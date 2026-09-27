import type { PrismaClient } from '@prisma/client';
import {
  seedAccounts,
  seedCompany,
  seedPolicies,
  seedTickets,
  type SeedAccount,
} from './seed-data';

const date = (value: string): Date => new Date(value);

/**
 * Applies the synthetic dataset via upserts on stable unique keys (slugs, refs,
 * invoice numbers, ticket references), so running it any number of times leaves
 * the database in the same state. Idempotent by construction.
 */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  const company = await prisma.company.upsert({
    where: { slug: seedCompany.slug },
    update: { name: seedCompany.name },
    create: { slug: seedCompany.slug, name: seedCompany.name },
  });

  const accountIds = new Map<string, string>();
  for (const account of seedAccounts) {
    await upsertAccountWithRecords(prisma, company.id, account, accountIds);
  }

  for (const policy of seedPolicies) {
    const data = {
      title: policy.title,
      body: policy.body,
      tags: [...policy.tags],
      effectiveFrom: date(policy.effectiveFrom),
    };
    await prisma.policy.upsert({
      where: { key: policy.key },
      update: data,
      create: { key: policy.key, companyId: company.id, ...data },
    });
  }

  for (const ticket of seedTickets) {
    const accountId = accountIds.get(ticket.accountSlug);
    if (!accountId) {
      throw new Error(
        `Seed ticket ${ticket.reference} references unknown account "${ticket.accountSlug}"`,
      );
    }
    const relatedAccountId = ticket.relatedAccountSlug
      ? accountIds.get(ticket.relatedAccountSlug)
      : null;
    if (ticket.relatedAccountSlug && !relatedAccountId) {
      throw new Error(
        `Seed ticket ${ticket.reference} references unknown related account "${ticket.relatedAccountSlug}"`,
      );
    }

    const data = {
      scenario: ticket.scenario,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      accountId,
      relatedAccountId: relatedAccountId ?? null,
      createdAt: date(ticket.createdAt),
    };
    await prisma.ticket.upsert({
      where: { reference: ticket.reference },
      update: data,
      create: { reference: ticket.reference, ...data },
    });
  }
}

async function upsertAccountWithRecords(
  prisma: PrismaClient,
  companyId: string,
  account: SeedAccount,
  accountIds: Map<string, string>,
): Promise<void> {
  const accountData = {
    name: account.name,
    billingEmail: account.billingEmail,
    status: account.status,
    companyId,
  };
  const upserted = await prisma.account.upsert({
    where: { slug: account.slug },
    update: accountData,
    create: { slug: account.slug, ...accountData },
  });
  accountIds.set(account.slug, upserted.id);

  for (const subscription of account.subscriptions) {
    const data = {
      accountId: upserted.id,
      planName: subscription.planName,
      status: subscription.status,
      seats: subscription.seats,
      currentPeriodStart: date(subscription.currentPeriodStart),
      currentPeriodEnd: date(subscription.currentPeriodEnd),
      canceledAt: subscription.canceledAt ? date(subscription.canceledAt) : null,
    };
    await prisma.subscription.upsert({
      where: { key: subscription.key },
      update: data,
      create: { key: subscription.key, ...data },
    });
  }

  const paymentIds = new Map<string, string>();
  for (const payment of account.payments) {
    const data = {
      accountId: upserted.id,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      description: payment.description ?? null,
      occurredAt: date(payment.occurredAt),
    };
    const upsertedPayment = await prisma.payment.upsert({
      where: { ref: payment.ref },
      update: data,
      create: { ref: payment.ref, ...data },
    });
    paymentIds.set(payment.ref, upsertedPayment.id);
  }

  for (const invoice of account.invoices) {
    let paymentId: string | null = null;
    if (invoice.paymentRef) {
      paymentId = paymentIds.get(invoice.paymentRef) ?? null;
      if (!paymentId) {
        throw new Error(
          `Seed invoice ${invoice.number} references unknown payment "${invoice.paymentRef}"`,
        );
      }
    }
    const data = {
      accountId: upserted.id,
      paymentId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status,
      periodStart: invoice.periodStart ? date(invoice.periodStart) : null,
      periodEnd: invoice.periodEnd ? date(invoice.periodEnd) : null,
      issuedAt: date(invoice.issuedAt),
      notes: invoice.notes ?? null,
    };
    await prisma.invoice.upsert({
      where: { number: invoice.number },
      update: data,
      create: { number: invoice.number, ...data },
    });
  }
}
