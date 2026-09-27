import { evaluateEligibility, versionKey, type EligibilityRecords } from './eligibility';
import type { RecordVersionMap } from '@billing-resolution/types';

/**
 * Pure unit tests for the server-side eligibility engine: what may be proposed
 * as an executable synthetic action, derived ONLY from live records and the
 * investigation verdict — never from model text.
 */

const baseRecords: EligibilityRecords = {
  scenario: 'PAID_BUT_INACTIVE_PLAN',
  uncertainty: 'CONFIRMED',
  proposedNextStepType: 'PLATFORM_OPS_REACTIVATION',
  subscriptions: [
    {
      id: 'sub-1',
      status: 'CANCELED',
      currentPeriodStart: new Date('2026-09-10'),
      currentPeriodEnd: new Date('2026-10-10'),
    },
  ],
  payments: [{ id: 'pay-1', status: 'SUCCEEDED', occurredAt: new Date('2026-09-12') }],
  invoices: [
    { id: 'inv-1', status: 'PAID', paymentId: 'pay-1', amount: '490.00', issuedAt: new Date('2026-09-10') },
  ],
};

const versions: RecordVersionMap = {
  [versionKey('SUBSCRIPTION', 'sub-1')]: '2026-09-27T00:00:00.000Z',
  [versionKey('PAYMENT', 'pay-1')]: '2026-09-27T00:00:00.000Z',
  [versionKey('INVOICE', 'inv-1')]: '2026-09-27T00:00:00.000Z',
};

describe('eligibility engine', () => {
  it('proposes ENTITLEMENT_REPAIR for paid-but-inactive with complete evidence', () => {
    const outcome = evaluateEligibility(baseRecords, versions);
    expect(outcome.eligible).toBe(true);
    if (outcome.eligible) {
      expect(outcome.actionType).toBe('ENTITLEMENT_REPAIR');
      expect(outcome.payload.subscriptionId).toBe('sub-1');
      expect(outcome.payload.paymentId).toBe('pay-1');
      expect(outcome.payload.invoiceId).toBe('inv-1');
      expect(Object.keys(outcome.recordVersions)).toHaveLength(3);
    }
  });

  it('refuses any executable action when uncertainty is not CONFIRMED/LIKELY', () => {
    const outcome = evaluateEligibility(
      { ...baseRecords, uncertainty: 'UNCERTAIN' },
      versions,
    );
    expect(outcome).toMatchObject({ eligible: false, code: 'not_eligible' });
  });

  it('refuses ENTITLEMENT_REPAIR when the payment falls outside the canceled period', () => {
    const outcome = evaluateEligibility(
      {
        ...baseRecords,
        payments: [{ id: 'pay-1', status: 'SUCCEEDED', occurredAt: new Date('2026-08-12') }],
      },
      versions,
    );
    expect(outcome).toMatchObject({ eligible: false, code: 'not_eligible' });
  });

  it('refuses ENTITLEMENT_REPAIR when there is no canceled subscription', () => {
    const outcome = evaluateEligibility(
      {
        ...baseRecords,
        subscriptions: [
          {
            id: 'sub-1',
            status: 'ACTIVE',
            currentPeriodStart: new Date('2026-09-10'),
            currentPeriodEnd: new Date('2026-10-10'),
          },
        ],
      },
      versions,
    );
    expect(outcome).toMatchObject({ eligible: false, code: 'not_eligible' });
  });

  it('proposes DUPLICATE_INVOICE_CORRECTION when two paid invoices share one charge', () => {
    const outcome = evaluateEligibility(
      {
        scenario: 'DUPLICATE_INVOICE',
        uncertainty: 'CONFIRMED',
        proposedNextStepType: 'DUPLICATE_INVOICE_VERIFICATION',
        subscriptions: [],
        payments: [{ id: 'pay-1', status: 'SUCCEEDED', occurredAt: new Date('2026-09-08') }],
        invoices: [
          { id: 'inv-a', status: 'PAID', paymentId: 'pay-1', amount: '1180.00', issuedAt: new Date('2026-09-08') },
          { id: 'inv-b', status: 'PAID', paymentId: 'pay-1', amount: '1180.00', issuedAt: new Date('2026-09-09') },
        ],
      },
      versions,
    );
    expect(outcome.eligible).toBe(true);
    if (outcome.eligible) {
      expect(outcome.actionType).toBe('DUPLICATE_INVOICE_CORRECTION');
      expect(outcome.payload.canonicalInvoiceId).toBe('inv-a');
      expect(outcome.payload.duplicateInvoiceId).toBe('inv-b');
    }
  });

  it('refuses DUPLICATE_INVOICE_CORRECTION when each invoice has its own charge', () => {
    const outcome = evaluateEligibility(
      {
        scenario: 'DUPLICATE_INVOICE',
        uncertainty: 'CONFIRMED',
        proposedNextStepType: 'DUPLICATE_INVOICE_VERIFICATION',
        subscriptions: [],
        payments: [
          { id: 'pay-1', status: 'SUCCEEDED', occurredAt: new Date('2026-09-08') },
          { id: 'pay-2', status: 'SUCCEEDED', occurredAt: new Date('2026-09-09') },
        ],
        invoices: [
          { id: 'inv-a', status: 'PAID', paymentId: 'pay-1', amount: '1180.00', issuedAt: new Date('2026-09-08') },
          { id: 'inv-b', status: 'PAID', paymentId: 'pay-2', amount: '1180.00', issuedAt: new Date('2026-09-09') },
        ],
      },
      versions,
    );
    expect(outcome).toMatchObject({ eligible: false, code: 'not_eligible' });
  });

  it('is escalation-only for cross-account exposure', () => {
    const outcome = evaluateEligibility(
      {
        scenario: 'CROSS_ACCOUNT_EXPOSURE',
        uncertainty: 'CONFIRMED',
        proposedNextStepType: 'SECURITY_ESCALATION',
        subscriptions: [],
        payments: [],
        invoices: [],
      },
      {},
    );
    expect(outcome).toMatchObject({ eligible: false, code: 'escalation_only' });
  });

  it('is escalation-only for ambiguous double charges', () => {
    const outcome = evaluateEligibility(
      {
        scenario: 'POSSIBLE_DOUBLE_CHARGE',
        uncertainty: 'UNCERTAIN',
        proposedNextStepType: 'FINANCIAL_REVIEW',
        subscriptions: [],
        payments: [],
        invoices: [],
      },
      {},
    );
    expect(outcome).toMatchObject({ eligible: false, code: 'escalation_only' });
  });

  it('refuses unknown next-step types the model may invent', () => {
    const outcome = evaluateEligibility(
      { ...baseRecords, proposedNextStepType: 'CHARGE_VERIFICATION' },
      versions,
    );
    expect(outcome).toMatchObject({ eligible: false, code: 'not_eligible' });
  });
});
