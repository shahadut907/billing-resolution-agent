'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Three-panel support workspace: tickets (left), ticket + billing evidence
 * (center), AI investigation + approval (right). Panels stack on narrow
 * screens. Every displayed state comes from the real API — there are no
 * decorative metrics and no simulated AI activity.
 */
export function Workspace({ initialTickets, meta }: WorkspaceProps) {
  const [tickets, setTickets] = useState<TicketSummary[] | null>(initialTickets);
  const [selectedId, setSelectedId] = useState<string | null>(initialTickets?.[0]?.id ?? null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [investigation, setInvestigation] = useState<InvestigationView | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [escalations, setEscalations] = useState<TicketEscalationView[]>([]);
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

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
    } catch {
      // The list is refreshed opportunistically; failures surface elsewhere.
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
      const refreshed = await clientApi.ticket(selectedId);
      setDetail(refreshed);
      setDetailState('idle');
    } catch (error) {
      setBanner(error instanceof ClientApiError ? error.message : 'Investigation failed.');
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
      return { errorCode: 'unknown', message: 'Creating the proposal failed.' };
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
        const result = await clientApi.decide(proposalId, {
          decision,
          reviewer,
          passcode,
        });
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
          message: error instanceof ClientApiError ? error.message : 'Decision failed.',
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

  const retryConnection = useCallback(async () => {
    setTickets(null);
    try {
      setTickets(await clientApi.tickets());
    } catch {
      setTickets([]);
    }
  }, []);

  return (
    <div className="workspace" ref={listRef}>
      <a href="#ticket-detail" className="skip-link">
        Skip to ticket detail
      </a>
      <TicketList
        tickets={tickets}
        selectedId={selectedId}
        onSelect={(id) => selectTicket(id, true)}
        onRetry={retryConnection}
      />
      <TicketDetailPanel detail={detail} state={detailState} banner={banner} />
      <InvestigationPanel
        ticket={detail?.ticket ?? null}
        investigation={investigation}
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
  );
}
