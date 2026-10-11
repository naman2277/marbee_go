// Paste this entire file into Supabase Dashboard → Edge Functions → Create function → name: form-ai
// Then add secret: OPENAI_API_KEY = your OpenAI key
// Settings: turn OFF "Enforce JWT Verification"

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'date'];
const THEME_PRESETS = ['indigo', 'teal', 'rose', 'violet', 'slate', 'amber'];

const SYSTEM_PROMPT = `You are an expert form designer for a marketing automation platform.
Given a user prompt, design a complete lead capture or data collection form.

Rules:
- Return ONLY valid JSON matching the schema exactly.
- Use snake_case for field "name" keys (e.g. work_email, job_title).
- field_type must be one of: text, email, phone, number, textarea, select, checkbox, date.
- For select fields, include 3-8 sensible "options".
- Use width "half" for short fields and "full" for textarea/checkbox.
- Include 3-8 fields unless the prompt clearly needs fewer or more (max 12).
- theme_preset must be one of: indigo, teal, rose, violet, slate, amber.
- banner_image_prompt: detailed DALL-E prompt for a wide hero banner (no text in image).`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function buildUserPrompt(prompt: string) {
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
  "banner_image_prompt": "DALL-E prompt for hero banner",
  "fields": [
    { "name": "email", "label": "Email", "field_type": "email", "required": true, "width": "half" }
  ]
}`;
}

async function callOpenAiChat(apiKey: string, prompt: string) {
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
    let message = err.slice(0, 300);
    try {
      const parsed = JSON.parse(err);
      if (parsed.error?.code === 'insufficient_quota') {
        message =
          'OpenAI credits exhausted. Add billing at platform.openai.com/settings/organization/billing';
      } else if (parsed.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // keep raw
    }
    throw new Error(`OpenAI error (${res.status}): ${message}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty response');

  const parsed = JSON.parse(content);
  if (!parsed.name || !Array.isArray(parsed.fields) || parsed.fields.length === 0) {
    throw new Error('OpenAI response missing required form fields');
  }
  return parsed;
}

async function generateBannerImage(apiKey: string, imagePrompt: string) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `${imagePrompt}. Wide hero banner, modern, professional, no text, no logos.`,
      size: '1792x1024',
      quality: 'standard',
      n: 1,
    }),
  });

  if (!res.ok) {
    console.warn('DALL-E failed:', await res.text());
    return null;
  }

  const data = await res.json();
  return data.data?.[0]?.url ?? null;
}

async function uploadBannerFromUrl(
  imageUrl: string,
  tenantId: string,
  environment: string,
  slug: string,
) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return imageUrl;

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
}

function toFormDraft(parsed: Record<string, unknown>, prompt: string, generateBanner: boolean, bannerImageUrl?: string | null) {
  const preset = THEME_PRESETS.includes(parsed.theme_preset as string) ? parsed.theme_preset : 'indigo';
  const rawFields = parsed.fields as Array<Record<string, unknown>>;

  const fields = rawFields.slice(0, 12).map((f, i) => ({
    id: crypto.randomUUID(),
    name: String(f.name ?? `field_${i + 1}`).replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
    label: String(f.label ?? `Field ${i + 1}`),
    field_type: FIELD_TYPES.includes(String(f.field_type)) ? f.field_type : 'text',
    required: Boolean(f.required),
    placeholder: f.placeholder ? String(f.placeholder) : undefined,
    help_text: f.help_text ? String(f.help_text) : undefined,
    options: f.field_type === 'select' ? (f.options as string[] ?? ['Option 1', 'Option 2']) : undefined,
    sort_order: i,
    width: f.width === 'half' ? 'half' : 'full',
    section: f.section ? String(f.section) : undefined,
  }));

  const theme = { preset, radius: 'xl', style: 'card' };
  const banner = {
    enabled: generateBanner,
    headline: String(parsed.banner_headline ?? parsed.name),
    subheadline: String(parsed.banner_subheadline ?? parsed.description),
    overlay_opacity: 0.35,
    image_url: bannerImageUrl ?? undefined,
  };

  return {
    name: String(parsed.name).slice(0, 80),
    description: String(parsed.description ?? ''),
    fields,
    theme,
    banner,
    banner_prompt: parsed.banner_image_prompt,
    settings: {
      build_mode: 'ai',
      submit_label: parsed.submit_label ?? 'Submit',
      success_message: parsed.success_message ?? 'Thank you — we received your submission.',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const body = await req.json();
    const prompt = String(body.prompt ?? '').trim();
    const generateBanner = body.generateBanner !== false;
    const tenantId = body.tenantId ?? '00000000-0000-0000-0000-000000000001';
    const environment = body.environment ?? 'production';

    if (!prompt) return json({ error: 'prompt is required' }, 400);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return json(
        { error: 'OPENAI_API_KEY secret is missing. Add it under Edge Functions → Secrets.' },
        503,
      );
    }

    const parsed = await callOpenAiChat(apiKey, prompt);

    // Banner images are generated client-side to avoid edge function timeouts
    return json(toFormDraft(parsed, prompt, generateBanner, null));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});
