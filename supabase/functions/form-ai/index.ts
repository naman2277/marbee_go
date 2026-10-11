import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
} from '../_shared/supabase.ts';

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'date'] as const;
const THEME_PRESETS = ['indigo', 'teal', 'rose', 'violet', 'slate', 'amber'] as const;

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

const SYSTEM_PROMPT = `You are an expert form designer for a marketing automation platform.
Given a user prompt, design a complete lead capture or data collection form.

Rules:
- Return ONLY valid JSON matching the schema exactly.
- Use snake_case for field "name" keys (e.g. work_email, job_title).
- field_type must be one of: ${FIELD_TYPES.join(', ')}.
- For select fields, include 3-8 sensible "options".
- Use width "half" for short fields (name, email, phone) and "full" for textarea/checkbox/long selects.
- Include 3-8 fields unless the prompt clearly needs fewer or more (max 12).
- Mark fields required when logically necessary (email on contact forms, etc.).
- theme_preset must be one of: ${THEME_PRESETS.join(', ')} — pick based on industry/mood.
- Write professional, concise copy for labels, placeholders, submit_label, success_message.
- banner_headline: short punchy title (max 6 words).
- banner_subheadline: one supporting line (max 12 words).
- banner_image_prompt: detailed DALL-E prompt for a wide hero banner (no text in image, abstract/professional).
- upsert_customer: true if form collects contact/lead info (email, name, phone).`;

function buildUserPrompt(prompt: string): string {
  return `Design a form for this request:\n\n"${prompt}"\n\nRespond with JSON:
{
  "name": "Form title (max 48 chars)",
  "description": "One sentence shown under the title",
  "submit_label": "Button text",
  "success_message": "After submit message",
  "theme_preset": "indigo|teal|rose|violet|slate|amber",
  "upsert_customer": true,
  "banner_headline": "Short headline",
  "banner_subheadline": "Supporting line",
  "banner_image_prompt": "DALL-E prompt for hero banner",
  "fields": [
    {
      "name": "field_key",
      "label": "Label",
      "field_type": "text",
      "required": true,
      "placeholder": "Optional",
      "help_text": "Optional",
      "options": ["Only for select"],
      "width": "half",
      "section": "Optional section name"
    }
  ]
}`;
}

async function callOpenAiChat(apiKey: string, prompt: string): Promise<AiPayload> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_FORM_MODEL') ?? 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(prompt) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${err.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty response');

  const parsed = JSON.parse(content) as AiPayload;
  if (!parsed.name || !Array.isArray(parsed.fields) || parsed.fields.length === 0) {
    throw new Error('OpenAI response missing required form fields');
  }
  return parsed;
}

async function generateBannerImage(apiKey: string, imagePrompt: string): Promise<string | null> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `${imagePrompt}. Wide hero banner, modern, professional, no text, no logos, suitable for website header.`,
      size: '1792x1024',
      quality: 'standard',
      n: 1,
    }),
  });

  if (!res.ok) {
    console.warn('DALL-E failed:', await res.text());
    return null;
  }

  const json = await res.json();
  return json.data?.[0]?.url ?? null;
}

async function uploadBannerFromUrl(
  imageUrl: string,
  tenantId: string,
  environment: string,
  slug: string,
): Promise<string | null> {
  try {
    const supabase = getServiceClient();
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    const path = `${tenantId}/${environment}/form-banners/${Date.now()}-${slug}.png`;

    const { error } = await supabase.storage.from('assets').upload(path, bytes, {
      contentType: 'image/png',
      upsert: false,
    });
    if (error) {
      console.warn('Banner upload failed:', error.message);
      return imageUrl;
    }

    const { data } = supabase.storage.from('assets').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.warn('Banner upload error:', e);
    return imageUrl;
  }
}

function toFormDraft(
  parsed: AiPayload,
  prompt: string,
  generateBanner: boolean,
  bannerImageUrl?: string | null,
) {
  const preset = THEME_PRESETS.includes(parsed.theme_preset as typeof THEME_PRESETS[number])
    ? parsed.theme_preset
    : 'indigo';

  const fields = parsed.fields.slice(0, 12).map((f, i) => ({
    id: crypto.randomUUID(),
    name: f.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase() || `field_${i + 1}`,
    label: f.label || `Field ${i + 1}`,
    field_type: FIELD_TYPES.includes(f.field_type as typeof FIELD_TYPES[number]) ? f.field_type : 'text',
    required: Boolean(f.required),
    placeholder: f.placeholder,
    help_text: f.help_text,
    options: f.field_type === 'select' ? (f.options ?? ['Option 1', 'Option 2']) : undefined,
    sort_order: i,
    width: f.width === 'half' ? 'half' : 'full',
    section: f.section,
  }));

  const theme = { preset, radius: 'xl', style: 'card' };
  const banner = {
    enabled: generateBanner,
    headline: parsed.banner_headline || parsed.name,
    subheadline: parsed.banner_subheadline || parsed.description,
    overlay_opacity: 0.35,
    image_url: bannerImageUrl ?? undefined,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const prompt = (body.prompt as string)?.trim();
    const generateBanner = body.generateBanner !== false;
    const tenantId = (body.tenantId as string) ?? '00000000-0000-0000-0000-000000000001';
    const environment = (body.environment as string) ?? 'production';

    if (!prompt) return errorResponse('prompt is required', 400);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return errorResponse(
        'OPENAI_API_KEY is not configured. Add it in Supabase Dashboard → Edge Functions → Secrets, then redeploy form-ai.',
        503,
      );
    }

    const parsed = await callOpenAiChat(apiKey, prompt);

    // Banner images are generated client-side to avoid edge function timeouts
    return jsonResponse(toFormDraft(parsed, prompt, generateBanner, null));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(message, 500);
  }
});
