import { PrismaClient } from '@prisma/client';
import { runSeed } from './seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await runSeed(prisma);
    const [company, accounts, subscriptions, payments, invoices, tickets, policies] =
      await Promise.all([
        prisma.company.count(),
        prisma.account.count(),
        prisma.subscription.count(),
        prisma.payment.count(),
        prisma.invoice.count(),
        prisma.ticket.count(),
        prisma.policy.count(),
      ]);
    console.log(
      `Seed complete (idempotent — safe to re-run). ` +
        `company=${company} accounts=${accounts} subscriptions=${subscriptions} ` +
        `payments=${payments} invoices=${invoices} tickets=${tickets} policies=${policies}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
