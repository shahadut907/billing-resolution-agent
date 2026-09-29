'use client';

import { useState } from 'react';
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
    <main className="ticket-detail" id="ticket-detail" aria-label="Ticket and billing evidence">
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
          <p>Select a ticket to see the case summary and billing evidence.</p>
        </div>
      )}

      {detail && <TicketDetailBody key={detail.ticket.id} detail={detail} />}
    </main>
  );
}

function TicketDetailBody({ detail }: { detail: TicketDetail }) {
  const { ticket, account, relatedAccount } = detail;

  return (
    <div className="case" key={ticket.id}>
      {/* ------------------------------------------------ case summary */}
      <header className="case__head">
        <p className="case__ref">
          {ticket.reference} · {SCENARIO_LABELS[ticket.scenario] ?? ticket.scenario}
        </p>
        <h1>{ticket.title}</h1>
        <dl className="case__facts">
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`status-dot status-dot--${ticket.status.toLowerCase()}`}>
                {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
              </span>
            </dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>
              {account.name} ({account.status.toLowerCase()})
            </dd>
          </div>
          <div>
            <dt>Reported</dt>
            <dd>{formatDate(ticket.createdAt)}</dd>
          </div>
        </dl>

        <Expander label="Customer report" summary={ticket.description} startOpen={false}>
          <p className="case__description">{ticket.description}</p>
        </Expander>

        {relatedAccount && (
          <p className="callout callout--warning" role="note">
            <strong>Exposure report — a second account is linked.</strong> Per policy, the other
            account&apos;s financial records are not shown and its details are not shared with the
            reporter.
          </p>
        )}
      </header>

      {/* ------------------------------------------------ billing records */}
      <section className="case__section" aria-label="Billing records">
        <h2 className="section-title">Billing records</h2>
        <p className="muted section-sub">
          {detail.subscriptions.length} subscription{detail.subscriptions.length === 1 ? '' : 's'} ·{' '}
          {detail.payments.length} payment{detail.payments.length === 1 ? '' : 's'} ·{' '}
          {detail.invoices.length} invoice{detail.invoices.length === 1 ? '' : 's'}
        </p>

        <RecordGroup title="Subscriptions" empty="No subscriptions on file.">
          <RecordTable
            headers={['Plan', 'Status', 'Seats', 'Period']}
            rows={detail.subscriptions.map((s) => [
              s.planName,
              <span key="st" className={`pill pill--sub-${s.status.toLowerCase()}`}>
                {SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status}
              </span>,
              String(s.seats),
              `${formatDate(s.currentPeriodStart)} → ${formatDate(s.currentPeriodEnd)}`,
            ])}
            empty="No subscriptions on file."
          />
        </RecordGroup>

        <RecordGroup title="Payments" empty="No payments on file." defaultOpen>
          <RecordTable
            headers={['Reference', 'Amount', 'Status', 'Occurred', 'Description']}
            rows={detail.payments.map((p) => [
              <code key="ref">{p.ref}</code>,
              formatMoney(p.amount, p.currency),
              <span key="st" className={`pill pill--pay-${p.status.toLowerCase()}`}>
                {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
              </span>,
              formatDateTime(p.occurredAt),
              p.description ?? '—',
            ])}
            empty="No payments on file."
          />
        </RecordGroup>

        <RecordGroup title="Invoices" empty="No invoices on file.">
          <RecordTable
            headers={['Number', 'Amount', 'Status', 'Period', 'Charge', 'Notes']}
            rows={detail.invoices.map((i) => [
              <code key="num">{i.number}</code>,
              formatMoney(i.amount, i.currency),
              <span key="st" className={`pill pill--inv-${i.status.toLowerCase()}`}>
                {INVOICE_STATUS_LABELS[i.status] ?? i.status}
              </span>,
              i.periodStart ? `${formatDate(i.periodStart)} → ${formatDate(i.periodEnd)}` : '—',
              i.paymentId ? <code key="pid">{chargeRef(i.paymentId, detail.payments)}</code> : '—',
              i.notes ?? '—',
            ])}
            empty="No invoices on file."
          />
        </RecordGroup>
      </section>

      {/* ------------------------------------------------ policy */}
      <section className="case__section" aria-label="Applicable policy">
        <Expander label={`Policy (${detail.policies.length})`} startOpen={false}>
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
        </Expander>
      </section>
    </div>
  );
}

function chargeRef(paymentId: string, payments: { id: string; ref: string }[]): string {
  return payments.find((p) => p.id === paymentId)?.ref ?? paymentId;
}

/** One expandable group of records; the trigger shows the group title. */
function RecordGroup({
  title,
  children,
  empty,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  empty?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="record-group">
      <Expander label={title} startOpen={defaultOpen} onToggle={setOpen}>
        {children}
      </Expander>
    </div>
  );
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
