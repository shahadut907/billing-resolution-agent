import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runSeed } from './seed';
import { seedAccounts, seedPolicies, seedTickets } from './seed-data';

// Probe database availability once at load time. When no PostgreSQL instance is
// reachable the suite below is reported as skipped (with the reason), never as
// a false pass and never as a failure of the code under test.
let prisma: PrismaClient | undefined;
let dbUp = false;
try {
  const probe = new PrismaClient();
  await probe.$queryRaw`SELECT 1`;
  await probe.$disconnect();
  prisma = new PrismaClient();
  dbUp = true;
} catch {
  dbUp = false;
}

afterAll(async () => {
  await prisma?.$disconnect();
});

const expectedCounts = {
  company: 1,
  accounts: seedAccounts.length,
  subscriptions: seedAccounts.reduce((n, a) => n + a.subscriptions.length, 0),
  payments: seedAccounts.reduce((n, a) => n + a.payments.length, 0),
  invoices: seedAccounts.reduce((n, a) => n + a.invoices.length, 0),
  tickets: seedTickets.length,
  policies: seedPolicies.length,
};

describe.skipIf(!dbUp)('seed idempotency (requires a reachable database)', () => {
  it('reaches the expected row counts after seeding', async () => {
    await runSeed(prisma!);
    expect(await snapshotCounts()).toEqual(expectedCounts);
  });

  it('leaves identical state when run twice (no duplicates, stable ids and created dates)', async () => {
    await runSeed(prisma!);
    const first = await snapshot();
    await runSeed(prisma!);
    const second = await snapshot();
    expect(second).toEqual(first);
  });

  it('seeds exactly one row per ticket reference after repeated runs', async () => {
    await runSeed(prisma!);
    for (const ticket of seedTickets) {
      const rows = await prisma!.ticket.findMany({
        where: { reference: ticket.reference },
      });
      expect(rows).toHaveLength(1);
    }
  });
});

async function snapshotCounts() {
  const [company, accounts, subscriptions, payments, invoices, tickets, policies] =
    await Promise.all([
      prisma!.company.count(),
      prisma!.account.count(),
      prisma!.subscription.count(),
      prisma!.payment.count(),
      prisma!.invoice.count(),
      prisma!.ticket.count(),
      prisma!.policy.count(),
    ]);
  return { company, accounts, subscriptions, payments, invoices, tickets, policies };
}

async function snapshot() {
  const [counts, accounts, tickets] = await Promise.all([
    snapshotCounts(),
    prisma!.account.findMany({ select: { slug: true, id: true, createdAt: true } }),
    prisma!.ticket.findMany({ select: { reference: true, id: true, createdAt: true } }),
  ]);
  const byKey = <T, K extends keyof T>(rows: T[], key: K) =>
    [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
  return {
    counts,
    accounts: byKey(accounts, 'slug'),
    tickets: byKey(tickets, 'reference'),
  };
}
