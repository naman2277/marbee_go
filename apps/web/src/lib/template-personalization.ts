import type {
  ContentChannel,
  EmailContent,
  RcsContent,
  SmsContent,
  TemplateContent,
  WebPushContent,
  WhatsAppContent,
} from './content-templates';
import type { NodePopulationResult } from './workflow-engine';
import { getPopulationForSource } from './workflow-thread';
import { insertVariable } from './whatsapp-template-types';

export type PopulationFieldDef = {
  key: string;
  label: string;
  sample?: string;
  group?: 'profile' | 'query' | 'system';
};

export type PersonalizationContext = Record<string, unknown>;

/** Standard Customer Profile attributes available in all templates. */
export const DEFAULT_POPULATION_FIELDS: PopulationFieldDef[] = [
  { key: 'first_name', label: 'First Name', sample: 'Sarah', group: 'profile' },
  { key: 'last_name', label: 'Last Name', sample: 'Connor', group: 'profile' },
  { key: 'name', label: 'Full Name', sample: 'Sarah Connor', group: 'profile' },
  { key: 'email', label: 'Email Address', sample: 'sarah.c@cyberdyne.io', group: 'profile' },
  { key: 'phone', label: 'Phone Number', sample: '+1 555-0199', group: 'profile' },
  { key: 'company', label: 'Company', sample: 'Cyberdyne Systems', group: 'profile' },
  { key: 'job_title', label: 'Job Title', sample: 'Chief Security Officer', group: 'profile' },
  { key: 'loyalty_tier', label: 'Loyalty Tier', sample: 'Platinum VIP', group: 'profile' },
  { key: 'loyalty_points', label: 'Loyalty Points', sample: '3450', group: 'profile' },
  { key: 'city', label: 'City', sample: 'Los Angeles', group: 'profile' },
  { key: 'state', label: 'State / Province', sample: 'California', group: 'profile' },
  { key: 'country', label: 'Country', sample: 'United States', group: 'profile' },
  { key: 'postal_code', label: 'Postal / ZIP Code', sample: '90001', group: 'profile' },
  { key: 'order_id', label: 'Customer Order ID', sample: 'ORD-8921', group: 'profile' },
  { key: 'order_total', label: 'Order Total', sample: '$249.00', group: 'profile' },
  { key: 'discount_code', label: 'Assigned Promo Code', sample: 'VIP25OFF', group: 'profile' },
  { key: 'unsubscribe_url', label: 'Unsubscribe URL', sample: 'https://marbee.io/unsubscribe', group: 'system' },
];

export const SAMPLE_POPULATION_CONTEXT: PersonalizationContext = Object.fromEntries(
  DEFAULT_POPULATION_FIELDS.map((f) => [f.key, f.sample ?? f.key]),
);

const MERGE_TAG_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const SINGLE_BRACE_RE = /\{([a-zA-Z0-9_.-]+)\}/g;

export function mergeTag(field: string): string {
  return `{{${field}}}`;
}

export function extractMergeTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(MERGE_TAG_RE)) {
    if (match[1]) tags.add(match[1]);
  }
  for (const match of text.matchAll(SINGLE_BRACE_RE)) {
    if (match[1]) tags.add(match[1]);
  }
  return [...tags];
}

export function extractMergeTagsFromContent(channel: ContentChannel, content: TemplateContent): string[] {
  const texts = collectTemplateStrings(channel, content);
  const tags = new Set<string>();
  for (const text of texts) {
    for (const tag of extractMergeTags(text)) tags.add(tag);
  }
  return [...tags];
}

function collectTemplateStrings(channel: ContentChannel, content: TemplateContent): string[] {
  switch (channel) {
    case 'email': {
      const c = content as EmailContent;
      return [c.subject, c.preheader ?? '', c.html_body, c.text_body ?? ''];
    }
    case 'sms':
      return [(content as SmsContent).message];
    case 'web_push': {
      const c = content as WebPushContent;
      return [c.title, c.body, c.action_url ?? '', c.icon_url ?? '', c.image_url ?? ''];
    }
    case 'whatsapp': {
      const c = content as WhatsAppContent;
      const parts = [c.body, c.header?.text ?? '', c.footer ?? ''];
      for (const btn of c.buttons ?? []) {
        parts.push(btn.text, btn.url ?? '');
      }
      for (const card of c.carousel_cards ?? []) {
        parts.push(card.body);
        for (const btn of card.buttons ?? []) parts.push(btn.text, btn.url ?? '');
      }
      return parts;
    }
    case 'rcs': {
      const c = content as RcsContent;
      const parts = [c.title, c.description, c.media?.url ?? '', c.fallback?.text ?? ''];
      for (const s of c.suggestions ?? []) parts.push(s.text, s.url ?? '');
      for (const card of c.carousel_cards ?? []) {
        parts.push(card.title, card.description, card.media?.url ?? '');
        for (const s of card.suggestions ?? []) parts.push(s.text, s.url ?? '');
      }
      return parts;
    }
    default:
      return [];
  }
}

export function interpolateTemplate(
  template: string,
  ctx: PersonalizationContext,
  fallback = '',
): string {
  if (!template) return template;
  const normalized = template.replace(SINGLE_BRACE_RE, (_, key: string) => `{{${key}}}`);
  return normalized.replace(MERGE_TAG_RE, (_, key: string) => {
    const value = ctx[key];
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

export function buildPersonalizationContext(
  recipient: Record<string, unknown>,
  extras?: Record<string, unknown>,
): PersonalizationContext {
  return { ...SAMPLE_POPULATION_CONTEXT, ...recipient, ...extras };
}

export function populationFieldsFromQueryMeta(
  additionalFields: string[] = [],
  segmentCode?: string,
): PopulationFieldDef[] {
  const queryFields: PopulationFieldDef[] = additionalFields.map((key) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    sample: `Sample ${key}`,
    group: 'query' as const,
  }));
  if (segmentCode) {
    queryFields.unshift({
      key: 'segment_code',
      label: 'Segment code',
      sample: segmentCode,
      group: 'query',
    });
  }
  return mergePopulationFields(DEFAULT_POPULATION_FIELDS, queryFields);
}

export function mergePopulationFields(
  base: PopulationFieldDef[],
  extra: PopulationFieldDef[],
): PopulationFieldDef[] {
  const seen = new Set<string>();
  const out: PopulationFieldDef[] = [];
  for (const field of [...extra, ...base]) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    out.push(field);
  }
  return out;
}

export function contextFromPopulationSample(
  sample: Record<string, unknown> | undefined,
  fields: PopulationFieldDef[],
): PersonalizationContext {
  const ctx: PersonalizationContext = { ...SAMPLE_POPULATION_CONTEXT };
  if (sample) {
    for (const [key, value] of Object.entries(sample)) {
      if (key === '_pk' || key.startsWith('_')) continue;
      ctx[key] = value;
    }
    if (sample._pk) ctx.id = sample._pk;
  }
  for (const field of fields) {
    if (ctx[field.key] == null && field.sample) ctx[field.key] = field.sample;
  }
  return ctx;
}

export function personalizeContent(
  channel: ContentChannel,
  content: TemplateContent,
  ctx: PersonalizationContext,
): TemplateContent {
  switch (channel) {
    case 'email': {
      const c = content as EmailContent;
      return {
        ...c,
        subject: interpolateTemplate(c.subject, ctx),
        preheader: c.preheader ? interpolateTemplate(c.preheader, ctx) : c.preheader,
        html_body: interpolateTemplate(c.html_body, ctx),
        text_body: c.text_body ? interpolateTemplate(c.text_body, ctx) : c.text_body,
      };
    }
    case 'sms':
      return { message: interpolateTemplate((content as SmsContent).message, ctx) };
    case 'web_push': {
      const c = content as WebPushContent;
      return {
        ...c,
        title: interpolateTemplate(c.title, ctx),
        body: interpolateTemplate(c.body, ctx),
        action_url: c.action_url ? interpolateTemplate(c.action_url, ctx) : c.action_url,
        icon_url: c.icon_url ? interpolateTemplate(c.icon_url, ctx) : c.icon_url,
        image_url: c.image_url ? interpolateTemplate(c.image_url, ctx) : c.image_url,
      };
    }
    case 'whatsapp': {
      const c = content as WhatsAppContent;
      return {
        ...c,
        body: interpolateTemplate(c.body, ctx),
        header: c.header?.text
          ? { ...c.header, text: interpolateTemplate(c.header.text, ctx) }
          : c.header,
        footer: c.footer ? interpolateTemplate(c.footer, ctx) : c.footer,
        buttons: c.buttons?.map((btn) => ({
          ...btn,
          text: interpolateTemplate(btn.text, ctx),
          url: btn.url ? interpolateTemplate(btn.url, ctx) : btn.url,
        })),
        carousel_cards: c.carousel_cards?.map((card) => ({
          ...card,
          body: interpolateTemplate(card.body, ctx),
          buttons: card.buttons?.map((btn) => ({
            ...btn,
            text: interpolateTemplate(btn.text, ctx),
            url: btn.url ? interpolateTemplate(btn.url, ctx) : btn.url,
          })),
        })),
      };
    }
    case 'rcs': {
      const c = content as RcsContent;
      return {
        ...c,
        title: interpolateTemplate(c.title, ctx),
        description: interpolateTemplate(c.description, ctx),
        media: c.media?.url
          ? { ...c.media, url: interpolateTemplate(c.media.url, ctx) }
          : c.media,
        fallback: c.fallback?.text
          ? { ...c.fallback, text: interpolateTemplate(c.fallback.text, ctx) }
          : c.fallback,
        suggestions: c.suggestions?.map((s) => ({
          ...s,
          text: interpolateTemplate(s.text, ctx),
          url: s.url ? interpolateTemplate(s.url, ctx) : s.url,
        })),
        carousel_cards: c.carousel_cards?.map((card) => ({
          ...card,
          title: interpolateTemplate(card.title, ctx),
          description: interpolateTemplate(card.description, ctx),
          media: card.media?.url
            ? { ...card.media, url: interpolateTemplate(card.media.url, ctx) }
            : card.media,
          suggestions: card.suggestions?.map((s) => ({
            ...s,
            text: interpolateTemplate(s.text, ctx),
            url: s.url ? interpolateTemplate(s.url, ctx) : s.url,
          })),
        })),
      };
    }
    default:
      return content;
  }
}

export function insertPopulationTag(
  channel: ContentChannel,
  content: TemplateContent,
  field: string,
): TemplateContent {
  const tag = mergeTag(field);
  switch (channel) {
    case 'email': {
      const c = content as EmailContent;
      return { ...c, html_body: insertVariable(c.html_body, tag) };
    }
    case 'sms':
      return { message: insertVariable((content as SmsContent).message, tag) };
    case 'web_push': {
      const c = content as WebPushContent;
      return { ...c, body: insertVariable(c.body, tag) };
    }
    case 'whatsapp': {
      const c = content as WhatsAppContent;
      return { ...c, body: insertVariable(c.body, tag) };
    }
    case 'rcs': {
      const c = content as RcsContent;
      return { ...c, description: insertVariable(c.description, tag) };
    }
    default:
      return content;
  }
}

export function populationFieldsFromSampleRow(
  sample: Record<string, unknown> | undefined,
  queryAdditionalFields: string[] = [],
): PopulationFieldDef[] {
  const fromSample: PopulationFieldDef[] = [];
  if (sample) {
    for (const key of Object.keys(sample)) {
      if (key.startsWith('_')) continue;
      fromSample.push({
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        sample: formatSampleValue(sample[key]),
        group: 'query',
      });
    }
  }
  const fromQuery = queryAdditionalFields
    .filter((key) => !fromSample.some((f) => f.key === key))
    .map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      sample: `Sample ${key}`,
      group: 'query' as const,
    }));
  return mergePopulationFields(DEFAULT_POPULATION_FIELDS, [...fromSample, ...fromQuery]);
}

function formatSampleValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function personalizationFromNodeResult(result?: NodePopulationResult | null): {
  fields: PopulationFieldDef[];
  sample: Record<string, unknown> | null;
} {
  if (!result) {
    return { fields: DEFAULT_POPULATION_FIELDS, sample: null };
  }
  const sample = result.sample[0] ?? null;
  const fields = populationFieldsFromSampleRow(sample ?? undefined, result.query?.additionalFields ?? []);
  return { fields, sample };
}

export function upstreamPersonalizationForNode(
  nodeId: string,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null }>,
  nodeResults: Record<string, NodePopulationResult>,
): { fields: PopulationFieldDef[]; sample: Record<string, unknown> | null } {
  const inbound = edges.filter((e) => e.target === nodeId);
  if (!inbound.length) {
    return { fields: DEFAULT_POPULATION_FIELDS, sample: null };
  }
  const edge = inbound[0]!;
  const pop = getPopulationForSource(edge.source, edge.sourceHandle ?? null, nodeResults);
  return personalizationFromNodeResult(pop);
}
