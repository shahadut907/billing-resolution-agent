/**
 * Deployment setup step for the public read-only demo: runs the REAL bounded
 * investigation pipeline (mock provider → agent loop → validation → overrides
 * → persistence) for each seeded ticket so public visitors can see the
 * product's core workflow even though investigations cannot be triggered on
 * a read-only deployment.
 *
 * Idempotent: tickets that already have a completed investigation are
 * skipped, so the script can be re-run any number of times (and is re-run
 * after re-seeding, which deletes investigation rows).
 *
 * Every persisted result is provider="mock" / isMock=true — these are
 * deterministic rule-based drafts, never real model output.
 *
 * Usage: pnpm demo:setup            (local .env)
 *        pnpm demo:setup:remote     (.env.remote — gitignored, never in shell history)
 */
import { PrismaClient } from '@billing-resolution/db';
import { InvestigationService } from '../investigation/investigation.service';
import { ScopedTools } from '../investigation/agent/tools';

const TICKET_REFS = ['TCK-1001', 'TCK-1002', 'TCK-1003', 'TCK-1004'];

async function main(): Promise<void> {
  // Trusted setup context: this step must be able to write investigations
  // even though the deployment itself is read-only, and it always uses the
  // deterministic mock provider — never a real model, never a paid call.
  delete process.env.PUBLIC_READ_ONLY;
  process.env.AI_PROVIDER = 'mock';

  const prisma = new PrismaClient();
  const tools = new ScopedTools(prisma as never);
  const investigations = new InvestigationService(prisma as never, tools);

  let created = 0;
  let skipped = 0;
  for (const reference of TICKET_REFS) {
    const ticket = await prisma.ticket.findUnique({ where: { reference } });
    if (!ticket) {
      throw new Error(`Seeded ticket ${reference} missing — run "pnpm db:seed" first.`);
    }
    const existing = await prisma.investigation.findFirst({
      where: { ticketId: ticket.id, status: 'COMPLETED' },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      console.log(`skip   ${reference} — completed investigation ${existing.id} already exists`);
      continue;
    }
    const view = await investigations.run(ticket.id);
    if (view.status !== 'COMPLETED' || !view.isMock) {
      throw new Error(
        `${reference}: expected a completed MOCK investigation, got status=${view.status} ` +
          `provider=${view.provider} isMock=${view.isMock} reason=${view.failureReason ?? 'none'}`,
      );
    }
    created += 1;
    console.log(
      `created ${reference} — investigation ${view.id}, provider=${view.provider}, ` +
        `model=${view.model}, toolCalls=${view.bounds.toolCallsUsed}, elapsed=${view.bounds.elapsedMs}ms`,
    );
  }

  console.log(
    `Demo investigations ready: ${created} created, ${skipped} skipped ` +
      '(idempotent — safe to re-run).',
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Demo investigation setup failed:', error);
  process.exitCode = 1;
});
