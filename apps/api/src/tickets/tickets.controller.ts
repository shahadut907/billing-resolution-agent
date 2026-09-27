import { Controller, Get, Param, Query } from '@nestjs/common';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.ticketsService.list(status);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.ticketsService.detail(id);
  }
}
