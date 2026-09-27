import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@billing-resolution/db';
import {
  TICKET_STATUSES,
  type TicketDetail,
  type TicketStatus,
  type TicketSummary,
} from '@billing-resolution/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only ticket list, newest first. Milestone 1 exposes no way to modify
   * tickets or their records.
   */
  async list(status?: string): Promise<TicketSummary[]> {
    let where: Prisma.TicketWhereInput | undefined;
    if (status) {
      if (!(TICKET_STATUSES as readonly string[]).includes(status)) {
        throw new BadRequestException(`Unknown ticket status: ${status}`);
      }
      where = { status: status as TicketStatus };
    }

    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      reference: ticket.reference,
      scenario: ticket.scenario,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt.toISOString(),
      account: { id: ticket.account.id, name: ticket.account.name },
    }));
  }

  /**
   * Read-only ticket detail: the ticket plus the reporter account's persisted
   * records and any policy tagged for the ticket's scenario. For cross-account
   * exposure reports the related (other) account's identity is included but its
   * financial records are deliberately not shown.
   */
  async detail(id: string): Promise<TicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { account: true, relatedAccount: true },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }

    const [subscriptions, payments, invoices, policies] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { accountId: ticket.accountId },
        orderBy: { currentPeriodStart: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: { accountId: ticket.accountId },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { accountId: ticket.accountId },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.policy.findMany({
        where: { tags: { has: ticket.scenario } },
        orderBy: { key: 'asc' },
      }),
    ]);

    return {
      ticket: {
        id: ticket.id,
        reference: ticket.reference,
        scenario: ticket.scenario,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt.toISOString(),
        account: { id: ticket.account.id, name: ticket.account.name },
        description: ticket.description,
        updatedAt: ticket.updatedAt.toISOString(),
        relatedAccountId: ticket.relatedAccountId,
      },
      account: {
        id: ticket.account.id,
        name: ticket.account.name,
        billingEmail: ticket.account.billingEmail,
        status: ticket.account.status,
        createdAt: ticket.account.createdAt.toISOString(),
      },
      relatedAccount: ticket.relatedAccount
        ? {
            id: ticket.relatedAccount.id,
            name: ticket.relatedAccount.name,
            billingEmail: ticket.relatedAccount.billingEmail,
            status: ticket.relatedAccount.status,
            createdAt: ticket.relatedAccount.createdAt.toISOString(),
          }
        : null,
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        planName: subscription.planName,
        status: subscription.status,
        seats: subscription.seats,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        canceledAt: subscription.canceledAt ? subscription.canceledAt.toISOString() : null,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        ref: payment.ref,
        amount: payment.amount.toFixed(2),
        currency: payment.currency,
        method: payment.method,
        status: payment.status,
        description: payment.description,
        occurredAt: payment.occurredAt.toISOString(),
      })),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        amount: invoice.amount.toFixed(2),
        currency: invoice.currency,
        status: invoice.status,
        periodStart: invoice.periodStart ? invoice.periodStart.toISOString() : null,
        periodEnd: invoice.periodEnd ? invoice.periodEnd.toISOString() : null,
        issuedAt: invoice.issuedAt.toISOString(),
        paymentId: invoice.paymentId,
        notes: invoice.notes,
      })),
      policies: policies.map((policy) => ({
        id: policy.id,
        key: policy.key,
        title: policy.title,
        body: policy.body,
      })),
    };
  }
}
