import {
  EVIDENCE_RECORD_TYPES,
  NEXT_STEP_TYPES,
  RISK_CATEGORIES,
  UNCERTAINTY_LEVELS,
  type EvidenceCitation,
  type EvidenceRecordType,
  type NextStepType,
  type RiskCategory,
  type UncertaintyLevel,
} from '@billing-resolution/types';
import type { Verdict } from './agent.types';

/** Thrown when the model's response does not follow the JSON envelope protocol. */
export class ModelProtocolError extends Error {}

export type ModelTurn =
  | { kind: 'tool_calls'; calls: { name: string; args: Record<string, unknown> }[] }
  | { kind: 'final'; verdictRaw: unknown };

/**
 * Parses the model's response into a protocol turn. The model must answer with
 * exactly one JSON object; fenced code blocks and surrounding prose are
 * tolerated, everything else is a protocol error (which the loop retries
 * within bounds).
 */
export function parseModelTurn(text: string): ModelTurn {
  const parsed = extractJson(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ModelProtocolError('response JSON is not an object');
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.action === 'tool_calls') {
    const callsRaw = envelope.calls;
    if (!Array.isArray(callsRaw) || callsRaw.length === 0) {
      throw new ModelProtocolError('action "tool_calls" requires a non-empty calls array');
    }
    const calls = callsRaw.map((call) => {
      if (typeof call !== 'object' || call === null) {
        throw new ModelProtocolError('each call must be an object');
      }
      const entry = call as Record<string, unknown>;
      if (typeof entry.name !== 'string' || entry.name.length === 0) {
        throw new ModelProtocolError('call.name must be a non-empty string');
      }
      const args = entry.args ?? {};
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        throw new ModelProtocolError('call.args must be an object');
      }
      return { name: entry.name, args: args as Record<string, unknown> };
    });
    return { kind: 'tool_calls', calls };
  }
  if (envelope.action === 'final') {
    const verdictRaw = envelope.verdict;
    if (typeof verdictRaw !== 'object' || verdictRaw === null || Array.isArray(verdictRaw)) {
      throw new ModelProtocolError('action "final" requires a "verdict" object');
    }
    return { kind: 'final', verdictRaw };
  }
  throw new ModelProtocolError('action must be "tool_calls" or "final"');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to tolerant extraction
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  throw new ModelProtocolError('response contained no parsable JSON object');
}

/**
 * Claims that the investigation (or anyone) completed an irreversible action.
 * Investigations are advisory: they must never state that a refund was issued,
 * an account was repaired/reactivated, an invoice voided, or similar.
 */
const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /refund\s+(?:has\s+been|will\s+be|was|is\s+being)\s+(?:issued|processed|sent|initiated|approved)/i,
  /we\s+(?:have|had)\s+refund(?:ed|ing)?/i,
  /(?:money|amount|funds)\s+(?:have|has|was|were)\s+(?:been\s+)?(?:refunded|returned|credited)/i,
  /we\s+have\s+(?:credited|reimbursed)/i,
  /(?:account|plan|subscription)\s+(?:has\s+been|was|is\s+now)\s+(?:reactivated|restored|repaired|fixed|reinstated|re-enabled)/i,
  /we\s+have\s+(?:reactivated|restored|repaired|fixed|reinstated|re-enabled)/i,
  /invoice\s+(?:has\s+been|was)\s+(?:voided|deleted|cancelled|canceled)/i,
  /charge\s+(?:has\s+been|was)\s+(?:reversed|refunded|cancelled|canceled|removed)/i,
  /i\s+(?:have\s+)?(?:issued|processed)\s+(?:a\s+)?refund/i,
];

export interface FinalizeContext {
  /** Every evidence record the tools returned, keyed as `${recordType}:${id}`. */
  registry: ReadonlyMap<string, EvidenceRecordType>;
  scenario: string;
  /** Identifiers of the related account (exposure reports) that must never appear in output text. */
  relatedAccountIdentifiers: string[] | null;
}

export type FinalizeResult =
  | { ok: true; verdict: Verdict; policyOverrides: string[] }
  | { ok: false; error: string };

/**
 * Validates the model's structured verdict, verifies every cited record id
 * against the gathered evidence, scans for forbidden action claims and related
 * account disclosures, and finally applies deterministic policy overrides
 * server-side (the model cannot talk its way out of them).
 */
export function finalizeVerdict(raw: unknown, ctx: FinalizeContext): FinalizeResult {
  const v = raw as Record<string, unknown>;
  const fail = (error: string): FinalizeResult => ({ ok: false, error });

  if (typeof v.diagnosis !== 'string' || v.diagnosis.trim().length === 0 || v.diagnosis.length > 4000) {
    return fail('diagnosis must be a non-empty string of at most 4000 characters');
  }
  if (!(UNCERTAINTY_LEVELS as readonly string[]).includes(v.uncertainty as string)) {
    return fail(`uncertainty must be one of ${UNCERTAINTY_LEVELS.join(', ')}`);
  }
  if (!(RISK_CATEGORIES as readonly string[]).includes(v.riskCategory as string)) {
    return fail(`riskCategory must be one of ${RISK_CATEGORIES.join(', ')}`);
  }
  const step = v.proposedNextStep as Record<string, unknown> | undefined;
  if (typeof step !== 'object' || step === null || Array.isArray(step)) {
    return fail('proposedNextStep must be an object');
  }
  if (!(NEXT_STEP_TYPES as readonly string[]).includes(step.type as string)) {
    return fail(`proposedNextStep.type must be one of ${NEXT_STEP_TYPES.join(', ')}`);
  }
  if (
    typeof step.detail !== 'string' ||
    step.detail.trim().length === 0 ||
    step.detail.length > 1000
  ) {
    return fail('proposedNextStep.detail must be a non-empty string of at most 1000 characters');
  }
  if (typeof v.draftReply !== 'string' || v.draftReply.trim().length === 0 || v.draftReply.length > 2000) {
    return fail('draftReply must be a non-empty string of at most 2000 characters');
  }

  const supporting = parseCitations(v.supportingEvidence, 'supportingEvidence', ctx.registry);
  if (typeof supporting === 'string') return fail(supporting);
  const contradicting = parseCitations(v.contradictingEvidence, 'contradictingEvidence', ctx.registry);
  if (typeof contradicting === 'string') return fail(contradicting);

  const scannedText = [v.diagnosis as string, step.detail as string, v.draftReply as string].join('\n');
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.test(scannedText)) {
      return fail(
        `output claims a completed action (matched forbidden pattern "${pattern.source}") — investigations must never claim refunds, account repairs, or other executed changes`,
      );
    }
  }
  if (ctx.relatedAccountIdentifiers) {
    const haystack = scannedText.toLowerCase();
    for (const identifier of ctx.relatedAccountIdentifiers) {
      const needle = identifier.toLowerCase();
      if (needle.length > 0 && haystack.includes(needle)) {
        return fail(
          'output names the related account, whose details must not be disclosed for cross-account exposure reports',
        );
      }
    }
  }

  const policyOverrides: string[] = [];
  let riskCategory = v.riskCategory as RiskCategory;
  let uncertainty = v.uncertainty as UncertaintyLevel;
  let nextStepType = step.type as NextStepType;
  if (ctx.scenario === 'CROSS_ACCOUNT_EXPOSURE') {
    if (riskCategory !== 'URGENT') {
      policyOverrides.push(
        `riskCategory forced from ${riskCategory} to URGENT: reported cross-account exposure is always an urgent escalation`,
      );
      riskCategory = 'URGENT';
    }
    if (nextStepType !== 'SECURITY_ESCALATION') {
      policyOverrides.push(
        `proposedNextStep.type forced from ${nextStepType} to SECURITY_ESCALATION: reported cross-account exposure is always an urgent escalation`,
      );
      nextStepType = 'SECURITY_ESCALATION';
    }
  }
  if (ctx.scenario === 'POSSIBLE_DOUBLE_CHARGE') {
    if (uncertainty !== 'UNCERTAIN') {
      policyOverrides.push(
        `uncertainty forced from ${uncertainty} to UNCERTAIN: ambiguous charge data cannot confirm a duplicate`,
      );
      uncertainty = 'UNCERTAIN';
    }
    if (nextStepType !== 'FINANCIAL_REVIEW') {
      policyOverrides.push(
        `proposedNextStep.type forced from ${nextStepType} to FINANCIAL_REVIEW: ambiguous charges route to financial review`,
      );
      nextStepType = 'FINANCIAL_REVIEW';
    }
  }

  return {
    ok: true,
    policyOverrides,
    verdict: {
      diagnosis: v.diagnosis as string,
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      uncertainty,
      riskCategory,
      proposedNextStep: { type: nextStepType, detail: step.detail as string },
      draftReply: v.draftReply as string,
    },
  };
}

function parseCitations(
  raw: unknown,
  field: string,
  registry: ReadonlyMap<string, EvidenceRecordType>,
): EvidenceCitation[] | string {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return `${field} must be an array`;
  }
  const citations: EvidenceCitation[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return `${field} entries must be objects`;
    }
    const e = entry as Record<string, unknown>;
    if (!(EVIDENCE_RECORD_TYPES as readonly string[]).includes(e.recordType as string)) {
      return `${field}.recordType must be one of ${EVIDENCE_RECORD_TYPES.join(', ')}`;
    }
    if (typeof e.id !== 'string' || e.id.length === 0 || e.id.length > 64) {
      return `${field}.id must be a non-empty string of at most 64 characters`;
    }
    const key = `${e.recordType}:${e.id}`;
    if (!registry.has(key)) {
      return `${field} cites ${key}, which is not part of the evidence gathered for this ticket`;
    }
    if (e.note !== undefined && (typeof e.note !== 'string' || e.note.length > 300)) {
      return `${field}.note must be a string of at most 300 characters`;
    }
    citations.push({
      recordType: e.recordType as EvidenceRecordType,
      id: e.id,
      ...(e.note !== undefined ? { note: e.note as string } : {}),
    });
  }
  return citations;
}
