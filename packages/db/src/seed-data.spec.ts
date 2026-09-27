import { describe, expect, it } from 'vitest';
import {
  seedAccounts,
  seedCompany,
  seedPolicies,
  seedTickets,
} from './seed-data';

const accountsBySlug = new Map(seedAccounts.map((a) => [a.slug, a]));
const allPayments = seedAccounts.flatMap((a) =>
  a.payments.map((p) => ({ account: a, payment: p })),
);
const allInvoices = seedAccounts.flatMap((a) =>
  a.invoices.map((i) => ({ account: a, invoice: i })),
);
const allSubscriptions = seedAccounts.flatMap((a) =>
  a.subscriptions.map((s) => ({ account: a, subscription: s })),
);
const paymentByRef = new Map(allPayments.map(({ payment }) => [payment.ref, payment]));
const accountForPayment = new Map(
  allPayments.map(({ account, payment }) => [payment.ref, account]),
);

const ticketFor = (scenario: string) => {
  const ticket = seedTickets.find((t) => t.scenario === scenario);
  if (!ticket) throw new Error(`missing ticket for scenario ${scenario}`);
  return ticket;
};

describe('seed dataset integrity (no database required)', () => {
  it('describes exactly one fictional company', () => {
    expect(seedCompany.slug).toBe('lumina-metrics');
    expect(seedCompany.name).toContain('Lumina Metrics');
  });

  it('has unique stable keys for every record type', () => {
    expect(new Set(seedAccounts.map((a) => a.slug)).size).toBe(seedAccounts.length);
    expect(new Set(allPayments.map(({ payment }) => payment.ref)).size).toBe(
      allPayments.length,
    );
    expect(new Set(allInvoices.map(({ invoice }) => invoice.number)).size).toBe(
      allInvoices.length,
    );
    expect(
      new Set(allSubscriptions.map(({ subscription }) => subscription.key)).size,
    ).toBe(allSubscriptions.length);
    expect(new Set(seedTickets.map((t) => t.reference)).size).toBe(seedTickets.length);
    expect(new Set(seedPolicies.map((p) => p.key)).size).toBe(seedPolicies.length);
  });

  it('links every invoice to a payment owned by the same account', () => {
    for (const { account, invoice } of allInvoices) {
      if (!invoice.paymentRef) continue;
      expect(paymentByRef.has(invoice.paymentRef)).toBe(true);
      expect(accountForPayment.get(invoice.paymentRef)?.slug).toBe(account.slug);
    }
  });

  it('covers the four supported scenarios with exactly one ticket each', () => {
    const scenarios = [
      'PAID_BUT_INACTIVE_PLAN',
      'DUPLICATE_INVOICE',
      'CROSS_ACCOUNT_EXPOSURE',
      'POSSIBLE_DOUBLE_CHARGE',
    ] as const;
    for (const scenario of scenarios) {
      expect(seedTickets.filter((t) => t.scenario === scenario)).toHaveLength(1);
    }
    expect(seedTickets).toHaveLength(scenarios.length);
  });

  it('resolves every ticket account, and related accounts differ from reporters', () => {
    for (const ticket of seedTickets) {
      expect(accountsBySlug.has(ticket.accountSlug)).toBe(true);
      if (ticket.relatedAccountSlug) {
        expect(ticket.relatedAccountSlug).not.toBe(ticket.accountSlug);
        expect(accountsBySlug.has(ticket.relatedAccountSlug)).toBe(true);
      }
    }
  });

  it('backs the paid-but-inactive-plan ticket with a successful payment and a canceled subscription', () => {
    const account = accountsBySlug.get(ticketFor('PAID_BUT_INACTIVE_PLAN').accountSlug);
    expect(account?.payments.some((p) => p.status === 'SUCCEEDED')).toBe(true);
    expect(account?.subscriptions.some((s) => s.status === 'CANCELED')).toBe(true);
  });

  it('backs the duplicate-invoice ticket with exactly two invoices sharing one successful charge', () => {
    const account = accountsBySlug.get(ticketFor('DUPLICATE_INVOICE').accountSlug);
    const duplicates = account?.invoices.filter(
      (i) => i.status === 'PAID' && i.paymentRef,
    );
    expect(duplicates).toHaveLength(2);
    const refs = new Set(duplicates?.map((i) => i.paymentRef));
    expect(refs.size).toBe(1);
    const sharedRef = [...refs][0];
    const charge = sharedRef ? paymentByRef.get(sharedRef) : undefined;
    expect(charge?.status).toBe('SUCCEEDED');
    expect(new Set(duplicates?.map((i) => i.amount)).size).toBe(1);
  });

  it('backs the cross-account-exposure ticket with a distinct related account', () => {
    const ticket = ticketFor('CROSS_ACCOUNT_EXPOSURE');
    expect(ticket.relatedAccountSlug).toBeTruthy();
    expect(ticket.relatedAccountSlug).not.toBe(ticket.accountSlug);
  });

  it('leaves the possible-double-charge scenario ambiguous: two charges, each on its own invoice', () => {
    const account = accountsBySlug.get(ticketFor('POSSIBLE_DOUBLE_CHARGE').accountSlug);
    const succeeded = account?.payments.filter((p) => p.status === 'SUCCEEDED');
    expect(succeeded?.length).toBeGreaterThanOrEqual(2);
    // The dataset must NOT prove a duplicate: every succeeded payment maps to a
    // distinct invoice, so the data alone cannot settle the dispute.
    const invoiceRefs = (account?.invoices ?? [])
      .map((i) => i.paymentRef)
      .filter((ref): ref is string => Boolean(ref));
    expect(new Set(invoiceRefs).size).toBe(invoiceRefs.length);
  });

  it('documents at least one policy for every ticket scenario via tags', () => {
    for (const ticket of seedTickets) {
      const matching = seedPolicies.filter((p) => p.tags.includes(ticket.scenario));
      expect(matching.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses one currency and parseable amounts everywhere', () => {
    for (const { payment } of allPayments) {
      expect(payment.currency).toBe('USD');
      expect(Number.isFinite(Number(payment.amount))).toBe(true);
    }
    for (const { invoice } of allInvoices) {
      expect(invoice.currency).toBe('USD');
      expect(Number.isFinite(Number(invoice.amount))).toBe(true);
    }
  });

  it('keeps all fictional email addresses on the reserved .example domain', () => {
    for (const account of seedAccounts) {
      expect(account.billingEmail.endsWith('.example')).toBe(true);
    }
  });
});
