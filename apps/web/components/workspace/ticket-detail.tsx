'use client';

import type { TicketDetail } from '@billing-resolution/types';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  SCENARIO_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  TICKET_STATUS_LABELS,
} from '../../lib/labels';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { Expander } from './expander';
import { CaseSkeleton } from './skeleton';

type LoadState = 'idle' | 'loading' | 'error';

export function TicketDetailPanel({
  detail,
  state,
  banner,
  onRetry,
}: {
  detail: TicketDetail | null;
  state: LoadState;
  banner: string | null;
  onRetry: () => void;
}) {
  return (
    <main className="ticket-detail" id="ticket-detail" aria-label="Case">
      {detail === null && state === 'loading' && <CaseSkeleton />}

      {detail === null && state === 'error' && (
        <div className="queue-state" role="alert">
          <p>{banner ?? 'Could not load this ticket.'}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {detail === null && state === 'idle' && (
        <div className="queue-state">
          <p>Select a ticket to see the case and its billing evidence.</p>
        </div>
      )}

      {detail && <CaseBody key={detail.ticket.id} detail={detail} />}
    </main>
  );
}

function CaseBody({ detail }: { detail: TicketDetail }) {
  const { ticket, account, relatedAccount } = detail;

  return (
    <div className="case" key={ticket.id}>
      <header className="case__head">
        <p className="case__eyebrow">
          {ticket.reference} · {SCENARIO_LABELS[ticket.scenario] ?? ticket.scenario}
        </p>
        <h2 className="case__title">{ticket.title}</h2>

        <p className="case__summaryrow">
          <span className={`status-dot status-dot--${ticket.status.toLowerCase()}`}>
            {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
          </span>
          <span className="case__summaryrow-sep" aria-hidden="true" />
          <span>
            {PRIORITY_LABELS[ticket.priority] ?? ticket.priority} priority · {account.name} ·
            reported {formatDate(ticket.createdAt)}
          </span>
        </p>

        <div className="case__report">
          <h3 className="case__subhead">Customer report</h3>
          <p>{ticket.description}</p>
        </div>

        {relatedAccount && (
          <p className="callout callout--warning" role="note">
            <strong>Exposure report.</strong> A second account is linked to this ticket. Per
            policy its records are not shown and its details are not shared with the reporter.
          </p>
        )}
      </header>

      <section className="case__section" aria-label="Subscriptions">
        <h3 className="case__sectiontitle">Subscriptions</h3>
        <RecordTable
          headers={['Plan', 'Status', 'Seats', 'Billing period']}
          rows={detail.subscriptions.map((s) => [
            s.planName,
            <span key="st" className={`pill pill--sub-${s.status.toLowerCase()}`}>
              {SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status}
            </span>,
            String(s.seats),
            `${formatDate(s.currentPeriodStart)} to ${formatDate(s.currentPeriodEnd)}`,
          ])}
          empty="No subscriptions on file."
        />
      </section>

      <section className="case__section" aria-label="Payments">
        <h3 className="case__sectiontitle">Payments</h3>
        <RecordTable
          headers={['Payment', 'Amount', 'Status', 'Date']}
          rows={detail.payments.map((p) => [
            p.description ?? 'Card payment',
            formatMoney(p.amount, p.currency),
            <span key="st" className={`pill pill--pay-${p.status.toLowerCase()}`}>
              {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
            </span>,
            formatDateTime(p.occurredAt),
          ])}
          empty="No payments on file."
        />
      </section>

      <section className="case__section" aria-label="Invoices">
        <h3 className="case__sectiontitle">Invoices</h3>
        <RecordTable
          headers={['Invoice', 'Amount', 'Status', 'Billing period', 'Notes']}
          rows={detail.invoices.map((i) => [
            i.number,
            formatMoney(i.amount, i.currency),
            <span key="st" className={`pill pill--inv-${i.status.toLowerCase()}`}>
              {INVOICE_STATUS_LABELS[i.status] ?? i.status}
            </span>,
            i.periodStart ? `${formatDate(i.periodStart)} to ${formatDate(i.periodEnd)}` : '—',
            i.notes ?? '',
          ])}
          empty="No invoices on file."
        />
      </section>

      {detail.policies.length > 0 && (
        <section className="case__section" aria-label="Policy">
          <h3 className="case__sectiontitle">Policy</h3>
          {detail.policies.map((policy) => (
            <article key={policy.id} className="policy-card">
              <h4>{policy.title}</h4>
              <p>{policy.body}</p>
            </article>
          ))}
        </section>
      )}

      <section className="case__section" aria-label="Technical details">
        <Expander label="Technical details" startOpen={false}>
          <div className="tech">
            <p className="muted tech__line">
              Account ID <code>{account.id}</code>
              {relatedAccount && (
                <>
                  {' '}
                  · related account <code>{relatedAccount.id}</code>
                </>
              )}
            </p>
            <h4>Payment references</h4>
            <ul className="tech__list">
              {detail.payments.map((p) => (
                <li key={p.id}>
                  <code>{p.ref}</code> · {p.method.toLowerCase()} · {p.description ?? ''}
                </li>
              ))}
              {detail.payments.length === 0 && <li className="muted">none</li>}
            </ul>
            <h4>Invoice to charge mapping</h4>
            <ul className="tech__list">
              {detail.invoices.map((i) => (
                <li key={i.id}>
                  <code>{i.number}</code> →{' '}
                  {i.paymentId
                    ? `charge ${chargeRef(i.paymentId, detail.payments)}`
                    : 'no charge linked'}
                </li>
              ))}
              {detail.invoices.length === 0 && <li className="muted">none</li>}
            </ul>
            <p className="muted tech__line">
              Ticket created {formatDateTime(ticket.createdAt)} UTC, updated{' '}
              {formatDateTime(ticket.updatedAt)} UTC.
            </p>
          </div>
        </Expander>
      </section>
    </div>
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
