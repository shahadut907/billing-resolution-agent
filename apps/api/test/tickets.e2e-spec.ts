import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { runSeed } from '@billing-resolution/db';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const statusFile = path.join(__dirname, '.db-status');
const dbUp =
  fs.existsSync(statusFile) && fs.readFileSync(statusFile, 'utf8').trim() === 'up';

const describeIfDb = dbUp ? describe : describe.skip;
if (!dbUp) {
  console.warn(
    '[e2e] No reachable PostgreSQL detected — the e2e suite reports as SKIPPED. Start a database and set DATABASE_URL to run it.',
  );
}

describeIfDb('Tickets API (e2e)', () => {
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

  it('GET /api/health reports liveness and database connectivity', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: true });
  });

  it('GET /api/tickets lists exactly the four seeded tickets, newest first', async () => {
    const res = await request(app.getHttpServer()).get('/api/tickets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    const dates: string[] = res.body.map((t: { createdAt: string }) => t.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(res.body.map((t: { reference: string }) => t.reference).sort()).toEqual([
      'TCK-1001',
      'TCK-1002',
      'TCK-1003',
      'TCK-1004',
    ]);
    for (const ticket of res.body) {
      expect(ticket.account.name).toBeTruthy();
    }
  });

  it('GET /api/tickets?status= filters by status and rejects unknown values', async () => {
    const open = await request(app.getHttpServer()).get('/api/tickets?status=OPEN');
    expect(open.status).toBe(200);
    expect(open.body).toHaveLength(3);

    const inReview = await request(app.getHttpServer()).get('/api/tickets?status=IN_REVIEW');
    expect(inReview.status).toBe(200);
    expect(inReview.body).toHaveLength(1);
    expect(inReview.body[0].reference).toBe('TCK-1001');

    const bogus = await request(app.getHttpServer()).get('/api/tickets?status=NOT_A_STATUS');
    expect(bogus.status).toBe(400);
  });

  it('GET /api/tickets/:id returns the duplicate-invoice ticket with two invoices on one charge', async () => {
    const list = await request(app.getHttpServer()).get('/api/tickets');
    const summary = list.body.find((t: { reference: string }) => t.reference === 'TCK-1002');

    const res = await request(app.getHttpServer()).get(`/api/tickets/${summary.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ticket.scenario).toBe('DUPLICATE_INVOICE');
    expect(res.body.account.name).toBe('Cedarline Labs');
    expect(res.body.invoices).toHaveLength(2);
    expect(res.body.invoices[0].paymentId).toBeTruthy();
    expect(res.body.invoices[0].paymentId).toBe(res.body.invoices[1].paymentId);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].status).toBe('SUCCEEDED');
    expect(res.body.policies.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/tickets/:id returns the exposure ticket with a distinct related account', async () => {
    const list = await request(app.getHttpServer()).get('/api/tickets');
    const summary = list.body.find((t: { reference: string }) => t.reference === 'TCK-1003');

    const res = await request(app.getHttpServer()).get(`/api/tickets/${summary.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ticket.scenario).toBe('CROSS_ACCOUNT_EXPOSURE');
    expect(res.body.relatedAccount).toBeTruthy();
    expect(res.body.relatedAccount.id).not.toBe(res.body.account.id);
  });

  it('GET /api/tickets/:id returns 404 for an unknown id', async () => {
    const res = await request(app.getHttpServer()).get('/api/tickets/does-not-exist');
    expect(res.status).toBe(404);
  });
});
