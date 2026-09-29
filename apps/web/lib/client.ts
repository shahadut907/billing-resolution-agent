'use client';

import type {
  InvestigationView,
  MetaView,
  ProposalDecisionResult,
  ProposalErrorBody,
  ProposalWithAuditsView,
  ProposalView,
  TicketDetail,
  TicketEscalationView,
  TicketSummary,
} from '@billing-resolution/types';

/**
 * Browser-side API access. Every call goes through the same-origin /backend
 * proxy served by Next, which forwards to the NestJS API server-side.
 * Requests carry a bounded timeout so the UI can always reach a failure
 * state instead of waiting forever.
 */

const DEFAULT_TIMEOUT_MS = 12_000;

export class ClientApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/backend${path}`, {
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      ...init,
    });
  } catch {
    throw new ClientApiError(
      'The request timed out or the API could not be reached.',
      0,
    );
  }
  if (!res.ok) {
    let code: string | undefined;
    let message = `Request failed (${res.status}).`;
    try {
      const body = (await res.json()) as Partial<ProposalErrorBody> & { message?: string };
      code = body?.code;
      message = body?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ClientApiError(message, res.status, code);
  }
  // Nest serializes a `null` return as an EMPTY body — treat that as null.
  const text = await res.text();
  if (text.length === 0) {
    return null as T;
  }
  return JSON.parse(text) as T;
}

export type TicketStatusFilter = 'ALL' | 'OPEN' | 'IN_REVIEW' | 'RESOLVED';

export const clientApi = {
  tickets: (status: TicketStatusFilter = 'ALL') =>
    request<TicketSummary[]>(status === 'ALL' ? '/tickets' : `/tickets?status=${status}`),
  ticket: (id: string) => request<TicketDetail>(`/tickets/${encodeURIComponent(id)}`),
  latestInvestigation: (id: string) =>
    request<InvestigationView | null>(`/tickets/${encodeURIComponent(id)}/investigation`),
  runInvestigation: (id: string) =>
    request<InvestigationView>(`/tickets/${encodeURIComponent(id)}/investigation`, {
      method: 'POST',
    }),
  proposals: (id: string) => request<ProposalView[]>(`/tickets/${encodeURIComponent(id)}/proposals`),
  createProposal: (id: string) =>
    request<ProposalView>(`/tickets/${encodeURIComponent(id)}/proposal`, { method: 'POST' }),
  decide: (proposalId: string, body: { decision: string; reviewer: string; passcode: string }) =>
    request<ProposalDecisionResult>(`/proposals/${encodeURIComponent(proposalId)}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  escalate: (
    ticketId: string,
    body: { reviewer: string; passcode: string; note?: string },
  ) =>
    request<TicketEscalationView>(`/tickets/${encodeURIComponent(ticketId)}/escalation`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  escalations: (ticketId: string) =>
    request<TicketEscalationView[]>(`/tickets/${encodeURIComponent(ticketId)}/escalations`),
  proposal: (id: string) =>
    request<ProposalWithAuditsView>(`/proposals/${encodeURIComponent(id)}`),
  meta: () => request<MetaView>('/meta'),
};
