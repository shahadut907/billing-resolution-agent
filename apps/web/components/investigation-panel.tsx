'use client';

import { useState } from 'react';
import type { InvestigationView } from '@billing-resolution/types';
import {
  runInvestigationAction,
  type RunInvestigationResult,
} from '../app/tickets/[id]/actions';
import {
  formatDateTime,
} from '../lib/format';
import {
  INVESTIGATION_STATUS_LABELS,
  NEXT_STEP_LABELS,
  RISK_LABELS,
  UNCERTAINTY_LABELS,
} from '../lib/labels';

const RISK_BADGE: Record<string, string> = {
  LOW: 'badge--risk-low',
  MEDIUM: 'badge--risk-medium',
  HIGH: 'badge--risk-high',
  URGENT: 'badge--risk-urgent',
};

export function InvestigationPanel({
  ticketId,
  initial,
}: {
  ticketId: string;
  initial: InvestigationView | null;
}) {
  const [investigation, setInvestigation] = useState<InvestigationView | null>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    const result: RunInvestigationResult = await runInvestigationAction(ticketId);
    if (result.ok) {
      setInvestigation(result.investigation);
    } else {
      setError(result.error);
    }
    setPending(false);
  };

  return (
    <section className="panel investigation" id="investigation">
      <div className="investigation__head">
        <h2>AI investigation</h2>
        <button
          type="button"
          className="investigation__run"
          onClick={run}
          disabled={pending}
        >
          {pending ? 'Investigating…' : investigation ? 'Re-run investigation' : 'Run investigation'}
        </button>
      </div>

      {investigation === null && !pending && !error && (
        <p className="muted">
          No investigation has been run for this ticket yet. Running one gathers this
          ticket&apos;s allowlisted records (read-only) and produces an advisory draft for
          human review.
        </p>
      )}

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {investigation && (
        <div className="investigation__body">
          <div className="investigation__meta">
            <span className={`badge ${investigation.status === 'COMPLETED' ? 'badge--status-resolved' : 'badge--status-open'}`}>
              {INVESTIGATION_STATUS_LABELS[investigation.status] ?? investigation.status}
            </span>
            {investigation.isMock ? (
              <span className="mock-banner">
                Mock mode — deterministic rules, no AI model was called
              </span>
            ) : (
              <span className="provider-banner">
                Provider: {investigation.provider} · model {investigation.model} (real model call)
              </span>
            )}
            <span className="muted">
              {formatDateTime(investigation.createdAt)} UTC ·{' '}
              {investigation.bounds.toolCallsUsed} tool calls ·{' '}
              {investigation.bounds.elapsedMs} ms
            </span>
          </div>

          {investigation.status === 'FAILED' && (
            <p className="notice notice--error">
              Investigation failed: <code>{investigation.failureReason}</code>. Nothing was
              changed; you can re-run it.
            </p>
          )}

          {investigation.status === 'COMPLETED' && (
            <>
              {investigation.policyOverrides.length > 0 && (
                <ul className="policy-overrides">
                  {investigation.policyOverrides.map((override) => (
                    <li key={override}>Policy override: {override}</li>
                  ))}
                </ul>
              )}

              <p className="investigation__diagnosis">{investigation.diagnosis}</p>

              <div className="investigation__meta">
                {investigation.riskCategory && (
                  <span className={`badge ${RISK_BADGE[investigation.riskCategory] ?? ''}`}>
                    Risk: {RISK_LABELS[investigation.riskCategory] ?? investigation.riskCategory}
                  </span>
                )}
                {investigation.uncertainty && (
                  <span className="muted">
                    Uncertainty: {UNCERTAINTY_LABELS[investigation.uncertainty] ?? investigation.uncertainty}
                  </span>
                )}
              </div>

              {investigation.proposedNextStep && (
                <p>
                  <strong>Proposed next step:</strong>{' '}
                  {NEXT_STEP_LABELS[investigation.proposedNextStep.type] ??
                    investigation.proposedNextStep.type}
                  {' — '}
                  {investigation.proposedNextStep.detail}
                </p>
              )}

              <h3 className="investigation__sub">Evidence</h3>
              <EvidenceList
                title="Supporting"
                citations={investigation.supportingEvidence}
              />
              <EvidenceList
                title="Contradicting"
                citations={investigation.contradictingEvidence}
              />

              <h3 className="investigation__sub">Draft reply (for human review)</h3>
              <blockquote className="draft-reply">{investigation.draftReply}</blockquote>

              <h3 className="investigation__sub">Tool trace (redacted)</h3>
              <div className="table-scroll">
                <table className="record-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tool</th>
                      <th>Args</th>
                      <th>Status</th>
                      <th>Rows</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investigation.toolTrace.map((entry) => (
                      <tr key={entry.seq}>
                        <td>{entry.seq}</td>
                        <td>
                          <code>{entry.tool}</code>
                        </td>
                        <td>{entry.argKeys.length > 0 ? entry.argKeys.join(', ') : '—'}</td>
                        <td>
                          {entry.status === 'ok'
                            ? `ok (${entry.rowCount ?? 0})`
                            : `rejected — ${entry.reason ?? 'unknown'}`}
                        </td>
                        <td>{entry.rowCount ?? '—'}</td>
                        <td>{entry.durationMs ?? 0} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="muted investigation__disclaimer">
                Advisory draft for human review only. The investigation read only this
                ticket&apos;s allowlisted records and did not execute any action — no refunds,
                account changes, or messages were sent.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function EvidenceList({
  title,
  citations,
}: {
  title: string;
  citations: { recordType: string; id: string; note?: string }[];
}) {
  return (
    <div className="evidence">
      <span className="evidence__title">{title}</span>
      {citations.length === 0 ? (
        <span className="muted">none</span>
      ) : (
        <ul>
          {citations.map((citation) => (
            <li key={`${citation.recordType}:${citation.id}`}>
              <code>
                {citation.recordType.toLowerCase()}:{citation.id.slice(0, 10)}…
              </code>
              {citation.note ? <span className="muted"> — {citation.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
