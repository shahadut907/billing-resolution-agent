import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { InvestigationModule } from './investigation/investigation.module';
import { PrismaModule } from './prisma/prisma.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [PrismaModule, TicketsModule, InvestigationModule],
  controllers: [HealthController],
})
export class AppModule {}
