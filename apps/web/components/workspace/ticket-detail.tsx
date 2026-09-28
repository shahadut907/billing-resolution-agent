'use client';

import type { TicketDetail } from '@billing-resolution/types';
import {
  ACCOUNT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  SCENARIO_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  TICKET_STATUS_LABELS,
} from '../../lib/labels';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';

type LoadState = 'idle' | 'loading' | 'error';

export function TicketDetailPanel({
  detail,
  state,
  banner,
}: {
  detail: TicketDetail | null;
  state: LoadState;
  banner: string | null;
}) {
  return (
    <main className="panel glass ticket-detail" id="ticket-detail" aria-label="Ticket and billing evidence">
      {detail === null && state === 'loading' && (
        <div className="empty-state" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading ticket…
        </div>
      )}
      {detail === null && state === 'error' && (
        <div className="empty-state" role="alert">
          <p>{banner ?? 'The ticket could not be loaded.'}</p>
        </div>
      )}
      {detail === null && state === 'idle' && (
        <div className="empty-state">
          <p>Select a ticket from the list to see its billing evidence.</p>
        </div>
      )}

      {detail && (
        <div className="ticket-detail__body" key={detail.ticket.id}>
          <header className="ticket-detail__head">
            <div className="ticket-detail__refs">
              <span className="ticket-item__ref">{detail.ticket.reference}</span>
              <span className={`badge badge--status-${detail.ticket.status.toLowerCase()}`}>
                {TICKET_STATUS_LABELS[detail.ticket.status] ?? detail.ticket.status}
              </span>
              <span
                className={`badge badge--scenario-${detail.ticket.scenario.toLowerCase().replace(/_/g, '-')}`}
              >
                {SCENARIO_LABELS[detail.ticket.scenario] ?? detail.ticket.scenario}
              </span>
              <span className="muted">Priority: {PRIORITY_LABELS[detail.ticket.priority] ?? detail.ticket.priority}</span>
            </div>
            <h1>{detail.ticket.title}</h1>
            <p className="muted">
              Reported by {detail.account.name} · created {formatDateTime(detail.ticket.createdAt)} UTC ·
              updated {formatDateTime(detail.ticket.updatedAt)} UTC
            </p>
            <blockquote className="ticket-description">{detail.ticket.description}</blockquote>
          </header>

          {detail.relatedAccount && (
            <section className="callout callout--warning" aria-label="Related account warning">
              <h3>Exposure report — second account linked</h3>
              <p>
                This ticket links a second account ({detail.relatedAccount.name},{' '}
                {ACCOUNT_STATUS_LABELS[detail.relatedAccount.status] ?? detail.relatedAccount.status}).
                Per the exposure-handling policy, the other account&apos;s financial records are
                deliberately not shown here and its details must not be shared with the reporter.
              </p>
            </section>
          )}

          <section className="evidence-block" aria-label="Subscriptions">
            <h2>Subscriptions</h2>
            <RecordTable
              headers={['Plan', 'Status', 'Seats', 'Current period', 'Canceled at']}
              rows={detail.subscriptions.map((s) => [
                s.planName,
                <span key="st" className={`pill pill--sub-${s.status.toLowerCase()}`}>
                  {SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status}
                </span>,
                String(s.seats),
                `${formatDate(s.currentPeriodStart)} → ${formatDate(s.currentPeriodEnd)}`,
                s.canceledAt ? `${formatDateTime(s.canceledAt)} UTC` : '—',
              ])}
              empty="No subscriptions on file."
            />
          </section>

          <section className="evidence-block" aria-label="Payments">
            <h2>Payments</h2>
            <RecordTable
              headers={['Reference', 'Amount', 'Method', 'Status', 'Occurred at', 'Description']}
              rows={detail.payments.map((p) => [
                <code key="ref">{p.ref}</code>,
                formatMoney(p.amount, p.currency),
                p.method === 'CARD' ? 'Card' : p.method === 'BANK_TRANSFER' ? 'Bank transfer' : p.method,
                <span key="st" className={`pill pill--pay-${p.status.toLowerCase()}`}>
                  {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                </span>,
                `${formatDateTime(p.occurredAt)} UTC`,
                p.description ?? '—',
              ])}
              empty="No payments on file."
            />
          </section>

          <section className="evidence-block" aria-label="Invoices">
            <h2>Invoices</h2>
            <RecordTable
              headers={['Number', 'Amount', 'Status', 'Billing period', 'Issued', 'Charge', 'Notes']}
              rows={detail.invoices.map((i) => [
                <code key="num">{i.number}</code>,
                formatMoney(i.amount, i.currency),
                <span key="st" className={`pill pill--inv-${i.status.toLowerCase()}`}>
                  {INVOICE_STATUS_LABELS[i.status] ?? i.status}
                </span>,
                i.periodStart ? `${formatDate(i.periodStart)} → ${formatDate(i.periodEnd)}` : '—',
                formatDate(i.issuedAt),
                i.paymentId ? <code key="pid">{chargeRef(i.paymentId, detail.payments)}</code> : '—',
                i.notes ?? '—',
              ])}
              empty="No invoices on file."
            />
          </section>

          <section className="evidence-block" aria-label="Applicable policy">
            <h2>Applicable policy</h2>
            {detail.policies.length === 0 ? (
              <p className="muted">No policy on file for this scenario.</p>
            ) : (
              detail.policies.map((policy) => (
                <article key={policy.id} className="policy-card">
                  <h3>{policy.title}</h3>
                  <p>{policy.body}</p>
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function chargeRef(paymentId: string, payments: { id: string; ref: string }[]): string {
  return payments.find((p) => p.id === paymentId)?.ref ?? paymentId;
}

export function RecordTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="muted table-empty">{empty}</p>;
  }
  return (
    <div className="table-scroll">
      <table className="record-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
