import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Badge } from '../../../components/badge';
import { InvestigationPanel } from '../../../components/investigation-panel';
import { RecordTable } from '../../../components/record-table';
import { fetchLatestInvestigation, fetchTicket } from '../../../lib/api';
import { formatDateTime, formatDate, formatMoney } from '../../../lib/format';
import {
  ACCOUNT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  SCENARIO_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  TICKET_STATUS_LABELS,
} from '../../../lib/labels';
import type { PaymentView } from '@billing-resolution/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Ticket ${id} — Billing Resolution Agent` };
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail;
  let apiError = false;
  try {
    detail = await fetchTicket(id);
  } catch {
    apiError = true;
  }
  let investigation = null;
  try {
    investigation = await fetchLatestInvestigation(id);
  } catch {
    investigation = null;
  }

  if (apiError) {
    return (
      <div className="notice notice--error" role="alert">
        <strong>API unreachable.</strong> Start the stack with <code>pnpm dev</code> and
        reload this page.
      </div>
    );
  }
  if (!detail) {
    notFound();
  }

  const { ticket, account, relatedAccount, subscriptions, payments, invoices, policies } =
    detail;

  return (
    <>
      <section className="page-head">
        <p className="ticket-head__ref">{ticket.reference}</p>
        <h1>{ticket.title}</h1>
        <div className="ticket-head__meta">
          <Badge
            className={`badge--${ticket.scenario.toLowerCase().replace(/_/g, '-')}`}
          >
            {SCENARIO_LABELS[ticket.scenario] ?? ticket.scenario}
          </Badge>
          <Badge className={`badge--status-${ticket.status.toLowerCase()}`}>
            {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
          </Badge>
          <span className="muted">
            Priority: {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
          </span>
          <span className="muted">Created {formatDateTime(ticket.createdAt)} UTC</span>
          <span className="muted">Updated {formatDateTime(ticket.updatedAt)} UTC</span>
        </div>
      </section>

      <blockquote className="ticket-description">{ticket.description}</blockquote>

      <div className="detail-grid">
        <section className="panel">
          <h2>Customer account</h2>
          <dl className="kv">
            <div>
              <dt>Name</dt>
              <dd>{account.name}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{ACCOUNT_STATUS_LABELS[account.status] ?? account.status}</dd>
            </div>
            <div>
              <dt>Billing email</dt>
              <dd>{account.billingEmail}</dd>
            </div>
            <div>
              <dt>Customer since</dt>
              <dd>{formatDate(account.createdAt)}</dd>
            </div>
          </dl>
        </section>

        {relatedAccount && (
          <section className="panel panel--warning">
            <h2>Related account (reported exposure)</h2>
            <p className="muted">
              This ticket links the reporter’s account to a second account. Per the
              exposure-handling policy, the other account’s financial records are not
              shown here.
            </p>
            <dl className="kv">
              <div>
                <dt>Name</dt>
                <dd>{relatedAccount.name}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {ACCOUNT_STATUS_LABELS[relatedAccount.status] ?? relatedAccount.status}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section className="panel">
          <h2>Subscriptions</h2>
          <RecordTable
            headers={['Plan', 'Status', 'Seats', 'Current period', 'Canceled at']}
            rows={subscriptions.map((s) => [
              s.planName,
              SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status,
              String(s.seats),
              `${formatDate(s.currentPeriodStart)} → ${formatDate(s.currentPeriodEnd)}`,
              s.canceledAt ? `${formatDateTime(s.canceledAt)} UTC` : '—',
            ])}
            empty="No subscriptions on file."
          />
        </section>

        <section className="panel">
          <h2>Payments</h2>
          <RecordTable
            headers={['Reference', 'Amount', 'Method', 'Status', 'Occurred at', 'Description']}
            rows={payments.map((p) => [
              <code key="ref">{p.ref}</code>,
              formatMoney(p.amount, p.currency),
              p.method === 'CARD' ? 'Card' : p.method === 'BANK_TRANSFER' ? 'Bank transfer' : p.method,
              PAYMENT_STATUS_LABELS[p.status] ?? p.status,
              `${formatDateTime(p.occurredAt)} UTC`,
              p.description ?? '—',
            ])}
            empty="No payments on file."
          />
        </section>

        <section className="panel">
          <h2>Invoices</h2>
          <RecordTable
            headers={['Number', 'Amount', 'Status', 'Billing period', 'Issued', 'Charge', 'Notes']}
            rows={invoices.map((i) => [
              <code key="num">{i.number}</code>,
              formatMoney(i.amount, i.currency),
              INVOICE_STATUS_LABELS[i.status] ?? i.status,
              i.periodStart
                ? `${formatDate(i.periodStart)} → ${formatDate(i.periodEnd)}`
                : '—',
              formatDate(i.issuedAt),
              i.paymentId ? <code key="pid">{chargeRef(i.paymentId, payments)}</code> : '—',
              i.notes ?? '—',
            ])}
            empty="No invoices on file."
          />
        </section>

        <section className="panel">
          <h2>Applicable policy</h2>
          {policies.length === 0 ? (
            <p className="muted panel__empty">No policy on file for this scenario.</p>
          ) : (
            policies.map((policy) => (
              <article key={policy.id} className="policy">
                <h3>{policy.title}</h3>
                <p>{policy.body}</p>
              </article>
            ))
          )}
        </section>
      </div>

      <p className="muted footnote">
        Milestone 2: records and investigations are read-only. Nothing on this page takes
        actions — investigations are advisory drafts for human review.
      </p>

      <InvestigationPanel ticketId={id} initial={investigation} />
    </>
  );
}

function chargeRef(paymentId: string, payments: PaymentView[]): string {
  return payments.find((p) => p.id === paymentId)?.ref ?? paymentId;
}
