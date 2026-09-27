/**
 * Shared API contract types for the Billing Resolution Agent support console.
 * Milestone 1 is read-only: these describe what the API returns, nothing more.
 */

export const TICKET_SCENARIOS = [
  'PAID_BUT_INACTIVE_PLAN',
  'DUPLICATE_INVOICE',
  'CROSS_ACCOUNT_EXPOSURE',
  'POSSIBLE_DOUBLE_CHARGE',
] as const;
export type TicketScenario = (typeof TICKET_SCENARIOS)[number];

export const TICKET_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface AccountSummary {
  id: string;
  name: string;
  billingEmail: string;
  status: string;
  createdAt: string;
}

export interface TicketSummary {
  id: string;
  reference: string;
  scenario: TicketScenario;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  account: {
    id: string;
    name: string;
  };
}

export interface SubscriptionView {
  id: string;
  planName: string;
  status: string;
  seats: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
}

export interface PaymentView {
  id: string;
  ref: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  description: string | null;
  occurredAt: string;
}

export interface InvoiceView {
  id: string;
  number: string;
  amount: string;
  currency: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  paymentId: string | null;
  notes: string | null;
}

export interface PolicyView {
  id: string;
  key: string;
  title: string;
  body: string;
}

export interface TicketDetail {
  ticket: TicketSummary & {
    description: string;
    updatedAt: string;
    relatedAccountId: string | null;
  };
  account: AccountSummary;
  relatedAccount: AccountSummary | null;
  subscriptions: SubscriptionView[];
  payments: PaymentView[];
  invoices: InvoiceView[];
  policies: PolicyView[];
}

export interface HealthResponse {
  status: string;
  database: boolean;
}

/**
 * Milestone 2: bounded, read-only AI investigation contract. Investigations
 * are advisory drafts for human review — nothing is executed, refunded, or sent.
 */

export const UNCERTAINTY_LEVELS = [
  'CONFIRMED',
  'LIKELY',
  'UNCERTAIN',
  'UNRESOLVABLE',
] as const;
export type UncertaintyLevel = (typeof UNCERTAINTY_LEVELS)[number];

export const RISK_CATEGORIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const NEXT_STEP_TYPES = [
  'PLATFORM_OPS_REACTIVATION',
  'DUPLICATE_INVOICE_VERIFICATION',
  'SECURITY_ESCALATION',
  'FINANCIAL_REVIEW',
  'CHARGE_VERIFICATION',
] as const;
export type NextStepType = (typeof NEXT_STEP_TYPES)[number];

export const EVIDENCE_RECORD_TYPES = [
  'TICKET',
  'ACCOUNT',
  'SUBSCRIPTION',
  'PAYMENT',
  'INVOICE',
  'POLICY',
] as const;
export type EvidenceRecordType = (typeof EVIDENCE_RECORD_TYPES)[number];

export type InvestigationStatus = 'COMPLETED' | 'FAILED';

export interface EvidenceCitation {
  recordType: EvidenceRecordType;
  id: string;
  note?: string;
}

/** Redacted tool trace entry: no record payloads, only ids and counts. */
export interface ToolTraceEntry {
  seq: number;
  tool: string;
  argKeys: string[];
  status: 'ok' | 'rejected';
  reason?: string;
  rowCount?: number;
  recordIds?: string[];
  durationMs?: number;
}

export interface InvestigationBoundsView {
  timeBudgetMs: number;
  maxToolCalls: number;
  toolCallsUsed: number;
  elapsedMs: number;
  providerRetries: number;
  outputRetries: number;
  turns: number;
}

export interface InvestigationView {
  id: string;
  ticketId: string;
  status: InvestigationStatus;
  provider: string;
  model: string;
  isMock: boolean;
  diagnosis: string | null;
  uncertainty: UncertaintyLevel | null;
  riskCategory: RiskCategory | null;
  proposedNextStep: { type: NextStepType; detail: string } | null;
  draftReply: string | null;
  supportingEvidence: EvidenceCitation[];
  contradictingEvidence: EvidenceCitation[];
  toolTrace: ToolTraceEntry[];
  bounds: InvestigationBoundsView;
  policyOverrides: string[];
  failureReason: string | null;
  createdAt: string;
}

/**
 * Milestone 3: human approval and action workflow. A proposal is the ONLY
 * path from an investigation to a permitted synthetic change, and only an
 * authenticated reviewer decision can move it forward.
 */

export const ACTION_TYPES = ['ENTITLEMENT_REPAIR', 'DUPLICATE_INVOICE_CORRECTION'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const PROPOSAL_STATUSES = ['PROPOSED', 'APPLIED', 'REJECTED', 'ESCALATED'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_DECISIONS = ['APPROVED', 'REJECTED', 'ESCALATED'] as const;
export type ProposalDecision = (typeof PROPOSAL_DECISIONS)[number];

export const PROPOSAL_AUDIT_EVENTS = [
  'PROPOSAL_CREATED',
  'DECISION_RECORDED',
  'APPROVAL_REJECTED',
  'APPLY_SUCCEEDED',
  'APPLY_FAILED',
] as const;
export type ProposalAuditEvent = (typeof PROPOSAL_AUDIT_EVENTS)[number];

export const DECISION_ACTIONS = ['APPROVE', 'REJECT', 'ESCALATE'] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** Immutable action target. Every id belongs to the ticket's reporter account. */
export interface ProposalPayload {
  accountId: string;
  actionType: ActionType;
  subscriptionId?: string;
  paymentId?: string;
  invoiceId?: string;
  canonicalInvoiceId?: string;
  duplicateInvoiceId?: string;
}

/** `${recordType}:${id}` -> ISO updatedAt captured when the proposal was written. */
export type RecordVersionMap = Record<string, string>;

export interface ProposalView {
  id: string;
  ticketId: string;
  investigationId: string;
  actionType: ActionType;
  status: ProposalStatus;
  payload: ProposalPayload;
  evidence: EvidenceCitation[];
  recordVersions: RecordVersionMap;
  policyId: string;
  policyKey: string;
  policyVersion: string;
  rationale: string;
  expiresAt: string;
  decision: ProposalDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  appliedAt: string | null;
  applyError: string | null;
  failureCount: number;
  createdAt: string;
}

export interface ProposalAuditView {
  id: string;
  proposalId: string;
  event: ProposalAuditEvent;
  actor: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface ProposalWithAuditsView {
  proposal: ProposalView;
  audits: ProposalAuditView[];
}

export interface ProposalDecisionRequest {
  decision: DecisionAction;
  reviewer: string;
  passcode: string;
}

export interface ProposalDecisionResult {
  proposal: ProposalView;
  ticket: { id: string; reference: string; status: TicketStatus };
  audits: ProposalAuditView[];
}

export interface TicketEscalationView {
  id: string;
  ticketId: string;
  escalatedBy: string;
  note: string | null;
  createdAt: string;
}

/** Server capabilities the UI needs to render honest controls. */
export interface MetaView {
  reviewerAuthConfigured: boolean;
  publicReadOnly: boolean;
}

export type ProposalErrorCode =
  | 'no_completed_investigation'
  | 'escalation_only'
  | 'not_eligible'
  | 'proposal_exists'
  | 'not_found'
  | 'already_decided'
  | 'expired'
  | 'policy_changed'
  | 'record_changed'
  | 'account_mismatch'
  | 'invalid_passcode'
  | 'reviewer_auth_not_configured'
  | 'invalid_request'
  | 'ticket_not_found'
  | 'public_read_only';

export interface ProposalErrorBody {
  code: ProposalErrorCode;
  message: string;
}
