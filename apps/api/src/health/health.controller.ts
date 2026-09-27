import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    return {
      status: 'ok',
      database: await this.prisma.isDatabaseHealthy(),
    };
  }
}
