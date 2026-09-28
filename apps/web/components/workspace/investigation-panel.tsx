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
  RISK_LABELS,
  UNCERTAINTY_LABELS,
} from '../../lib/labels';

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
  const [reviewer, setReviewer] = useState('');
  const [passcode, setPasscode] = useState('');
  const [escalationOnlyHint, setEscalationOnlyHint] = useState<string | null>(null);
  const [decisionFeedback, setDecisionFeedback] = useState<string | null>(null);
  const readOnly = meta?.publicReadOnly === true;

  const handleCreateProposal = async () => {
    setEscalationOnlyHint(null);
    const result = await onCreateProposal();
    if (result?.errorCode) {
      setEscalationOnlyHint(
        PROPOSAL_ERROR_HINTS[result.errorCode] ?? result.message ?? 'The proposal was refused.',
      );
    }
  };

  return (
    <aside className="panel glass investigation-panel" aria-label="AI investigation and approval">
      <header className="investigation-panel__head">
        <h2>AI investigation</h2>
        {!readOnly && ticket && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onRun}
            disabled={running}
            aria-busy={running}
          >
            {running ? 'Investigating…' : investigation ? 'Re-run investigation' : 'Run investigation'}
          </button>
        )}
      </header>

      {readOnly && (
        <p className="callout callout--info" role="note">
          <strong>Public read-only preview.</strong> Investigations and approvals are disabled on
          shared demos. Run the stack locally to walk the full journey.
        </p>
      )}

      {meta && !meta.reviewerAuthConfigured && !readOnly && (
        <p className="callout callout--warning" role="note">
          Reviewer authentication is not configured (no <code>REVIEWER_PASSCODE</code>). Approval
          controls are shown but every decision will be refused until you set it.
        </p>
      )}

      {running && (
        <div className="run-progress" role="status" aria-live="polite">
          <div className="run-progress__bar" aria-hidden="true">
            <span className="run-progress__fill" />
          </div>
          <p>
            Running the bounded investigation — gathering this ticket&apos;s allowlisted records
            (read-only) and drafting a verdict for human review. Hard limits: ≤ 12 tool calls,
            ≤ 20 s. This shows real progress only; nothing is simulated.
          </p>
        </div>
      )}

      {!investigation && !running && !ticket && (
        <p className="muted">Select a ticket, then run an investigation to see the evidence behind a diagnosis.</p>
      )}
      {!investigation && !running && ticket && (
        <p className="muted">
          No investigation has been run for this ticket yet. Running one gathers only this
          ticket&apos;s allowlisted records (read-only) and produces an advisory draft for human
          review.
        </p>
      )}

      {investigation && <InvestigationResult investigation={investigation} />}

      {investigation?.status === 'COMPLETED' && !readOnly && (
        <section className="proposal-section" aria-label="Action proposal">
          <h3>Action proposal</h3>
          {proposals.length === 0 && (
            <div className="proposal-create">
              <p className="muted">
                Server-side code decides whether this investigation supports an executable sandbox
                action. Escalation-only routes (exposure, ambiguous double charge) never produce one.
              </p>
              <button type="button" className="btn btn--secondary" onClick={handleCreateProposal}>
                Derive action proposal
              </button>
              {escalationOnlyHint && (
                <p className="callout callout--warning" role="status">
                  {escalationOnlyHint}
                </p>
              )}
            </div>
          )}
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              isMock={investigation.isMock}
              reviewer={reviewer}
              passcode={passcode}
              onReviewer={setReviewer}
              onPasscode={setPasscode}
              onDecide={onDecide}
              onFeedback={setDecisionFeedback}
              authConfigured={meta?.reviewerAuthConfigured === true}
            />
          ))}
        </section>
      )}

      {decisionFeedback && (
        <p className="callout callout--success" role="status">
          {decisionFeedback}
        </p>
      )}

      {!readOnly && ticket && (
        <EscalationSection
          onEscalate={onEscalate}
          escalations={escalations}
          reviewer={reviewer}
          passcode={passcode}
          onReviewer={setReviewer}
          onPasscode={setPasscode}
        />
      )}
    </aside>
  );
}

function InvestigationResult({ investigation }: { investigation: InvestigationView }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const failed = investigation.status === 'FAILED';

  return (
    <article className="investigation-result" aria-live="polite">
      <div className="investigation-result__meta">
        <span className={`badge ${failed ? 'badge--status-open' : 'badge--status-resolved'}`}>
          {failed ? 'Failed' : 'Completed'}
        </span>
        {investigation.isMock ? (
          <span className="badge badge--mock" title="Deterministic mock rules produced this result — no AI model was called.">
            MOCK · no AI model called
          </span>
        ) : (
          <span className="badge badge--real" title="A real model call produced this result.">
            REAL MODEL · {investigation.provider} / {investigation.model}
          </span>
        )}
        <span className="muted">
          {formatDateTime(investigation.createdAt)} UTC · {investigation.bounds.toolCallsUsed} tool
          calls · {investigation.bounds.elapsedMs} ms
        </span>
      </div>

      {failed && (
        <p className="callout callout--warning" role="alert">
          The investigation failed safely (<code>{investigation.failureReason}</code>). Nothing was
          changed anywhere; you can re-run it.
        </p>
      )}

      {!failed && (
        <>
          {investigation.policyOverrides.length > 0 && (
            <ul className="policy-overrides">
              {investigation.policyOverrides.map((override) => (
                <li key={override}>
                  <strong>Policy override:</strong> {override}
                </li>
              ))}
            </ul>
          )}

          <p className="investigation-result__diagnosis">{investigation.diagnosis}</p>

          <div className="investigation-result__flags">
            {investigation.riskCategory && (
              <span className={`badge badge--risk-${investigation.riskCategory.toLowerCase()}`}>
                Risk: {RISK_LABELS[investigation.riskCategory] ?? investigation.riskCategory}
              </span>
            )}
            {investigation.uncertainty && (
              <span className={`badge badge--uncertainty-${investigation.uncertainty.toLowerCase()}`}>
                Uncertainty: {UNCERTAINTY_LABELS[investigation.uncertainty] ?? investigation.uncertainty}
              </span>
            )}
            {investigation.proposedNextStep && (
              <span className="badge badge--route">
                Route: {NEXT_STEP_LABELS[investigation.proposedNextStep.type] ?? investigation.proposedNextStep.type}
              </span>
            )}
          </div>

          {investigation.proposedNextStep && (
            <p className="investigation-result__step">
              <strong>Proposed next step:</strong> {investigation.proposedNextStep.detail}
            </p>
          )}

          <CitationList title="Supporting evidence" citations={investigation.supportingEvidence} tone="supporting" />
          <CitationList
            title="Contradicting evidence"
            citations={investigation.contradictingEvidence}
            tone="contradicting"
          />

          <section className="draft-reply-block" aria-label="Draft reply">
            <h4>Draft reply for human review</h4>
            <blockquote className="draft-reply">{investigation.draftReply}</blockquote>
            <p className="muted draft-reply__note">
              Nothing has been sent to anyone. This draft becomes the reviewer&apos;s starting point.
            </p>
          </section>

          <Expander
            open={traceOpen}
            onToggle={() => setTraceOpen((v) => !v)}
            label={`Tool trace (${investigation.toolTrace.length} calls, redacted)`}
          >
            <div className="table-scroll">
              <table className="record-table record-table--compact">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Tool</th>
                    <th scope="col">Args</th>
                    <th scope="col">Status</th>
                    <th scope="col">Rows</th>
                    <th scope="col">Duration</th>
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
                          <span className="pill pill--ok">ok</span>
                        ) : (
                          <span className="pill pill--rejected" title={entry.reason}>
                            rejected
                          </span>
                        )}
                      </td>
                      <td>{entry.rowCount ?? '—'}</td>
                      <td>{entry.durationMs ?? 0} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Expander>

          <p className="muted investigation-disclaimer">
            The investigation read only this ticket&apos;s allowlisted records. It cannot issue
            refunds, change accounts, or contact anyone — approvals below are the only path to a
            change, and only on this sandbox dataset.
          </p>
        </>
      )}
    </article>
  );
}

function CitationList({
  title,
  citations,
  tone,
}: {
  title: string;
  citations: EvidenceCitation[];
  tone: 'supporting' | 'contradicting';
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`citation-list citation-list--${tone}`}>
      <button
        type="button"
        className="expander__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="expander__chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {title} ({citations.length})
      </button>
      <div className={`expander__content ${open ? 'expander__content--open' : ''}`}>
        {citations.length === 0 ? (
          <p className="muted citation-empty">none recorded</p>
        ) : (
          <ul>
            {citations.map((c) => (
              <li key={`${c.recordType}:${c.id}`}>
                <span className="citation-chip">
                  <code>
                    {c.recordType.toLowerCase()}:{c.id.slice(0, 10)}…
                  </code>
                  {c.note && <span className="citation-note">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Expander({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="expander">
      <button type="button" className="expander__trigger" aria-expanded={open} onClick={onToggle}>
        <span className="expander__chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {label}
      </button>
      <div className={`expander__content ${open ? 'expander__content--open' : ''}`}>
        <div className="expander__inner">{children}</div>
      </div>
    </div>
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
      const status = decision === 'APPROVE' ? 'APPLIED' : decision === 'REJECT' ? 'REJECTED' : 'ESCALATED';
      onFeedback(
        decision === 'APPROVE'
          ? 'Approved and applied to the sandbox dataset. Ticket resolved — see the updated records in the center panel.'
          : `Proposal ${status.toLowerCase()}. No data was changed.`,
      );
      onPasscode('');
    } else {
      setError(result.message ?? 'The decision was refused.');
    }
    setBusy(false);
  };

  const pending = proposal.status === 'PROPOSED';
  const targets = describeTargets(proposal);

  return (
    <article className={`proposal-card proposal-card--${proposal.status.toLowerCase()}`}>
      <header className="proposal-card__head">
        <span className="badge badge--action">{ACTION_TYPE_LABELS[proposal.actionType] ?? proposal.actionType}</span>
        <span className={`badge badge--proposal-${proposal.status.toLowerCase()}`}>
          {PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
        </span>
      </header>

      {isMock && (
        <p className="muted proposal-card__mocknote">
          Derived from a <strong>MOCK</strong> investigation — deterministic rules, no AI model was
          called.
        </p>
      )}

      <p className="proposal-card__rationale">{proposal.rationale}</p>

      <dl className="proposal-card__facts">
        <div>
          <dt>Targets</dt>
          <dd>{targets}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>
            <code>{proposal.policyKey}</code> @ {formatDateTime(proposal.policyVersion)} UTC
          </dd>
        </div>
        <div>
          <dt>Version-pinned records</dt>
          <dd>{Object.keys(proposal.recordVersions).length} (drift invalidates approval)</dd>
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
              <code>{proposal.applyError}</code> (rolled back; attempt {proposal.failureCount})
            </dd>
          </div>
        )}
      </dl>

      {pending && (
        <div className="decision-controls">
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
              placeholder="from REVIEWER_PASSCODE"
            />
          </label>
          <div className="decision-controls__buttons">
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
          <p className="muted decision-controls__note">
            Approving re-validates expiry, record versions, policy version, and account ownership
            inside one database transaction before applying. Only entitlement repair and
            duplicate-invoice correction exist — nothing else can ever be applied.
          </p>
          {!authConfigured && (
            <p className="muted decision-controls__note">
              Reviewer auth is not configured on the API, so decisions will currently be refused.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="callout callout--warning" role="alert">
          {error}
        </p>
      )}

      <div className="expander">
        <button
          type="button"
          className="expander__trigger"
          aria-expanded={auditsOpen}
          onClick={loadAudits}
        >
          <span className="expander__chevron" aria-hidden="true">
            {auditsOpen ? '▾' : '▸'}
          </span>
          Audit history
        </button>
        <div className={`expander__content ${auditsOpen ? 'expander__content--open' : ''}`}>
          <div className="expander__inner">
            {audits === null && <p className="muted">Loading audit trail…</p>}
            {audits !== null && audits.length === 0 && <p className="muted">No audit entries.</p>}
            {audits !== null && audits.length > 0 && (
              <ol className="audit-timeline">
                {audits.map((audit) => (
                  <li key={audit.id} className={`audit-timeline__item audit-timeline__item--${audit.event.toLowerCase()}`}>
                    <span className="audit-timeline__dot" aria-hidden="true" />
                    <div>
                      <strong>{AUDIT_EVENT_LABELS[audit.event] ?? audit.event}</strong>
                      {audit.actor && <span className="muted"> · {audit.actor}</span>}
                      <span className="muted"> · {formatDateTime(audit.createdAt)} UTC</span>
                      {audit.detail?.before !== undefined && audit.detail?.after !== undefined && (
                        <pre className="audit-diff">
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
          </div>
        </div>
      </div>
    </article>
  );
}

function EscalationSection({
  onEscalate,
  escalations,
  reviewer,
  passcode,
  onReviewer,
  onPasscode,
}: {
  onEscalate: EscalateFn;
  escalations: TicketEscalationView[];
  reviewer: string;
  passcode: string;
  onReviewer: (value: string) => void;
  onPasscode: (value: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const escalate = async () => {
    setBusy(true);
    setError(null);
    const result = await onEscalate(reviewer, passcode, note || undefined);
    if (result.ok) {
      setDone(true);
      setNote('');
      onPasscode('');
    } else {
      setError(result.message ?? 'Escalation failed.');
    }
    setBusy(false);
  };

  return (
    <section className="escalation-section" aria-label="Escalation">
      <h3>Escalation</h3>
      <p className="muted">
        Escalation hands the ticket to a human team. It never changes account data — it is the
        required route for exposure reports and ambiguous double charges.
      </p>
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
          placeholder="from REVIEWER_PASSCODE"
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
      {escalations.length > 0 && (
        <ul className="escalation-history">
          {escalations.map((e) => (
            <li key={e.id}>
              <strong>{e.escalatedBy}</strong>
              {e.note && <span> — {e.note}</span>}
              <span className="muted"> · {formatDateTime(e.createdAt)} UTC</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describeTargets(proposal: ProposalView): string {
  const p = proposal.payload;
  if (proposal.actionType === 'ENTITLEMENT_REPAIR') {
    return `subscription ${short(p.subscriptionId)} → set ACTIVE for the paid period (charge ${short(p.paymentId)}, invoice ${short(p.invoiceId)})`;
  }
  return `void duplicate invoice ${short(p.duplicateInvoiceId)}; keep ${short(p.canonicalInvoiceId)} and charge ${short(p.paymentId)}`;
}

function short(id: string | undefined): string {
  return id ? id.slice(0, 8) + '…' : '—';
}
