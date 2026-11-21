import type { TemplateProviderApproval } from './template-provider-approval';
import type { ResolvedWebPushPayload, WebPushAction } from './web-push-config';
import { supabase } from './supabase';
import { toSchemaSlug } from './schema-slug';
import { logAudit } from './audit';
import type { EmailBlock, EmailGlobalTheme } from './email-builder-types';
import { DEFAULT_EMAIL_THEME } from './email-builder-types';
import {
  CONTENT_TEMPLATE_LIBRARY,
  CONTENT_TEMPLATE_LIBRARY_CATEGORIES,
  LIBRARY_NAME,
  LIBRARY_TEMPLATE_COUNT,
  LIBRARY_VERSION,
} from './content-template-library.generated';

export {
  CONTENT_TEMPLATE_LIBRARY,
  CONTENT_TEMPLATE_LIBRARY_CATEGORIES as CONTENT_TEMPLATE_CATEGORIES,
  LIBRARY_NAME,
  LIBRARY_TEMPLATE_COUNT,
  LIBRARY_VERSION,
};

export type ContentChannel = 'email' | 'sms' | 'web_push' | 'whatsapp' | 'rcs';

export type EmailContent = {
  subject: string;
  preheader?: string;
  html_body: string;
  text_body?: string;
  /** Plain-text version written by the studio (TD-11: type had fallen behind). */
  plain_text?: string;
  amp_html?: string;
  amp_enabled?: boolean;
  enabled_versions?: Array<'html' | 'amp' | 'text'>;
  editor_mode?: 'visual' | 'html' | 'amp' | 'plain';
  builder_state?: {
    theme?: EmailGlobalTheme;
    blocks?: EmailBlock[];
    /** Review state written by the email studio. */
    approval_status?: string;
  };
  blocks?: EmailBlock[];
  theme?: EmailGlobalTheme;
};

export type SmsContent = {
  message: string;
};

export type WebPushContent = {
  title: string;
  body: string;
  icon_url?: string;
  image_url?: string;
  badge_url?: string;
  action_url?: string;
  actions?: Array<{ action?: string; title?: string; url?: string }>;
  require_interaction?: boolean;
  ttl_hours?: number;
};

export type WhatsAppContent = {
  body: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  variable_map?: string[];
  template_format?: 'standard' | 'carousel' | 'authentication';
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language?: string;
  header?: {
    format: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    media_url?: string;
  };
  footer?: string;
  carousel_cards?: Array<{
    id: string;
    header_format?: 'IMAGE' | 'VIDEO';
    header_media_url?: string;
    body: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
};

export type RcsSuggestion = { type: string; text: string; url?: string };

export type RcsCarouselCard = {
  id: string;
  title: string;
  description: string;
  media?: { url?: string; height?: string };
  suggestions?: RcsSuggestion[];
};

export type RcsContent = {
  format?: 'rich_card' | 'carousel' | 'text' | string;
  title: string;
  description: string;
  orientation?: string;
  media?: { url?: string; height?: string };
  suggestions?: RcsSuggestion[];
  fallback?: { channel?: string; text?: string };
  carousel_cards?: RcsCarouselCard[];
};

export type TemplateContent = EmailContent | SmsContent | WebPushContent | WhatsAppContent | RcsContent;

export type ContentTemplateSettings = {
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  sender_id?: string;
  description?: string;
  cta_label?: string;
  cta_url?: string;
  personalization?: string[];
  responsive?: boolean;
  controls?: Record<string, unknown>;
  tag?: string;
  actions?: Array<{ action?: string; title?: string; url?: string }>;
  badge?: string;
  provider_category?: string;
  design_system?: string;
  /** External provider registration — DLT (SMS), Meta (WhatsApp), RCS SP */
  provider_approval?: TemplateProviderApproval;
  header_handle?: string;
  header_example_url?: string;
  buttons?: WhatsAppContent['buttons'];
  carousel_cards?: WhatsAppContent['carousel_cards'];
  category?: WhatsAppContent['category'];
  language?: string;
  /** Selected BYOP sending account (channel_providers.id) — also used for test proofs. */
  provider_account_id?: string;
};

/* ------------------------------------------------------------------ *
 * Unified template lifecycle status — shared by every studio + list.
 * DB column is free-text; older rows may carry 'test_sent'.
 * ------------------------------------------------------------------ */
export type TemplateStatus = 'draft' | 'in_review' | 'approved' | 'published';

export const TEMPLATE_STATUS_FLOW: Array<{ id: TemplateStatus; label: string; hint: string }> = [
  { id: 'draft', label: 'Draft', hint: 'Editing in progress' },
  { id: 'in_review', label: 'In review', hint: 'Proof sent — awaiting sign-off' },
  { id: 'approved', label: 'Approved', hint: 'Signed off, ready to publish' },
  { id: 'published', label: 'Published', hint: 'Live for sends' },
];

export function normalizeTemplateStatus(raw: string | undefined | null): TemplateStatus {
  if (raw === 'test_sent') return 'in_review';
  if (raw === 'in_review' || raw === 'approved' || raw === 'published') return raw;
  return 'draft';
}

export function templateStatusMeta(raw: string | undefined | null): {
  id: TemplateStatus;
  label: string;
  dot: string;
  chip: string;
} {
  const id = normalizeTemplateStatus(raw);
  const map: Record<TemplateStatus, { label: string; dot: string; chip: string }> = {
    draft: { label: 'Draft', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
    in_review: { label: 'In review', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200/70' },
    approved: { label: 'Approved', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200/70' },
    published: { label: 'Published', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200/70' },
  };
  return { id, ...map[id] };
}

export type MarbeeContentTemplate = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  slug: string;
  channel: ContentChannel;
  content: TemplateContent;
  settings: ContentTemplateSettings;
  status: 'draft' | 'published';
  library_template_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentTemplateLibraryItem = {
  id: string;
  name: string;
  channel: ContentChannel;
  category: string;
  description: string;
  icon: string;
  content: TemplateContent;
  settings: ContentTemplateSettings;
  popular?: boolean;
};

export function getLibraryTemplate(id: string): ContentTemplateLibraryItem | undefined {
  return CONTENT_TEMPLATE_LIBRARY.find((t) => t.id === id);
}

export function emptyContentForChannel(channel: ContentChannel): TemplateContent {
  switch (channel) {
    case 'email': {
      return {
        subject: '',
        preheader: '',
        html_body: '',
        text_body: '',
        builder_state: {
          blocks: [],
          theme: DEFAULT_EMAIL_THEME,
        },
        blocks: [],
        theme: DEFAULT_EMAIL_THEME,
        editor_mode: 'visual',
      };
    }
    case 'sms':
      return { message: '' };
    case 'web_push':
      return { title: '', body: '', action_url: '', icon_url: '' };
    case 'whatsapp':
      return {
        body: '',
        buttons: [],
        variable_map: [],
        template_format: 'standard',
        category: 'MARKETING',
        language: 'en',
        header: { format: 'NONE' },
        footer: '',
        carousel_cards: [],
      };
    case 'rcs':
      return { format: 'rich_card', title: '', description: '', suggestions: [], carousel_cards: [] };
  }
}

export function channelLabel(channel: ContentChannel): string {
  switch (channel) {
    case 'email':
      return 'Email';
    case 'sms':
      return 'SMS';
    case 'web_push':
      return 'Web push';
    case 'whatsapp':
      return 'WhatsApp';
    case 'rcs':
      return 'RCS';
  }
}

export function applyTemplateToDeliveryConfig(
  template: MarbeeContentTemplate,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...existing,
    content_template_id: template.id,
    content_template_name: template.name,
  };

  switch (template.channel) {
    case 'email': {
      const content = template.content as EmailContent;
      if (!next.subject) next.subject = content.subject;
      break;
    }
    case 'sms': {
      const dlt = template.settings?.provider_approval?.sms_dlt;
      if (dlt?.dlt_template_id) next.dlt_template_id = dlt.dlt_template_id;
      if (dlt?.sender_id) next.sender_id = dlt.sender_id;
      break;
    }
    case 'web_push': {
      const content = template.content as WebPushContent;
      if (!next.title) next.title = content.title;
      if (!next.body) next.body = content.body;
      break;
    }
    case 'whatsapp': {
      const meta = template.settings?.provider_approval?.whatsapp_meta;
      if (meta?.meta_template_id) next.meta_template_id = meta.meta_template_id;
      if (meta?.template_name) next.whatsapp_template_name = meta.template_name;
      if (meta?.language) next.whatsapp_language = meta.language;
      break;
    }
    case 'rcs': {
      const rcs = template.settings?.provider_approval?.rcs_provider;
      if (rcs?.template_id) next.rcs_template_id = rcs.template_id;
      if (rcs?.agent_id) next.rcs_agent_id = rcs.agent_id;
      break;
    }
  }

  return next;
}

/** Read editable delivery body from workflow node config (copied from template or edited inline). */
export function getDeliveryContentFromConfig(
  channel: ContentChannel,
  config: Record<string, unknown>,
): TemplateContent {
  if (config.delivery_content && typeof config.delivery_content === 'object') {
    return config.delivery_content as TemplateContent;
  }
  return deliveryContentFromFlatFields(channel, config);
}

function deliveryContentFromFlatFields(channel: ContentChannel, config: Record<string, unknown>): TemplateContent {
  switch (channel) {
    case 'email':
      return {
        subject: String(config.subject ?? ''),
        preheader: String(config.preheader ?? ''),
        html_body: String(config.html_body ?? '<p></p>'),
        text_body: String(config.text_body ?? ''),
      };
    case 'sms':
      return { message: String(config.message ?? config.body ?? '') };
    case 'web_push':
      return {
        title: String(config.title ?? ''),
        body: String(config.body ?? ''),
        icon_url: String(config.icon_url ?? ''),
        image_url: String(config.image_url ?? ''),
        action_url: String(config.action_url ?? ''),
      };
    case 'whatsapp':
      return emptyContentForChannel('whatsapp') as WhatsAppContent;
    case 'rcs':
      return emptyContentForChannel('rcs') as RcsContent;
  }
}

/** Sync legacy flat config fields from structured delivery content. */
export function syncDeliveryFlatFields(
  channel: ContentChannel,
  content: TemplateContent,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...config, delivery_content: content };
  switch (channel) {
    case 'email': {
      const c = content as EmailContent;
      next.subject = c.subject;
      next.preheader = c.preheader ?? '';
      break;
    }
    case 'sms': {
      const c = content as SmsContent;
      next.message = c.message;
      break;
    }
    case 'web_push': {
      const c = content as WebPushContent;
      next.title = c.title;
      next.body = c.body;
      next.icon_url = c.icon_url ?? '';
      next.image_url = c.image_url ?? '';
      next.action_url = c.action_url ?? '';
      break;
    }
    default:
      break;
  }
  return next;
}

/** Load a published template as reference — copies full content into workflow delivery. */
export function populateDeliveryFromTemplate(
  template: MarbeeContentTemplate,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const content = structuredClone(template.content);
  const withMeta = applyTemplateToDeliveryConfig(template, existing);
  return syncDeliveryFlatFields(template.channel, content, {
    ...withMeta,
    content_template_id: template.id,
    content_template_name: template.name,
  });
}

export async function resolveWebPushDeliveryContent(
  config: Record<string, unknown>,
  defaults?: Partial<ResolvedWebPushPayload>,
): Promise<ResolvedWebPushPayload> {
  let title = String(config.title ?? '').trim();
  let body = String(config.body ?? '').trim();
  let clickAction = defaults?.clickAction;
  let iconUrl = String(config.icon_url ?? defaults?.iconUrl ?? '').trim() || undefined;
  let imageUrl = String(config.image_url ?? defaults?.imageUrl ?? '').trim() || undefined;
  let badgeUrl = String(config.badge_url ?? defaults?.badgeUrl ?? '').trim() || undefined;
  let tag = defaults?.tag;
  let ttlSeconds = defaults?.ttlSeconds;
  let actions = defaults?.actions;
  let trackOpens = defaults?.trackOpens;

  const templateId = String(config.content_template_id ?? '').trim();
  const inline = config.delivery_content as WebPushContent | undefined;
  if (inline?.title || inline?.body) {
    if (!title) title = inline.title?.trim() ?? '';
    if (!body) body = inline.body?.trim() ?? '';
    if (!clickAction) clickAction = inline.action_url;
    if (!iconUrl) iconUrl = inline.icon_url?.trim() || undefined;
    if (!imageUrl) imageUrl = inline.image_url?.trim() || undefined;
    if (!badgeUrl) badgeUrl = inline.badge_url?.trim() || undefined;
  }
  if (templateId) {
    const template = await fetchContentTemplateById(templateId);
    if (template?.channel === 'web_push') {
      const content = template.content as WebPushContent;
      const settings = template.settings ?? {};
      if (!title) title = content.title?.trim() ?? '';
      if (!body) body = content.body?.trim() ?? '';
      if (!clickAction) clickAction = content.action_url;
      if (!iconUrl) iconUrl = content.icon_url?.trim() || undefined;
      if (!imageUrl) imageUrl = content.image_url?.trim() || undefined;
      if (!badgeUrl) badgeUrl = content.badge_url?.trim() || settings.badge?.trim() || undefined;
      if (!tag) tag = settings.tag?.trim() || undefined;
      if (!actions?.length && settings.actions?.length) {
        actions = settings.actions
          .filter((a) => a.title)
          .map((a, i) => ({
            action: a.action ?? `action_${i}`,
            title: a.title ?? 'Open',
            url: a.url,
          })) as WebPushAction[];
      }
    }
  }

  if (!title) title = String(config.delivery_name ?? 'Notification');
  if (!body) body = 'You have a new message.';

  return {
    title,
    body,
    clickAction,
    iconUrl,
    imageUrl,
    badgeUrl,
    tag,
    ttlSeconds,
    actions,
    trackOpens,
  };
}

export function channelBadgeVariant(channel: ContentChannel): 'default' | 'success' | 'warning' {
  switch (channel) {
    case 'email':
      return 'default';
    case 'sms':
      return 'success';
    case 'web_push':
      return 'warning';
    case 'whatsapp':
      return 'success';
    case 'rcs':
      return 'default';
  }
}

export async function fetchContentTemplates(
  tenantId: string,
  environment: string,
): Promise<MarbeeContentTemplate[]> {
  const { data, error } = await supabase
    .from('content_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as MarbeeContentTemplate[];
}

export async function fetchContentTemplateById(id: string): Promise<MarbeeContentTemplate | null> {
  const { data, error } = await supabase.from('content_templates').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as MarbeeContentTemplate | null;
}

/** Find a free slug for (tenant, environment) by appending -2, -3, … when taken. */
async function resolveUniqueTemplateSlug(
  tenantId: string,
  environment: string,
  baseSlug: string,
): Promise<string> {
  const { data: taken } = await supabase
    .from('content_templates')
    .select('slug')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .like('slug', `${baseSlug}%`);

  const used = new Set((taken ?? []).map((r) => (r as { slug: string }).slug));
  if (!used.has(baseSlug)) return baseSlug;
  let n = 2;
  while (used.has(`${baseSlug}-${n}`)) n += 1;
  return `${baseSlug}-${n}`;
}

export async function createContentTemplate(
  tenantId: string,
  environment: string,
  name: string,
  channel: ContentChannel,
  options?: {
    content?: TemplateContent;
    settings?: ContentTemplateSettings;
    library_template_id?: string;
  },
): Promise<{ template?: MarbeeContentTemplate; error?: string }> {
  const baseSlug = toSchemaSlug(name);
  if (!baseSlug) return { error: 'Enter a valid template name' };

  // Slugs are unique per (tenant, environment). Reusing a template name is fine —
  // we auto-suffix the slug so creation always succeeds with its own backend id.
  const slug = await resolveUniqueTemplateSlug(tenantId, environment, baseSlug);

  const { data, error } = await supabase
    .from('content_templates')
    .insert({
      tenant_id: tenantId,
      environment,
      name: name.trim(),
      slug,
      channel,
      content: options?.content ?? emptyContentForChannel(channel),
      settings: options?.settings ?? {},
      status: 'draft',
      library_template_id: options?.library_template_id ?? null,
    })
    .select('*')
    .single();

  if (error) return { error: error.message };

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'content_template',
    resourceId: data.id,
    resourceName: data.name,
    summary: `Created ${channel} template "${data.name}"`,
    metadata: { channel, library_template_id: options?.library_template_id },
  });

  return { template: data as MarbeeContentTemplate };
}

export async function updateContentTemplate(
  id: string,
  patch: {
    name?: string;
    content?: TemplateContent;
    settings?: ContentTemplateSettings;
    status?: string;
  },
): Promise<{ error?: string }> {
  const payload: Record<string, unknown> = {};
  if (patch.name != null) payload.name = patch.name.trim();
  if (patch.content != null) payload.content = patch.content;
  if (patch.settings != null) payload.settings = patch.settings;
  if (patch.status != null) payload.status = patch.status;

  const { error } = await supabase.from('content_templates').update(payload).eq('id', id);
  return error ? { error: error.message } : {};
}

export async function publishContentTemplate(
  id: string,
  publish: boolean,
  tenantId: string,
  environment: string,
  name: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('content_templates')
    .update({ status: publish ? 'published' : 'draft' })
    .eq('id', id);

  if (error) return { error: error.message };

  void logAudit({
    tenantId,
    environment,
    action: publish ? 'publish' : 'unpublish',
    resourceType: 'content_template',
    resourceId: id,
    resourceName: name,
    summary: publish ? `Published template "${name}"` : `Unpublished template "${name}"`,
  });

  return {};
}

export async function deleteContentTemplate(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('content_templates').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

export function createFromLibraryItem(item: ContentTemplateLibraryItem, name?: string) {
  return {
    name: name?.trim() || item.name,
    channel: item.channel,
    content: structuredClone(item.content),
    settings: { ...item.settings },
    library_template_id: item.id,
  };
}

export function extractTemplateVariables(content: TemplateContent): string[] {
  if (!content) return [];
  const str = JSON.stringify(content);
  const matches = str.match(/\{\{([a-zA-Z0-9_.-]+)\}\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, '').trim())));
}

export async function duplicateContentTemplate(
  id: string,
  tenantId: string,
  environment: string,
): Promise<{ template?: MarbeeContentTemplate; error?: string }> {
  const original = await fetchContentTemplateById(id);
  if (!original) return { error: 'Template not found' };

  let copyName = `${original.name} (Copy)`;
  let counter = 1;
  while (true) {
    const slug = toSchemaSlug(copyName);
    const { data: existing } = await supabase
      .from('content_templates')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    counter++;
    copyName = `${original.name} (Copy ${counter})`;
  }

  return createContentTemplate(tenantId, environment, copyName, original.channel, {
    content: structuredClone(original.content),
    settings: structuredClone(original.settings),
    library_template_id: original.library_template_id,
  });
}
