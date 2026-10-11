/**
 * Landing Studio — AI assists.
 *
 * Two layers, mirroring the rest of the app:
 *  1. Deterministic, offline transforms (copy rewrite, page audit, SEO, block
 *     suggestions, prompt→page from blueprints) — always available, no network.
 *  2. `generateLandingPageWithAi` — an edge-function → client-key → local
 *     blueprint ladder, the same shape as `generateFormWithAi` (lib/form-ai.ts).
 */
import { invokeFunction } from './functions';
import {
  createLandingSection,
  type LandingContent,
  type LandingSection,
  type LandingSectionType,
} from './landing-pages';
import { countBlocks } from './landing-blocks';
import { generateLandingViaOpenAi } from './openai-landing';

// ---------------------------------------------------------------------------
// 1a. Copy assist
// ---------------------------------------------------------------------------

export type CopyAssistAction = 'rewrite' | 'shorten' | 'expand' | 'punchier' | 'friendlier' | 'cta';

export const COPY_ASSIST_LABELS: Record<CopyAssistAction, string> = {
  rewrite: 'Rewrite',
  shorten: 'Make it shorter',
  expand: 'Add detail',
  punchier: 'Make it punchier',
  friendlier: 'Warmer tone',
  cta: 'Stronger CTA',
};

const FILLERS = /\b(really|very|just|actually|basically|simply|literally|in order to|that is|kind of|sort of)\b/gi;
const PUNCHY_LEADS = ['Ship faster.', 'Built for teams.', 'No fluff.', 'Results, not busywork.'];
const CTA_VERBS = ['Start', 'Get', 'Try', 'Claim', 'Unlock', 'Book'];

function sentences(t: string): string[] {
  return t
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function runCopyAssist(action: CopyAssistAction, text: string): string {
  const src = (text ?? '').trim();
  if (!src) return src;
  switch (action) {
    case 'shorten': {
      const parts = sentences(src);
      const kept = parts.slice(0, Math.max(1, Math.ceil(parts.length / 2)));
      return kept.join(' ').replace(FILLERS, '').replace(/\s{2,}/g, ' ').trim();
    }
    case 'rewrite': {
      const cleaned = src.replace(FILLERS, '').replace(/\s{2,}/g, ' ').trim();
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    case 'expand': {
      const parts = sentences(src);
      const lead = parts[0] ?? src;
      return `${src} ${lead.replace(/[.!?]$/, '')} — and it takes minutes to set up, not weeks.`;
    }
    case 'punchier': {
      const lead = PUNCHY_LEADS[hash(src) % PUNCHY_LEADS.length];
      const core = sentences(src)[0] ?? src;
      return `${lead} ${core.replace(FILLERS, '').trim()}`.replace(/\s{2,}/g, ' ');
    }
    case 'friendlier': {
      const core = src.replace(FILLERS, '').trim();
      return `We built this for you. ${core} Have a look — we think you'll like it.`;
    }
    case 'cta': {
      const verb = CTA_VERBS[hash(src) % CTA_VERBS.length];
      const noun = src.replace(/^(get|start|try|claim|book|unlock)\s+/i, '').replace(/[.!]$/, '');
      return `${verb} ${noun || 'your free trial'} →`;
    }
    default:
      return src;
  }
}

/** The text fields on a block worth running copy assist against, in priority order. */
export function editableTextFields(section: LandingSection): Array<{ key: string; label: string; value: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = section.props;
  const out: Array<{ key: string; label: string; value: string }> = [];
  const push = (key: string, label: string) => {
    if (typeof p[key] === 'string' && p[key].trim()) out.push({ key, label, value: p[key] });
  };
  push('headline', 'Headline');
  push('title', 'Title');
  push('subheadline', 'Subheadline');
  push('subtitle', 'Subtitle');
  push('body', 'Body');
  push('ctaLabel', 'Button label');
  push('buttonLabel', 'Button label');
  push('tagline', 'Tagline');
  return out;
}

export function applyCopyAssist(
  section: LandingSection,
  fieldKey: string,
  action: CopyAssistAction,
): LandingSection['props'] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = section.props;
  return { ...p, [fieldKey]: runCopyAssist(action, p[fieldKey] ?? '') };
}

// ---------------------------------------------------------------------------
// 1b. Page audit
// ---------------------------------------------------------------------------

export type PageIssue = {
  severity: 'error' | 'warning' | 'info';
  blockId?: string;
  message: string;
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const la = luminance(ra);
  const lb = luminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function auditPage(content: LandingContent): PageIssue[] {
  const issues: PageIssue[] = [];
  const flat: LandingSection[] = [];
  const walk = (list: LandingSection[]) =>
    list.forEach((s) => {
      flat.push(s);
      if (s.type === 'container') walk(s.props.children);
    });
  walk(content.sections);

  if (flat.length === 0) {
    issues.push({ severity: 'warning', message: 'The page has no blocks yet.' });
    return issues;
  }

  const types = new Set(flat.map((s) => s.type));
  if (!types.has('hero')) issues.push({ severity: 'warning', message: 'No hero block — most landing pages open with one.' });
  if (!types.has('cta') && !types.has('form') && !types.has('pricing'))
    issues.push({ severity: 'error', message: 'No call-to-action, form or pricing block — visitors have no next step.' });
  if (!types.has('footer')) issues.push({ severity: 'info', message: 'Consider a footer block for legal links and contact info.' });

  // per-block checks
  for (const s of flat) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = s.props;
    if (s.type === 'image' && p.url && !String(p.alt || '').trim())
      issues.push({ severity: 'warning', blockId: s.id, message: 'Image is missing alt text.' });
    if (s.type === 'gallery' && Array.isArray(p.images) && p.images.some((i: { url: string; alt: string }) => i.url && !i.alt))
      issues.push({ severity: 'warning', blockId: s.id, message: 'One or more gallery images have no alt text.' });
    if ((s.type === 'hero' || s.type === 'cta') && p.ctaLabel === '' && p.buttonLabel === '')
      issues.push({ severity: 'info', blockId: s.id, message: 'This block has no button label.' });
    if ((s.type === 'hero' && (p.ctaUrl === '#' || !p.ctaUrl)) || (s.type === 'cta' && (p.buttonUrl === '#' || !p.buttonUrl)))
      issues.push({ severity: 'info', blockId: s.id, message: 'Button still points at a placeholder URL (#).' });
    if (s.type === 'video' && !String(p.url || '').trim())
      issues.push({ severity: 'warning', blockId: s.id, message: 'Video block has no URL.' });
    if (s.type === 'countdown' && new Date(p.targetDate).getTime() < Date.now())
      issues.push({ severity: 'warning', blockId: s.id, message: 'Countdown target date is in the past.' });
  }

  // theme contrast
  const bg = content.theme?.background ?? '#ffffff';
  const text = content.theme?.textColor ?? '#0f172a';
  const cr = contrastRatio(bg, text);
  if (cr && cr < 4.5)
    issues.push({ severity: 'error', message: `Body text vs background contrast is ${cr.toFixed(1)}:1 (WCAG AA needs 4.5:1).` });

  // SEO
  if (!content.theme) issues.push({ severity: 'info', message: 'No theme set — using defaults.' });

  return issues;
}

// ---------------------------------------------------------------------------
// 1c. Block suggestions
// ---------------------------------------------------------------------------

export function suggestNextBlocks(content: LandingContent): LandingSectionType[] {
  const present = new Set(content.sections.map((s) => s.type));
  const ideal: LandingSectionType[] = ['navbar', 'hero', 'logos', 'features', 'stats', 'testimonials', 'pricing', 'faq', 'cta', 'footer'];
  return ideal.filter((t) => !present.has(t)).slice(0, 4);
}

// ---------------------------------------------------------------------------
// 1d. SEO
// ---------------------------------------------------------------------------

export function generateSeoFromContent(
  content: LandingContent,
  fallbackName: string,
): { title: string; description: string } {
  const hero = content.sections.find((s) => s.type === 'hero') as Extract<LandingSection, { type: 'hero' }> | undefined;
  const firstText = content.sections.find((s) => s.type === 'text') as Extract<LandingSection, { type: 'text' }> | undefined;
  const title = (hero?.props.headline || fallbackName || 'Landing page').slice(0, 60);
  const descSource = hero?.props.subheadline || firstText?.props.body || `${fallbackName} — learn more and get started today.`;
  const description = descSource.replace(/\s+/g, ' ').trim().slice(0, 155);
  return { title, description };
}

// ---------------------------------------------------------------------------
// 1e. Prompt → page (local blueprint fallback)
// ---------------------------------------------------------------------------

type Blueprint = { match: RegExp; blocks: LandingSectionType[] };

const BLUEPRINTS: Blueprint[] = [
  { match: /\b(saas|software|app|platform|product|tool)\b/i, blocks: ['navbar', 'hero', 'logos', 'features', 'stats', 'testimonials', 'pricing', 'faq', 'cta', 'footer'] },
  { match: /\b(webinar|event|conference|workshop|summit)\b/i, blocks: ['navbar', 'hero', 'stats', 'features', 'testimonials', 'form', 'faq', 'footer'] },
  { match: /\b(ebook|guide|whitepaper|report|download|lead magnet)\b/i, blocks: ['hero', 'features', 'testimonials', 'form', 'footer'] },
  { match: /\b(course|bootcamp|class|training|academy)\b/i, blocks: ['navbar', 'hero', 'features', 'stats', 'testimonials', 'pricing', 'faq', 'cta', 'footer'] },
  { match: /\b(agency|studio|freelance|consult|service)\b/i, blocks: ['navbar', 'hero', 'logos', 'features', 'gallery', 'testimonials', 'cta', 'footer'] },
  { match: /\b(waitlist|coming soon|early access|launch)\b/i, blocks: ['hero', 'features', 'countdown', 'form', 'footer'] },
  { match: /\b(sale|discount|offer|promo|black friday|deal)\b/i, blocks: ['navbar', 'hero', 'countdown', 'pricing', 'testimonials', 'faq', 'cta', 'footer'] },
];

const DEFAULT_BLUEPRINT: LandingSectionType[] = ['navbar', 'hero', 'features', 'testimonials', 'cta', 'footer'];

export function pageFromBlueprint(prompt: string): LandingContent {
  const topic = prompt.trim();
  const bp = BLUEPRINTS.find((b) => b.match.test(topic))?.blocks ?? DEFAULT_BLUEPRINT;
  const name = topic.replace(/^(a|an|the)\s+/i, '').split(/[.,\n]/)[0].slice(0, 60) || 'Your product';
  const sections = bp.map((type) => {
    const block = createLandingSection(type);
    if (block.type === 'hero') {
      block.props.headline = titleCase(name);
      block.props.subheadline = `${sentenceCase(topic)}. Everything you need, nothing you don't.`;
      block.props.ctaLabel = 'Get started free';
    }
    if (block.type === 'cta') {
      block.props.headline = `Ready to try ${shorten(name)}?`;
      block.props.subheadline = 'Join thousands already on board.';
    }
    if (block.type === 'navbar') block.props.logoText = titleCase(shorten(name));
    if (block.type === 'footer') {
      block.props.companyName = titleCase(shorten(name));
      block.props.legalText = `© ${new Date().getFullYear()} ${titleCase(shorten(name))}. All rights reserved.`;
    }
    return block;
  });
  return {
    mode: 'blocks',
    sections,
    theme: { primaryColor: '#4f46e5', background: '#ffffff', radius: 'md', headingFont: 'sans', sectionSpacing: 'normal', preset: 'indigo' },
  };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function sentenceCase(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function shorten(s: string): string {
  return s.split(/\s+/).slice(0, 2).join(' ');
}

// ---------------------------------------------------------------------------
// 2. Full generation ladder
// ---------------------------------------------------------------------------

export const AI_PAGE_EXAMPLES = [
  'A SaaS landing page for an AI meeting-notes app with pricing and testimonials',
  'Webinar registration page for a fintech conference in March',
  'Early-access waitlist for a developer tool, with a countdown',
  'Agency portfolio page for a branding studio with a project gallery',
  'Black Friday promo page for an online course, 50% off',
];

export type GeneratedPage = { name?: string; content: LandingContent; source: 'edge' | 'client' | 'local' };

function getClientOpenAiKey(): string | undefined {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  return key?.trim() || undefined;
}

export async function generateLandingPageWithAi(
  prompt: string,
  options?: { tenantId?: string; environment?: string },
): Promise<GeneratedPage> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error('Describe the page you want to create.');

  // 1) Edge function (with a short ceiling so a missing/slow function can't
  //    hang the studio — we still have the client + local fallbacks).
  const edge = await Promise.race([
    invokeFunction<{ name?: string; content?: LandingContent }>('landing-ai', {
      prompt: trimmed,
      tenantId: options?.tenantId,
      environment: options?.environment,
    }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 6000)),
  ]);

  if (edge?.ok && edge.data?.content && Array.isArray(edge.data.content.sections) && edge.data.content.sections.length > 0) {
    return { name: edge.data.name, content: normalizeGenerated(edge.data.content), source: 'edge' };
  }
  if (edge && !edge.ok && /insufficient_quota|no credits/i.test(edge.error ?? '')) {
    // fall through to local rather than hard-failing
    console.warn('[landing-ai] edge quota exhausted, using local blueprint');
  }

  // 2) Client OpenAI key (local dev)
  if (getClientOpenAiKey()) {
    try {
      const content = await generateLandingViaOpenAi(getClientOpenAiKey()!, trimmed);
      if (content.sections.length > 0) return { content: normalizeGenerated(content), source: 'client' };
    } catch (e) {
      console.warn('[landing-ai] client OpenAI failed, using local blueprint', e);
    }
  }

  // 3) Local blueprint
  return { content: pageFromBlueprint(trimmed), source: 'local' };
}

/** Coerce a generated content object into something the renderer trusts. */
export function normalizeGenerated(raw: LandingContent): LandingContent {
  const clean = (list: unknown): LandingSection[] => {
    if (!Array.isArray(list)) return [];
    return list
      .map((s) => {
        const sec = s as Partial<LandingSection> & { type?: string };
        if (!sec || typeof sec.type !== 'string') return null;
        let base: LandingSection;
        try {
          base = createLandingSection(sec.type as LandingSectionType);
        } catch {
          return null;
        }
        const merged = {
          ...base,
          id: crypto.randomUUID(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          props: { ...(base.props as any), ...((sec as any).props ?? {}) },
        } as LandingSection;
        if (merged.type === 'container') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          merged.props.children = clean((sec as any).props?.children);
        }
        return merged;
      })
      .filter((x): x is LandingSection => x !== null);
  };
  return {
    mode: 'blocks',
    sections: clean(raw?.sections),
    theme: raw?.theme ?? { primaryColor: '#4f46e5', background: '#ffffff', preset: 'indigo' },
  };
}

export { countBlocks };
