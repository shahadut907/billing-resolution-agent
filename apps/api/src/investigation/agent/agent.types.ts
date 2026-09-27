import type {
  EvidenceCitation,
  EvidenceRecordType,
  NextStepType,
  RiskCategory,
  ToolTraceEntry,
  UncertaintyLevel,
} from '@billing-resolution/types';

export type { EvidenceRecordType };

export type AgentRole = 'system' | 'user';

export interface AgentMessage {
  role: AgentRole;
  content: string;
}

export interface ToolCallRequest {
  name: string;
  args: Record<string, unknown>;
}

/** One record returned by a scoped tool. Tool results are evidence; the model may cite only these ids. */
export interface EvidenceRecord {
  recordType: EvidenceRecordType;
  id: string;
  data: Record<string, unknown>;
}

export interface Verdict {
  diagnosis: string;
  supportingEvidence: EvidenceCitation[];
  contradictingEvidence: EvidenceCitation[];
  uncertainty: UncertaintyLevel;
  riskCategory: RiskCategory;
  proposedNextStep: { type: NextStepType; detail: string };
  draftReply: string;
}

export interface AgentBounds {
  timeBudgetMs: number;
  maxToolCalls: number;
  /** Backstop against loops that never consume the tool budget (e.g. empty tool_calls batches). */
  maxTurns: number;
  maxProviderRetries: number;
  maxOutputRetries: number;
}

export const DEFAULT_AGENT_BOUNDS: AgentBounds = {
  timeBudgetMs: 20_000,
  maxToolCalls: 12,
  maxTurns: 24,
  maxProviderRetries: 2,
  maxOutputRetries: 2,
};

export function loadBoundsFromEnv(): AgentBounds {
  const int = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };
  return {
    ...DEFAULT_AGENT_BOUNDS,
    timeBudgetMs: int(process.env.AGENT_TIME_BUDGET_MS, DEFAULT_AGENT_BOUNDS.timeBudgetMs),
    maxToolCalls: int(process.env.AGENT_MAX_TOOL_CALLS, DEFAULT_AGENT_BOUNDS.maxToolCalls),
  };
}

export interface AgentOutcome {
  status: 'COMPLETED' | 'FAILED';
  verdict?: Verdict;
  trace: ToolTraceEntry[];
  policyOverrides: string[];
  failureReason?: string;
  boundsUsage: {
    timeBudgetMs: number;
    maxToolCalls: number;
    toolCallsUsed: number;
    elapsedMs: number;
    providerRetries: number;
    outputRetries: number;
    turns: number;
  };
}

/** Thrown by tools when the model requests something outside the allowlist. */
export class ToolRejection extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ToolRejection';
  }
}
