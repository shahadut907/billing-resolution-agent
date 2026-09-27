import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { InvestigationService } from './investigation.service';

@Controller('tickets')
export class InvestigationController {
  constructor(private readonly investigationService: InvestigationService) {}

  /** Runs one bounded, read-only investigation and persists it for review. */
  @Post(':id/investigation')
  @HttpCode(201)
  run(@Param('id') id: string) {
    return this.investigationService.run(id);
  }

  /** Returns the latest persisted investigation for the ticket, if any. */
  @Get(':id/investigation')
  latest(@Param('id') id: string) {
    return this.investigationService.latest(id);
  }
}
