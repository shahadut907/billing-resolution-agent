import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service';
import { runSeed } from '@billing-resolution/db';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Database-backed gate tests for the human approval and action workflow.
 * Every test below runs against the real PostgreSQL database and the seeded
 * synthetic dataset, proving the invariants that mocks cannot:
 *
 *  - an unauthorized (missing/wrong/unconfigured passcode) approval is rejected;
 *  - an expired proposal cannot be applied;
 *  - a changed policy invalidates a pending approval;
 *  - changed records invalidate a pending approval;
 *  - wrong-account access fails;
 *  - duplicate and concurrent approvals never repeat a mutation (exactly once);
 *  - a transaction failure never marks the ticket resolved;
 *  - all four seeded scenarios reach their intended outcomes.
 */

const PASSCODE = 'e2e-reviewer-passcode-9f2';
const reviewerHeaders = {
  decision: 'APPROVE' as const,
  reviewer: 'E2E Reviewer',
  passcode: PASSCODE,
};

const dbUp =
  fs.existsSync(path.join(__dirname, '.db-status')) &&
  fs.readFileSync(path.join(__dirname, '.db-status'), 'utf8').trim() === 'up';
const describeIfDb = dbUp ? describe : describe.skip;
if (!dbUp) {
  console.warn('[e2e] No reachable PostgreSQL detected — the workflow suite reports as SKIPPED.');
}

describeIfDb('Action proposal workflow (e2e, real database)', () => {
  let app: INestApplication;
  let prisma: PrismaServiceType;

  const ids: Record<string, string> = {};

  async function findId(reference: string): Promise<string> {
    const ticket = await prisma.ticket.findUnique({ where: { reference } });
    if (!ticket) throw new Error(`Seeded ticket ${reference} missing`);
    return ticket.id;
  }

  /** Deletes workflow rows and re-seeds, restoring the pristine synthetic dataset. */
  async function resetDatabase(): Promise<void> {
    await prisma.proposalAudit.deleteMany({});
    await prisma.appliedAction.deleteMany({});
    await prisma.actionProposal.deleteMany({});
    await prisma.ticketEscalation.deleteMany({});
    await prisma.investigation.deleteMany({});
    await runSeed(prisma);
  }

  /** Runs a mock investigation for a ticket and returns the investigation view. */
  async function runInvestigation(ticketId: string): Promise<any> {
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/investigation`)
      .expect(201);
    return res.body;
  }

  /** Creates the proposal for a ticket's latest investigation, asserting eligibility. */
  async function createProposal(ticketId: string): Promise<any> {
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ticketId}/proposal`)
      .expect(201);
    return res.body;
  }

  beforeAll(async () => {
    process.env.REVIEWER_PASSCODE = PASSCODE;
    delete process.env.PUBLIC_READ_ONLY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase();
    ids.TCK1 = await findId('TCK-1001');
    ids.TCK2 = await findId('TCK-1002');
    ids.TCK3 = await findId('TCK-1003');
    ids.TCK4 = await findId('TCK-1004');
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.PUBLIC_READ_ONLY;
  });

  // ---------------------------------------------------------------- helpers

  const decider = (proposalId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/proposals/${proposalId}/decision`).send(body);

  const approve = (proposalId: string, passcode: string = PASSCODE, reviewer = 'E2E Reviewer') =>
    decider(proposalId, { decision: 'APPROVE', reviewer, passcode });

  async function subscriptionFor(ticketId: string) {
    const account = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { accountId: true },
    });
    return prisma.subscription.findFirstOrThrow({ where: { accountId: account.accountId } });
  }

  // ---------------------------------------------------- reviewer identity

  it('rejects an approval with a missing passcode (401)', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    const res = await decider(proposal.id as string, {
      decision: 'APPROVE',
      reviewer: 'E2E Reviewer',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_passcode');
    expect((await subscriptionFor(ids.TCK1)).status).toBe('CANCELED');
  });

  it('rejects an approval with a wrong passcode (401)', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    const res = await approve(proposal.id as string, 'totally-wrong');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_passcode');
    expect((await subscriptionFor(ids.TCK1)).status).toBe('CANCELED');
  });

  it('rejects a missing reviewer name even with a valid passcode', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    const res = await decider(proposal.id as string, {
      decision: 'APPROVE',
      reviewer: '   ',
      passcode: PASSCODE,
    });
    expect(res.status).toBe(401);
  });

  it('disables decisions entirely when no passcode is configured (503, no default)', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    const previous = process.env.REVIEWER_PASSCODE;
    delete process.env.REVIEWER_PASSCODE;
    try {
      const res = await approve(proposal.id as string, 'anything');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('reviewer_auth_not_configured');
      expect((await subscriptionFor(ids.TCK1)).status).toBe('CANCELED');
    } finally {
      process.env.REVIEWER_PASSCODE = previous;
    }
  });

  // ------------------------------------------------------ proposal creation

  it('creates an entitlement-repair proposal from a completed investigation (TCK-1001)', async () => {
    const investigation = await runInvestigation(ids.TCK1);
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK1}/proposal`)
      .expect(201);
    expect(res.body.actionType).toBe('ENTITLEMENT_REPAIR');
    expect(res.body.status).toBe('PROPOSED');
    expect(res.body.investigationId).toBe(investigation.id);
    expect(res.body.payload.subscriptionId).toBeTruthy();
    expect(res.body.payload.accountId).toBeTruthy();
    expect(res.body.rationale).toBeTruthy();
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.evidence.length).toBeGreaterThan(0);
    expect(Object.keys(res.body.recordVersions).length).toBe(3);
  });

  it('refuses a second proposal for the same investigation (409 proposal_exists)', async () => {
    await runInvestigation(ids.TCK1);
    await request(app.getHttpServer()).post(`/api/tickets/${ids.TCK1}/proposal`).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK1}/proposal`)
      .expect(409);
    expect(res.body.code).toBe('proposal_exists');
  });

  it('refuses proposal creation without a completed investigation (409)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK1}/proposal`)
      .expect(409);
    expect(res.body.code).toBe('no_completed_investigation');
  });

  it('offers escalation only for the cross-account exposure scenario (TCK-1003, no mutation)', async () => {
    await runInvestigation(ids.TCK3);
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK3}/proposal`)
      .expect(409);
    expect(res.body.code).toBe('escalation_only');
  });

  it('offers escalation only for the ambiguous double-charge scenario (TCK-1004, no mutation)', async () => {
    await runInvestigation(ids.TCK4);
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK4}/proposal`)
      .expect(409);
    expect(res.body.code).toBe('escalation_only');
  });

  // ------------------------------------------------------------- gate tests

  it('refuses an expired proposal and audits the rejection without applying anything', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    await prisma.actionProposal.update({
      where: { id: proposal.id as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await approve(proposal.id as string);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('expired');

    expect((await subscriptionFor(ids.TCK1)).status).toBe('CANCELED');
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK1 } });
    expect(ticket.status).toBe('IN_REVIEW'); // not RESOLVED
    const audits = await prisma.proposalAudit.findMany({
      where: { proposalId: proposal.id as string },
    });
    expect(audits.some((a) => a.event === 'APPROVAL_REJECTED')).toBe(true);
  });

  it('refuses approval when the backing policy changed after the proposal was written', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    await prisma.policy.update({
      where: { key: 'paid-plan-reactivation' },
      data: { body: 'Changed after proposal creation — the approval must now fail.' },
    });

    const res = await approve(proposal.id as string);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('policy_changed');
    expect((await subscriptionFor(ids.TCK1)).status).toBe('CANCELED');
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK1 } });
    expect(ticket.status).not.toBe('RESOLVED');
  });

  it('refuses approval when a pinned record changed after the proposal was written', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    const subscription = await subscriptionFor(ids.TCK1);
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { seats: subscription.seats + 1 },
    });

    const res = await approve(proposal.id as string);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('record_changed');
    expect((await subscriptionFor(ids.TCK1)).status).toBe('CANCELED');
  });

  it('refuses approval when the target record was moved to another account (wrong-account)', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    const subscription = await subscriptionFor(ids.TCK1);
    const otherAccount = await prisma.account.findFirstOrThrow({
      where: { id: { not: subscription.accountId } },
    });
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { accountId: otherAccount.id },
    });

    const res = await approve(proposal.id as string);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account_mismatch');
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK1 } });
    expect(ticket.status).not.toBe('RESOLVED');
    expect(await prisma.appliedAction.count()).toBe(0);
  });

  it('applies an approval exactly once under concurrent duplicate approvals', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);

    const [r1, r2, r3] = await Promise.allSettled([
      approve(proposal.id as string, PASSCODE, 'Reviewer One'),
      approve(proposal.id as string, PASSCODE, 'Reviewer Two'),
      approve(proposal.id as string, PASSCODE, 'Reviewer Three'),
    ]);
    const statuses = [r1, r2, r3].map((r) =>
      r.status === 'fulfilled' ? r.value.status : 0,
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);

    // Exactly one applied action, one audit trail of a successful application.
    expect(await prisma.appliedAction.count()).toBe(1);
    const applied = await prisma.appliedAction.findFirstOrThrow();
    expect(applied.actionType).toBe('ENTITLEMENT_REPAIR');

    const subscription = await subscriptionFor(ids.TCK1);
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.canceledAt).toBeNull();

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK1 } });
    expect(ticket.status).toBe('RESOLVED');

    const audits = await prisma.proposalAudit.findMany({
      where: { proposalId: proposal.id as string, event: 'APPLY_SUCCEEDED' },
    });
    expect(audits).toHaveLength(1);
    const detail = audits[0].detail as { before: unknown; after: unknown };
    expect(detail.before).toBeTruthy();
    expect(detail.after).toBeTruthy();

    const stored = await prisma.actionProposal.findUniqueOrThrow({
      where: { id: proposal.id as string },
    });
    expect(stored.status).toBe('APPLIED');
    expect(stored.appliedAt).toBeTruthy();
  });

  it('rolls back completely when application fails — the ticket is NOT resolved', async () => {
    // Simulate a crash-consistency scenario: an earlier approval already
    // inserted the exactly-once ledger row, but the records were re-provisioned
    // to their pre-application state afterwards. A new proposal passes
    // validation, then the apply transaction must hit the unique constraint,
    // roll back entirely, and leave the ticket unresolved.
    await runInvestigation(ids.TCK1);
    const proposalA = await createProposal(ids.TCK1);
    await approve(proposalA.id as string).expect(200);
    expect(await prisma.appliedAction.count({ where: { ticketId: ids.TCK1 } })).toBe(1);

    // Re-provision the record to its pre-application state.
    const subscription = await subscriptionFor(ids.TCK1);
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
    await prisma.ticket.update({ where: { id: ids.TCK1 }, data: { status: 'IN_REVIEW' } });

    // A fresh investigation + proposal whose pinned versions match live state.
    await runInvestigation(ids.TCK1);
    const proposalB = await createProposal(ids.TCK1);

    const res = await approve(proposalB.id as string);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('already_decided');

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK1 } });
    expect(ticket.status).not.toBe('RESOLVED');

    const stillCanceled = await subscriptionFor(ids.TCK1);
    expect(stillCanceled.status).toBe('CANCELED'); // mutation rolled back

    const stored = await prisma.actionProposal.findUniqueOrThrow({
      where: { id: proposalB.id as string },
    });
    expect(stored.status).toBe('PROPOSED'); // retryable, nothing half-applied
    expect(stored.failureCount).toBe(1);
    const audits = await prisma.proposalAudit.findMany({
      where: { proposalId: proposalB.id as string, event: 'APPLY_FAILED' },
    });
    expect(audits).toHaveLength(1);
  });

  // ------------------------------------------------------- scenario journeys

  it('Scenario 1 (TCK-1001): approve repairs the entitlement and resolves the ticket exactly once', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    const res = await approve(proposal.id as string);
    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('RESOLVED');
    expect(res.body.proposal.status).toBe('APPLIED');

    const subscription = await subscriptionFor(ids.TCK1);
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.canceledAt).toBeNull();

    // Approving again must not repeat the mutation.
    const again = await approve(proposal.id as string, PASSCODE, 'Late Reviewer');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_decided');
    expect(await prisma.appliedAction.count()).toBe(1);
  });

  it('Scenario 2 (TCK-1002): approve voids only the duplicate invoice; reject leaves everything untouched', async () => {
    await runInvestigation(ids.TCK2);
    const account = await prisma.ticket.findUniqueOrThrow({
      where: { id: ids.TCK2 },
      select: { accountId: true },
    });
    const invoicesBefore = await prisma.invoice.findMany({
      where: { accountId: account.accountId },
      orderBy: { issuedAt: 'asc' },
    });
    expect(invoicesBefore).toHaveLength(2);

    // REJECT path first: nothing changes.
    const rejectRes = await decider(
      (
        await createProposal(ids.TCK2)
      ).id as string,
      { decision: 'REJECT', reviewer: 'Skeptical Reviewer', passcode: PASSCODE },
    );
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.proposal.status).toBe('REJECTED');
    expect((await prisma.invoice.findMany({ where: { accountId: account.accountId } })).every((i) => i.status === 'PAID')).toBe(true);
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK2 } })).status,
    ).not.toBe('RESOLVED');

    // Fresh proposal for the APPROVE path.
    await runInvestigation(ids.TCK2);
    const proposal2 = await createProposal(ids.TCK2);
    expect(proposal2.actionType).toBe('DUPLICATE_INVOICE_CORRECTION');
    const approveRes = await approve(proposal2.id as string);
    expect(approveRes.status).toBe(200);

    const invoicesAfter = await prisma.invoice.findMany({
      where: { accountId: account.accountId },
    });
    const voided = invoicesAfter.filter((i) => i.status === 'VOID');
    const paid = invoicesAfter.filter((i) => i.status === 'PAID');
    expect(voided).toHaveLength(1);
    expect(paid).toHaveLength(1);
    expect(paid[0].id).toBe(proposal2.payload.canonicalInvoiceId);
    expect(voided[0].id).toBe(proposal2.payload.duplicateInvoiceId);
    expect(voided[0].notes).toContain('duplicate');
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK2 } })).status,
    ).toBe('RESOLVED');
    // No payment was ever refunded or created.
    const payments = await prisma.payment.findMany({ where: { accountId: account.accountId } });
    expect(payments.map((p) => p.status)).toEqual(['SUCCEEDED']);
  });

  it('Scenario 3 (TCK-1003): escalation only — no mutation proposal, no account changes', async () => {
    const investigation = await runInvestigation(ids.TCK3);
    expect(investigation.riskCategory).toBe('URGENT');
    expect(investigation.proposedNextStep.type).toBe('SECURITY_ESCALATION');

    // No mutation proposal may exist for this route.
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK3}/proposal`)
      .expect(409);
    expect(res.body.code).toBe('escalation_only');

    // Escalation records a durable decision and changes NO account data.
    const before = await prisma.account.findMany({
      include: { subscriptions: true, invoices: true, payments: true },
    });
    const esc = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK3}/escalation`)
      .send({ reviewer: 'Security Reviewer', passcode: PASSCODE, note: 'Paged security on-call.' })
      .expect(201);
    expect(esc.body.escalatedBy).toBe('Security Reviewer');
    const after = await prisma.account.findMany({
      include: { subscriptions: true, invoices: true, payments: true },
    });
    expect(after).toEqual(before);
    expect(await prisma.appliedAction.count()).toBe(0);

    const escalations = await request(app.getHttpServer())
      .get(`/api/tickets/${ids.TCK3}/escalations`)
      .expect(200);
    expect(escalations.body).toHaveLength(1);
  });

  it('Scenario 4 (TCK-1004): preserve uncertainty — escalation routes to review, never a refund', async () => {
    const investigation = await runInvestigation(ids.TCK4);
    expect(investigation.uncertainty).toBe('UNCERTAIN');
    expect(investigation.proposedNextStep.type).toBe('FINANCIAL_REVIEW');

    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK4}/proposal`)
      .expect(409);
    expect(res.body.code).toBe('escalation_only');

    await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK4}/escalation`)
      .send({ reviewer: 'Finance Reviewer', passcode: PASSCODE })
      .expect(201);

    const account = await prisma.ticket.findUniqueOrThrow({
      where: { id: ids.TCK4 },
      select: { accountId: true },
    });
    const payments = await prisma.payment.findMany({ where: { accountId: account.accountId } });
    expect(payments.map((p) => p.status).sort()).toEqual(['SUCCEEDED', 'SUCCEEDED']);
    expect(await prisma.appliedAction.count()).toBe(0);
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ids.TCK4 } })).status,
    ).not.toBe('RESOLVED');
  });

  it('escalation requires the configured reviewer passcode', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${ids.TCK3}/escalation`)
      .send({ reviewer: 'Anon', passcode: 'wrong' });
    expect(res.status).toBe(401);
    expect(await prisma.ticketEscalation.count()).toBe(0);
  });

  // ------------------------------------------------------ public read-only

  it('PUBLIC_READ_ONLY disables investigations, proposals, and decisions (403)', async () => {
    await runInvestigation(ids.TCK1);
    const proposal = await createProposal(ids.TCK1);
    process.env.PUBLIC_READ_ONLY = '1';
    try {
      const inv = await request(app.getHttpServer())
        .post(`/api/tickets/${ids.TCK1}/investigation`)
        .expect(403);
      expect(inv.body.code).toBe('public_read_only');

      const prop = await request(app.getHttpServer())
        .post(`/api/tickets/${ids.TCK2}/proposal`)
        .expect(403);
      expect(prop.body.code).toBe('public_read_only');

      const dec = await approve(proposal.id as string);
      expect(dec.status).toBe(403);
      expect(dec.body.code).toBe('public_read_only');
      expect(await prisma.appliedAction.count()).toBe(0);
    } finally {
      delete process.env.PUBLIC_READ_ONLY;
    }
  });

  it('meta endpoint reports capability flags honestly', async () => {
    const res = await request(app.getHttpServer()).get('/api/meta').expect(200);
    expect(res.body).toEqual({
      reviewerAuthConfigured: true,
      publicReadOnly: false,
      aiProvider: 'mock',
    });
  });
});
