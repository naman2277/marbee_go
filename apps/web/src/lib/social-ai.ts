/**
 * Local, deterministic "AI assist" for the Social Studio composer.
 *
 * No network calls — these are rule-based transforms and heuristics so the
 * studio works offline and in the dev harness. They are intentionally small and
 * predictable; swap `runAssist` for a real model call later without changing
 * the composer.
 */
import type { AiVoice } from './social-config';
import { getNetwork, type SocialNetworkId } from './social-networks';

export type AssistAction =
  | 'shorten'
  | 'expand'
  | 'hook'
  | 'hashtags'
  | 'emoji'
  | 'cta'
  | 'thread'
  | 'plain';

const HOOKS = [
  'Here’s what nobody tells you:',
  'Quick story 👇',
  'We just shipped something big.',
  'Unpopular opinion:',
  'The 30-second version:',
  '3 lessons from this week:',
];

const CTAS = [
  '\n\n→ Try it free, link in comments.',
  '\n\nWhat would you add? Reply below.',
  '\n\nFull breakdown on the blog (link below).',
  '\n\nFollow for more like this.',
];

const TONE_EMOJI: Record<AiVoice['tone'], string[]> = {
  professional: ['✅', '📈', '🔧', '•'],
  friendly: ['🙌', '✨', '👇', '💬'],
  bold: ['🚀', '🔥', '⚡', '💥'],
  playful: ['😄', '🎉', '👀', '🙃'],
  informative: ['📊', '🧵', '📌', 'ℹ️'],
};

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractHashtags(text: string): string[] {
  return Array.from(text.matchAll(/#[\p{L}0-9_]+/gu)).map((m) => m[0]);
}

export function extractMentions(text: string): string[] {
  return Array.from(text.matchAll(/@[\p{L}0-9_.]+/gu)).map((m) => m[0]);
}

export function countEmoji(text: string): number {
  return Array.from(text.matchAll(/\p{Extended_Pictographic}/gu)).length;
}

export function hasLink(text: string): boolean {
  return /(https?:\/\/|www\.)\S+/i.test(text);
}

export function runAssist(
  action: AssistAction,
  text: string,
  opts: { voice: AiVoice; network?: SocialNetworkId; hashtags?: string[] },
): string {
  const src = text.trim();
  switch (action) {
    case 'shorten': {
      const limit = opts.network ? getNetwork(opts.network)?.charLimit ?? 280 : 280;
      const target = Math.min(limit, Math.max(120, Math.round(src.length * 0.6)));
      const parts = sentences(src);
      let out = '';
      for (const s of parts) {
        if ((out + ' ' + s).trim().length > target) break;
        out = (out ? `${out} ${s}` : s);
      }
      return (out || src.slice(0, target)).trim();
    }
    case 'expand': {
      const parts = sentences(src);
      const bullets = parts.slice(0, 3).map((s) => `• ${s.replace(/[.!?]$/, '')}`);
      return `${parts[0] ?? src}\n\n${bullets.join('\n')}\n\nWhy it matters: this compounds over time.`;
    }
    case 'hook': {
      const idx = Math.abs(hashCode(src)) % HOOKS.length;
      const already = HOOKS.some((h) => src.startsWith(h));
      return already ? src : `${HOOKS[idx]}\n\n${src}`;
    }
    case 'hashtags': {
      const tags = (opts.hashtags && opts.hashtags.length ? opts.hashtags : autoTags(src)).join(' ');
      return extractHashtags(src).length ? src : `${src}\n\n${tags}`;
    }
    case 'emoji': {
      const pool = TONE_EMOJI[opts.voice.tone];
      const lines = src.split('\n');
      return lines
        .map((line, i) => {
          if (!line.trim() || countEmoji(line) > 0) return line;
          const e = pool[i % pool.length];
          return /[:.!?]$/.test(line.trim()) ? `${line} ${e}` : `${line} ${e}`;
        })
        .join('\n');
    }
    case 'cta': {
      const idx = Math.abs(hashCode(src)) % CTAS.length;
      return /link in|reply below|follow for|blog/i.test(src) ? src : src + CTAS[idx];
    }
    case 'thread': {
      const parts = sentences(src);
      return parts.map((s, i) => `${i + 1}/ ${s}`).join('\n\n');
    }
    case 'plain': {
      return src.replace(/\p{Extended_Pictographic}/gu, '').replace(/ +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    default:
      return src;
  }
}

function autoTags(text: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'you', 'your', 'our', 'this', 'that', 'from', 'have',
    'are', 'was', 'will', 'just', 'about', 'into', 'they', 'what', 'when', 'here',
  ]);
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().matchAll(/[a-z]{4,}/g)) {
    const word = w[0];
    if (stop.has(word)) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => `#${w}`);
  return top.length ? top : ['#marketing', '#growth'];
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------
// Caption analysis — powers the composer's "content health" meter
// ---------------------------------------------------------------------------

export type CaptionInsight = {
  score: number; // 0–100
  chars: number;
  words: number;
  readingSeconds: number;
  hashtags: number;
  mentions: number;
  emoji: number;
  link: boolean;
  overLimit: boolean;
  tips: string[];
};

export function analyseCaption(text: string, network?: SocialNetworkId): CaptionInsight {
  const n = network ? getNetwork(network) : undefined;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const hashtags = extractHashtags(text).length;
  const mentions = extractMentions(text).length;
  const emoji = countEmoji(text);
  const link = hasLink(text);
  const overLimit = n ? chars > n.charLimit : false;

  const tips: string[] = [];
  let score = 60;

  if (words === 0) {
    return { score: 0, chars, words, readingSeconds: 0, hashtags, mentions, emoji, link, overLimit, tips: ['Start writing to see suggestions.'] };
  }
  if (overLimit) {
    score -= 30;
    tips.push(`Trim ${chars - (n!.charLimit)} characters to fit ${n!.label}.`);
  }
  const firstLine = text.split('\n')[0] ?? '';
  if (firstLine.length > 0 && firstLine.length <= 120) score += 8;
  else tips.push('Tighten the first line — it’s the only thing most people read.');

  if (n) {
    const [lo, hi] = n.hashtagSweetSpot;
    if (hashtags < lo && hi > 0) tips.push(`Add ${lo - hashtags} more hashtag${lo - hashtags === 1 ? '' : 's'} (aim ${lo}–${hi} on ${n.shortLabel}).`);
    else if (hashtags > hi) { score -= 8; tips.push(`Drop a few hashtags — ${n.shortLabel} performs best with ${lo}–${hi}.`); }
    else score += 8;
  }
  if (emoji > 0 && emoji <= 5) score += 6;
  if (emoji > 10) { score -= 6; tips.push('Ease up on the emoji.'); }
  if (link && n && !n.features.includes('link')) tips.push(`${n!.label} doesn’t make links clickable — put it in the bio or first comment.`);
  if (mentions > 0) score += 4;
  if (words > 8 && words < 120) score += 6;
  if (/\?$/m.test(text)) score += 4; // a question invites replies

  score = Math.max(0, Math.min(100, score));
  if (tips.length === 0) tips.push('Looks strong. Ship it. 🚀');

  return {
    score,
    chars,
    words,
    readingSeconds: Math.max(1, Math.round((words / 200) * 60)),
    hashtags,
    mentions,
    emoji,
    link,
    overLimit,
    tips,
  };
}
