import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, type ActionProposal, type ProposalAudit } from '@billing-resolution/db';
import type {
  DecisionAction,
  ProposalAuditView,
  ProposalDecisionRequest,
  ProposalDecisionResult,
  ProposalErrorCode,
  ProposalPayload,
  ProposalView,
  ProposalWithAuditsView,
  RecordVersionMap,
  TicketEscalationView,
  TicketStatus,
} from '@billing-resolution/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateEligibility,
  versionKey,
  type EligibilityRecords,
} from './eligibility';
import {
  assertNotPublicReadOnly,
  assertReviewerName,
  assertReviewerPasscode,
} from './reviewer-auth';

const DECISION_ACTIONS: readonly string[] = ['APPROVE', 'REJECT', 'ESCALATE'];

/** Errors that carry a machine-readable proposal error code to the client. */
export class ProposalError extends ConflictException {
  constructor(
    readonly code: ProposalErrorCode,
    message: string,
  ) {
    super({ code, message });
    this.code = code;
  }
}

function proposalTtlMs(): number {
  const parsed = Number(process.env.ACTION_PROPOSAL_TTL_MINUTES);
  const minutes =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 24 * 60 ? parsed : 30;
  return minutes * 60_000;
}

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Derives an immutable action proposal from the latest COMPLETED
   * investigation of a ticket. Eligibility is evaluated HERE, server-side,
   * against the live records — the model's recommendation alone never creates
   * a proposal.
   */
  async create(ticketId: string): Promise<ProposalView> {
    assertNotPublicReadOnly();
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException({
        code: 'ticket_not_found',
        message: `Ticket ${ticketId} not found`,
      });
    }

    const investigation = await this.prisma.investigation.findFirst({
      where: { ticketId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!investigation) {
      throw new ProposalError(
        'no_completed_investigation',
        'No completed investigation exists for this ticket — run an investigation first.',
      );
    }
    const existing = await this.prisma.actionProposal.findUnique({
      where: { investigationId: investigation.id },
    });
    if (existing) {
      throw new ProposalError(
        'proposal_exists',
        `A proposal already exists for this investigation: ${existing.id}`,
      );
    }

    const [subscriptions, payments, invoices, policies] = await Promise.all([
      this.prisma.subscription.findMany({ where: { accountId: ticket.accountId } }),
      this.prisma.payment.findMany({ where: { accountId: ticket.accountId } }),
      this.prisma.invoice.findMany({ where: { accountId: ticket.accountId } }),
      this.prisma.policy.findMany({
        where: { tags: { has: ticket.scenario } },
        orderBy: { key: 'asc' },
      }),
    ]);

    const policy = policies[0];
    if (!policy) {
      throw new ProposalError(
        'not_eligible',
        `No policy is on file for scenario ${ticket.scenario} — no action can be proposed.`,
      );
    }

    const versions: RecordVersionMap = {
      ...Object.fromEntries(
        subscriptions.map((s) => [versionKey('SUBSCRIPTION', s.id), s.updatedAt.toISOString()]),
      ),
      ...Object.fromEntries(
        payments.map((p) => [versionKey('PAYMENT', p.id), p.updatedAt.toISOString()]),
      ),
      ...Object.fromEntries(
        invoices.map((i) => [versionKey('INVOICE', i.id), i.updatedAt.toISOString()]),
      ),
    };

    const records: EligibilityRecords = {
      scenario: ticket.scenario,
      uncertainty: investigation.uncertainty,
      proposedNextStepType: investigation.proposedNextStepType,
      subscriptions,
      payments,
      invoices: invoices.map(toEligibilityInvoice),
    };
    const outcome = evaluateEligibility(records, versions);
    if (!outcome.eligible) {
      throw new ProposalError(outcome.code, outcome.reason);
    }

    const payload: ProposalPayload = { ...outcome.payload, accountId: ticket.accountId };
    const evidence = (investigation.supportingEvidence ?? []) as unknown as ProposalView['evidence'];

    const { proposal } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.actionProposal.create({
        data: {
          ticketId: ticket.id,
          investigationId: investigation.id,
          actionType: outcome.actionType,
          payload: payload as unknown as Prisma.InputJsonValue,
          evidence: evidence as unknown as Prisma.InputJsonValue,
          recordVersions: outcome.recordVersions as unknown as Prisma.InputJsonValue,
          policyId: policy.id,
          policyKey: policy.key,
          policyVersion: policy.updatedAt.toISOString(),
          rationale: outcome.rationale,
          expiresAt: new Date(Date.now() + proposalTtlMs()),
        },
      });
      await tx.proposalAudit.create({
        data: {
          proposalId: created.id,
          event: 'PROPOSAL_CREATED',
          detail: {
            actionType: created.actionType,
            payload,
            policyKey: policy.key,
            policyVersion: created.policyVersion,
            recordVersions: outcome.recordVersions,
            rationale: outcome.rationale,
            investigationId: investigation.id,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return { proposal: created };
    });
    return toProposalView(proposal);
  }

  async listForTicket(ticketId: string): Promise<ProposalView[]> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException({
        code: 'ticket_not_found',
        message: `Ticket ${ticketId} not found`,
      });
    }
    const rows = await this.prisma.actionProposal.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toProposalView);
  }

  async get(proposalId: string): Promise<ProposalWithAuditsView> {
    const proposal = await this.prisma.actionProposal.findUnique({
      where: { id: proposalId },
      include: { audits: { orderBy: { createdAt: 'asc' } } },
    });
    if (!proposal) {
      throw new NotFoundException({
        code: 'not_found',
        message: `Proposal ${proposalId} not found`,
      });
    }
    return { proposal: toProposalView(proposal), audits: proposal.audits.map(toAuditView) };
  }

  /**
   * Records a reviewer decision.
   *
   * APPROVE runs a two-phase flow: full validation against live state first
   * (rejected attempts are audited and leave everything untouched), then ONE
   * transaction that locks the proposal row, re-checks it, inserts the
   * exactly-once ledger row, applies the permitted mutation, marks the ticket
   * resolved, and writes the success audit. Any in-transaction failure rolls
   * the whole thing back — the ticket is NOT resolved — and is recorded as an
   * APPLY_FAILED audit outside the rolled-back transaction.
   */
  async decide(
    proposalId: string,
    request: { decision?: unknown; reviewer?: unknown; passcode?: unknown },
  ): Promise<ProposalDecisionResult> {
    assertNotPublicReadOnly();
    if (
      !request ||
      typeof request !== 'object' ||
      !DECISION_ACTIONS.includes(request.decision as string)
    ) {
      throw new ProposalError(
        'invalid_request',
        `decision must be one of ${DECISION_ACTIONS.join(', ')}`,
      );
    }
    assertReviewerPasscode(request.passcode);
    const reviewer = assertReviewerName(request.reviewer);
    const decision = request.decision as DecisionAction;

    const proposal = await this.prisma.actionProposal.findUnique({
      where: { id: proposalId },
      include: { ticket: { select: { id: true, reference: true, status: true } } },
    });
    if (!proposal) {
      throw new NotFoundException({
        code: 'not_found',
        message: `Proposal ${proposalId} not found`,
      });
    }

    if (decision === 'APPROVE') {
      await this.validateApproval(proposal.id, reviewer);
    } else if (proposal.status !== 'PROPOSED') {
      throw new ProposalError(
        'already_decided',
        `Proposal is already ${proposal.status} and cannot be re-decided.`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) =>
        this.applyDecision(tx, proposal.id, decision, reviewer),
      );
    } catch (error) {
      if (error instanceof ProposalError || error instanceof NotFoundException) {
        if (decision === 'APPROVE') {
          // The application transaction rolled back: nothing was applied and
          // the ticket is not resolved. Record the failed attempt durably.
          const reason =
            error instanceof ProposalError ? error.code : 'apply_failed';
          await this.recordApplyFailure(proposal.id, reviewer, reason);
        }
      }
      throw error;
    }
  }

  /** Phase 1 of APPROVE: validate against live state; audit and reject on any mismatch. */
  private async validateApproval(proposalId: string, reviewer: string): Promise<void> {
    const reject = async (code: ProposalErrorCode, message: string, detail?: Record<string, unknown>) => {
      await this.prisma.proposalAudit.create({
        data: {
          proposalId,
          event: 'APPROVAL_REJECTED',
          actor: reviewer,
          detail: { reason: code, message, ...(detail ?? {}) } as unknown as Prisma.InputJsonValue,
        },
      });
      throw new ProposalError(code, message);
    };

    const proposal = await this.prisma.actionProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) {
      throw new NotFoundException({
        code: 'not_found',
        message: `Proposal ${proposalId} not found`,
      });
    }
    if (proposal.status !== 'PROPOSED') {
      throw new ProposalError(
        'already_decided',
        `Proposal is already ${proposal.status} and cannot be approved.`,
      );
    }
    if (proposal.expiresAt.getTime() <= Date.now()) {
      await reject('expired', 'The proposal has expired — run a fresh investigation and propose again.', {
        expiredAt: proposal.expiresAt.toISOString(),
      });
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: proposal.ticketId } });
    if (!ticket) {
      await reject('ticket_not_found', 'The ticket behind this proposal no longer exists.');
    }

    const payload = proposal.payload as unknown as ProposalPayload;
    if (payload.accountId !== ticket!.accountId) {
      await reject(
        'account_mismatch',
        'The proposal payload does not target the ticket\'s reporter account.',
      );
    }

    const pinnedVersions = proposal.recordVersions as unknown as RecordVersionMap;
    const current = await this.loadRecordsFor(payload);
    const currentVersions: RecordVersionMap = {
      ...Object.fromEntries(
        current.subscriptions.map((s) => [versionKey('SUBSCRIPTION', s.id), s.updatedAt.toISOString()]),
      ),
      ...Object.fromEntries(
        current.payments.map((p) => [versionKey('PAYMENT', p.id), p.updatedAt.toISOString()]),
      ),
      ...Object.fromEntries(
        current.invoices.map((i) => [versionKey('INVOICE', i.id), i.updatedAt.toISOString()]),
      ),
    };
    for (const [key, pinned] of Object.entries(pinnedVersions)) {
      // Ownership re-check FIRST: the pinned record must still belong to the
      // reporter account (guards any wrong-account manipulation).
      const ownerId = this.recordAccountId(key, current);
      if (ownerId !== ticket!.accountId) {
        await reject(
          'account_mismatch',
          `Record ${key} no longer belongs to the ticket's reporter account.`,
          { recordKey: key },
        );
      }
      if (currentVersions[key] !== pinned) {
        await reject(
          'record_changed',
          `Record ${key} changed after the proposal was written — approval refused. ` +
            'Run a fresh investigation and propose again.',
          { recordKey: key, pinnedVersion: pinned, currentVersion: currentVersions[key] ?? null },
        );
      }
    }

    const [policy, investigation] = await Promise.all([
      this.prisma.policy.findUnique({ where: { id: proposal.policyId } }),
      this.prisma.investigation.findUnique({ where: { id: proposal.investigationId } }),
    ]);
    if (!policy || policy.updatedAt.toISOString() !== proposal.policyVersion) {
      await reject(
        'policy_changed',
        'The policy backing this proposal changed after it was written — approval refused. ' +
          'Run a fresh investigation and propose again.',
      );
    }
    if (!investigation) {
      await reject('record_changed', 'The investigation behind this proposal no longer exists.');
    }

    const outcome = evaluateEligibility(
      {
        scenario: ticket!.scenario,
        uncertainty: investigation!.uncertainty,
        proposedNextStepType: investigation!.proposedNextStepType,
        subscriptions: current.subscriptions,
        payments: current.payments,
        invoices: current.invoices.map(toEligibilityInvoice),
      },
      currentVersions,
    );
    if (!outcome.eligible) {
      await reject('not_eligible', `The records no longer support this action: ${outcome.reason}`);
    }
    if (
      outcome.eligible &&
      (outcome.payload.subscriptionId !== payload.subscriptionId ||
        outcome.payload.duplicateInvoiceId !== payload.duplicateInvoiceId ||
        outcome.payload.canonicalInvoiceId !== payload.canonicalInvoiceId)
    ) {
      await reject(
        'not_eligible',
        'The records now point at different target records than the proposal — refusing to ' +
          'apply a stale target. Run a fresh investigation and propose again.',
      );
    }
  }

  /** Phase 2 of APPROVE/REJECT/ESCALATE: one transaction, row-locked, exactly-once. */
  private async applyDecision(
    tx: Prisma.TransactionClient,
    proposalId: string,
    decision: DecisionAction,
    reviewer: string,
  ): Promise<ProposalDecisionResult> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ActionProposal" WHERE id = ${proposalId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundException({
        code: 'not_found',
        message: `Proposal ${proposalId} not found`,
      });
    }
    const proposal = await tx.actionProposal.findUnique({
      where: { id: proposalId },
      include: { ticket: { select: { id: true, reference: true, status: true } } },
    });
    if (!proposal) {
      throw new NotFoundException({
        code: 'not_found',
        message: `Proposal ${proposalId} not found`,
      });
    }
    const decidedAt = new Date();

    if (decision === 'REJECT' || decision === 'ESCALATE') {
      const proposalDecision = decision === 'REJECT' ? 'REJECTED' : 'ESCALATED';
      const updated = await tx.actionProposal.update({
        where: { id: proposalId, status: 'PROPOSED' },
        data: { status: proposalDecision, decision: proposalDecision, decidedBy: reviewer, decidedAt },
      });
      const audit = await tx.proposalAudit.create({
        data: {
          proposalId,
          event: 'DECISION_RECORDED',
          actor: reviewer,
          detail: { decision: proposalDecision, proposalStatus: proposalDecision } as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        proposal: toProposalView(updated),
        ticket: proposal.ticket,
        audits: [toAuditView(audit)],
      };
    }

    // APPROVE — re-check under lock; a concurrent winner makes this reject.
    if (proposal.status !== 'PROPOSED') {
      throw new ProposalError(
        'already_decided',
        `Proposal is already ${proposal.status} — another decision arrived first.`,
      );
    }
    if (proposal.expiresAt.getTime() <= Date.now()) {
      throw new ProposalError('expired', 'The proposal expired before approval could be applied.');
    }

    const payload = proposal.payload as unknown as ProposalPayload;
    const now = new Date();

    let before: Record<string, unknown>;
    let after: Record<string, unknown>;

    // The exactly-once ledger: a second applied action of the same type for
    // the same ticket violates the DB unique constraint and rolls everything
    // back, no matter what the application code does.
    try {
      await tx.appliedAction.create({
        data: { ticketId: proposal.ticketId, actionType: proposal.actionType, proposalId },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ProposalError(
          'already_decided',
          'This ticket already has an applied action of this type — the mutation cannot repeat.',
        );
      }
      throw error;
    }

    if (proposal.actionType === 'ENTITLEMENT_REPAIR') {
      const subscription = await tx.subscription.findUnique({
        where: { id: payload.subscriptionId! },
      });
      if (!subscription) {
        throw new ProposalError('record_changed', 'The target subscription no longer exists.');
      }
      before = { subscription: { id: subscription.id, status: subscription.status, canceledAt: subscription.canceledAt?.toISOString() ?? null } };
      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE', canceledAt: null },
      });
      after = { subscription: { id: updated.id, status: updated.status, canceledAt: null } };
    } else {
      const duplicate = await tx.invoice.findUnique({ where: { id: payload.duplicateInvoiceId! } });
      const canonical = await tx.invoice.findUnique({ where: { id: payload.canonicalInvoiceId! } });
      if (!duplicate || !canonical) {
        throw new ProposalError('record_changed', 'A target invoice no longer exists.');
      }
      if (duplicate.status !== 'PAID') {
        throw new ProposalError(
          'not_eligible',
          `The duplicate invoice is ${duplicate.status}, not PAID — nothing to correct.`,
        );
      }
      before = { invoice: { id: duplicate.id, number: duplicate.number, status: duplicate.status, notes: duplicate.notes } };
      const noteSuffix =
        `Voided as a duplicate of ${canonical.number} after reviewer approval ` +
        `(proposal ${proposalId}, sandbox data change).`;
      const updated = await tx.invoice.update({
        where: { id: duplicate.id },
        data: {
          status: 'VOID',
          notes: duplicate.notes ? `${duplicate.notes} — ${noteSuffix}` : noteSuffix,
        },
      });
      after = { invoice: { id: updated.id, number: updated.number, status: updated.status } };
    }

    const updatedProposal = await tx.actionProposal.update({
      where: { id: proposalId, status: 'PROPOSED' },
      data: {
        status: 'APPLIED',
        decision: 'APPROVED',
        decidedBy: reviewer,
        decidedAt,
        appliedAt: now,
      },
    });
    const updatedTicket = await tx.ticket.update({
      where: { id: proposal.ticketId },
      data: { status: 'RESOLVED' },
    });
    const audit = await tx.proposalAudit.create({
      data: {
        proposalId,
        event: 'APPLY_SUCCEEDED',
        actor: reviewer,
        detail: {
          actionType: proposal.actionType,
          before,
          after,
          ticketStatusBefore: proposal.ticket.status,
          ticketStatusAfter: 'RESOLVED',
          sandbox: true,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      proposal: toProposalView(updatedProposal),
      ticket: {
        id: updatedTicket.id,
        reference: updatedTicket.reference,
        status: updatedTicket.status as TicketStatus,
      },
      audits: [toAuditView(audit)],
    };
  }

  /** APPLY_FAILED audit + failure counter, written AFTER a rolled-back attempt. */
  private async recordApplyFailure(
    proposalId: string,
    reviewer: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.actionProposal.update({
          where: { id: proposalId },
          data: {
            applyError: reason,
            failureCount: { increment: 1 },
          },
        }),
        this.prisma.proposalAudit.create({
          data: {
            proposalId,
            event: 'APPLY_FAILED',
            actor: reviewer,
            detail: { reason, rolledBack: true } as unknown as Prisma.InputJsonValue,
          },
        }),
      ]);
    } catch {
      // The proposal may have vanished mid-failure; never mask the original error.
    }
  }

  async listEscalations(ticketId: string): Promise<TicketEscalationView[]> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException({
        code: 'ticket_not_found',
        message: `Ticket ${ticketId} not found`,
      });
    }
    const rows = await this.prisma.ticketEscalation.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      ticketId: row.ticketId,
      escalatedBy: row.escalatedBy,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Records an escalation for a ticket. Escalation changes NO account data —
   * it is the permitted route for security and ambiguous-charge tickets (and
   * for anything a reviewer would rather hand to a human team).
   */
  async escalateTicket(
    ticketId: string,
    input: { reviewer?: unknown; passcode?: unknown; note?: unknown },
  ): Promise<TicketEscalationView> {
    assertNotPublicReadOnly();
    assertReviewerPasscode(input.passcode);
    const reviewer = assertReviewerName(input.reviewer);
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim().slice(0, 500)
        : null;
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException({
        code: 'ticket_not_found',
        message: `Ticket ${ticketId} not found`,
      });
    }
    const row = await this.prisma.ticketEscalation.create({
      data: { ticketId, escalatedBy: reviewer, note },
    });
    return {
      id: row.id,
      ticketId: row.ticketId,
      escalatedBy: row.escalatedBy,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async loadRecordsFor(payload: ProposalPayload) {
    const accountId = payload.accountId;
    const [subscriptions, payments, invoices] = await Promise.all([
      this.prisma.subscription.findMany({ where: { accountId } }),
      this.prisma.payment.findMany({ where: { accountId } }),
      this.prisma.invoice.findMany({ where: { accountId } }),
    ]);
    return { subscriptions, payments, invoices };
  }

  private recordAccountId(
    versionKeyStr: string,
    current: {
      subscriptions: { id: string; accountId: string }[];
      payments: { id: string; accountId: string }[];
      invoices: { id: string; accountId: string }[];
    },
  ): string | null {
    const [type, id] = versionKeyStr.split(':');
    switch (type) {
      case 'SUBSCRIPTION':
        return current.subscriptions.find((s) => s.id === id)?.accountId ?? null;
      case 'PAYMENT':
        return current.payments.find((p) => p.id === id)?.accountId ?? null;
      case 'INVOICE':
        return current.invoices.find((i) => i.id === id)?.accountId ?? null;
      default:
        return null;
    }
  }
}

/** Maps a persisted invoice onto the plain record shape the eligibility engine consumes. */
function toEligibilityInvoice(row: {
  id: string;
  status: string;
  paymentId: string | null;
  amount: Prisma.Decimal;
  issuedAt: Date;
}) {
  return {
    id: row.id,
    status: row.status,
    paymentId: row.paymentId,
    amount: row.amount.toFixed(2),
    issuedAt: row.issuedAt,
  };
}

function toProposalView(row: ActionProposal): ProposalView {  return {
    id: row.id,
    ticketId: row.ticketId,
    investigationId: row.investigationId,
    actionType: row.actionType,
    status: row.status,
    payload: row.payload as unknown as ProposalPayload,
    evidence: (row.evidence ?? []) as unknown as ProposalView['evidence'],
    recordVersions: row.recordVersions as unknown as RecordVersionMap,
    policyId: row.policyId,
    policyKey: row.policyKey,
    policyVersion: row.policyVersion,
    rationale: row.rationale,
    expiresAt: row.expiresAt.toISOString(),
    decision: row.decision,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    applyError: row.applyError,
    failureCount: row.failureCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditView(row: ProposalAudit): ProposalAuditView {
  return {
    id: row.id,
    proposalId: row.proposalId,
    event: row.event,
    actor: row.actor,
    detail: (row.detail ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  };
}
