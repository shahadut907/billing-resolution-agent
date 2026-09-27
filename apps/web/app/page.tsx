import type { TicketSummary } from '@billing-resolution/types';
import { TicketCard } from '../components/ticket-card';
import { fetchTickets } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  let tickets: TicketSummary[] | undefined;
  let apiError = false;
  try {
    tickets = await fetchTickets();
  } catch {
    apiError = true;
  }

  return (
    <>
      <section className="page-head">
        <h1>Support tickets</h1>
        <p className="muted">
          {tickets
            ? `${tickets.length} seeded ticket${tickets.length === 1 ? '' : 's'} for the fictional company “Lumina Metrics, Inc.”. Open a ticket to see its persisted account, subscription, payment, and invoice records.`
            : 'Read-only view of persisted billing records.'}
        </p>
      </section>
      {apiError ? (
        <div className="notice notice--error" role="alert">
          <strong>API unreachable.</strong> Start the stack with <code>pnpm dev</code> (API
          on port 4000) and reload this page.
        </div>
      ) : (
        <div className="ticket-list">
          {tickets?.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
        </div>
      )}
    </>
  );
}
