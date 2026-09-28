'use client';

import type { TicketSummary } from '@billing-resolution/types';
import { PRIORITY_LABELS, SCENARIO_LABELS, TICKET_STATUS_LABELS } from '../../lib/labels';
import { formatDateTime } from '../../lib/format';

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
    <nav className="panel glass ticket-list" aria-label="Support tickets">
      <header className="ticket-list__head">
        <h2>Tickets</h2>
        <span className="ticket-list__count muted" aria-hidden="true">
          {tickets ? tickets.length : '…'}
        </span>
      </header>

      {tickets === null && (
        <div className="empty-state" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading tickets…
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
                  className={`ticket-item${selected ? ' ticket-item--selected' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(ticket.id)}
                >
                  <span className="ticket-item__top">
                    <span className="ticket-item__ref">{ticket.reference}</span>
                    <span className={`badge badge--status-${ticket.status.toLowerCase()}`}>
                      {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>
                  </span>
                  <span className="ticket-item__title">{ticket.title}</span>
                  <span className="ticket-item__bottom">
                    <span className={`badge badge--scenario-${ticket.scenario.toLowerCase().replace(/_/g, '-')}`}>
                      {SCENARIO_LABELS[ticket.scenario] ?? ticket.scenario}
                    </span>
                    <span className="muted">
                      {ticket.account.name} · {PRIORITY_LABELS[ticket.priority] ?? ticket.priority} ·{' '}
                      {formatDateTime(ticket.createdAt)}
                    </span>
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
