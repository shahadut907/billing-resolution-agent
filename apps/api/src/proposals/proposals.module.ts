import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProposalsController, TicketProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProposalsController, TicketProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
