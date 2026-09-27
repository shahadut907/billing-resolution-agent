import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Investigation } from '@billing-resolution/db';
import type {
  EvidenceCitation,
  InvestigationBoundsView,
  InvestigationView,
  ToolTraceEntry,
} from '@billing-resolution/types';
import { PrismaService } from '../prisma/prisma.service';
import { assertNotPublicReadOnly } from '../proposals/reviewer-auth';
import { runInvestigationLoop } from './agent/agent-loop';
import {
  loadBoundsFromEnv,
  type AgentOutcome,
} from './agent/agent.types';
import {
  createProviderFromEnv,
  ProviderMisconfiguredError,
  requestedProviderId,
  type InvestigationProvider,
} from './agent/providers/provider';
import { ScopedTools } from './agent/tools';

@Injectable()
export class InvestigationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ScopedTools,
  ) {}

  /**
   * Runs one bounded, read-only investigation for an existing ticket and
   * persists the outcome (including the redacted tool trace) for review.
   * No approvals, account mutations, refunds, or notifications exist in M2.
   */
  async run(ticketId: string): Promise<InvestigationView> {
    // Public read-only previews must not be able to start investigations (or
    // trigger any uncontrolled paid AI usage).
    assertNotPublicReadOnly();
    const resolved = await this.tools.resolveScope(ticketId);
    if (!resolved) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }
    const bounds = loadBoundsFromEnv();

    let provider: InvestigationProvider;
    try {
      provider = createProviderFromEnv();
    } catch (error) {
      const failureReason =
        error instanceof ProviderMisconfiguredError
          ? 'provider_misconfigured'
          : 'provider_error: unexpected provider failure';
      const outcome: AgentOutcome = {
        status: 'FAILED',
        trace: [],
        policyOverrides: [],
        failureReason,
        boundsUsage: {
          timeBudgetMs: bounds.timeBudgetMs,
          maxToolCalls: bounds.maxToolCalls,
          toolCallsUsed: 0,
          elapsedMs: 0,
          providerRetries: 0,
          outputRetries: 0,
          turns: 0,
        },
      };
      return this.persist(ticketId, requestedProviderId(), process.env.AI_MODEL?.trim() || 'unknown', false, outcome);
    }

    const outcome = await runInvestigationLoop({
      provider,
      bounds,
      initialRecords: [
        { recordType: 'TICKET', id: resolved.ticketRecord.id as string, data: resolved.ticketRecord },
        { recordType: 'ACCOUNT', id: resolved.accountRecord.id as string, data: resolved.accountRecord },
      ],
      executeTool: (name, args) => this.tools.execute(resolved.scope, name, args),
      relatedAccountIdentifiers: resolved.relatedAccountIdentifiers,
      scenario: resolved.scope.scenario,
    });

    return this.persist(ticketId, provider.id, provider.model, provider.isMock, outcome);
  }

  async latest(ticketId: string): Promise<InvestigationView | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }
    const row = await this.prisma.investigation.findFirst({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toView(row) : null;
  }

  private async persist(
    ticketId: string,
    providerId: string,
    model: string,
    isMock: boolean,
    outcome: AgentOutcome,
  ): Promise<InvestigationView> {
    const [, saved] = await this.prisma.$transaction([
      // An investigation means a human has begun reviewing the ticket.
      this.prisma.ticket.updateMany({
        where: { id: ticketId, status: 'OPEN' },
        data: { status: 'IN_REVIEW' },
      }),
      this.prisma.investigation.create({
        data: {
          ticketId,
          status: outcome.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
          provider: providerId,
          model,
          isMock,
          diagnosis: outcome.verdict?.diagnosis ?? null,
          uncertainty: outcome.verdict?.uncertainty ?? null,
          riskCategory: outcome.verdict?.riskCategory ?? null,
          proposedNextStepType: outcome.verdict?.proposedNextStep?.type ?? null,
          proposedNextStepDetail: outcome.verdict?.proposedNextStep?.detail ?? null,
          draftReply: outcome.verdict?.draftReply ?? null,
          supportingEvidence: (outcome.verdict?.supportingEvidence ??
            []) as unknown as Prisma.InputJsonValue,
          contradictingEvidence: (outcome.verdict?.contradictingEvidence ??
            []) as unknown as Prisma.InputJsonValue,
          toolTrace: outcome.trace as unknown as Prisma.InputJsonValue,
          bounds: outcome.boundsUsage as unknown as Prisma.InputJsonValue,
          policyOverrides: outcome.policyOverrides,
          failureReason: outcome.failureReason ?? null,
        },
      }),
    ]);
    return toView(saved);
  }
}

function toView(row: Investigation): InvestigationView {
  return {
    id: row.id,
    ticketId: row.ticketId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    isMock: row.isMock,
    diagnosis: row.diagnosis,
    uncertainty: row.uncertainty,
    riskCategory: row.riskCategory,
    proposedNextStep:
      row.proposedNextStepType && row.proposedNextStepDetail !== null
        ? { type: row.proposedNextStepType, detail: row.proposedNextStepDetail }
        : null,
    draftReply: row.draftReply,
    supportingEvidence: (row.supportingEvidence ?? []) as unknown as EvidenceCitation[],
    contradictingEvidence: (row.contradictingEvidence ?? []) as unknown as EvidenceCitation[],
    toolTrace: row.toolTrace as unknown as ToolTraceEntry[],
    bounds: row.bounds as unknown as InvestigationBoundsView,
    policyOverrides: row.policyOverrides,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
  };
}
