import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { runSeed } from '@billing-resolution/db';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * REAL provider smoke test — strictly opt-in so it can never run by accident:
 *   AI_SMOKE_TEST=1  AI_PROVIDER=openai  AI_API_KEY=<your key>  AI_MODEL=<model>
 *
 * Makes ONE real model call against the seeded TCK-1001 ticket. Without those
 * environment variables the suite reports as SKIPPED and NO real model call
 * happens anywhere in this repository's test suite — every other suite uses the
 * shipped deterministic mock provider or a test-only fake provider.
 */
const dbUp =
  fs.existsSync(path.join(__dirname, '.db-status')) &&
  fs.readFileSync(path.join(__dirname, '.db-status'), 'utf8').trim() === 'up';
const enabled =
  process.env.AI_SMOKE_TEST === '1' &&
  !!process.env.AI_API_KEY &&
  process.env.AI_PROVIDER === 'openai';

const describeSmoke = dbUp && enabled ? describe : describe.skip;
if (!enabled) {
  console.warn(
    '[smoke] Real-provider smoke test is DISABLED (set AI_SMOKE_TEST=1, AI_PROVIDER=openai, AI_API_KEY, AI_MODEL to enable). No real model call is made by this suite.',
  );
}

describeSmoke('Investigations API (REAL provider smoke — one real model call)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await runSeed(app.get(PrismaService));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('completes a real investigation for TCK-1001', async () => {
    const tickets = await request(app.getHttpServer()).get('/api/tickets');
    const id = tickets.body.find((t: { reference: string }) => t.reference === 'TCK-1001').id;

    const res = await request(app.getHttpServer()).post(`/api/tickets/${id}/investigation`);
    expect(res.status).toBe(201);
    expect(res.body.isMock).toBe(false);
    expect(res.body.provider).toBe('openai');
    if (res.body.status !== 'COMPLETED') {
      throw new Error(`real provider investigation did not complete: ${res.body.failureReason}`);
    }
    expect(res.body.diagnosis).toBeTruthy();
    expect(res.body.draftReply).toBeTruthy();
    expect(res.body.toolTrace.length).toBeGreaterThan(0);
  }, 60_000);
});
