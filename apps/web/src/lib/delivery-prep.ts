import { supabase } from './supabase';
import {
  fetchContentTemplateById,
  getDeliveryContentFromConfig,
  resolveWebPushDeliveryContent,
  type ContentChannel,
  type EmailContent,
  type TemplateContent,
} from './content-templates';

export const DELIVERY_STEP_TYPES = [
  'send_email',
  'send_sms',
  'send_web_push',
  'send_whatsapp',
  'send_rcs',
  'send_in_app',
  'send_direct_mail',
] as const;

export type DeliveryStepType = (typeof DELIVERY_STEP_TYPES)[number];

export function isDeliveryStep(stepType: string): stepType is DeliveryStepType {
  return (DELIVERY_STEP_TYPES as readonly string[]).includes(stepType);
}

export function channelForDeliveryStep(stepType: string): string {
  switch (stepType) {
    case 'send_email':
      return 'email';
    case 'send_sms':
      return 'sms';
    case 'send_web_push':
      return 'web_push';
    case 'send_whatsapp':
      return 'whatsapp';
    case 'send_rcs':
      return 'rcs';
    case 'send_in_app':
      return 'in_app';
    case 'send_direct_mail':
      return 'direct_mail';
    default:
      return 'email';
  }
}

export type DeliveryPreview = {
  subject?: string;
  title?: string;
  body?: string;
  templateName?: string;
};

export type DeliveryExclusionRow = {
  customer_id: string;
  reason: string;
  channel: string | null;
  end_date: string | null;
};

export type DeliveryEngagementRow = {
  customer_id: string;
  event: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type DeliveryPrepData = {
  nodeId: string;
  stepType: string;
  deliveryId: string;
  deliveryName: string;
  channel: string;
  preview: DeliveryPreview;
  deliveryContent: TemplateContent;
  totalTarget: number;
  excludedCount: number;
  toSendCount: number;
  targetIds: string[];
  excludedIds: string[];
  toSendIds: string[];
  sampleRecipients: Record<string, unknown>[];
  exclusions: DeliveryExclusionRow[];
  engagement: DeliveryEngagementRow[];
};

async function fetchCustomersByIds(ids: string[]): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('customers').select('*').in('id', ids.slice(0, 100));
  if (error) throw error;
  return data ?? [];
}

async function fetchExcludedCustomers(
  tenantId: string,
  environment: string,
  customerIds: string[],
  channel: string,
): Promise<DeliveryExclusionRow[]> {
  if (!customerIds.length) return [];
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('exclusions')
    .select('customer_id, reason, channel, end_date')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .in('customer_id', customerIds.slice(0, 2000))
    .or(`channel.eq.${channel},channel.is.null`)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`);

  if (error) throw error;
  return (data ?? []) as DeliveryExclusionRow[];
}

async function fetchEngagementForCustomers(
  tenantId: string,
  environment: string,
  customerIds: string[],
  channel: string,
): Promise<DeliveryEngagementRow[]> {
  if (!customerIds.length) return [];
  const { data, error } = await supabase
    .from('engagement_log')
    .select('customer_id, event, timestamp, metadata')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('channel', channel)
    .in('customer_id', customerIds.slice(0, 500))
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as DeliveryEngagementRow[];
}

export async function resolveDeliveryPreview(
  stepType: string,
  config: Record<string, unknown>,
): Promise<{ preview: DeliveryPreview; deliveryContent: TemplateContent }> {
  const templateName = String(config.content_template_name ?? '').trim() || undefined;
  const channelKey = channelForDeliveryStep(stepType);
  const previewChannels: ContentChannel[] = ['email', 'sms', 'web_push', 'whatsapp', 'rcs'];

  if (previewChannels.includes(channelKey as ContentChannel)) {
    const channel = channelKey as ContentChannel;
    const deliveryContent = getDeliveryContentFromConfig(channel, config);
    switch (channel) {
      case 'email': {
        const c = deliveryContent as EmailContent;
        return {
          preview: { subject: c.subject || String(config.delivery_name ?? 'Email'), templateName },
          deliveryContent,
        };
      }
      case 'sms': {
        const c = deliveryContent as import('./content-templates').SmsContent;
        return { preview: { body: c.message, templateName }, deliveryContent };
      }
      case 'web_push': {
        const resolved = await resolveWebPushDeliveryContent(config);
        return {
          preview: { title: resolved.title, body: resolved.body, templateName },
          deliveryContent,
        };
      }
      case 'whatsapp': {
        const c = deliveryContent as import('./content-templates').WhatsAppContent;
        return { preview: { body: c.body, templateName }, deliveryContent };
      }
      case 'rcs': {
        const c = deliveryContent as import('./content-templates').RcsContent;
        const isCarousel = c.format === 'carousel' || (c.carousel_cards?.length ?? 0) > 0;
        return {
          preview: {
            title: c.title,
            body: c.description,
            templateName,
            ...(isCarousel ? { cards: c.carousel_cards?.length ?? 0 } : {}),
          },
          deliveryContent,
        };
      }
    }
  }

  if (stepType === 'send_web_push') {
    const { title, body } = await resolveWebPushDeliveryContent(config);
    return {
      preview: { title, body, templateName },
      deliveryContent: getDeliveryContentFromConfig('web_push', config),
    };
  }

  if (stepType === 'send_email') {
    let subject = String(config.subject ?? '').trim();
    const templateId = String(config.content_template_id ?? '').trim();
    if (templateId && !subject) {
      const template = await fetchContentTemplateById(templateId);
      if (template?.channel === 'email') {
        subject = (template.content as EmailContent).subject?.trim() ?? '';
      }
    }
    return {
      preview: { subject: subject || String(config.delivery_name ?? 'Email'), templateName },
      deliveryContent: getDeliveryContentFromConfig('email', config),
    };
  }

  return {
    preview: {
      title: String(config.title ?? config.delivery_name ?? 'Delivery'),
      body: String(config.body ?? config.content ?? config.message ?? ''),
      templateName,
    },
    deliveryContent: getDeliveryContentFromConfig('email', config),
  };
}

export async function buildDeliveryPrep(input: {
  nodeId: string;
  stepType: string;
  config: Record<string, unknown>;
  targetIds: string[];
  tenantId: string;
  environment: string;
}): Promise<DeliveryPrepData> {
  const channel = channelForDeliveryStep(input.stepType);
  const deliveryName = String(input.config.delivery_name ?? 'Untitled delivery');
  const deliveryId = crypto.randomUUID();
  const uniqueTargetIds = [...new Set(input.targetIds)];

  const exclusions = await fetchExcludedCustomers(
    input.tenantId,
    input.environment,
    uniqueTargetIds,
    channel,
  );
  const excludedIdSet = new Set(exclusions.map((e) => e.customer_id));
  const excludedIds = [...excludedIdSet];
  const toSendIds = uniqueTargetIds.filter((id) => !excludedIdSet.has(id));

  const [sampleRecipients, engagement, resolved] = await Promise.all([
    fetchCustomersByIds(toSendIds.slice(0, 100)),
    fetchEngagementForCustomers(input.tenantId, input.environment, toSendIds, channel),
    resolveDeliveryPreview(input.stepType, input.config),
  ]);

  return {
    nodeId: input.nodeId,
    stepType: input.stepType,
    deliveryId,
    deliveryName,
    channel,
    preview: resolved.preview,
    deliveryContent: resolved.deliveryContent,
    totalTarget: uniqueTargetIds.length,
    excludedCount: excludedIds.length,
    toSendCount: toSendIds.length,
    targetIds: uniqueTargetIds,
    excludedIds,
    toSendIds,
    sampleRecipients,
    exclusions,
    engagement,
  };
}
