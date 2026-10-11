import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase.ts';

const OPERATORS = [
  'contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with',
  'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty',
];

type AiRule = {
  field: string;
  operator: string;
  value: string;
  join?: string;
};

type AiPayload = {
  name: string;
  description: string;
  schema_slug: string;
  explanation: string;
  rules: AiRule[];
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const prompt = String(body.prompt ?? '');
    const schemaSlug = String(body.schema_slug ?? 'customer');
    const fieldNames = (body.field_names as string[]) ?? [];

    if (!prompt.trim()) return errorResponse('prompt is required', 400);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return errorResponse('OPENAI_API_KEY not configured', 503);
    }

    const system = `You are a marketing audience segmentation expert for Marbee CDP.
Given a user prompt, design a cohort using schema field filters.

Rules:
- Return ONLY valid JSON.
- schema_slug: "${schemaSlug}"
- rules[].field must be from: ${fieldNames.join(', ') || 'status, email, country, consent_email, mobile, city'}
- rules[].operator must be one of: ${OPERATORS.join(', ')}
- Use join "and" or "or" on rules after the first.
- For boolean fields use value "true" or "false".
- For is_empty/is_not_empty use value "".

JSON:
{
  "name": "Cohort name (max 48 chars)",
  "description": "One sentence",
  "schema_slug": "${schemaSlug}",
  "explanation": "Brief reasoning",
  "rules": [{ "field": "status", "operator": "equals", "value": "active" }]
}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Create audience cohort: "${prompt}"` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return errorResponse(`OpenAI error: ${err.slice(0, 200)}`, 502);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return errorResponse('Empty AI response', 502);

    const parsed = JSON.parse(content) as AiPayload;
    if (!parsed.rules?.length) return errorResponse('No rules generated', 422);

    return jsonResponse(parsed);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500);
  }
});
