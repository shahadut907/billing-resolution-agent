import { Injectable } from '@nestjs/common';
import type { EvidenceRecordType } from '@billing-resolution/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ToolRejection, type EvidenceRecord } from './agent.types';

/**
 * The complete allowlist of tools the model may request. Every tool is
 * zero-argument and pre-scoped server-side to ONE ticket's reporter account —
 * there is no tool that can reach another account's records, no matter what
 * the ticket text or the model requests.
 */
export const TOOL_NAMES = [
  'get_ticket',
  'get_account',
  'list_subscriptions',
  'list_payments',
  'list_invoices',
  'list_policies',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface TicketScope {
  ticketId: string;
  accountId: string;
  companyId: string;
  scenario: string;
}

export interface ResolvedTicket {
  scope: TicketScope;
  ticketRecord: Record<string, unknown>;
  accountRecord: Record<string, unknown>;
  /** Name/email/id of the related account for exposure reports — used ONLY for output redaction checks, never returned to the model. */
  relatedAccountIdentifiers: string[] | null;
}

@Injectable()
export class ScopedTools {
  constructor(private readonly prisma: PrismaService) {}

  /** Loads the ticket and derives the immutable investigation scope. */
  async resolveScope(ticketId: string): Promise<ResolvedTicket | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        account: {
          select: {
            id: true,
            companyId: true,
            name: true,
            billingEmail: true,
            status: true,
            createdAt: true,
          },
        },
        relatedAccount: { select: { id: true, name: true, billingEmail: true } },
      },
    });
    if (!ticket) {
      return null;
    }
    return {
      scope: {
        ticketId: ticket.id,
        accountId: ticket.accountId,
        companyId: ticket.account.companyId,
        scenario: ticket.scenario,
      },
      ticketRecord: {
        id: ticket.id,
        reference: ticket.reference,
        scenario: ticket.scenario,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        accountId: ticket.accountId,
        relatedAccountId: ticket.relatedAccountId,
        createdAt: ticket.createdAt.toISOString(),
      },
      accountRecord: {
        id: ticket.account.id,
        name: ticket.account.name,
        billingEmail: ticket.account.billingEmail,
        status: ticket.account.status,
        createdAt: ticket.account.createdAt.toISOString(),
      },
      relatedAccountIdentifiers: ticket.relatedAccount
        ? [ticket.relatedAccount.name, ticket.relatedAccount.billingEmail, ticket.relatedAccount.id]
        : null,
    };
  }

  /**
   * Executes an allowlisted tool for the given scope. Tool arguments are not
   * accepted in M2: any attempt to pass them (e.g. an attacker-supplied
   * accountId) is rejected before any query runs.
   */
  async execute(
    scope: TicketScope,
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ records: EvidenceRecord[] }> {
    if (!(TOOL_NAMES as readonly string[]).includes(name)) {
      throw new ToolRejection('unknown_tool');
    }
    if (
      args === null ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      Object.keys(args).length > 0
    ) {
      throw new ToolRejection('invalid_args: tools accept no arguments; scope is fixed to the ticket');
    }

    switch (name as ToolName) {
      case 'get_ticket': {
        const ticket = await this.prisma.ticket.findUnique({ where: { id: scope.ticketId } });
        if (!ticket) throw new ToolRejection('ticket_not_found');
        return {
          records: [
            {
              recordType: 'TICKET',
              id: ticket.id,
              data: {
                id: ticket.id,
                reference: ticket.reference,
                scenario: ticket.scenario,
                title: ticket.title,
                description: ticket.description,
                status: ticket.status,
                priority: ticket.priority,
                accountId: ticket.accountId,
                relatedAccountId: ticket.relatedAccountId,
                createdAt: ticket.createdAt.toISOString(),
              },
            },
          ],
        };
      }
      case 'get_account': {
        const account = await this.prisma.account.findUnique({ where: { id: scope.accountId } });
        if (!account) throw new ToolRejection('account_not_found');
        return {
          records: [
            {
              recordType: 'ACCOUNT',
              id: account.id,
              data: {
                id: account.id,
                name: account.name,
                billingEmail: account.billingEmail,
                status: account.status,
                createdAt: account.createdAt.toISOString(),
              },
            },
          ],
        };
      }
      case 'list_subscriptions': {
        const rows = await this.prisma.subscription.findMany({
          where: { accountId: scope.accountId },
          orderBy: { currentPeriodStart: 'desc' },
        });
        return {
          records: rows.map((row) => ({
            recordType: 'SUBSCRIPTION' as EvidenceRecordType,
            id: row.id,
            data: {
              id: row.id,
              planName: row.planName,
              status: row.status,
              seats: row.seats,
              currentPeriodStart: row.currentPeriodStart.toISOString(),
              currentPeriodEnd: row.currentPeriodEnd.toISOString(),
              canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
            },
          })),
        };
      }
      case 'list_payments': {
        const rows = await this.prisma.payment.findMany({
          where: { accountId: scope.accountId },
          orderBy: { occurredAt: 'desc' },
        });
        return {
          records: rows.map((row) => ({
            recordType: 'PAYMENT' as EvidenceRecordType,
            id: row.id,
            data: {
              id: row.id,
              ref: row.ref,
              amount: row.amount.toFixed(2),
              currency: row.currency,
              method: row.method,
              status: row.status,
              description: row.description,
              occurredAt: row.occurredAt.toISOString(),
            },
          })),
        };
      }
      case 'list_invoices': {
        const rows = await this.prisma.invoice.findMany({
          where: { accountId: scope.accountId },
          orderBy: { issuedAt: 'desc' },
        });
        return {
          records: rows.map((row) => ({
            recordType: 'INVOICE' as EvidenceRecordType,
            id: row.id,
            data: {
              id: row.id,
              number: row.number,
              amount: row.amount.toFixed(2),
              currency: row.currency,
              status: row.status,
              periodStart: row.periodStart ? row.periodStart.toISOString() : null,
              periodEnd: row.periodEnd ? row.periodEnd.toISOString() : null,
              issuedAt: row.issuedAt.toISOString(),
              paymentId: row.paymentId,
              notes: row.notes,
            },
          })),
        };
      }
      case 'list_policies': {
        const rows = await this.prisma.policy.findMany({
          where: { companyId: scope.companyId, tags: { has: scope.scenario } },
          orderBy: { key: 'asc' },
        });
        return {
          records: rows.map((row) => ({
            recordType: 'POLICY' as EvidenceRecordType,
            id: row.id,
            data: { id: row.id, key: row.key, title: row.title, body: row.body },
          })),
        };
      }
    }
  }
}
