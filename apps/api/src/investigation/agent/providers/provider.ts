import type { AgentMessage } from '../agent.types';
import { MockInvestigationProvider } from './mock.provider';
import { OpenAICompatibleProvider } from './openai-compatible.provider';

/**
 * Server-side provider adapter contract. Implementations receive only chat
 * messages and must never leak credentials: API keys stay inside the adapter,
 * error messages are sanitized, and nothing is logged here.
 */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** The AI_PROVIDER/AI_API_KEY/AI_MODEL configuration is missing or invalid. */
export class ProviderMisconfiguredError extends ProviderError {}

export interface ProviderCompleteRequest {
  messages: AgentMessage[];
  /** Wall-clock budget for this single provider call, in milliseconds. */
  timeoutMs: number;
}

export interface InvestigationProvider {
  readonly id: string;
  readonly model: string;
  /** True for the deterministic mock — persisted so mock output is never presented as a real model call. */
  readonly isMock: boolean;
  complete(request: ProviderCompleteRequest): Promise<{ text: string }>;
}

export function requestedProviderId(): string {
  return (process.env.AI_PROVIDER ?? 'mock').trim().toLowerCase();
}

/**
 * Resolves the provider from environment configuration:
 *   AI_PROVIDER=mock    deterministic mock mode (default; no model is called)
 *   AI_PROVIDER=openai  any OpenAI-compatible chat completions API
 *                       (AI_API_KEY + AI_MODEL required; AI_BASE_URL optional)
 */
export function createProviderFromEnv(): InvestigationProvider {
  const provider = requestedProviderId();
  if (provider === 'mock') {
    return new MockInvestigationProvider();
  }
  if (provider === 'openai') {
    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL?.trim();
    if (!apiKey || !model) {
      throw new ProviderMisconfiguredError(
        'AI_PROVIDER=openai requires AI_API_KEY and AI_MODEL to be set',
      );
    }
    const baseUrl = (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    return new OpenAICompatibleProvider({ apiKey, model, baseUrl });
  }
  throw new ProviderMisconfiguredError(`Unknown AI_PROVIDER "${provider}" (supported: mock, openai)`);
}
