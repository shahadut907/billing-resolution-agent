import type { TicketDetail, TicketSummary } from '@billing-resolution/types';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchTickets(): Promise<TicketSummary[]> {
  const res = await fetch(`${API_BASE_URL}/tickets`, { cache: 'no-store' });
  if (!res.ok) {
    throw new ApiError(`Tickets request failed (${res.status})`, res.status);
  }
  return (await res.json()) as TicketSummary[];
}

export async function fetchTicket(id: string): Promise<TicketDetail | null> {
  const res = await fetch(`${API_BASE_URL}/tickets/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new ApiError(`Ticket request failed (${res.status})`, res.status);
  }
  return (await res.json()) as TicketDetail;
}
