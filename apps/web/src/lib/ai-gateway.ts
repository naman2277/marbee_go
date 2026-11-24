// Browser client for the ai-gateway edge function (D-018).
// The browser never holds an AI provider key: it sends prompts, the server picks the
// key (tenant's sealed key, or Marbee's platform key metered against AI credits).

import { invokeFunction } from './functions';
import { readStoredEnvironment } from './environment';

/** Stored keys are shown as "••••••••abcd". A value starting with this is never a real key. */
export const MASKED_KEY_PREFIX = '••••';
export const isMaskedKey = (k?: string | null) => typeof k === 'string' && k.startsWith(MASKED_KEY_PREFIX);
export const maskedKey = (last4?: string | null) => (last4 ? `${MASKED_KEY_PREFIX}••••${last4}` : '');
/** A key the user just typed (not the masked placeholder, not empty). */
export const isNewKey = (k?: string | null) => typeof k === 'string' && k.trim().length >= 8 && !isMaskedKey(k);

export type AiCompleteInput = {
  tenantId?: string;
  environment?: string;
  provider?: string;
  model?: string;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  /** Only for "Test" on an unsaved key in Settings → AI Engine (needs Manage settings). */
  candidateKey?: string;
};

export type AiCompleteResult =
  | { ok: true; text: string; provider: string; model: string; source: string; latencyMs: number; tokens: number }
  | { ok: false; status: number; error: string };

export async function aiComplete(input: AiCompleteInput): Promise<AiCompleteResult> {
  const r = await invokeFunction<{ data?: { text: string; provider: string; model: string; source: string; latency_ms: number; tokens: number } }>(
    'ai-gateway',
    {
      op: 'complete',
      tenant_id: input.tenantId,
      environment: input.environment ?? readStoredEnvironment() ?? 'production',
      provider: input.provider || undefined,
      model: input.model || undefined,
      system_prompt: input.systemPrompt,
      user_message: input.userMessage,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      candidate_key: isNewKey(input.candidateKey) ? input.candidateKey!.trim() : undefined,
    },
  );
  const d = r.data?.data;
  if (!r.ok || !d) return { ok: false, status: r.status, error: r.error ?? 'AI request failed' };
  return { ok: true, text: d.text, provider: d.provider, model: d.model, source: d.source, latencyMs: d.latency_ms, tokens: d.tokens };
}

export async function saveAiKey(p: { tenantId: string; environment: string; provider: string; modelName: string; apiKey: string }) {
  return invokeFunction<{ data?: { saved: boolean; last4: string } }>('ai-gateway', {
    op: 'save_key', tenant_id: p.tenantId, environment: p.environment, provider: p.provider, model_name: p.modelName, api_key: p.apiKey.trim(),
  });
}

export async function clearAiKey(p: { tenantId: string; environment: string; provider: string; modelName: string }) {
  return invokeFunction<{ data?: { cleared: boolean } }>('ai-gateway', {
    op: 'clear_key', tenant_id: p.tenantId, environment: p.environment, provider: p.provider, model_name: p.modelName,
  });
}
