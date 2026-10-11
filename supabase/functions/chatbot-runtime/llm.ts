// Provider-agnostic LLM adapter for the Chat Bot runtime.
// Mirrors the endpoints used by apps/web/src/lib/ai-crm-context.ts, but runs
// server-side only — the API key never leaves this Edge Function.

export type LlmProvider = 'openai' | 'gemini' | 'claude' | 'grok' | 'deepseek' | 'groq' | 'openrouter' | 'jev' | 'custom_llm';

export type LlmCallInput = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export type LlmCallResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
};

const OPENAI_COMPATIBLE_ENDPOINTS: Partial<Record<LlmProvider, string>> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  grok: 'https://api.x.ai/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  custom_llm: 'https://api.openai.com/v1/chat/completions',
};

async function callOpenAiCompatible(input: LlmCallInput): Promise<LlmCallResult> {
  const endpoint = input.baseUrl || OPENAI_COMPATIBLE_ENDPOINTS[input.provider] || OPENAI_COMPATIBLE_ENDPOINTS.openai!;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (input.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://app.marbee.io';
      headers['X-OpenRouter-Title'] = 'Marbee';
    }

    const body: Record<string, unknown> = {
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userMessage },
      ],
    };
    if (input.provider === 'openrouter' && !input.model.startsWith('openrouter/')) {
      body.models = [
        input.model,
        '~anthropic/claude-sonnet-latest',
        '~openai/gpt-sol-latest',
        'google/gemini-2.0-flash-001',
      ];
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${input.provider} error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? '';
    const usage = json.usage ?? {};
    return {
      text,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(input: LlmCallInput): Promise<LlmCallResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: `${input.systemPrompt}\n\nRespond with ONLY valid JSON, no markdown fences.`,
        messages: [{ role: 'user', content: input.userMessage }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`claude error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const json = await res.json();
    const text = (json.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
    const usage = json.usage ?? {};
    const inputTok = usage.input_tokens ?? 0;
    const outputTok = usage.output_tokens ?? 0;
    return {
      text,
      promptTokens: inputTok,
      completionTokens: outputTok,
      totalTokens: inputTok + outputTok,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(input: LlmCallInput): Promise<LlmCallResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const model = input.model || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input.userMessage }] }],
        generationConfig: {
          temperature: input.temperature,
          maxOutputTokens: input.maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`gemini error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    const usage = json.usageMetadata ?? {};
    return {
      text,
      promptTokens: usage.promptTokenCount ?? 0,
      completionTokens: usage.candidatesTokenCount ?? 0,
      totalTokens: usage.totalTokenCount ?? 0,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Call the configured LLM provider. Retries `retryCount` times on failure/timeout. */
export async function callLlm(input: LlmCallInput, retryCount = 0): Promise<LlmCallResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (input.provider === 'claude') return await callAnthropic(input);
      if (input.provider === 'gemini') return await callGemini(input);
      return await callOpenAiCompatible(input);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

/** Resolve the server-side secret for a provider. Never sourced from the browser. */
export function resolveProviderApiKey(provider: string, dbFallbackKey?: string | null): string | null {
  const envKeyByProvider: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    claude: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY',
    grok: 'XAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    jev: 'JEV_API_KEY',
    custom_llm: 'CUSTOM_LLM_API_KEY',
  };
  const envVarName = envKeyByProvider[provider];
  if (envVarName) {
    const fromEnv = Deno.env.get(envVarName)?.trim();
    if (fromEnv) return fromEnv;
  }
  const fromDb = dbFallbackKey?.trim();
  return fromDb || null;
}
