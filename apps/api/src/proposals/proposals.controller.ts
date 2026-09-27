import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type {
  ProposalDecisionResult,
  ProposalView,
  ProposalWithAuditsView,
  TicketEscalationView,
} from '@billing-resolution/types';
import { ProposalsService } from './proposals.service';

/**
 * Ticket-scoped proposal and escalation routes. All mutating routes are
 * disabled in PUBLIC_READ_ONLY deployments and decision routes additionally
 * require the configured reviewer passcode.
 */
@Controller('tickets')
export class TicketProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  /** Derives an immutable action proposal from the latest completed investigation. */
  @Post(':id/proposal')
  @HttpCode(201)
  create(@Param('id') id: string): Promise<ProposalView> {
    return this.proposals.create(id);
  }

  @Get(':id/proposals')
  list(@Param('id') id: string): Promise<ProposalView[]> {
    return this.proposals.listForTicket(id);
  }

  /** Escalation for routes that permit no mutation (exposure, ambiguous charge). */
  @Post(':id/escalation')
  @HttpCode(201)
  escalate(
    @Param('id') id: string,
    @Body() body: { reviewer?: unknown; passcode?: unknown; note?: unknown },
  ): Promise<TicketEscalationView> {
    return this.proposals.escalateTicket(id, body ?? {});
  }

  @Get(':id/escalations')
  escalations(@Param('id') id: string): Promise<TicketEscalationView[]> {
    return this.proposals.listEscalations(id);
  }
}

@Controller('proposals')
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get(':id')
  async get(@Param('id') id: string): Promise<ProposalWithAuditsView> {
    return this.proposals.get(id);
  }

  /** Records an APPROVE / REJECT / ESCALATE decision by an authenticated reviewer. */
  @Post(':id/decision')
  @HttpCode(200)
  decide(
    @Param('id') id: string,
    @Body() body?: { decision?: unknown; reviewer?: unknown; passcode?: unknown },
  ): Promise<ProposalDecisionResult> {
    return this.proposals.decide(id, body ?? {});
  }
}
