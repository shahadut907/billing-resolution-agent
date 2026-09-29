'use client';

import { useState } from 'react';
import type {
  EvidenceCitation,
  InvestigationView,
  MetaView,
  ProposalAuditView,
  ProposalWithAuditsView,
  ProposalView,
  TicketEscalationView,
} from '@billing-resolution/types';
import { clientApi } from '../../lib/client';
import { formatDateTime } from '../../lib/format';
import {
  ACTION_TYPE_LABELS,
  AUDIT_EVENT_LABELS,
  DECISION_LABELS,
  NEXT_STEP_LABELS,
  PROPOSAL_ERROR_HINTS,
  PROPOSAL_STATUS_LABELS,
} from '../../lib/labels';
import { Expander } from './expander';

type DecideFn = (
  proposalId: string,
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE',
  reviewer: string,
  passcode: string,
) => Promise<{ ok: boolean; message?: string }>;

type EscalateFn = (
  reviewer: string,
  passcode: string,
  note?: string,
) => Promise<{ ok: boolean; message?: string }>;

type CreateProposalFn = () => Promise<
  { id?: string; errorCode?: string; message?: string } | null
>;

/**
 * Routes whose investigation outcome can never be executed by the sandbox.
 * For these, escalation is the primary (only) action and no proposal is
 * offered — mirroring the server-side eligibility rules.
 */
const ESCALATION_ONLY_ROUTES = ['SECURITY_ESCALATION', 'FINANCIAL_REVIEW', 'CHARGE_VERIFICATION'];

export function InvestigationPanel({
  ticket,
  investigation,
  proposals,
  escalations,
  running,
  onRun,
  onCreateProposal,
  onDecide,
  onEscalate,
  meta,
}: {
  ticket: { id: string; reference: string; status: string } | null;
  investigation: InvestigationView | null;
  proposals: ProposalView[];
  escalations: TicketEscalationView[];
  running: boolean;
  onRun: () => Promise<void>;
  onCreateProposal: CreateProposalFn;
  onDecide: DecideFn;
  onEscalate: EscalateFn;
  meta: MetaView | null;
}) {
  const readOnly = meta?.publicReadOnly === true;
  const route = investigation?.status === 'COMPLETED' ? investigation.proposedNextStep?.type : null;
  const escalationOnly = route != null && ESCALATION_ONLY_ROUTES.includes(route);

  return (
    <aside className="investigation" aria-label="AI investigation and next steps">
      <header className="investigation__head">
        <h2>Investigation</h2>
        {!readOnly && ticket && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onRun}
            disabled={running}
            aria-busy={running}
          >
            {running ? 'Investigating…' : investigation ? 'Re-run' : 'Run investigation'}
          </button>
        )}
      </header>

      {readOnly && (
        <p className="callout callout--info" role="note">
          <strong>Public read-only preview.</strong> Investigations and approvals are disabled on
          shared demos — run the stack locally for the full journey.
        </p>
      )}

      {running && (
        <div className="run-progress" role="status" aria-live="polite">
          <div className="run-progress__bar" aria-hidden="true">
            <span className="run-progress__fill" />
          </div>
          <p>
            Gathering this ticket&apos;s allowlisted records (read-only) and drafting a verdict.
            Real progress only — hard limits: ≤ 12 tool calls, ≤ 20 s.
          </p>
        </div>
      )}

      {!investigation && !running && ticket && !readOnly && (
        <p className="muted">
          Run an investigation to gather this ticket&apos;s records (read-only) and draft a verdict
          for your review.
        </p>
      )}
      {!investigation && !running && ticket && readOnly && (
        <p className="muted">
          No investigation is attached to this ticket in this demo dataset.
        </p>
      )}

      {investigation && (
        <InvestigationResult investigation={investigation} meta={meta} />
      )}

      {investigation?.status === 'COMPLETED' && !readOnly && (
        <>
          {escalationOnly ? (
            <EscalationPrimary
              onEscalate={onEscalate}
              escalations={escalations}
              routeLabel={
                NEXT_STEP_LABELS[route!] ?? route!
              }
            />
          ) : (
            <ProposalSection
              proposals={proposals}
              isMock={investigation.isMock}
              escalations={escalations}
              onCreateProposal={onCreateProposal}
              onDecide={onDecide}
              onEscalate={onEscalate}
              authConfigured={meta?.reviewerAuthConfigured === true}
            />
          )}
        </>
      )}
    </aside>
  );
}

/* --------------------------------------------------------------- result */

function InvestigationResult({
  investigation,
  meta,
}: {
  investigation: InvestigationView;
  meta: MetaView | null;
}) {
  const failed = investigation.status === 'FAILED';
  const keyReasons = investigation.supportingEvidence
    .filter((c) => c.note)
    .slice(0, 3);

  return (
    <article className="result" aria-live="polite">
      <div className="result__labels">
        {investigation.isMock ? (
          <span className="tag tag--mock" title="Deterministic rules over the seeded records — no AI model was called.">
            MOCK · no AI model called
          </span>
        ) : (
          <span className="tag tag--real" title="A real model call produced this result.">
            REAL MODEL · {investigation.provider} / {investigation.model}
          </span>
        )}
        {failed && <span className="tag tag--fail">Failed</span>}
        <span className="muted result__meta">
          {formatDateTime(investigation.createdAt)} UTC
        </span>
      </div>

      {failed ? (
        <p className="callout callout--warning" role="alert">
          The investigation failed safely (<code>{investigation.failureReason}</code>). Nothing was
          changed anywhere; you can re-run it.
        </p>
      ) : (
        <>
          <p className="result__verdict">{investigation.diagnosis}</p>

          <dl className="result__facts">
            {investigation.uncertainty && (
              <div>
                <dt>Uncertainty</dt>
                <dd>{uncertaintyLabel(investigation.uncertainty)}</dd>
              </div>
            )}
            {investigation.riskCategory && (
              <div>
                <dt>Risk</dt>
                <dd>
                  <span className={`risk risk--${investigation.riskCategory.toLowerCase()}`}>
                    {riskLabel(investigation.riskCategory)}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {keyReasons.length > 0 && (
            <div className="result__reasons">
              <h3 className="result__subhead">Key reasons</h3>
              <ul>
                {keyReasons.map((c) => (
                  <li key={`${c.recordType}:${c.id}`}>{c.note}</li>
                ))}
              </ul>
            </div>
          )}

          {investigation.proposedNextStep && (
            <div className="next-step">
              <h3 className="result__subhead">Next step</h3>
              <p className="next-step__route">
                {NEXT_STEP_LABELS[investigation.proposedNextStep.type] ??
                  investigation.proposedNextStep.type}
              </p>
              <p className="next-step__detail">{investigation.proposedNextStep.detail}</p>
            </div>
          )}

          <div className="result__draft">
            <h3 className="result__subhead">Draft reply for your review</h3>
            <blockquote className="draft">{investigation.draftReply}</blockquote>
            <p className="muted result__note">Nothing has been sent to anyone.</p>
          </div>

          <TechnicalDetails investigation={investigation} />
        </>
      )}
    </article>
  );
}

/* --------------------------------------------------- technical details */

function TechnicalDetails({ investigation }: { investigation: InvestigationView }) {
  return (
    <Expander label="Technical details" startOpen={false}>
      <div className="tech">
        <p className="muted tech__line">
          Provider <code>{investigation.provider}</code> · model <code>{investigation.model}</code>{' '}
          · {investigation.bounds.toolCallsUsed} tool calls · {investigation.bounds.elapsedMs} ms ·
          output retries {investigation.bounds.outputRetries}
        </p>

        {investigation.policyOverrides.length > 0 && (
          <div>
            <h4>Policy overrides applied server-side</h4>
            <ul className="tech__list">
              {investigation.policyOverrides.map((override) => (
                <li key={override}>{override}</li>
              ))}
            </ul>
          </div>
        )}

        <h4>All cited evidence</h4>
        <CitationList title="Supporting" citations={investigation.supportingEvidence} />
        <CitationList title="Contradicting" citations={investigation.contradictingEvidence} />

        <h4>Tool trace ({investigation.toolTrace.length} calls, redacted)</h4>
        <div className="table-scroll">
          <table className="record-table record-table--compact">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Tool</th>
                <th scope="col">Args</th>
                <th scope="col">Status</th>
                <th scope="col">Rows</th>
                <th scope="col">ms</th>
              </tr>
            </thead>
            <tbody>
              {investigation.toolTrace.map((entry) => (
                <tr key={entry.seq}>
                  <td>{entry.seq}</td>
                  <td>
                    <code>{entry.tool}</code>
                  </td>
                  <td>{entry.argKeys.length > 0 ? entry.argKeys.join(', ') : 'none'}</td>
                  <td>
                    {entry.status === 'ok' ? (
                      `ok (${entry.rowCount ?? 0})`
                    ) : (
                      <span title={entry.reason}>rejected — {entry.reason}</span>
                    )}
                  </td>
                  <td>{entry.rowCount ?? '—'}</td>
                  <td>{entry.durationMs ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="muted tech__line">
          The investigation read only this ticket&apos;s allowlisted records. It cannot issue
          refunds, change accounts, or contact anyone.
        </p>
      </div>
    </Expander>
  );
}

function CitationList({ title, citations }: { title: string; citations: EvidenceCitation[] }) {
  return (
    <div className="citations">
      <strong>{title}</strong>
      {citations.length === 0 ? (
        <p className="muted">none</p>
      ) : (
        <ul>
          {citations.map((c) => (
            <li key={`${c.recordType}:${c.id}`}>
              <code>
                {c.recordType.toLowerCase()}:{c.id.slice(0, 10)}…
              </code>
              {c.note && <span className="muted"> — {c.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- actions */

function ProposalSection({
  proposals,
  isMock,
  escalations,
  onCreateProposal,
  onDecide,
  onEscalate,
  authConfigured,
}: {
  proposals: ProposalView[];
  isMock: boolean;
  escalations: TicketEscalationView[];
  onCreateProposal: CreateProposalFn;
  onDecide: DecideFn;
  onEscalate: EscalateFn;
  authConfigured: boolean;
}) {
  const [reviewer, setReviewer] = useState('');
  const [passcode, setPasscode] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreate = async () => {
    setHint(null);
    const result = await onCreateProposal();
    if (result?.errorCode) {
      setHint(PROPOSAL_ERROR_HINTS[result.errorCode] ?? result.message ?? 'The proposal was refused.');
    }
  };

  return (
    <section className="actions" aria-label="Action proposal and decision">
      <h2 className="section-title">Proposed action</h2>

      {feedback && (
        <p className="callout callout--success" role="status">
          {feedback}
        </p>
      )}

      {proposals.length === 0 && (
        <div className="actions__create">
          <p className="muted">
            If the records support it, server-side code derives a bounded sandbox action from this
            investigation — the model cannot create one.
          </p>
          <button type="button" className="btn btn--primary" onClick={handleCreate}>
            Derive action proposal
          </button>
          {hint && (
            <p className="callout callout--warning" role="status">
              {hint}
            </p>
          )}
        </div>
      )}

      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          isMock={isMock}
          reviewer={reviewer}
          passcode={passcode}
          onReviewer={setReviewer}
          onPasscode={setPasscode}
          onDecide={onDecide}
          onFeedback={setFeedback}
          authConfigured={authConfigured}
        />
      ))}

      <Expander label="Escalate to a human team instead" startOpen={false}>
        <EscalationForm onEscalate={onEscalate} reviewer={reviewer} passcode={passcode} onReviewer={setReviewer} onPasscode={setPasscode} />
        <EscalationHistory escalations={escalations} />
      </Expander>
    </section>
  );
}

function ProposalCard({
  proposal,
  isMock,
  reviewer,
  passcode,
  onReviewer,
  onPasscode,
  onDecide,
  onFeedback,
  authConfigured,
}: {
  proposal: ProposalView;
  isMock: boolean;
  reviewer: string;
  passcode: string;
  onReviewer: (value: string) => void;
  onPasscode: (value: string) => void;
  onDecide: DecideFn;
  onFeedback: (message: string | null) => void;
  authConfigured: boolean;
}) {
  const [audits, setAudits] = useState<ProposalAuditView[] | null>(null);
  const [auditsOpen, setAuditsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAudits = async () => {
    const next = !auditsOpen;
    setAuditsOpen(next);
    if (next && audits === null) {
      try {
        const full: ProposalWithAuditsView = await clientApi.proposal(proposal.id);
        setAudits(full.audits);
      } catch {
        setAudits([]);
      }
    }
  };

  const decide = async (decision: 'APPROVE' | 'REJECT' | 'ESCALATE') => {
    setBusy(true);
    setError(null);
    const result = await onDecide(proposal.id, decision, reviewer, passcode);
    if (result.ok) {
      onFeedback(
        decision === 'APPROVE'
          ? 'Approved and applied to the sandbox dataset. Ticket resolved — the center panel shows the updated records.'
          : `Proposal ${decision === 'REJECT' ? 'rejected' : 'escalated'}. No data was changed.`,
      );
      onPasscode('');
    } else {
      setError(result.message ?? 'The decision was refused.');
    }
    setBusy(false);
  };

  const pending = proposal.status === 'PROPOSED';

  return (
    <article className={`proposal proposal--${proposal.status.toLowerCase()}`}>
      <header className="proposal__head">
        <span className="proposal__title">{ACTION_TYPE_LABELS[proposal.actionType] ?? proposal.actionType}</span>
        <span className={`tag tag--proposal-${proposal.status.toLowerCase()}`}>
          {PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
        </span>
      </header>

      {isMock && <p className="muted proposal__note">Derived from a MOCK investigation.</p>}
      <p className="proposal__rationale">{proposal.rationale}</p>

      <dl className="proposal__facts">
        <div>
          <dt>Targets</dt>
          <dd>{describeTargets(proposal)}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>
            <code>{proposal.policyKey}</code> · pinned {formatDateTime(proposal.policyVersion)} UTC
          </dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{formatDateTime(proposal.expiresAt)} UTC</dd>
        </div>
        {proposal.decidedBy && (
          <div>
            <dt>Decided by</dt>
            <dd>
              {proposal.decidedBy} · {formatDateTime(proposal.decidedAt ?? proposal.createdAt)} UTC
            </dd>
          </div>
        )}
        {proposal.applyError && (
          <div>
            <dt>Last failure</dt>
            <dd>
              <code>{proposal.applyError}</code> — rolled back (attempt {proposal.failureCount})
            </dd>
          </div>
        )}
      </dl>

      {pending && (
        <div className="decision">
          <label className="field">
            <span>Reviewer name</span>
            <input
              type="text"
              value={reviewer}
              maxLength={80}
              onChange={(e) => onReviewer(e.target.value)}
              autoComplete="off"
              placeholder="e.g. Dana Support"
            />
          </label>
          <label className="field">
            <span>Reviewer passcode</span>
            <input
              type="password"
              value={passcode}
              onChange={(e) => onPasscode(e.target.value)}
              autoComplete="off"
              placeholder="REVIEWER_PASSCODE"
            />
          </label>
          <div className="decision__buttons">
            <button type="button" className="btn btn--approve" disabled={busy} onClick={() => decide('APPROVE')}>
              {busy ? 'Working…' : DECISION_LABELS.APPROVE}
            </button>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => decide('REJECT')}>
              {DECISION_LABELS.REJECT}
            </button>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => decide('ESCALATE')}>
              {DECISION_LABELS.ESCALATE}
            </button>
          </div>
          <p className="muted decision__note">
            Approving re-validates expiry, record versions, policy version, and account ownership
            in one database transaction before applying. Only entitlement repair and
            duplicate-invoice correction exist.
          </p>
          {!authConfigured && (
            <p className="muted decision__note">
              Reviewer auth is not configured on the API — decisions will currently be refused.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="callout callout--warning" role="alert">
          {error}
        </p>
      )}

      <Expander label="Audit history" startOpen={false} onToggle={loadAudits}>
        {audits === null && <p className="muted">Loading audit trail…</p>}
        {audits !== null && audits.length === 0 && <p className="muted">No audit entries.</p>}
        {audits !== null && audits.length > 0 && (
          <ol className="audit">
            {audits.map((audit) => (
              <li key={audit.id} className={`audit__item audit__item--${audit.event.toLowerCase()}`}>
                <span className="audit__dot" aria-hidden="true" />
                <div>
                  <strong>{AUDIT_EVENT_LABELS[audit.event] ?? audit.event}</strong>
                  {audit.actor && <span className="muted"> · {audit.actor}</span>}
                  <span className="muted"> · {formatDateTime(audit.createdAt)} UTC</span>
                  {audit.detail?.before !== undefined && audit.detail?.after !== undefined && (
                    <pre className="audit__diff">
                      {`before ${JSON.stringify(audit.detail.before)}\nafter  ${JSON.stringify(audit.detail.after)}`}
                    </pre>
                  )}
                  {typeof audit.detail?.reason === 'string' && (
                    <p className="muted">Reason: {audit.detail.reason}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Expander>
    </article>
  );
}

/* ---------------------------------------------------------- escalation */

function EscalationPrimary({
  onEscalate,
  escalations,
  routeLabel,
}: {
  onEscalate: EscalateFn;
  escalations: TicketEscalationView[];
  routeLabel: string;
}) {
  return (
    <section className="actions actions--escalation" aria-label="Escalation">
      <h2 className="section-title">Next step</h2>
      <p className="actions__lede">
        This route has <strong>no sandbox action</strong>: {routeLabel} is the only permitted
        outcome, and escalation never changes account data.
      </p>
      <EscalationForm onEscalate={onEscalate} />
      <EscalationHistory escalations={escalations} />
    </section>
  );
}

function EscalationForm({
  onEscalate,
  reviewer,
  passcode,
  onReviewer,
  onPasscode,
}: {
  onEscalate: EscalateFn;
  reviewer?: string;
  passcode?: string;
  onReviewer?: (value: string) => void;
  onPasscode?: (value: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [name, setName] = useState(reviewer ?? '');
  const [code, setCode] = useState(passcode ?? '');

  // Share identity state with proposal decisions when the parent controls it.
  const reviewerValue = onReviewer ? (reviewer ?? '') : name;
  const passcodeValue = onPasscode ? (passcode ?? '') : code;

  const escalate = async () => {
    setBusy(true);
    setError(null);
    const result = await onEscalate(reviewerValue, passcodeValue, note || undefined);
    if (result.ok) {
      setDone(true);
      setNote('');
      onPasscode?.('');
      setCode('');
    } else {
      setError(result.message ?? 'Escalation failed.');
    }
    setBusy(false);
  };

  return (
    <div className="escalation-form">
      <label className="field">
        <span>Reviewer name</span>
        <input
          type="text"
          value={reviewerValue}
          maxLength={80}
          onChange={(e) => (onReviewer ? onReviewer(e.target.value) : setName(e.target.value))}
          autoComplete="off"
          placeholder="e.g. Dana Support"
        />
      </label>
      <label className="field">
        <span>Reviewer passcode</span>
        <input
          type="password"
          value={passcodeValue}
          onChange={(e) => (onPasscode ? onPasscode(e.target.value) : setCode(e.target.value))}
          autoComplete="off"
          placeholder="REVIEWER_PASSCODE"
        />
      </label>
      <label className="field">
        <span>Note (optional)</span>
        <input
          type="text"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          autoComplete="off"
          placeholder="e.g. Paged security on-call"
        />
      </label>
      <button type="button" className="btn btn--secondary" disabled={busy} onClick={escalate}>
        {busy ? 'Escalating…' : done ? 'Escalated — add another' : 'Escalate to human team'}
      </button>
      {error && (
        <p className="callout callout--warning" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EscalationHistory({ escalations }: { escalations: TicketEscalationView[] }) {
  if (escalations.length === 0) return null;
  return (
    <ul className="escalation-history">
      {escalations.map((e) => (
        <li key={e.id}>
          <strong>{e.escalatedBy}</strong>
          {e.note && <span> — {e.note}</span>}
          <span className="muted"> · {formatDateTime(e.createdAt)} UTC</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- helpers */

function describeTargets(proposal: ProposalView): string {
  const p = proposal.payload;
  if (proposal.actionType === 'ENTITLEMENT_REPAIR') {
    return `subscription ${short(p.subscriptionId)} → ACTIVE for the paid period (charge ${short(p.paymentId)}, invoice ${short(p.invoiceId)})`;
  }
  return `void duplicate invoice ${short(p.duplicateInvoiceId)}; keep ${short(p.canonicalInvoiceId)} and charge ${short(p.paymentId)}`;
}

function short(id: string | undefined): string {
  return id ? id.slice(0, 8) + '…' : '—';
}

function uncertaintyLabel(value: string): string {
  const map: Record<string, string> = {
    CONFIRMED: 'Confirmed from records',
    LIKELY: 'Likely',
    UNCERTAIN: 'Uncertain',
    UNRESOLVABLE: 'Not determinable from records',
  };
  return map[value] ?? value;
}

function riskLabel(value: string): string {
  const map: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent — escalate',
  };
  return map[value] ?? value;
}
