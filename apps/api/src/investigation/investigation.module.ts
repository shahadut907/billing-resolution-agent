import { Module } from '@nestjs/common';
import { ScopedTools } from './agent/tools';
import { InvestigationController } from './investigation.controller';
import { InvestigationService } from './investigation.service';

@Module({
  controllers: [InvestigationController],
  providers: [InvestigationService, ScopedTools],
})
export class InvestigationModule {}
