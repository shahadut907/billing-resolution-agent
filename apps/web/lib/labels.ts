import type { TicketPriority, TicketScenario, TicketStatus } from '@billing-resolution/types';

export const SCENARIO_LABELS: Record<TicketScenario, string> = {
  PAID_BUT_INACTIVE_PLAN: 'Paid but inactive plan',
  DUPLICATE_INVOICE: 'Duplicate invoice',
  CROSS_ACCOUNT_EXPOSURE: 'Cross-account exposure',
  POSSIBLE_DOUBLE_CHARGE: 'Possible double charge',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  CLOSED: 'Closed',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  TRIALING: 'Trialing',
  PAST_DUE: 'Past due',
  CANCELED: 'Canceled',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  PAID: 'Paid',
  VOID: 'Void',
};

export const RISK_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent — escalate',
};

export const UNCERTAINTY_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmed from records',
  LIKELY: 'Likely',
  UNCERTAIN: 'Uncertain',
  UNRESOLVABLE: 'Not determinable from records',
};

export const NEXT_STEP_LABELS: Record<string, string> = {
  PLATFORM_OPS_REACTIVATION: 'Platform Ops reactivation review',
  DUPLICATE_INVOICE_VERIFICATION: 'Duplicate invoice verification',
  SECURITY_ESCALATION: 'Security escalation',
  FINANCIAL_REVIEW: 'Financial review',
  CHARGE_VERIFICATION: 'Charge verification',
};

export const INVESTIGATION_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export const ACTION_TYPE_LABELS: Record<string, string> = {
  ENTITLEMENT_REPAIR: 'Entitlement repair (sandbox)',
  DUPLICATE_INVOICE_CORRECTION: 'Duplicate invoice correction (sandbox)',
};

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Awaiting decision',
  APPLIED: 'Applied',
  REJECTED: 'Rejected',
  ESCALATED: 'Escalated',
};

export const DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Approve & apply',
  REJECT: 'Reject proposal',
  ESCALATE: 'Escalate',
};

export const AUDIT_EVENT_LABELS: Record<string, string> = {
  PROPOSAL_CREATED: 'Proposal created (server-side eligibility check passed)',
  DECISION_RECORDED: 'Reviewer decision recorded',
  APPROVAL_REJECTED: 'Approval refused by validation',
  APPLY_SUCCEEDED: 'Sandbox action applied',
  APPLY_FAILED: 'Application failed and rolled back',
};

export const PROPOSAL_ERROR_HINTS: Record<string, string> = {
  escalation_only:
    'This route allows escalation only — no account mutation may be proposed for it.',
  not_eligible:
    'The records do not support an executable action right now. Run a fresh investigation.',
  no_completed_investigation: 'Run an investigation first — proposals derive from completed ones.',
  proposal_exists: 'A proposal already exists for this investigation.',
};
