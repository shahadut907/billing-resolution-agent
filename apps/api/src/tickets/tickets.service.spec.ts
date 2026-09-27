import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@billing-resolution/db';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from './tickets.service';

const money = (value: string) => new Prisma.Decimal(value);

const reporterAccount = {
  id: 'acc-1',
  slug: 'bright-harbor-studio',
  name: 'Bright Harbor Studio',
  billingEmail: 'billing@brightharbor.example',
  status: 'ACTIVE',
  createdAt: new Date('2026-01-05T00:00:00Z'),
};

const relatedAccount = {
  ...reporterAccount,
  id: 'acc-2',
  slug: 'granite-glen-dental',
  name: 'Granite Glen Dental',
  billingEmail: 'billing@graniteglen.example',
};

const baseTicketRow = {
  id: 'tkt-1',
  reference: 'TCK-1001',
  scenario: 'PAID_BUT_INACTIVE_PLAN',
  title: 'Plan shows inactive after successful payment',
  description: 'We paid but the plan is inactive.',
  status: 'IN_REVIEW',
  priority: 'HIGH',
  accountId: 'acc-1',
  relatedAccountId: null as string | null,
  createdAt: new Date('2026-09-15T10:05:00Z'),
  updatedAt: new Date('2026-09-16T08:00:00Z'),
  account: reporterAccount,
  relatedAccount: null as typeof reporterAccount | null,
};

type PrismaMock = {
  ticket: { findMany: jest.Mock; findUnique: jest.Mock };
  subscription: { findMany: jest.Mock };
  payment: { findMany: jest.Mock };
  invoice: { findMany: jest.Mock };
  policy: { findMany: jest.Mock };
};

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      ticket: { findMany: jest.fn(), findUnique: jest.fn() },
      subscription: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      policy: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [TicketsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TicketsService);
  });

  describe('list', () => {
    it('returns mapped ticket summaries with account names', async () => {
      prisma.ticket.findMany.mockResolvedValue([baseTicketRow]);

      const result = await service.list();

      expect(result).toEqual([
        {
          id: 'tkt-1',
          reference: 'TCK-1001',
          scenario: 'PAID_BUT_INACTIVE_PLAN',
          title: 'Plan shows inactive after successful payment',
          status: 'IN_REVIEW',
          priority: 'HIGH',
          createdAt: '2026-09-15T10:05:00.000Z',
          account: { id: 'acc-1', name: 'Bright Harbor Studio' },
        },
      ]);
    });

    it('queries newest first and includes the account name', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      await service.list();
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { account: { select: { id: true, name: true } } },
        }),
      );
    });

    it('passes a valid status filter through', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      await service.list('OPEN');
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'OPEN' } }),
      );
    });

    it('rejects unknown status values with 400', async () => {
      await expect(service.list('NOT_A_STATUS')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.ticket.findMany).not.toHaveBeenCalled();
    });
  });

  describe('detail', () => {
    it('throws NotFound for an unknown ticket id', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(service.detail('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('aggregates the reporter account records and the scenario-matched policy', async () => {
      prisma.ticket.findUnique.mockResolvedValue(baseTicketRow);
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          planName: 'Metrics Pro',
          status: 'CANCELED',
          seats: 12,
          currentPeriodStart: new Date('2026-09-10T00:00:00Z'),
          currentPeriodEnd: new Date('2026-10-10T00:00:00Z'),
          canceledAt: new Date('2026-09-11T09:14:00Z'),
        },
      ]);
      prisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          ref: 'ch_syn_bhs_0001',
          amount: money('490.00'),
          currency: 'USD',
          method: 'CARD',
          status: 'SUCCEEDED',
          description: 'Metrics Pro — monthly (September 2026)',
          occurredAt: new Date('2026-09-12T08:02:00Z'),
        },
      ]);
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.policy.findMany.mockResolvedValue([
        { id: 'pol-1', key: 'paid-plan-reactivation', title: 'Paid but inactive plan — reactivation', body: '...' },
      ]);

      const detail = await service.detail('tkt-1');

      // All record queries are scoped to the reporter account only.
      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'acc-1' } }),
      );
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'acc-1' } }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'acc-1' } }),
      );
      expect(prisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tags: { has: 'PAID_BUT_INACTIVE_PLAN' } },
        }),
      );

      expect(detail.ticket.reference).toBe('TCK-1001');
      expect(detail.relatedAccount).toBeNull();
      expect(detail.subscriptions[0]).toMatchObject({ planName: 'Metrics Pro', status: 'CANCELED' });
      expect(detail.payments[0]).toMatchObject({
        ref: 'ch_syn_bhs_0001',
        amount: '490.00',
        status: 'SUCCEEDED',
      });
      expect(detail.policies).toHaveLength(1);
    });

    it('exposes the related account for exposure reports', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...baseTicketRow,
        scenario: 'CROSS_ACCOUNT_EXPOSURE',
        relatedAccountId: 'acc-2',
        relatedAccount: relatedAccount,
      });

      const detail = await service.detail('tkt-1');

      expect(detail.relatedAccount).toMatchObject({
        id: 'acc-2',
        name: 'Granite Glen Dental',
      });
      // Financial records stay scoped to the reporter account.
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'acc-1' } }),
      );
    });
  });
});
