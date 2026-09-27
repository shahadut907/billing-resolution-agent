import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { InvestigationModule } from './investigation/investigation.module';
import { MetaController } from './meta/meta.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProposalsModule } from './proposals/proposals.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [PrismaModule, TicketsModule, InvestigationModule, ProposalsModule],
  controllers: [HealthController, MetaController],
})
export class AppModule {}
