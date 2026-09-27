import type { EvidenceRecordType } from '@billing-resolution/types';
import { finalizeVerdict, parseModelTurn, ModelProtocolError } from './verdict';

const registry = new Map<string, EvidenceRecordType>([
  ['TICKET:tkt-3', 'TICKET'],
  ['ACCOUNT:acc-1', 'ACCOUNT'],
  ['PAYMENT:pay-1', 'PAYMENT'],
  ['INVOICE:inv-1', 'INVOICE'],
  ['POLICY:pol-1', 'POLICY'],
]);

const baseVerdict = {
  diagnosis: 'The report describes cross-account exposure; treated as a privacy incident.',
  supportingEvidence: [{ recordType: 'TICKET', id: 'tkt-3', note: 'ticket' }],
  contradictingEvidence: [],
  uncertainty: 'CONFIRMED',
  riskCategory: 'URGENT',
  proposedNextStep: {
    type: 'SECURITY_ESCALATION',
    detail: 'Escalate to the security on-call for triage.',
  },
  draftReply:
    'Thank you for reporting this. A security specialist will review access to your account. Nothing has been changed yet.',
};

const exposureCtx = {
  registry,
  scenario: 'CROSS_ACCOUNT_EXPOSURE',
  relatedAccountIdentifiers: ['Granite Glen Dental', 'billing@graniteglen.example', 'acc-2'],
};

describe('parseModelTurn', () => {
  it('parses a plain tool_calls envelope', () => {
    const turn = parseModelTurn('{"action":"tool_calls","calls":[{"name":"get_ticket","args":{}}]}');
    expect(turn).toEqual({
      kind: 'tool_calls',
      calls: [{ name: 'get_ticket', args: {} }],
    });
  });

  it('parses a fenced final envelope', () => {
    const text = '```json\n{"action":"final","verdict":{"diagnosis":"x"}}\n```';
    const turn = parseModelTurn(text);
    expect(turn).toEqual({ kind: 'final', verdictRaw: { diagnosis: 'x' } });
  });

  it('extracts the JSON object from surrounding prose', () => {
    const text = 'Here is my answer: {"action":"tool_calls","calls":[{"name":"get_account"}]} — done.';
    const turn = parseModelTurn(text);
    expect(turn).toEqual({ kind: 'tool_calls', calls: [{ name: 'get_account', args: {} }] });
  });

  it('rejects prose without JSON, non-object JSON, unknown actions, and empty calls', () => {
    expect(() => parseModelTurn('no json here')).toThrow(ModelProtocolError);
    expect(() => parseModelTurn('[1,2,3]')).toThrow(ModelProtocolError);
    expect(() => parseModelTurn('{"action":"nap"}')).toThrow(ModelProtocolError);
    expect(() => parseModelTurn('{"action":"tool_calls","calls":[]}')).toThrow(ModelProtocolError);
    expect(() => parseModelTurn('{"action":"final"}')).toThrow(ModelProtocolError);
  });
});

describe('finalizeVerdict', () => {
  it('accepts a valid verdict whose citations all belong to the gathered evidence', () => {
    const result = finalizeVerdict(
      { ...baseVerdict, supportingEvidence: [{ recordType: 'PAYMENT', id: 'pay-1' }] },
      { registry, scenario: 'CROSS_ACCOUNT_EXPOSURE', relatedAccountIdentifiers: null },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verdict.riskCategory).toBe('URGENT');
      expect(result.policyOverrides).toEqual([]);
    }
  });

  it('rejects missing or malformed fields', () => {
    const cases: unknown[] = [
      { ...baseVerdict, diagnosis: '' },
      { ...baseVerdict, uncertainty: 'SORT_OF' },
      { ...baseVerdict, riskCategory: 'CATASTROPHIC' },
      { ...baseVerdict, proposedNextStep: { type: 'ISSUE_REFUND', detail: 'x' } },
      { ...baseVerdict, draftReply: '' },
      { ...baseVerdict, supportingEvidence: 'nope' },
    ];
    for (const verdict of cases) {
      const result = finalizeVerdict(verdict, {
        registry,
        scenario: 'CROSS_ACCOUNT_EXPOSURE',
        relatedAccountIdentifiers: null,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects citations that are not part of the gathered evidence', () => {
    const result = finalizeVerdict(
      {
        ...baseVerdict,
        supportingEvidence: [{ recordType: 'INVOICE', id: 'inv-FOREIGN' }],
      },
      { registry, scenario: 'CROSS_ACCOUNT_EXPOSURE', relatedAccountIdentifiers: null },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not part of the evidence');
    }
  });

  it('rejects citations whose record type does not match the evidence registry', () => {
    const result = finalizeVerdict(
      {
        ...baseVerdict,
        supportingEvidence: [{ recordType: 'INVOICE', id: 'pay-1' }],
      },
      { registry, scenario: 'CROSS_ACCOUNT_EXPOSURE', relatedAccountIdentifiers: null },
    );
    expect(result.ok).toBe(false);
  });

  it('rejects draft replies that claim a completed refund or repair', () => {
    const claims = [
      'Good news — the refund has been issued to your card.',
      'We have reactivated your plan.',
      'Your account has been repaired and the invoice has been voided.',
      'I have issued a refund of $490.',
    ];
    for (const draftReply of claims) {
      const result = finalizeVerdict({ ...baseVerdict, draftReply }, {
        registry,
        scenario: 'CROSS_ACCOUNT_EXPOSURE',
        relatedAccountIdentifiers: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('forbidden pattern');
      }
    }
  });

  it('rejects output that names the related account on exposure reports', () => {
    const result = finalizeVerdict(
      {
        ...baseVerdict,
        draftReply:
          'Thank you for reporting this. We found that Granite Glen Dental records were visible and a security review is under way.',
      },
      exposureCtx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('related account');
    }
  });

  it('forces URGENT + SECURITY_ESCALATION for exposure reports regardless of the model output', () => {
    const result = finalizeVerdict(
      { ...baseVerdict, riskCategory: 'LOW', proposedNextStep: { type: 'CHARGE_VERIFICATION', detail: 'check charges' } },
      exposureCtx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verdict.riskCategory).toBe('URGENT');
      expect(result.verdict.proposedNextStep.type).toBe('SECURITY_ESCALATION');
      expect(result.policyOverrides).toHaveLength(2);
    }
  });

  it('forces UNCERTAIN + FINANCIAL_REVIEW for ambiguous double-charge reports', () => {
    const result = finalizeVerdict(
      {
        ...baseVerdict,
        uncertainty: 'CONFIRMED',
        riskCategory: 'MEDIUM',
        proposedNextStep: { type: 'PLATFORM_OPS_REACTIVATION', detail: 'reactivate review' },
      },
      { registry, scenario: 'POSSIBLE_DOUBLE_CHARGE', relatedAccountIdentifiers: null },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verdict.uncertainty).toBe('UNCERTAIN');
      expect(result.verdict.proposedNextStep.type).toBe('FINANCIAL_REVIEW');
      expect(result.policyOverrides).toHaveLength(2);
    }
  });
});
