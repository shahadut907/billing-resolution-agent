/**
 * Synthetic dataset for one fictional SaaS company: "Lumina Metrics, Inc."
 * All names, email addresses (.example TLD), payment references, and amounts
 * are invented for local development and tests. Nothing here is real data.
 *
 * Records link to each other by stable keys (account slugs, payment refs,
 * invoice numbers) so the seed can upsert idempotently and tests can assert
 * cross-record integrity without a database.
 */

export type SeedAccountStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';
export type SeedSubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';
export type SeedPaymentStatus = 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type SeedPaymentMethod = 'CARD' | 'BANK_TRANSFER';
export type SeedInvoiceStatus = 'OPEN' | 'PAID' | 'VOID';
export type SeedTicketScenario =
  | 'PAID_BUT_INACTIVE_PLAN'
  | 'DUPLICATE_INVOICE'
  | 'CROSS_ACCOUNT_EXPOSURE'
  | 'POSSIBLE_DOUBLE_CHARGE';
export type SeedTicketStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
export type SeedTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SeedCompany {
  slug: string;
  name: string;
}

export interface SeedSubscription {
  key: string;
  planName: string;
  status: SeedSubscriptionStatus;
  seats: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt?: string | null;
}

export interface SeedPayment {
  ref: string;
  amount: string;
  currency: string;
  method: SeedPaymentMethod;
  status: SeedPaymentStatus;
  description?: string | null;
  occurredAt: string;
}

export interface SeedInvoice {
  number: string;
  amount: string;
  currency: string;
  status: SeedInvoiceStatus;
  paymentRef?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  issuedAt: string;
  notes?: string | null;
}

export interface SeedAccount {
  slug: string;
  name: string;
  billingEmail: string;
  status: SeedAccountStatus;
  subscriptions: SeedSubscription[];
  payments: SeedPayment[];
  invoices: SeedInvoice[];
}

export interface SeedTicket {
  reference: string;
  scenario: SeedTicketScenario;
  title: string;
  description: string;
  status: SeedTicketStatus;
  priority: SeedTicketPriority;
  accountSlug: string;
  relatedAccountSlug?: string | null;
  createdAt: string;
}

export interface SeedPolicy {
  key: string;
  title: string;
  body: string;
  tags: string[];
  effectiveFrom: string;
}

export const seedCompany: SeedCompany = {
  slug: 'lumina-metrics',
  name: 'Lumina Metrics, Inc.',
};

export const seedAccounts: SeedAccount[] = [
  {
    slug: 'bright-harbor-studio',
    name: 'Bright Harbor Studio',
    billingEmail: 'billing@brightharbor.example',
    status: 'ACTIVE',
    subscriptions: [
      {
        key: 'sub-bhs-001',
        planName: 'Metrics Pro',
        status: 'CANCELED',
        seats: 12,
        currentPeriodStart: '2026-09-10T00:00:00Z',
        currentPeriodEnd: '2026-10-10T00:00:00Z',
        canceledAt: '2026-09-11T09:14:00Z',
      },
    ],
    payments: [
      {
        ref: 'ch_syn_bhs_0001',
        amount: '490.00',
        currency: 'USD',
        method: 'CARD',
        status: 'SUCCEEDED',
        description: 'Metrics Pro — monthly (September 2026)',
        occurredAt: '2026-09-12T08:02:00Z',
      },
    ],
    invoices: [
      {
        number: 'INV-2026-09-0113',
        amount: '490.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_bhs_0001',
        periodStart: '2026-09-10T00:00:00Z',
        periodEnd: '2026-10-10T00:00:00Z',
        issuedAt: '2026-09-10T00:00:00Z',
      },
    ],
  },
  {
    slug: 'cedarline-labs',
    name: 'Cedarline Labs',
    billingEmail: 'accounts@cedarline.example',
    status: 'ACTIVE',
    subscriptions: [
      {
        key: 'sub-cdl-001',
        planName: 'Metrics Scale',
        status: 'ACTIVE',
        seats: 40,
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      },
    ],
    payments: [
      {
        ref: 'ch_syn_cdl_0001',
        amount: '1180.00',
        currency: 'USD',
        method: 'CARD',
        status: 'SUCCEEDED',
        description: 'Metrics Scale — monthly (September 2026)',
        occurredAt: '2026-09-08T14:37:00Z',
      },
    ],
    invoices: [
      {
        number: 'INV-2026-09-0204',
        amount: '1180.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_cdl_0001',
        periodStart: '2026-09-01T00:00:00Z',
        periodEnd: '2026-10-01T00:00:00Z',
        issuedAt: '2026-09-08T00:00:00Z',
      },
      {
        number: 'INV-2026-09-0205',
        amount: '1180.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_cdl_0001',
        periodStart: '2026-09-01T00:00:00Z',
        periodEnd: '2026-10-01T00:00:00Z',
        issuedAt: '2026-09-09T00:00:00Z',
        notes: 'Issued a second time for the same charge — suspected duplicate.',
      },
    ],
  },
  {
    slug: 'bluecrest-clinics',
    name: 'Bluecrest Clinics',
    billingEmail: 'finance@bluecrest.example',
    status: 'ACTIVE',
    subscriptions: [
      {
        key: 'sub-bcc-001',
        planName: 'Metrics Pro',
        status: 'ACTIVE',
        seats: 8,
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      },
    ],
    payments: [
      {
        ref: 'ch_syn_bcc_0001',
        amount: '490.00',
        currency: 'USD',
        method: 'CARD',
        status: 'SUCCEEDED',
        description: 'Metrics Pro — monthly (September 2026)',
        occurredAt: '2026-09-02T10:15:00Z',
      },
    ],
    invoices: [
      {
        number: 'INV-2026-09-0310',
        amount: '490.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_bcc_0001',
        periodStart: '2026-09-01T00:00:00Z',
        periodEnd: '2026-10-01T00:00:00Z',
        issuedAt: '2026-09-01T00:00:00Z',
      },
    ],
  },
  {
    slug: 'granite-glen-dental',
    name: 'Granite Glen Dental',
    billingEmail: 'billing@graniteglen.example',
    status: 'ACTIVE',
    subscriptions: [
      {
        key: 'sub-ggd-001',
        planName: 'Metrics Starter',
        status: 'ACTIVE',
        seats: 5,
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      },
    ],
    payments: [
      {
        ref: 'ch_syn_ggd_0001',
        amount: '240.00',
        currency: 'USD',
        method: 'CARD',
        status: 'SUCCEEDED',
        description: 'Metrics Starter — monthly (September 2026)',
        occurredAt: '2026-09-03T09:45:00Z',
      },
    ],
    invoices: [
      {
        number: 'INV-2026-09-0411',
        amount: '240.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_ggd_0001',
        periodStart: '2026-09-01T00:00:00Z',
        periodEnd: '2026-10-01T00:00:00Z',
        issuedAt: '2026-09-01T00:00:00Z',
      },
    ],
  },
  {
    slug: 'juniper-workshops',
    name: 'Juniper Workshops',
    billingEmail: 'ap@juniperworkshops.example',
    status: 'ACTIVE',
    subscriptions: [
      {
        key: 'sub-jws-001',
        planName: 'Metrics Starter',
        status: 'ACTIVE',
        seats: 6,
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      },
    ],
    payments: [
      {
        ref: 'ch_syn_jws_0001',
        amount: '240.00',
        currency: 'USD',
        method: 'CARD',
        status: 'SUCCEEDED',
        description: 'Metrics Starter — monthly (September 2026)',
        occurredAt: '2026-09-14T11:20:00Z',
      },
      {
        ref: 'ch_syn_jws_0002',
        amount: '240.00',
        currency: 'USD',
        method: 'CARD',
        status: 'SUCCEEDED',
        description: 'Metrics Starter — September 2026 (adjustment)',
        occurredAt: '2026-09-16T09:03:00Z',
      },
    ],
    invoices: [
      {
        number: 'INV-2026-09-0507',
        amount: '240.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_jws_0001',
        periodStart: '2026-09-01T00:00:00Z',
        periodEnd: '2026-10-01T00:00:00Z',
        issuedAt: '2026-09-14T00:00:00Z',
      },
      {
        number: 'INV-2026-09-0508',
        amount: '240.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_jws_0002',
        periodStart: '2026-09-01T00:00:00Z',
        periodEnd: '2026-10-01T00:00:00Z',
        issuedAt: '2026-09-16T00:00:00Z',
        notes: 'Same billing period as INV-2026-09-0507 — origin not confirmed.',
      },
    ],
  },
  {
    slug: 'mosaic-fields-coop',
    name: 'Mosaic Fields Co-op',
    billingEmail: 'billing@mosaicfields.example',
    status: 'ACTIVE',
    subscriptions: [
      {
        key: 'sub-mfc-001',
        planName: 'Metrics Pro',
        status: 'ACTIVE',
        seats: 20,
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      },
    ],
    payments: [
      {
        ref: 'ch_syn_mfc_0001',
        amount: '490.00',
        currency: 'USD',
        method: 'CARD',
        status: 'SUCCEEDED',
        description: 'Metrics Pro — monthly (September 2026)',
        occurredAt: '2026-09-05T12:00:00Z',
      },
    ],
    invoices: [
      {
        number: 'INV-2026-09-0601',
        amount: '490.00',
        currency: 'USD',
        status: 'PAID',
        paymentRef: 'ch_syn_mfc_0001',
        periodStart: '2026-09-01T00:00:00Z',
        periodEnd: '2026-10-01T00:00:00Z',
        issuedAt: '2026-09-05T00:00:00Z',
      },
    ],
  },
];

export const seedTickets: SeedTicket[] = [
  {
    reference: 'TCK-1001',
    scenario: 'PAID_BUT_INACTIVE_PLAN',
    title: 'Plan shows inactive after successful payment',
    description:
      'Our Metrics Pro subscription was canceled on 11 Sep without anyone on our team canceling it, yet our card was charged $490 on 12 Sep (invoice INV-2026-09-0113). Our dashboard still shows the plan as inactive and usage tracking has stopped. We paid for September — please restore the plan for the period we paid for.',
    status: 'IN_REVIEW',
    priority: 'HIGH',
    accountSlug: 'bright-harbor-studio',
    createdAt: '2026-09-15T10:05:00Z',
  },
  {
    reference: 'TCK-1002',
    scenario: 'DUPLICATE_INVOICE',
    title: 'Two invoices for the same charge',
    description:
      'We received invoices INV-2026-09-0204 and INV-2026-09-0205, both for $1,180 for September. Our accounting software matched both invoices to a single card charge of $1,180 from 8 Sep. Please confirm which invoice is the valid one so we can correct our books.',
    status: 'OPEN',
    priority: 'MEDIUM',
    accountSlug: 'cedarline-labs',
    createdAt: '2026-09-18T09:26:00Z',
  },
  {
    reference: 'TCK-1003',
    scenario: 'CROSS_ACCOUNT_EXPOSURE',
    title: "We can see another customer's billing records in our account",
    description:
      "While exporting our September invoices today, our billing page showed an invoice and a payment that do not belong to us — they appear to belong to a different organization. We have not shared our login with anyone. Please investigate who has access to our data and how this happened.",
    status: 'OPEN',
    priority: 'URGENT',
    accountSlug: 'bluecrest-clinics',
    relatedAccountSlug: 'granite-glen-dental',
    createdAt: '2026-09-22T16:41:00Z',
  },
  {
    reference: 'TCK-1004',
    scenario: 'POSSIBLE_DOUBLE_CHARGE',
    title: 'Possible duplicate charge for September',
    description:
      'Our card statement shows two $240 charges this month, on 14 Sep and 16 Sep, both labeled for the same plan. We did not intentionally make a second purchase in September. Can you check whether one of these charges is a duplicate?',
    status: 'OPEN',
    priority: 'MEDIUM',
    accountSlug: 'juniper-workshops',
    createdAt: '2026-09-19T13:12:00Z',
  },
];

export const seedPolicies: SeedPolicy[] = [
  {
    key: 'paid-plan-reactivation',
    title: 'Paid but inactive plan — reactivation',
    body:
      'If a customer reports an inactive plan and account records show a successful payment covering the current period, Billing Support verifies the payment and subscription records, then escalates to Platform Operations for reactivation within one business day. Root cause is documented before any compensation is discussed.',
    tags: ['PAID_BUT_INACTIVE_PLAN'],
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    key: 'duplicate-invoice-handling',
    title: 'Duplicate invoices for a single charge',
    body:
      "If two invoices reference the same successful payment, Billing Support confirms the charge against the payment record on file, voids the duplicate invoice, and corrects the customer's account balance. Any amount actually collected twice is refunded after a senior billing analyst reviews the case.",
    tags: ['DUPLICATE_INVOICE'],
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    key: 'cross-account-exposure-response',
    title: 'Reported cross-account data exposure',
    body:
      "Reports that one customer can view another customer's billing data are treated as potential privacy incidents. Billing Support preserves the records as reported, notifies the security on-call within one hour, and does not disclose the other account's details to the reporting customer while the incident is triaged.",
    tags: ['CROSS_ACCOUNT_EXPOSURE'],
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    key: 'possible-double-charge-review',
    title: 'Possible double charge — review',
    body:
      'When a customer reports a possible double charge and records show two successful payments of similar amounts within five days, Billing Support compares the invoices and payment references. If each payment maps to a distinct invoice for a legitimate billing period, the charges stand; if both payments map to the same charge or period without cause, the duplicate is refunded.',
    tags: ['POSSIBLE_DOUBLE_CHARGE'],
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
];
