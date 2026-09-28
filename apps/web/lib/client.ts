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
 * Browser-side API access. EVERY call goes through the same-origin /backend
 * proxy served by Next, which forwards to the NestJS API server-side — the
 * browser never makes cross-origin requests and never sees provider
 * credentials or the API host.
 */

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
      ...init,
    });
  } catch {
    throw new ClientApiError('Could not reach the API through the backend proxy.', 0);
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

export const clientApi = {
  tickets: () => request<TicketSummary[]>('/tickets'),
  ticket: (id: string) => request<TicketDetail>(`/tickets/${encodeURIComponent(id)}`),
  latestInvestigation: (id: string) =>
    request<InvestigationView | null>(`/tickets/${encodeURIComponent(id)}/investigation`),
  runInvestigation: (id: string) =>
    request<InvestigationView>(`/tickets/${encodeURIComponent(id)}/investigation`, {
      method: 'POST',
    }),
  proposals: (id: string) => request<ProposalView[]>(`/tickets/${encodeURIComponent(id)}/proposals`),
  proposal: (id: string) =>
    request<ProposalWithAuditsView>(`/proposals/${encodeURIComponent(id)}`),
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
  meta: () => request<MetaView>('/meta'),
};
