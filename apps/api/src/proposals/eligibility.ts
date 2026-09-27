import type {
  ActionType,
  NextStepType,
  ProposalPayload,
  ProposalErrorCode,
  RecordVersionMap,
  TicketScenario,
  UncertaintyLevel,
} from '@billing-resolution/types';

/**
 * Server-side eligibility evaluation. The model may recommend a next step, but
 * ONLY this code — run against the live records, never against model text —
 * decides whether a concrete, bounded synthetic action may be proposed.
 *
 * The two permitted actions and their strict preconditions:
 *   ENTITLEMENT_REPAIR            — paid-but-inactive-plan: a CANCELED
 *                                   subscription whose current period is
 *                                   covered by a SUCCEEDED payment with a
 *                                   matching PAID invoice.
 *   DUPLICATE_INVOICE_CORRECTION  — duplicate-invoice: TWO OR MORE PAID
 *                                   invoices referencing the SAME SUCCEEDED
 *                                   payment (duplicate = latest issued).
 * Everything else (security escalation, financial review, charge
 * verification, or any model-invented route) is escalation-only or ineligible:
 * no account mutation exists for it and none may be proposed.
 */

export interface EligibilityRecords {
  scenario: TicketScenario;
  uncertainty: UncertaintyLevel | null;
  proposedNextStepType: NextStepType | null;
  subscriptions: {
    id: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }[];
  payments: { id: string; status: string; occurredAt: Date }[];
  invoices: {
    id: string;
    status: string;
    paymentId: string | null;
    amount: string;
    issuedAt: Date;
  }[];
}

export type EligibilityOutcome =
  | {
      eligible: true;
      actionType: ActionType;
      payload: ProposalPayload;
      rationale: string;
      recordVersions: RecordVersionMap;
    }
  | {
      eligible: false;
      code: ProposalErrorCode;
      reason: string;
    };

/** Version keys pinned by each action, so approval can detect record drift. */
export function versionKey(recordType: string, id: string): string {
  return `${recordType}:${id}`;
}

export function evaluateEligibility(
  records: EligibilityRecords,
  versions: RecordVersionMap,
): EligibilityOutcome {
  // Escalation-only routes first: for these scenarios NO account mutation may
  // ever be proposed, regardless of the investigation's confidence — the
  // POSSIBLE_DOUBLE_CHARGE override even forces UNCERTAIN by policy.
  if (
    records.scenario === 'CROSS_ACCOUNT_EXPOSURE' &&
    records.proposedNextStepType === 'SECURITY_ESCALATION'
  ) {
    return {
      eligible: false,
      code: 'escalation_only',
      reason:
        'reported cross-account exposure allows escalation only — no account mutation is ' +
        'permitted for this route',
    };
  }

  if (
    records.scenario === 'POSSIBLE_DOUBLE_CHARGE' &&
    records.proposedNextStepType === 'FINANCIAL_REVIEW'
  ) {
    return {
      eligible: false,
      code: 'escalation_only',
      reason:
        'ambiguous double-charge reports route to financial review — no mutation and no ' +
        'refund may be proposed without confirmed evidence',
    };
  }

  // Uncertainty gate: an investigation that is not at least LIKELY about its
  // own conclusion never produces an executable proposal.
  if (records.uncertainty !== 'CONFIRMED' && records.uncertainty !== 'LIKELY') {
    return {
      eligible: false,
      code: 'not_eligible',
      reason:
        `investigation uncertainty is ${records.uncertainty ?? 'unknown'}; an executable ` +
        'action requires CONFIRMED or LIKELY',
    };
  }

  if (
    records.scenario === 'PAID_BUT_INACTIVE_PLAN' &&
    records.proposedNextStepType === 'PLATFORM_OPS_REACTIVATION'
  ) {
    return evaluateEntitlementRepair(records, versions);
  }

  if (
    records.scenario === 'DUPLICATE_INVOICE' &&
    records.proposedNextStepType === 'DUPLICATE_INVOICE_VERIFICATION'
  ) {
    return evaluateDuplicateInvoiceCorrection(records, versions);
  }

  return {
    eligible: false,
    code: 'not_eligible',
    reason:
      `no executable action exists for scenario ${records.scenario} with proposed next step ` +
      `${records.proposedNextStepType ?? 'none'} — only entitlement repair and duplicate-invoice ` +
      'correction on matching scenarios can be proposed',
  };
}

function evaluateEntitlementRepair(
  records: EligibilityRecords,
  versions: RecordVersionMap,
): EligibilityOutcome {
  const canceled = records.subscriptions.find((s) => s.status === 'CANCELED');
  if (!canceled) {
    return {
      eligible: false,
      code: 'not_eligible',
      reason: 'no CANCELED subscription found on the reporter account — nothing to repair',
    };
  }
  const coveringPayment = records.payments.find(
    (p) =>
      p.status === 'SUCCEEDED' &&
      p.occurredAt >= canceled.currentPeriodStart &&
      p.occurredAt <= canceled.currentPeriodEnd,
  );
  if (!coveringPayment) {
    return {
      eligible: false,
      code: 'not_eligible',
      reason:
        'no successful payment falls inside the canceled subscription\'s current period — ' +
        'entitlement repair requires paid coverage of the period',
    };
  }
  const paidInvoice = records.invoices.find(
    (i) => i.status === 'PAID' && i.paymentId === coveringPayment.id,
  );
  if (!paidInvoice) {
    return {
      eligible: false,
      code: 'not_eligible',
      reason: 'no PAID invoice references the covering payment — evidence incomplete',
    };
  }

  const payload: ProposalPayload = {
    accountId: '',
    actionType: 'ENTITLEMENT_REPAIR',
    subscriptionId: canceled.id,
    paymentId: coveringPayment.id,
    invoiceId: paidInvoice.id,
  };
  // Pin only the records this action reads or writes — drift on unrelated
  // account records must not block an otherwise valid approval.
  const recordVersions: RecordVersionMap = {
    [versionKey('SUBSCRIPTION', canceled.id)]: versions[versionKey('SUBSCRIPTION', canceled.id)],
    [versionKey('PAYMENT', coveringPayment.id)]: versions[versionKey('PAYMENT', coveringPayment.id)],
    [versionKey('INVOICE', paidInvoice.id)]: versions[versionKey('INVOICE', paidInvoice.id)],
  };
  return {
    eligible: true,
    actionType: 'ENTITLEMENT_REPAIR',
    payload,
    rationale:
      'Records show a successful payment covering the canceled subscription\'s current period ' +
      'with a matching paid invoice. The permitted action sets the subscription back to ACTIVE ' +
      'for that period. Nothing else is changed.',
    recordVersions,
  };
}

function evaluateDuplicateInvoiceCorrection(
  records: EligibilityRecords,
  versions: RecordVersionMap,
): EligibilityOutcome {
  const byPayment = new Map<string, typeof records.invoices>();
  for (const invoice of records.invoices) {
    if (invoice.status !== 'PAID' || !invoice.paymentId) continue;
    const group = byPayment.get(invoice.paymentId) ?? [];
    group.push(invoice);
    byPayment.set(invoice.paymentId, group);
  }

  for (const [paymentId, group] of byPayment) {
    const payment = records.payments.find((p) => p.id === paymentId);
    if (!payment || payment.status !== 'SUCCEEDED') continue;
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
    const canonical = sorted[0];
    const duplicate = sorted[sorted.length - 1];
    const amountsConsistent = group.every((i) => i.amount === canonical.amount);

    const payload: ProposalPayload = {
      accountId: '',
      actionType: 'DUPLICATE_INVOICE_CORRECTION',
      paymentId,
      canonicalInvoiceId: canonical.id,
      duplicateInvoiceId: duplicate.id,
    };
    return {
      eligible: true,
      actionType: 'DUPLICATE_INVOICE_CORRECTION',
      payload,
      rationale: amountsConsistent
        ? `Two or more paid invoices reference the same successful charge. The permitted action ` +
          `voids the later duplicate invoice (${sorted.length} invoices share the charge); the ` +
          'earliest invoice and the payment record stand. No refund is issued.'
        : `Two or more paid invoices reference the same successful charge with inconsistent ` +
          'amounts — flagging for review. The permitted action voids the later duplicate ' +
          'invoice; no refund is issued.',
      recordVersions: {
        [versionKey('INVOICE', duplicate.id)]: versions[versionKey('INVOICE', duplicate.id)],
        [versionKey('INVOICE', canonical.id)]: versions[versionKey('INVOICE', canonical.id)],
        [versionKey('PAYMENT', paymentId)]: versions[versionKey('PAYMENT', paymentId)],
      },
    };
  }

  return {
    eligible: false,
    code: 'not_eligible',
    reason:
      'no successful charge is referenced by two or more paid invoices — the reported ' +
      'duplicate cannot be confirmed from the records',
  };
}
