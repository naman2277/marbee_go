import { invokeFunction } from './functions';
import type { FilterOperator } from './schema-filters';
import type { SimpleAudienceRule } from './audiences';

export type AiAudienceDraft = {
  name: string;
  description: string;
  schema_slug: string;
  rules: SimpleAudienceRule[];
  explanation: string;
};

const OPERATORS: FilterOperator[] = [
  'contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with',
  'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty',
];

function getClientOpenAiKey(): string | undefined {
  const key = undefined as string | undefined /* SEC-06: AI keys never in the browser — edge functions / ai-gateway only */;
  return key?.trim() || undefined;
}

/** Rule-based fallback when AI is unavailable */
export function parseAudiencePromptLocal(prompt: string, schemaSlug = 'customer'): AiAudienceDraft {
  const q = prompt.toLowerCase();
  const rules: SimpleAudienceRule[] = [];

  if (q.includes('active')) {
    rules.push({ field: 'status', operator: 'equals', value: 'active' });
  }
  if (q.includes('india') || q.includes(' indian')) {
    rules.push({ field: 'country', operator: 'equals', value: 'IN', join: 'and' });
  }
  if (q.includes('email consent') || q.includes('email marketing')) {
    rules.push({ field: 'consent_email', operator: 'equals', value: 'true', join: 'and' });
  }
  if (q.includes('sms consent') || q.includes('sms marketing')) {
    rules.push({ field: 'consent_sms', operator: 'equals', value: 'true', join: 'and' });
  }
  if (q.includes('web push') || q.includes('push consent')) {
    rules.push({ field: 'consent_web_push', operator: 'equals', value: 'true', join: 'and' });
  }
  if (q.includes('global consent')) {
    rules.push({ field: 'global_consent', operator: 'equals', value: 'true', join: 'and' });
  }
  if (q.includes('has email') || q.includes('with email')) {
    rules.push({ field: 'email', operator: 'is_not_empty', value: '', join: 'and' });
  }
  if (q.includes('missing email') || q.includes('no email')) {
    rules.push({ field: 'email', operator: 'is_empty', value: '', join: 'and' });
  }
  if (q.includes('mobile') || q.includes('phone')) {
    rules.push({ field: 'mobile', operator: 'is_not_empty', value: '', join: 'and' });
  }

  if (!rules.length) {
    rules.push({ field: 'status', operator: 'equals', value: 'active' });
  }

  const name = prompt.length > 48 ? `${prompt.slice(0, 45)}…` : prompt || 'AI cohort';

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    description: `AI-generated from: "${prompt}"`,
    schema_slug: schemaSlug,
    rules,
    explanation: `Matched ${rules.length} rule(s) from your prompt using keyword patterns.`,
  };
}

async function generateViaEdge(prompt: string, schemaSlug: string, fieldNames: string[]): Promise<AiAudienceDraft | null> {
  const edge = await invokeFunction<AiAudienceDraft>('audience-ai', {
    prompt,
    schema_slug: schemaSlug,
    field_names: fieldNames,
  });
  if (edge.ok && edge.data?.rules?.length) return edge.data;
  return null;
}

async function generateViaOpenAiClient(
  prompt: string,
  schemaSlug: string,
  fieldNames: string[],
): Promise<AiAudienceDraft | null> {
  const apiKey = getClientOpenAiKey();
  if (!apiKey) return null;

  const system = `You are a marketing audience segmentation expert. Given a user prompt and available schema fields, return ONLY valid JSON with cohort rules.

Available operators: ${OPERATORS.join(', ')}
Available fields: ${fieldNames.join(', ')}

JSON schema:
{
  "name": "Short cohort name",
  "description": "One sentence",
  "schema_slug": "${schemaSlug}",
  "explanation": "Why these rules match the prompt",
  "rules": [{ "field": "field_name", "operator": "equals", "value": "value", "join": "and" }]
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
        { role: 'user', content: `Create an audience cohort for: "${prompt}"` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as AiAudienceDraft;
    if (parsed.rules?.length) return parsed;
  } catch {
    return null;
  }
  return null;
}

export async function generateAudienceFromPrompt(opts: {
  prompt: string;
  schemaSlug: string;
  fieldNames: string[];
}): Promise<{ draft: AiAudienceDraft; source: 'edge' | 'openai' | 'local' }> {
  const edge = await generateViaEdge(opts.prompt, opts.schemaSlug, opts.fieldNames);
  if (edge) return { draft: edge, source: 'edge' };

  const client = await generateViaOpenAiClient(opts.prompt, opts.schemaSlug, opts.fieldNames);
  if (client) return { draft: client, source: 'openai' };

  return {
    draft: parseAudiencePromptLocal(opts.prompt, opts.schemaSlug),
    source: 'local',
  };
}
