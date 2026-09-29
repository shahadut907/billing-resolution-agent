'use client';

import { useMemo, useState } from 'react';
import type { TicketSummary } from '@billing-resolution/types';
import { SCENARIO_LABELS, TICKET_STATUS_LABELS } from '../../lib/labels';
import { formatDate } from '../../lib/format';
import { TicketListSkeleton } from './skeleton';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_REVIEW', label: 'In review' },
  { key: 'RESOLVED', label: 'Resolved' },
];

type FilterKey = 'ALL' | 'OPEN' | 'IN_REVIEW' | 'RESOLVED';

export function TicketList({
  tickets,
  ticketsError,
  onRetry,
  selectedId,
  onSelect,
}: {
  tickets: TicketSummary[] | null;
  ticketsError: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const visible = useMemo(() => {
    if (!tickets) return null;
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter !== 'ALL' && t.status !== filter) return false;
      if (!q) return true;
      return (
        t.reference.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.account.name.toLowerCase().includes(q) ||
        (SCENARIO_LABELS[t.scenario] ?? t.scenario).toLowerCase().includes(q)
      );
    });
  }, [tickets, search, filter]);

  return (
    <nav className="ticket-list" aria-label="Ticket queue">
      <h2 className="panel-title">Tickets</h2>

      <input
        type="search"
        className="ticket-search"
        placeholder="Search tickets"
        aria-label="Search tickets"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="ticket-filters" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`ticket-filters__item${filter === f.key ? ' ticket-filters__item--active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tickets === null && ticketsError === null && <TicketListSkeleton />}

      {ticketsError !== null && (
        <div className="queue-state" role="alert">
          <p>Could not load tickets.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {tickets !== null && ticketsError === null && visible !== null && visible.length === 0 && (
        <p className="queue-state">
          {search ? 'No tickets match your search.' : 'No tickets with this status.'}
        </p>
      )}

      {visible !== null && visible.length > 0 && (
        <ul className="ticket-list__items">
          {visible.map((ticket) => {
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
