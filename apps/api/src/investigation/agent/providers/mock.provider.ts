import type { AgentMessage } from '../agent.types';
import { TOOL_NAMES } from '../tools';
import type { InvestigationProvider, ProviderCompleteRequest } from './provider';

/**
 * Deterministic mock provider used when no model API key is configured.
 * It follows the exact same JSON protocol as a real provider (a scripted
 * tool-gathering turn, then a rule-based final verdict derived ONLY from the
 * tool results in the conversation), so the entire loop, validation, override,
 * and persistence pipeline is exercised end to end.
 *
 * Every investigation run through this provider is persisted with
 * provider="mock" / isMock=true so mock output is never presented as a real
 * model call.
 */
export class MockInvestigationProvider implements InvestigationProvider {
  readonly id = 'mock';
  readonly model = 'mock-rules-v1';
  readonly isMock = true;
  private steps = 0;

  async complete(request: ProviderCompleteRequest): Promise<{ text: string }> {
    this.steps += 1;
    if (this.steps === 1) {
      return {
        text: JSON.stringify({
          action: 'tool_calls',
          calls: TOOL_NAMES.map((name) => ({ name, args: {} })),
        }),
      };
    }
    const evidence = collectEvidence(request.messages);
    return { text: JSON.stringify({ action: 'final', verdict: buildMockVerdict(evidence) }) };
  }
}

interface EvidencePack {
  ticket?: Record<string, unknown>;
  account?: Record<string, unknown>;
  subscriptions: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  policies: Record<string, unknown>[];
}

function collectEvidence(messages: AgentMessage[]): EvidencePack {
  const pack: EvidencePack = { subscriptions: [], payments: [], invoices: [], policies: [] };
  for (const message of messages) {
    if (!message.content.startsWith('TOOL_RESULT ')) continue;
    const newline = message.content.indexOf('\n');
    let records: { recordType: string; id: string; data: Record<string, unknown> }[] = [];
    try {
      records = JSON.parse(message.content.slice(newline + 1)) as typeof records;
    } catch {
      continue;
    }
    for (const record of records) {
      switch (record.recordType) {
        case 'TICKET':
          pack.ticket = record.data;
          break;
        case 'ACCOUNT':
          pack.account = record.data;
          break;
        case 'SUBSCRIPTION':
          pack.subscriptions.push(record.data);
          break;
        case 'PAYMENT':
          pack.payments.push(record.data);
          break;
        case 'INVOICE':
          pack.invoices.push(record.data);
          break;
        case 'POLICY':
          pack.policies.push(record.data);
          break;
      }
    }
  }
  return pack;
}

const money = (value: unknown): string => Number(value).toFixed(2);

const cite = (
  recordType: 'TICKET' | 'ACCOUNT' | 'SUBSCRIPTION' | 'PAYMENT' | 'INVOICE' | 'POLICY',
  id: string | undefined,
  note?: string,
) => ({ recordType, id: id ?? 'unknown', ...(note ? { note } : {}) });

/**
 * Rule-based verdicts mirroring the persisted seed data. These are NOT model
 * outputs — they are deterministic statements about the records, labeled as
 * mock wherever they surface.
 */
function buildMockVerdict(pack: EvidencePack): Record<string, unknown> {
  const scenario = String(pack.ticket?.scenario ?? '');
  const ticketId = typeof pack.ticket?.id === 'string' ? pack.ticket.id : 'unknown-ticket';

  if (scenario === 'PAID_BUT_INACTIVE_PLAN') {
    const canceled = pack.subscriptions.find((s) => s.status === 'CANCELED');
    const paid = pack.payments.find((p) => p.status === 'SUCCEEDED');
    const paidInvoice = pack.invoices.find((i) => paid && i.paymentId === paid.id);
    const policy = pack.policies.find((p) => String(p.key).startsWith('paid-plan'));
    return {
      diagnosis:
        `Records show a successful payment of $${money(paid?.amount)} on ${String(paid?.occurredAt)} ` +
        `covering the current period, while the subscription "${String(canceled?.planName)}" is CANCELED` +
        `${canceled?.canceledAt ? ` (canceled at ${String(canceled?.canceledAt)})` : ''}. ` +
        `The reported mismatch is supported by the persisted records; the cause of the cancellation is not visible in the records.`,
      supportingEvidence: [
        cite('PAYMENT', paid?.id as string | undefined, 'successful payment covering the current period'),
        cite('INVOICE', paidInvoice?.id as string | undefined, 'paid invoice for the same period'),
        cite('SUBSCRIPTION', canceled?.id as string | undefined, 'subscription is CANCELED despite the payment'),
        cite('POLICY', policy?.id as string | undefined, 'policy covering paid-but-inactive-plan reports'),
      ],
      contradictingEvidence: [],
      uncertainty: 'CONFIRMED',
      riskCategory: 'MEDIUM',
      proposedNextStep: {
        type: 'PLATFORM_OPS_REACTIVATION',
        detail:
          'Verify the payment coverage and escalate to Platform Operations for a reactivation review per the paid-plan-reactivation policy. No account changes are made by this investigation.',
      },
      draftReply:
        'Thank you for your report. Our records show a successful payment covering the current period while the subscription is inactive. We are verifying the payment and subscription records and will escalate to Platform Operations for a reactivation review within one business day. No changes have been made to your account yet; we will update this ticket with the outcome.',
    };
  }

  if (scenario === 'DUPLICATE_INVOICE') {
    const paidInvoices = pack.invoices.filter((i) => i.status === 'PAID' && i.paymentId);
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const invoice of paidInvoices) {
      const key = String(invoice.paymentId);
      groups.set(key, [...(groups.get(key) ?? []), invoice]);
    }
    const duplicate = [...groups.entries()].find(([, group]) => group.length >= 2);
    const charge = duplicate ? pack.payments.find((p) => p.id === duplicate[0]) : undefined;
    const policy = pack.policies.find((p) => String(p.key).startsWith('duplicate-invoice'));
    const [first, second] = duplicate?.[1] ?? [];
    return {
      diagnosis:
        duplicate
          ? `Invoices ${String(first?.number)} and ${String(second?.number)} both reference the same successful charge ${String(charge?.ref)} of $${money(charge?.amount)}. The persisted records support the reported duplicate invoicing.`
          : 'No duplicate invoice group was found in the persisted records.',
      supportingEvidence: [
        cite('PAYMENT', charge?.id as string | undefined, 'single successful charge referenced by both invoices'),
        cite('INVOICE', first?.id as string | undefined, 'first invoice for the charge'),
        cite('INVOICE', second?.id as string | undefined, 'second invoice for the same charge'),
        cite('POLICY', policy?.id as string | undefined, 'policy covering duplicate invoices'),
      ],
      contradictingEvidence: [],
      uncertainty: 'CONFIRMED',
      riskCategory: 'MEDIUM',
      proposedNextStep: {
        type: 'DUPLICATE_INVOICE_VERIFICATION',
        detail:
          'A billing analyst should verify the charge against both invoices and correct the duplicate invoice if confirmed. No invoices are voided and no refunds are issued by this investigation.',
      },
      draftReply:
        'Thank you for flagging this. Our records show two invoices referencing the same successful charge. A billing analyst will verify the charge and correct the duplicate invoice if it is confirmed. No changes have been made to your account or invoices yet; we will update this ticket with the outcome.',
    };
  }

  if (scenario === 'CROSS_ACCOUNT_EXPOSURE') {
    const policy = pack.policies.find((p) => String(p.key).startsWith('cross-account'));
    return {
      diagnosis:
        'The ticket reports that the customer could see another organization\'s billing records, and the ticket links a related account. The related account\'s records were deliberately not retrieved. Per company policy this is treated as a potential privacy incident requiring urgent security escalation.',
      supportingEvidence: [
        cite('TICKET', ticketId, 'customer report of cross-account data exposure'),
        cite('POLICY', policy?.id as string | undefined, 'policy covering cross-account exposure reports'),
      ],
      contradictingEvidence: [],
      uncertainty: 'CONFIRMED',
      riskCategory: 'URGENT',
      proposedNextStep: {
        type: 'SECURITY_ESCALATION',
        detail:
          'Escalate to the security on-call within one hour per the cross-account-exposure policy. Preserve the records as reported and do not disclose the other account\'s details to the reporter while triaging. This investigation made no changes.',
      },
      draftReply:
        'Thank you for reporting this. We treat reports of seeing another organization\'s billing data as potential privacy incidents and handle them with the highest priority. A security specialist will review access to your account and investigate how this happened. We will not share details about other accounts during the review, and nothing has been changed on your account yet.',
    };
  }

  if (scenario === 'POSSIBLE_DOUBLE_CHARGE') {
    const succeeded = pack.payments
      .filter((p) => p.status === 'SUCCEEDED')
      .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
    const first = succeeded[0];
    const second = succeeded[1];
    const invoiceFor = (paymentId: unknown) =>
      pack.invoices.find((i) => i.paymentId === paymentId);
    const policy = pack.policies.find((p) => String(p.key).startsWith('possible-double'));
    return {
      diagnosis:
        first && second
          ? `Two successful payments of $${money(first.amount)} and $${money(second.amount)} occurred on ${String(first.occurredAt)} and ${String(second.occurredAt)}. Each maps to a distinct invoice for the same billing period, so the records alone cannot confirm whether one charge is a duplicate.`
          : 'Fewer than two successful payments were found in the persisted records.',
      supportingEvidence: [
        cite('PAYMENT', first?.id as string | undefined, 'first successful charge'),
        cite('PAYMENT', second?.id as string | undefined, 'second successful charge two days later'),
        cite('INVOICE', invoiceFor(first?.id)?.id as string | undefined, 'invoice mapped to the first charge'),
        cite('INVOICE', invoiceFor(second?.id)?.id as string | undefined, 'invoice mapped to the second charge'),
        cite('POLICY', policy?.id as string | undefined, 'policy covering possible double charges'),
      ],
      contradictingEvidence: [
        cite('INVOICE', invoiceFor(first?.id)?.id as string | undefined, 'each payment maps to its own distinct invoice, which is consistent with legitimate charges'),
        cite('INVOICE', invoiceFor(second?.id)?.id as string | undefined, 'the second charge has its own invoice rather than referencing the first'),
      ],
      uncertainty: 'UNCERTAIN',
      riskCategory: 'MEDIUM',
      proposedNextStep: {
        type: 'FINANCIAL_REVIEW',
        detail:
          'Route to financial review: a senior billing analyst must compare the payment references and billing periods before deciding whether a duplicate exists. No refund is issued by this investigation.',
      },
      draftReply:
        'Thank you for your report. Our records show two similar charges close together, and each maps to a separate invoice, so we cannot yet confirm whether one of them is a duplicate. This ticket has been routed to financial review, where a senior billing analyst will compare the payment references. No corrections have been made yet; we will update this ticket with the outcome.',
    };
  }

  return {
    diagnosis:
      'The persisted records for this ticket\'s account were gathered, but no deterministic rule matched the scenario, so no conclusion can be drawn from the records alone.',
    supportingEvidence: [cite('TICKET', ticketId, 'ticket under investigation')],
    contradictingEvidence: [],
    uncertainty: 'UNRESOLVABLE',
    riskCategory: 'LOW',
    proposedNextStep: {
      type: 'FINANCIAL_REVIEW',
      detail: 'Route to financial review for manual inspection of the gathered records.',
    },
    draftReply:
      'Thank you for your report. We are reviewing the records on your account and will follow up in this ticket. No changes have been made to your account yet.',
  };
}
