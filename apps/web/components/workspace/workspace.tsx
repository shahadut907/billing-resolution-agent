'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  InvestigationView,
  MetaView,
  ProposalView,
  TicketDetail,
  TicketEscalationView,
  TicketSummary,
} from '@billing-resolution/types';
import { clientApi, ClientApiError } from '../../lib/client';
import { TicketList } from './ticket-list';
import { TicketDetailPanel } from './ticket-detail';
import { InvestigationPanel } from './investigation-panel';

export interface WorkspaceProps {
  /** Server-rendered initial tickets (null when the API was unreachable). */
  initialTickets: TicketSummary[] | null;
  meta: MetaView | null;
}

type LoadState = 'idle' | 'loading' | 'error';

/**
 * Support workspace: ticket queue (left), case (center), investigation and
 * next steps (right). One shared page scroll.
 */
export function Workspace({ initialTickets, meta }: WorkspaceProps) {
  const [tickets, setTickets] = useState<TicketSummary[] | null>(initialTickets);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialTickets?.[0]?.id ?? null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [investigation, setInvestigation] = useState<InvestigationView | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [escalations, setEscalations] = useState<TicketEscalationView[]>([]);
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchTickets = useCallback(async () => {
    try {
      setTickets(await clientApi.tickets());
      setTicketsError(null);
    } catch (error) {
      setTickets(null);
      setTicketsError(
        error instanceof ClientApiError ? error.message : 'Could not load tickets.',
      );
    }
  }, []);

  // If the server render could not reach the API, retry once on mount so the
  // user sees content as soon as it is available.
  useEffect(() => {
    if (initialTickets === null) {
      void fetchTickets();
    }
  }, [initialTickets, fetchTickets]);

  const selectTicket = useCallback((id: string, updateUrl: boolean) => {
    setSelectedId(id);
    setDetail(null);
    setInvestigation(null);
    setProposals([]);
    setEscalations([]);
    setBanner(null);
    // Bump even when the id is unchanged so re-selecting reloads everything.
    setReloadKey((key) => key + 1);
    if (updateUrl && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('ticket', id);
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  // Deep-link support: honor ?ticket=<id> once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('ticket');
    if (!requested) return;
    setSelectedId((current) => (current === requested ? current : requested));
  }, []);

  // Center + right panel data for the selected ticket.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailState('loading');
    Promise.all([
      clientApi.ticket(selectedId),
      clientApi.latestInvestigation(selectedId),
      clientApi.proposals(selectedId),
      clientApi.escalations(selectedId),
    ])
      .then(([ticketDetail, inv, props, escs]) => {
        if (cancelled) return;
        setDetail(ticketDetail);
        setInvestigation(inv);
        setProposals(props);
        setEscalations(escs);
        setDetailState('idle');
      })
      .catch((error: ClientApiError) => {
        if (cancelled) return;
        setDetailState('error');
        setBanner(error.status === 404 ? 'That ticket no longer exists.' : error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadKey]);

  const refreshTickets = useCallback(async () => {
    try {
      setTickets(await clientApi.tickets());
      setTicketsError(null);
    } catch {
      // Refreshed opportunistically; failures surface in the queue.
    }
  }, []);

  const runInvestigation = useCallback(async () => {
    if (!selectedId) return;
    setRunning(true);
    setBanner(null);
    try {
      const inv = await clientApi.runInvestigation(selectedId);
      setInvestigation(inv);
      setProposals(await clientApi.proposals(selectedId));
      await refreshTickets();
      setDetail(await clientApi.ticket(selectedId));
      setDetailState('idle');
    } catch (error) {
      setBanner(error instanceof ClientApiError ? error.message : 'The investigation failed.');
    } finally {
      setRunning(false);
    }
  }, [selectedId, refreshTickets]);

  const createProposal = useCallback(async () => {
    if (!selectedId) return null;
    try {
      const proposal = await clientApi.createProposal(selectedId);
      setProposals((current) => [proposal, ...current]);
      return { id: proposal.id };
    } catch (error) {
      if (error instanceof ClientApiError) {
        return { errorCode: error.code ?? 'unknown', message: error.message };
      }
      return { errorCode: 'unknown', message: 'Preparing the action failed.' };
    }
  }, [selectedId]);

  const decide = useCallback(
    async (
      proposalId: string,
      decision: 'APPROVE' | 'REJECT' | 'ESCALATE',
      reviewer: string,
      passcode: string,
    ) => {
      try {
        const result = await clientApi.decide(proposalId, { decision, reviewer, passcode });
        setProposals((current) =>
          current.map((p) => (p.id === proposalId ? result.proposal : p)),
        );
        setBanner(null);
        await refreshTickets();
        if (selectedId) {
          setDetail(await clientApi.ticket(selectedId));
        }
        return { ok: true as const, result };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof ClientApiError ? error.message : 'The decision failed.',
        };
      }
    },
    [refreshTickets, selectedId],
  );

  const escalate = useCallback(
    async (reviewer: string, passcode: string, note?: string) => {
      if (!selectedId) return { ok: false as const, message: 'No ticket selected.' };
      try {
        const escalation = await clientApi.escalate(selectedId, { reviewer, passcode, note });
        setEscalations((current) => [escalation, ...current]);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof ClientApiError ? error.message : 'Escalation failed.',
        };
      }
    },
    [selectedId],
  );

  return (
    <>
      <a href="#ticket-detail" className="skip-link">
        Skip to case
      </a>
      <div className="workspace">
        <TicketList
          tickets={tickets}
          ticketsError={ticketsError}
          onRetry={fetchTickets}
          selectedId={selectedId}
          onSelect={(id) => selectTicket(id, true)}
        />
        <TicketDetailPanel
          detail={detail}
          state={detailState}
          banner={banner}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
        <InvestigationPanel
          ticket={detail?.ticket ?? null}
          investigation={investigation}
          loading={detailState === 'loading'}
          proposals={proposals}
          escalations={escalations}
          running={running}
          onRun={runInvestigation}
          onCreateProposal={createProposal}
          onDecide={decide}
          onEscalate={escalate}
          meta={meta}
        />
      </div>
    </>
  );
}
