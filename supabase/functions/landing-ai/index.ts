import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase.ts';

/**
 * landing-ai — prompt → landing page block layout.
 * Mirrors form-ai: returns ONLY JSON, validated/coerced client-side by
 * lib/landing-ai.ts `normalizeGenerated`. Requires OPENAI_API_KEY secret.
 */

const BLOCK_TYPES = [
  'navbar', 'hero', 'text', 'features', 'faq', 'stats', 'testimonials', 'logos',
  'cta', 'form', 'pricing', 'countdown', 'image', 'gallery', 'video', 'divider',
  'spacer', 'footer', 'container',
] as const;

const SYSTEM_PROMPT = `You are an expert landing-page designer for a marketing automation platform.
Given a user prompt, design a complete, conversion-focused landing page.

Rules:
- Return ONLY valid JSON: { "name": string, "content": { "sections": Block[], "theme": Theme } }.
- Block = { "type": string, "props": object }. type must be one of: ${BLOCK_TYPES.join(', ')}.
- Order like a real page: navbar, hero, social proof (logos), features/benefits, stats, testimonials, pricing, FAQ, a closing CTA, footer.
- 6-10 blocks. Real, specific marketing copy — no lorem ipsum, no placeholder text.
- hero.props: { headline, subheadline, ctaLabel, ctaUrl:"#", layout:"center"|"split" }.
- features.props: { title, columns:3, items:[{title, description, icon:"check"}] }.
- stats.props: { title, columns:3, items:[{value, label}] }.
- testimonials.props: { title, columns:3, items:[{quote, author, role, rating:5}] }.
- logos.props: { title, items:[{name}] }.
- pricing.props: { title, subtitle, columns:3, tiers:[{name, price, period:"/mo", description, features:[string], ctaLabel, ctaUrl:"#", highlighted:boolean}] }.
- faq.props: { title, items:[{question, answer}] }.
- cta.props: { headline, subheadline, buttonLabel, buttonUrl:"#" }.
- navbar.props: { logoText, links:[{label, url:"#"}], ctaLabel, ctaUrl:"#" }.
- footer.props: { companyName, tagline, columns:[{title, links:[{label, url:"#"}]}], legalText }.
- Theme = { primaryColor: hex, background: hex, radius: "sm"|"md"|"lg", headingFont: "sans"|"serif" } — pick a palette that fits the industry.`;

function buildUserPrompt(prompt: string): string {
  return `Design a landing page for:\n\n"${prompt}"\n\nRespond with the JSON object only.`;
}

async function callOpenAi(apiKey: string, prompt: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_LANDING_MODEL') ?? 'gpt-4o-mini',
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
  const parsed = JSON.parse(content);
  const inner = parsed.content ?? parsed;
  if (!inner || !Array.isArray(inner.sections) || inner.sections.length === 0) {
    throw new Error('OpenAI response missing sections');
  }
  return { name: parsed.name ?? '', content: inner };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  try {
    const body = await req.json();
    const prompt = (body.prompt as string)?.trim();
    if (!prompt) return errorResponse('prompt is required', 400);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return errorResponse(
        'OPENAI_API_KEY is not configured. Add it in Supabase Dashboard → Edge Functions → Secrets, then redeploy landing-ai.',
        503,
      );
    }

    const result = await callOpenAi(apiKey, prompt);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});
