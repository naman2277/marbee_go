import type { ContentChannel } from './content-templates';

export type ProviderApprovalStatus = 'not_registered' | 'pending' | 'approved' | 'rejected';

export type SmsDltApproval = {
  status: ProviderApprovalStatus;
  template_name?: string;
  dlt_template_id?: string;
  dlt_entity_id?: string;
  principal_entity_id?: string;
  sender_id?: string;
  message_type?: 'promotional' | 'transactional' | 'service_implicit' | 'service_explicit';
  operator?: string;
  registered_at?: string;
  approved_at?: string;
  rejection_reason?: string;
  notes?: string;
};

export type WhatsAppMetaApproval = {
  status: ProviderApprovalStatus;
  template_name?: string;
  meta_template_id?: string;
  waba_id?: string;
  business_account_id?: string;
  namespace?: string;
  language?: string;
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  quality_rating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  submitted_at?: string;
  approved_at?: string;
  rejection_reason?: string;
  notes?: string;
};

export type RcsProviderApproval = {
  status: ProviderApprovalStatus;
  provider_name?: string;
  template_name?: string;
  template_id?: string;
  agent_id?: string;
  route_id?: string;
  template_type?: 'text' | 'rich_card' | 'carousel' | 'suggested_reply';
  submitted_at?: string;
  approved_at?: string;
  rejection_reason?: string;
  notes?: string;
};

export type TemplateProviderApproval = {
  sms_dlt?: SmsDltApproval;
  whatsapp_meta?: WhatsAppMetaApproval;
  rcs_provider?: RcsProviderApproval;
};

export const PROVIDER_APPROVAL_CHANNELS: ContentChannel[] = ['sms', 'whatsapp', 'rcs'];

export function channelRequiresProviderApproval(channel: ContentChannel): boolean {
  return PROVIDER_APPROVAL_CHANNELS.includes(channel);
}

export function providerApprovalTabLabel(channel: ContentChannel): string {
  switch (channel) {
    case 'sms':
      return 'DLT registration';
    case 'whatsapp':
      return 'Meta approval';
    case 'rcs':
      return 'Provider approval';
    default:
      return 'Provider approval';
  }
}

export const APPROVAL_STATUS_OPTIONS: Array<{ id: ProviderApprovalStatus; label: string; description: string }> = [
  { id: 'not_registered', label: 'Not registered', description: 'Template not yet submitted to the provider portal' },
  { id: 'pending', label: 'Pending review', description: 'Submitted and awaiting provider approval' },
  { id: 'approved', label: 'Approved', description: 'Provider approved — safe to use in live sends' },
  { id: 'rejected', label: 'Rejected', description: 'Provider rejected — update and resubmit externally' },
];

export function approvalStatusBadgeVariant(
  status: ProviderApprovalStatus | undefined,
): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'rejected':
      return 'error';
    default:
      return 'default';
  }
}

export function emptyProviderApprovalForChannel(channel: ContentChannel): TemplateProviderApproval {
  switch (channel) {
    case 'sms':
      return { sms_dlt: { status: 'not_registered', message_type: 'promotional' } };
    case 'whatsapp':
      return { whatsapp_meta: { status: 'not_registered', language: 'en', category: 'MARKETING' } };
    case 'rcs':
      return { rcs_provider: { status: 'not_registered', template_type: 'rich_card' } };
    default:
      return {};
  }
}

export function getProviderApprovalForChannel(
  approval: TemplateProviderApproval | undefined,
  channel: ContentChannel,
): SmsDltApproval | WhatsAppMetaApproval | RcsProviderApproval | undefined {
  if (!approval) return undefined;
  switch (channel) {
    case 'sms':
      return approval.sms_dlt;
    case 'whatsapp':
      return approval.whatsapp_meta;
    case 'rcs':
      return approval.rcs_provider;
    default:
      return undefined;
  }
}

export function mergeProviderApproval(
  existing: TemplateProviderApproval | undefined,
  channel: ContentChannel,
  patch: SmsDltApproval | WhatsAppMetaApproval | RcsProviderApproval,
): TemplateProviderApproval {
  const base = { ...existing };
  switch (channel) {
    case 'sms':
      base.sms_dlt = patch as SmsDltApproval;
      break;
    case 'whatsapp':
      base.whatsapp_meta = patch as WhatsAppMetaApproval;
      break;
    case 'rcs':
      base.rcs_provider = patch as RcsProviderApproval;
      break;
  }
  return base;
}

export function normalizeProviderApproval(
  raw: TemplateProviderApproval | undefined,
  channel: ContentChannel,
): TemplateProviderApproval {
  const empty = emptyProviderApprovalForChannel(channel);
  if (!raw) return empty;
  return {
    ...empty,
    ...raw,
    sms_dlt:
      channel === 'sms'
        ? { ...empty.sms_dlt!, ...raw.sms_dlt, status: raw.sms_dlt?.status ?? empty.sms_dlt!.status }
        : raw.sms_dlt,
    whatsapp_meta:
      channel === 'whatsapp'
        ? {
            ...empty.whatsapp_meta!,
            ...raw.whatsapp_meta,
            status: raw.whatsapp_meta?.status ?? empty.whatsapp_meta!.status,
          }
        : raw.whatsapp_meta,
    rcs_provider:
      channel === 'rcs'
        ? { ...empty.rcs_provider!, ...raw.rcs_provider, status: raw.rcs_provider?.status ?? empty.rcs_provider!.status }
        : raw.rcs_provider,
  };
}
