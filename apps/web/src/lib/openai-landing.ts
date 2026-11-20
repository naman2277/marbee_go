/**
 * Direct-from-browser OpenAI call for landing-page generation. Only used in
 * (disabled — SEC-06: AI keys never ship to the browser) direct-call fallback for when the `landing-ai` edge function
 * is unavailable. Production uses the edge function (see lib/landing-ai.ts).
 */
import type { LandingContent } from './landing-pages';

const BLOCK_TYPES = [
  'navbar', 'hero', 'text', 'features', 'faq', 'stats', 'testimonials', 'logos',
  'cta', 'form', 'pricing', 'countdown', 'image', 'gallery', 'video', 'divider',
  'spacer', 'footer',
] as const;

export const LANDING_SYSTEM_PROMPT = `You are an expert landing-page designer for a marketing automation platform.
Given a user prompt, design a complete, conversion-focused landing page.

Rules:
- Return ONLY valid JSON: { "name": string, "content": { "sections": Block[], "theme": Theme } }.
- Block = { "type": string, "props": object }. type must be one of: ${BLOCK_TYPES.join(', ')}.
- Order blocks like a real page: navbar, hero, social proof, features/benefits, testimonials, pricing, FAQ, a closing CTA, footer.
- 6-10 blocks. Write real, specific marketing copy — no lorem ipsum, no placeholders.
- hero props: headline, subheadline, ctaLabel, ctaUrl ("#").
- features props: title, columns (3), items:[{title, description, icon:"check"}].
- testimonials props: title, items:[{quote, author, role, rating:5}].
- pricing props: title, tiers:[{name, price, period:"/mo", description, features:[string], ctaLabel, ctaUrl:"#", highlighted:bool}].
- faq props: title, items:[{question, answer}].
- stats props: items:[{value, label}].
- cta props: headline, subheadline, buttonLabel, buttonUrl:"#".
- footer props: companyName, tagline, columns:[{title, links:[{label,url:"#"}]}], legalText.
- Theme = { "primaryColor": hex, "background": hex, "radius": "sm"|"md"|"lg", "headingFont": "sans"|"serif" } — pick a palette that fits the industry.`;

function buildUserPrompt(prompt: string): string {
  return `Design a landing page for:\n\n"${prompt}"\n\nRespond with the JSON object only.`;
}

export async function generateLandingViaOpenAi(apiKey: string, prompt: string): Promise<LandingContent> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        { role: 'system', content: LANDING_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(prompt) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned an empty response');
  const parsed = JSON.parse(raw) as { content?: LandingContent };
  const content = parsed.content ?? (parsed as unknown as LandingContent);
  if (!content?.sections) throw new Error('OpenAI response had no sections');
  return content;
}
