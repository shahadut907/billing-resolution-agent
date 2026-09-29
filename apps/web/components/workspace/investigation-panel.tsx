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
import { formatDate, formatDateTime } from '../../lib/format';
import {
  ACTION_TYPE_LABELS,
  AUDIT_EVENT_LABELS,
  DECISION_LABELS,
  NEXT_STEP_LABELS,
  PROPOSAL_ERROR_HINTS,
  PROPOSAL_STATUS_LABELS,
} from '../../lib/labels';
import { Expander } from './expander';
import { InvestigationSkeleton } from './skeleton';

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
 * Routes whose outcome can never be executed by the sandbox. For these,
 * escalation is the primary (only) action and no proposal is offered,
 * mirroring the server-side eligibility rules.
 */
const ESCALATION_ONLY_ROUTES = ['SECURITY_ESCALATION', 'FINANCIAL_REVIEW', 'CHARGE_VERIFICATION'];

export function InvestigationPanel({
  ticket,
  investigation,
  loading,
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
  loading: boolean;
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
    <aside className="investigation" aria-label="Investigation and next steps">
      <header className="investigation__head">
        <div className="investigation__titlewrap">
          <h2 className="panel-title">Investigation</h2>
          {meta?.aiProvider === 'mock' && (
            <span
              className="demo-badge demo-badge--sm"
              title="Uses deterministic demo logic over the stored records. No AI model is called, and every result is labeled as a demo result."
            >
              Demo AI
            </span>
          )}
        </div>
        {!readOnly && ticket && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onRun}
            disabled={running}
            aria-busy={running}
          >
            {running ? 'Running…' : investigation ? 'Re-run' : 'Run investigation'}
          </button>
        )}
      </header>

      {loading && !investigation && ticket && <InvestigationSkeleton />}

      {readOnly && (
        <p className="callout callout--info" role="note">
          <strong>Read-only demo.</strong> Running investigations and approving changes is
          disabled here. Run the project locally for the full workflow.
        </p>
      )}

      {running && (
        <div className="run-progress" role="status" aria-live="polite">
          <div className="run-progress__bar" aria-hidden="true">
            <span className="run-progress__fill" />
          </div>
          <p>Checking the records for this ticket and preparing a recommendation.</p>
        </div>
      )}

      {!investigation && !loading && !running && ticket && !readOnly && (
        <p className="muted investigation__empty">
          No investigation yet. Run one to review the records and get a recommended action.
        </p>
      )}
      {!investigation && !loading && !running && ticket && readOnly && (
        <p className="muted investigation__empty">No investigation is attached to this ticket.</p>
      )}

      {investigation && <ResultSections investigation={investigation} />}

      {investigation?.status === 'COMPLETED' && !readOnly && (
        <>
          {escalationOnly ? (
            <EscalationPrimary
              onEscalate={onEscalate}
              escalations={escalations}
              routeLabel={NEXT_STEP_LABELS[route!] ?? route!}
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

/* --------------------------------------------------------- result sections */

function ResultSections({ investigation }: { investigation: InvestigationView }) {
  const failed = investigation.status === 'FAILED';
  const keyReasons = investigation.supportingEvidence.filter((c) => c.note).slice(0, 3);

  if (failed) {
    return (
      <article className="result" aria-live="polite">
        <div className="result__section">
          <h3 className="result__subhead">Finding</h3>
          <p className="result__finding">The investigation could not be completed.</p>
          <p className="callout callout--warning" role="alert">
            <code>{investigation.failureReason}</code> Nothing was changed anywhere; you can run
            it again.
          </p>
        </div>
        <TechnicalDetails investigation={investigation} />
      </article>
    );
  }

  return (
    <article className="result" aria-live="polite">
      <div className="result__section">
        <div className="result__subheadrow">
          <h3 className="result__subhead">Finding</h3>
          {investigation.isMock && <span className="result__mocknote">Demo result</span>}
        </div>
        <p className="result__finding">{firstSentence(investigation.diagnosis ?? '')}</p>
      </div>

      {keyReasons.length > 0 && (
        <div className="result__section">
          <h3 className="result__subhead">Evidence</h3>
          <ul className="result__reasons">
            {keyReasons.map((c) => (
              <li key={`${c.recordType}:${c.id}`}>{c.note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="result__section">
        <h3 className="result__subhead">Risk</h3>
        <p className="result__riskline">
          <span className={`risk risk--${investigation.riskCategory?.toLowerCase() ?? 'low'}`}>
            {riskLabel(investigation.riskCategory)}
          </span>
          <span className="muted">{uncertaintyLabel(investigation.uncertainty)}</span>
        </p>
      </div>

      {investigation.proposedNextStep && (
        <div className="result__section">
          <h3 className="result__subhead">Recommended action</h3>
          <div className="next-step">
            <p className="next-step__route">
              {NEXT_STEP_LABELS[investigation.proposedNextStep.type] ??
                investigation.proposedNextStep.type}
            </p>
            <p className="next-step__detail">{investigation.proposedNextStep.detail}</p>
          </div>
        </div>
      )}

      <TechnicalDetails investigation={investigation} />
    </article>
  );
}

/* ------------------------------------------------------ technical details */

function TechnicalDetails({ investigation }: { investigation: InvestigationView }) {
  return (
    <Expander label="Technical details" startOpen={false}>
      <div className="tech">
        <p className="muted tech__line">
          Provider <code>{investigation.provider}</code> · model <code>{investigation.model}</code>{' '}
          · {investigation.bounds.toolCallsUsed} tool calls · {investigation.bounds.elapsedMs} ms ·
          finished {formatDateTime(investigation.createdAt)} UTC
        </p>

        <h4>Full analysis</h4>
        <p className="tech__line">{investigation.diagnosis}</p>

        {investigation.policyOverrides.length > 0 && (
          <>
            <h4>Policy overrides applied by the server</h4>
            <ul className="tech__list">
              {investigation.policyOverrides.map((override) => (
                <li key={override}>{override}</li>
              ))}
            </ul>
          </>
        )}

        <h4>Cited records</h4>
        <CitationList title="Supporting" citations={investigation.supportingEvidence} />
        <CitationList title="Contradicting" citations={investigation.contradictingEvidence} />

        <h4>Tool trace ({investigation.toolTrace.length} calls)</h4>
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
                    {entry.status === 'ok'
                      ? `ok (${entry.rowCount ?? 0})`
                      : `rejected: ${entry.reason}`}
                  </td>
                  <td>{entry.rowCount ?? '—'}</td>
                  <td>{entry.durationMs ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="muted tech__line">
          The investigation read only this ticket's allowlisted records and cannot change
          accounts, issue refunds, or contact anyone.
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
                {c.recordType.toLowerCase()}:{c.id.slice(0, 10)}
              </code>
              {c.note && <span className="muted"> {c.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- actions */

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
      setHint(
        PROPOSAL_ERROR_HINTS[result.errorCode] ?? result.message ?? 'The proposal was refused.',
      );
    }
  };

  return (
    <section className="actions" aria-label="Proposed action">
      <h3 className="actions__title">Proposed action</h3>

      {feedback && (
        <p className="callout callout--success" role="status">
          {feedback}
        </p>
      )}

      {proposals.length === 0 && (
        <div className="actions__create">
          <button type="button" className="btn btn--primary" onClick={handleCreate}>
            Prepare this action
          </button>
          <p className="muted actions__hint">
            The server checks the records and prepares the change for your approval.
          </p>
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
        <EscalationForm
          onEscalate={onEscalate}
          reviewer={reviewer}
          passcode={passcode}
          onReviewer={setReviewer}
          onPasscode={setPasscode}
        />
        <EscalationHistory escalations={escalations} />
      </Expander>
    </section>
  );
}

function ProposalCard({
  proposal,
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
          ? 'Done. The change was applied and the ticket is resolved.'
          : `Proposal ${decision === 'REJECT' ? 'rejected' : 'escalated'}. Nothing was changed.`,
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
        <span className="proposal__title">
          {ACTION_TYPE_LABELS[proposal.actionType] ?? proposal.actionType}
        </span>
        <span className={`tag tag--proposal-${proposal.status.toLowerCase()}`}>
          {PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
        </span>
      </header>

      <p className="proposal__rationale">{proposal.rationale}</p>

      <dl className="proposal__facts">
        <div>
          <dt>Applies to</dt>
          <dd>{describeTargets(proposal)}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>{proposal.policyKey.replace(/-/g, ' ')}</dd>
        </div>
        <div>
          <dt>Valid until</dt>
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
            <dt>Last attempt</dt>
            <dd>Failed and rolled back. You can approve again while the proposal is valid.</dd>
          </div>
        )}
      </dl>

      {pending && (
        <div className="decision">
          <div className="decision__inputs">
            <label className="field">
              <span>Your name</span>
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
              <span>Passcode</span>
              <input
                type="password"
                value={passcode}
                onChange={(e) => onPasscode(e.target.value)}
                autoComplete="off"
                placeholder="Reviewer passcode"
              />
            </label>
          </div>
          <div className="decision__buttons">
            <button
              type="button"
              className="btn btn--approve"
              disabled={busy}
              onClick={() => decide('APPROVE')}
            >
              {busy ? 'Working…' : DECISION_LABELS.APPROVE}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => decide('REJECT')}
            >
              {DECISION_LABELS.REJECT}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => decide('ESCALATE')}
            >
              {DECISION_LABELS.ESCALATE}
            </button>
          </div>
          {!authConfigured && (
            <p className="muted decision__note">
              No reviewer passcode is configured on this deployment, so decisions are refused.
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
        {audits === null && <p className="muted">Loading…</p>}
        {audits !== null && audits.length === 0 && <p className="muted">No entries.</p>}
        {audits !== null && audits.length > 0 && (
          <ol className="audit">
            {audits.map((audit) => (
              <li
                key={audit.id}
                className={`audit__item audit__item--${audit.event.toLowerCase()}`}
              >
                <span className="audit__dot" aria-hidden="true" />
                <div>
                  <strong>{AUDIT_EVENT_LABELS[audit.event] ?? audit.event}</strong>
                  {audit.actor && <span className="muted"> · {audit.actor}</span>}
                  <span className="muted"> · {formatDateTime(audit.createdAt)} UTC</span>
                  {audit.detail?.before !== undefined && audit.detail?.after !== undefined && (
                    <pre className="audit__diff">
                      {`before ${JSON.stringify(audit.detail.before)}\nafter  ${JSON.stringify(
                        audit.detail.after,
                      )}`}
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

/* -------------------------------------------------------------- escalation */

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
      <h3 className="actions__title">Escalate this ticket</h3>
      <p className="actions__lede">
        {routeLabel} is the only permitted outcome for this ticket. Escalation hands it to the
        right team and never changes account data.
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
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

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
      <div className="decision__inputs">
        <label className="field">
          <span>Your name</span>
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
          <span>Passcode</span>
          <input
            type="password"
            value={passcodeValue}
            onChange={(e) => (onPasscode ? onPasscode(e.target.value) : setCode(e.target.value))}
            autoComplete="off"
            placeholder="Reviewer passcode"
          />
        </label>
      </div>
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
        {busy ? 'Escalating…' : done ? 'Escalated' : 'Escalate to human team'}
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
          {e.note && <span> · {e.note}</span>}
          <span className="muted"> · {formatDate(e.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- helpers */

function describeTargets(proposal: ProposalView): string {
  const p = proposal.payload;
  if (proposal.actionType === 'ENTITLEMENT_REPAIR') {
    return 'the canceled subscription, for the period that was paid';
  }
  return 'the later of the two duplicate invoices';
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = /^.*?[.!?](?:\s|$)/s.exec(trimmed);
  return match ? match[0].trim() : trimmed;
}

function uncertaintyLabel(value: string | null): string {
  if (!value) return '';
  const map: Record<string, string> = {
    CONFIRMED: 'Confirmed from records',
    LIKELY: 'Likely',
    UNCERTAIN: 'Uncertain',
    UNRESOLVABLE: 'Not determinable from records',
  };
  return map[value] ?? value;
}

function riskLabel(value: string | null): string {
  if (!value) return '';
  const map: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
  };
  return map[value] ?? value;
}
