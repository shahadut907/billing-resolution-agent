'use server';

import type { InvestigationView } from '@billing-resolution/types';
import { API_BASE_URL } from '../../../lib/api';

export type RunInvestigationResult =
  | { ok: true; investigation: InvestigationView }
  | { ok: false; error: string };

/**
 * Server action: triggers one bounded, read-only investigation via the API.
 * The API key (when a real provider is configured) lives only in the API
 * process — the frontend never sees provider credentials, only the labeled
 * investigation result.
 */
export async function runInvestigationAction(
  ticketId: string,
): Promise<RunInvestigationResult> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/tickets/${encodeURIComponent(ticketId)}/investigation`,
      { method: 'POST', cache: 'no-store' },
    );
    if (!res.ok) {
      return { ok: false, error: `The API returned status ${res.status}.` };
    }
    return { ok: true, investigation: (await res.json()) as InvestigationView };
  } catch {
    return { ok: false, error: 'Could not reach the API. Is it running on port 4000?' };
  }
}
