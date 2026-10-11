/**
 * Shared helpers for the multi-channel message studios (WhatsApp / RCS / SMS /
 * Web Push). Kept framework-free so both the composers and the device previews
 * can use them.
 */

// Unified lifecycle status lives in lib/content-templates so the list page and
// every studio agree. Re-exported here for the channel-studio components.
import { TEMPLATE_STATUS_FLOW, normalizeTemplateStatus } from '@/lib/content-templates';

export {
  TEMPLATE_STATUS_FLOW,
  normalizeTemplateStatus,
  templateStatusMeta,
  type TemplateStatus,
} from '@/lib/content-templates';

export function statusIndex(status: string | undefined): number {
  const norm = normalizeTemplateStatus(status);
  const i = TEMPLATE_STATUS_FLOW.findIndex((s) => s.id === norm);
  return i < 0 ? 0 : i;
}

/* ------------------------------------------------------------------ *
 * Personalization — resolve {{ tokens }} against a sample profile so
 * the previews look like a real send. Mirrors the behaviour of the
 * email studio's applyPersonalization but data-driven.
 * ------------------------------------------------------------------ */

const FALLBACK_SAMPLE: Record<string, string> = {
  first_name: 'Alex',
  'customer.first_name': 'Alex',
  last_name: 'Morgan',
  'customer.last_name': 'Morgan',
  full_name: 'Alex Morgan',
  'customer.full_name': 'Alex Morgan',
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  'customer.email': 'alex.morgan@example.com',
  company: 'Northwind',
  'customer.company': 'Northwind',
  city: 'Austin',
  'customer.city': 'Austin',
  order_id: 'MB-48213',
  'order.id': 'MB-48213',
  order_total: '$128.40',
  discount_code: 'SAVE20',
  'coupon.code': 'SAVE20',
  loyalty_points: '1,240',
  'customer.loyalty_points': '1,240',
  loyalty_tier: 'Gold',
  'customer.tier': 'Gold',
  '1': '482913',
  '2': 'Alex',
};

export function applyPersonalization(
  input: string,
  sample?: Record<string, unknown>,
): string {
  if (!input) return '';
  return input.replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*[^}]+?)?\s*\}\}/g, (_m, rawKey: string) => {
    const key = rawKey.trim();
    const bare = key.replace(/^(customer|user|recipient|contact)\./, '');
    const fromSample =
      sample && (sample[key] ?? sample[bare] ?? (sample as any)[bare.replace(/_/g, '')]);
    if (fromSample != null && fromSample !== '') return String(fromSample);
    return FALLBACK_SAMPLE[key] ?? FALLBACK_SAMPLE[bare] ?? `{{${key}}}`;
  });
}

/** Detect the {{ variables }} referenced by a piece of copy, in order, deduped. */
export function extractVariables(...texts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(/\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g)) {
      const v = m[1].trim();
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

/** Common merge tags offered in every channel's variable menu. */
export const COMMON_VARIABLE_GROUPS: Array<{ group: string; tags: Array<{ label: string; token: string }> }> = [
  {
    group: 'Contact',
    tags: [
      { label: 'First name', token: '{{first_name}}' },
      { label: 'Last name', token: '{{last_name}}' },
      { label: 'Full name', token: '{{full_name}}' },
      { label: 'City', token: '{{city}}' },
      { label: 'Company', token: '{{company}}' },
    ],
  },
  {
    group: 'Commerce',
    tags: [
      { label: 'Order ID', token: '{{order_id}}' },
      { label: 'Order total', token: '{{order_total}}' },
      { label: 'Discount code', token: '{{discount_code}}' },
      { label: 'Loyalty points', token: '{{loyalty_points}}' },
      { label: 'Loyalty tier', token: '{{loyalty_tier}}' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * SMS segmentation (GSM-7 vs UCS-2), matching carrier behaviour.
 * ------------------------------------------------------------------ */

// Characters that are a single unit in GSM-7 plus the ones that cost two.
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';

function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (GSM7_BASIC.indexOf(ch) === -1 && GSM7_EXTENDED.indexOf(ch) === -1) return false;
  }
  return true;
}

export type SmsSegmentInfo = {
  chars: number;
  encoding: 'GSM-7' | 'UCS-2';
  segments: number;
  perSegment: number;
  remaining: number;
};

export function smsSegmentInfo(message: string): SmsSegmentInfo {
  const gsm = isGsm7(message);
  // GSM-7 extended chars cost 2 units.
  let units = 0;
  if (gsm) {
    for (const ch of message) units += GSM7_EXTENDED.indexOf(ch) === -1 ? 1 : 2;
  } else {
    units = [...message].length;
  }
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  const perSegment = segments <= 1 ? single : multi;
  const capacity = segments <= 1 ? single : segments * multi;
  return {
    chars: units,
    encoding: gsm ? 'GSM-7' : 'UCS-2',
    segments,
    perSegment,
    remaining: Math.max(0, capacity - units),
  };
}

/** Insert a token into `value` at [start,end], returning next value + caret. */
export function spliceToken(
  value: string,
  start: number,
  end: number,
  token: string,
): { value: string; caret: number } {
  const needsSpaceBefore = start > 0 && !/\s$/.test(value.slice(0, start));
  const snippet = (needsSpaceBefore ? ' ' : '') + token;
  const next = value.slice(0, start) + snippet + value.slice(end);
  return { value: next, caret: start + snippet.length };
}

/** WhatsApp / RCS lightweight markdown → safe HTML for previews. */
export function waMarkdownToHtml(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*(?!\s)([^*\n]+?)(?<!\s)\*/g, '<strong>$1</strong>')
    .replace(/_(?!\s)([^_\n]+?)(?<!\s)_/g, '<em>$1</em>')
    .replace(/~(?!\s)([^~\n]+?)(?<!\s)~/g, '<s>$1</s>')
    .replace(/```([^`]+?)```/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

export function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
