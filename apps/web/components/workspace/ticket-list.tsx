'use client';

import type { TicketSummary } from '@billing-resolution/types';
import { SCENARIO_LABELS, TICKET_STATUS_LABELS } from '../../lib/labels';
import { formatDate } from '../../lib/format';

export function TicketList({
  tickets,
  selectedId,
  onSelect,
  onRetry,
}: {
  tickets: TicketSummary[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <nav className="ticket-list" aria-label="Support tickets">
      <header className="ticket-list__head">
        <h2>Tickets</h2>
        <span className="ticket-list__count muted">{tickets ? tickets.length : '…'}</span>
      </header>

      {tickets === null && (
        <div className="empty-state" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading…
        </div>
      )}

      {tickets !== null && tickets.length === 0 && (
        <div className="empty-state">
          <p>No tickets found. Is the API running and seeded?</p>
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {tickets !== null && tickets.length > 0 && (
        <ul className="ticket-list__items">
          {tickets.map((ticket) => {
            const selected = ticket.id === selectedId;
            return (
              <li key={ticket.id}>
                <button
                  type="button"
                  className={`ticket-row${selected ? ' ticket-row--selected' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(ticket.id)}
                >
                  <span className="ticket-row__top">
                    <span className="ticket-row__ref">{ticket.reference}</span>
                    <span className={`status-dot status-dot--${ticket.status.toLowerCase()}`}>
                      {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>
                  </span>
                  <span className="ticket-row__title">{ticket.title}</span>
                  <span className="ticket-row__meta">
                    {SCENARIO_LABELS[ticket.scenario] ?? ticket.scenario} ·{' '}
                    {formatDate(ticket.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
