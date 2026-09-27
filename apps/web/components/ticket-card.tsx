import Link from 'next/link';
import type { TicketSummary } from '@billing-resolution/types';
import { formatDateTime } from '../lib/format';
import { PRIORITY_LABELS, SCENARIO_LABELS, TICKET_STATUS_LABELS } from '../lib/labels';
import { Badge } from './badge';

export function TicketCard({ ticket }: { ticket: TicketSummary }) {
  return (
    <Link href={`/tickets/${ticket.id}`} className="ticket-card">
      <div className="ticket-card__top">
        <span className="ticket-card__ref">{ticket.reference}</span>
        <Badge className={`badge--status-${ticket.status.toLowerCase()}`}>
          {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
        </Badge>
      </div>
      <h2 className="ticket-card__title">{ticket.title}</h2>
      <div className="ticket-card__meta">
        <Badge
          className={`badge--scenario badge--${ticket.scenario.toLowerCase().replace(/_/g, '-')}`}
        >
          {SCENARIO_LABELS[ticket.scenario] ?? ticket.scenario}
        </Badge>
        <span className="muted">{ticket.account.name}</span>
        <span className="muted">
          Priority: {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
        </span>
        <span className="muted">{formatDateTime(ticket.createdAt)} UTC</span>
      </div>
    </Link>
  );
}
