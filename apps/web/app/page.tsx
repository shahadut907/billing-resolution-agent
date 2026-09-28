import type { Metadata } from 'next';
import type { MetaView, TicketSummary } from '@billing-resolution/types';
import { fetchMeta, fetchTickets } from '../lib/api';
import { Workspace } from '../components/workspace/workspace';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Billing Resolution Agent — Support Workspace',
  description:
    'AI-assisted billing support workspace over a seeded synthetic dataset: bounded read-only investigations, human approval, and exactly-once sandbox actions.',
};

export default async function WorkspacePage() {
  let tickets: TicketSummary[] | null = null;
  let meta: MetaView | null = null;
  try {
    [tickets, meta] = await Promise.all([fetchTickets(), fetchMeta()]);
  } catch {
    // The workspace renders an honest connection state and retries via the
    // same-origin proxy from the client.
    try {
      meta = await fetchMeta();
    } catch {
      meta = null;
    }
  }

  return <Workspace initialTickets={tickets} meta={meta} />;
}
