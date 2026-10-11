import type { FormField, FormSchemaMapping, FormSettings } from './forms';
import type { FormBanner, FormTheme, FormThemePreset } from './form-design';
import { DEFAULT_FORM_THEME } from './form-design';

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'date'] as const;
const THEME_PRESETS: FormThemePreset[] = ['indigo', 'teal', 'rose', 'violet', 'slate', 'amber'];

type AiField = {
  name: string;
  label: string;
  field_type: string;
  required?: boolean;
  placeholder?: string;
  help_text?: string;
  options?: string[];
  width?: 'full' | 'half';
  section?: string;
};

type AiPayload = {
  name: string;
  description: string;
  submit_label: string;
  success_message: string;
  theme_preset: string;
  upsert_customer: boolean;
  banner_headline: string;
  banner_subheadline: string;
  banner_image_prompt: string;
  fields: AiField[];
};

export type OpenAiFormResult = {
  name: string;
  description: string;
  fields: FormField[];
  settings: FormSettings;
  schema_mapping: FormSchemaMapping;
  theme: FormTheme;
  banner: FormBanner;
  banner_prompt?: string;
};

const SYSTEM_PROMPT = `You are an expert form designer for a marketing automation platform.
Given a user prompt, design a complete lead capture or data collection form.

Rules:
- Return ONLY valid JSON matching the schema exactly.
- Use snake_case for field "name" keys (e.g. work_email, job_title).
- field_type must be one of: ${FIELD_TYPES.join(', ')}.
- For select fields, include 3-8 sensible "options".
- Use width "half" for short fields and "full" for textarea/checkbox.
- Include 3-8 fields unless the prompt clearly needs fewer or more (max 12).
- theme_preset must be one of: ${THEME_PRESETS.join(', ')}.
- banner_image_prompt: detailed DALL-E prompt for a wide hero banner (no text in image).`;

function buildUserPrompt(prompt: string): string {
  return `Design a form for this request:\n\n"${prompt}"\n\nRespond with JSON:
{
  "name": "Form title",
  "description": "One sentence",
  "submit_label": "Button text",
  "success_message": "After submit message",
  "theme_preset": "indigo",
  "upsert_customer": true,
  "banner_headline": "Short headline",
  "banner_subheadline": "Supporting line",
  "banner_image_prompt": "DALL-E prompt",
  "fields": [{ "name": "email", "label": "Email", "field_type": "email", "required": true, "width": "half" }]
}`;
}

function formatOpenAiError(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string } };
    const code = parsed.error?.code;
    const message = parsed.error?.message;

    if (code === 'insufficient_quota' || status === 429) {
      return (
        'Your OpenAI account has no credits left. Add billing at platform.openai.com/settings/organization/billing ' +
        '— then retry AI Studio. You can still create forms using Template or Blank.'
      );
    }
    if (code === 'invalid_api_key' || status === 401) {
      return 'Invalid OpenAI API key. Update OPENAI_API_KEY in Supabase secrets or VITE_OPENAI_API_KEY in .env.local.';
    }
    if (message) return message;
  } catch {
    // not JSON
  }
  return `OpenAI error (${status}): ${raw.slice(0, 200)}`;
}

async function openAiFetch<T>(apiKey: string, path: string, body: unknown): Promise<T> {
  const useDevProxy = import.meta.env.DEV && Boolean(import.meta.env.VITE_OPENAI_API_KEY);
  const url = useDevProxy ? `/openai-api${path.replace('/v1', '')}` : `https://api.openai.com/v1${path.replace('/v1', '')}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: useDevProxy
      ? { 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(formatOpenAiError(res.status, err));
  }

  return res.json() as Promise<T>;
}

function parsePayload(content: string): AiPayload {
  const parsed = JSON.parse(content) as AiPayload;
  if (!parsed.name || !Array.isArray(parsed.fields) || parsed.fields.length === 0) {
    throw new Error('AI response missing required form fields');
  }
  return parsed;
}

function toFormResult(parsed: AiPayload, prompt: string, generateBanner: boolean): OpenAiFormResult {
  const preset = THEME_PRESETS.includes(parsed.theme_preset as FormThemePreset)
    ? (parsed.theme_preset as FormThemePreset)
    : 'indigo';

  const fields: FormField[] = parsed.fields.slice(0, 12).map((f, i) => ({
    id: crypto.randomUUID(),
    name: f.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase() || `field_${i + 1}`,
    label: f.label || `Field ${i + 1}`,
    field_type: (FIELD_TYPES.includes(f.field_type as (typeof FIELD_TYPES)[number])
      ? f.field_type
      : 'text') as FormField['field_type'],
    required: Boolean(f.required),
    placeholder: f.placeholder,
    help_text: f.help_text,
    options: f.field_type === 'select' ? (f.options ?? ['Option 1', 'Option 2']) : undefined,
    sort_order: i,
    width: f.width === 'half' ? 'half' : 'full',
    section: f.section,
  }));

  const theme: FormTheme = { ...DEFAULT_FORM_THEME, preset };
  const banner: FormBanner = {
    enabled: generateBanner,
    headline: parsed.banner_headline || parsed.name,
    subheadline: parsed.banner_subheadline || parsed.description,
    overlay_opacity: 0.35,
  };

  return {
    name: parsed.name.slice(0, 80),
    description: parsed.description,
    fields,
    theme,
    banner,
    banner_prompt: parsed.banner_image_prompt,
    settings: {
      build_mode: 'ai',
      submit_label: parsed.submit_label || 'Submit',
      success_message: parsed.success_message || 'Thank you — we received your submission.',
      description: parsed.description,
      theme,
      banner,
      ai_generated: true,
      ai_prompt: prompt,
      ai_provider: 'openai',
    },
    schema_mapping: { upsert_customer: Boolean(parsed.upsert_customer) },
  };
}

export async function generateFormViaOpenAi(
  apiKey: string,
  prompt: string,
  generateBanner = true,
): Promise<OpenAiFormResult> {
  const json = await openAiFetch<{
    choices: Array<{ message?: { content?: string } }>;
  }>(apiKey, '/chat/completions', {
    model: import.meta.env.VITE_OPENAI_FORM_MODEL ?? 'gpt-4o-mini',
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(prompt) },
    ],
  });

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty response');

  return toFormResult(parsePayload(content), prompt, generateBanner);
}

export async function generateBannerViaOpenAi(
  apiKey: string,
  imagePrompt: string,
): Promise<string | null> {
  const json = await openAiFetch<{ data?: Array<{ url?: string }> }>(apiKey, '/images/generations', {
    model: 'dall-e-3',
    prompt: `${imagePrompt}. Wide hero banner, modern, professional, no text, no logos.`,
    size: '1792x1024',
    quality: 'standard',
    n: 1,
  });

  return json.data?.[0]?.url ?? null;
}
