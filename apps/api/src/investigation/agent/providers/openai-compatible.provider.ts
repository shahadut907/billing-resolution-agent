import type { InvestigationProvider, ProviderCompleteRequest } from './provider';
import { ProviderError } from './provider';

/**
 * Adapter for any OpenAI-compatible chat completions API (OpenAI, Azure-style
 * gateways, OpenRouter, Groq, vLLM, ...). Configured via env:
 *   AI_API_KEY   secret — stays inside this module, is never logged, persisted,
 *                or sent to the frontend
 *   AI_MODEL     model identifier, e.g. "gpt-4o-mini"
 *   AI_BASE_URL  default https://api.openai.com/v1
 *
 * All error messages are sanitized: HTTP bodies, headers, and the key itself
 * never appear in errors, so nothing sensitive can reach logs or the client.
 */
export class OpenAICompatibleProvider implements InvestigationProvider {
  readonly id = 'openai';
  readonly isMock = false;
  readonly model: string;

  constructor(
    private readonly options: { apiKey: string; model: string; baseUrl: string },
  ) {
    this.model = options.model;
  }

  async complete(request: ProviderCompleteRequest): Promise<{ text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, request.timeoutMs));
    try {
      const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ProviderError(`provider HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new ProviderError('provider returned an empty response');
      }
      return { text };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as Error)?.name === 'AbortError') {
        throw new ProviderError('provider timeout');
      }
      throw new ProviderError('provider unreachable');
    } finally {
      clearTimeout(timer);
    }
  }
}
