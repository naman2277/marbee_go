import type { LucideIcon } from 'lucide-react';
import { emptyContentForChannel } from './content-templates';
import { defaultQueryActivityConfig, queryConfigSummary } from './query-activity';
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  GitBranch,
  ListPlus,
  LogOut,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointerClick,
  Percent,
  Repeat,
  Shield,
  Shuffle,
  Smartphone,
  Split,
  Target,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';

export type CampaignMode = 'campaign' | 'flow';
/** @deprecated Stored as `blast` in older journeys — treated as campaign */
export type CampaignModeInput = CampaignMode | 'blast';

export function normalizeCampaignMode(mode?: CampaignModeInput | null): CampaignMode {
  return mode === 'flow' ? 'flow' : 'campaign';
}

export function isCampaignWorkflowMode(mode?: CampaignModeInput | null): boolean {
  return normalizeCampaignMode(mode) === 'campaign';
}

export type CampaignNodeCategory =
  | 'Targeting'
  | 'Entry'
  | 'Timing'
  | 'Channels'
  | 'Decisions'
  | 'Audience'
  | 'Flow'
  | 'Exit';

export type CampaignNodeShape = 'entry' | 'wait' | 'channel' | 'decision' | 'action' | 'flow' | 'exit';

export type CampaignIconKey =
  | 'users'
  | 'target'
  | 'bell'
  | 'zap'
  | 'calendar'
  | 'clock'
  | 'alarm'
  | 'mail'
  | 'sms'
  | 'push'
  | 'whatsapp'
  | 'app'
  | 'click'
  | 'open'
  | 'check'
  | 'split'
  | 'shuffle'
  | 'merge'
  | 'list'
  | 'subscribe'
  | 'unsubscribe'
  | 'profile'
  | 'webhook'
  | 'exit'
  | 'shield'
  | 'percent'
  | 'repeat';

export type DeliveryTemplateChannel = 'email' | 'sms' | 'web_push' | 'whatsapp' | 'rcs';

export type ConfigField = {
  key: string;
  label: string;
  kind:
    | 'text'
    | 'number'
    | 'textarea'
    | 'select'
    | 'toggle'
    | 'audience'
    | 'service'
    | 'schema'
    | 'content_template';
  placeholder?: string;
  options?: { value: string; label: string }[];
  rows?: number;
  min?: number;
  max?: number;
  /** Filter content templates by channel when kind is content_template */
  templateChannel?: DeliveryTemplateChannel;
  /** Show this field only when config[key] equals value */
  showWhen?: { key: string; equals: string };
};

export type CampaignPaletteItem = {
  type: string;
  label: string;
  category: CampaignNodeCategory;
  description: string;
  shape: CampaignNodeShape;
  accent: string;
  accentBg: string;
  icon: CampaignIconKey;
  tags: string[];
  outputs?: { id: string; label: string; color?: string }[];
  popular?: boolean;
  /** Which campaign editor shows this node (default: both) */
  modes?: CampaignMode[];
  /** Only source handle (entry) */
  entryOnly?: boolean;
  /** Terminal — no source handle */
  terminal?: boolean;
};

export const CAMPAIGN_ICONS: Record<CampaignIconKey, LucideIcon> = {
  users: Users,
  target: Target,
  bell: Bell,
  zap: Zap,
  calendar: CalendarClock,
  clock: Clock,
  alarm: AlarmClock,
  mail: Mail,
  sms: MessageSquare,
  push: Bell,
  whatsapp: MessageSquare,
  app: Smartphone,
  click: MousePointerClick,
  open: MailOpen,
  check: CheckCircle2,
  split: Split,
  shuffle: Shuffle,
  merge: GitBranch,
  list: ListPlus,
  subscribe: UserPlus,
  unsubscribe: UserMinus,
  profile: UserCheck,
  webhook: Webhook,
  exit: LogOut,
  shield: Shield,
  percent: Percent,
  repeat: Repeat,
};

export const CAMPAIGN_CATEGORIES: CampaignNodeCategory[] = [
  'Targeting',
  'Entry',
  'Timing',
  'Channels',
  'Decisions',
  'Audience',
  'Flow',
  'Exit',
];

export const CATEGORY_COLORS: Record<CampaignNodeCategory, string> = {
  Targeting: '#0ea5e9',
  Entry: '#22c55e',
  Timing: '#a855f7',
  Channels: '#3b82f6',
  Decisions: '#ec4899',
  Audience: '#6366f1',
  Flow: '#64748b',
  Exit: '#475569',
};

export function paletteForMode(mode: CampaignModeInput): CampaignPaletteItem[] {
  const normalized = normalizeCampaignMode(mode);
  return CAMPAIGN_PALETTE.filter((n) => {
    if (!n.modes) return true;
    if (n.modes.includes(normalized)) return true;
    // Campaign workflows reuse flow Decisions, Timing, and Flow controls
    if (
      normalized === 'campaign' &&
      n.modes.includes('flow') &&
      (n.category === 'Decisions' || n.category === 'Timing' || n.category === 'Flow')
    ) {
      return true;
    }
    return false;
  });
}

const YES_NO = [
  { id: 'yes', label: '✓', color: '#3b82f6' },
  { id: 'no', label: '✗', color: '#f97316' },
];

const AB_SPLIT = [
  { id: 'a', label: 'A', color: '#3b82f6' },
  { id: 'b', label: 'B', color: '#8b5cf6' },
];

export const CAMPAIGN_PALETTE: CampaignPaletteItem[] = [
  // Targeting — Adobe Campaign Classic workflow activities (blast only)
  {
    type: 'query',
    label: 'Query',
    category: 'Targeting',
    description:
      'Select a population from the database by criteria — filters, targeting dimension, optional additional data and aggregates — then pass primary keys through a work table to the next activity',
    shape: 'action',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'target',
    tags: ['query', 'target', 'filter', 'population'],
    modes: ['campaign'],
    popular: true,
  },
  {
    type: 'read_list',
    label: 'Read list',
    category: 'Targeting',
    description: 'Load profiles from a saved audience list',
    shape: 'action',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'list',
    tags: ['list', 'audience', 'read'],
    modes: ['campaign'],
    popular: true,
  },
  {
    type: 'incremental_query',
    label: 'Incremental query',
    category: 'Targeting',
    description: 'Query with incremental / scheduled execution',
    shape: 'action',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'repeat',
    tags: ['incremental', 'query', 'scheduled'],
    modes: ['campaign'],
  },
  {
    type: 'union',
    label: 'Union',
    category: 'Targeting',
    description: 'Combine multiple inbound targets into one population',
    shape: 'flow',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'merge',
    tags: ['union', 'combine', 'merge'],
    modes: ['campaign'],
  },
  {
    type: 'intersection',
    label: 'Intersection',
    category: 'Targeting',
    description: 'Keep only profiles present in all inbound targets',
    shape: 'flow',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'users',
    tags: ['intersection', 'overlap'],
    modes: ['campaign'],
  },
  {
    type: 'exclusion',
    label: 'Exclusion',
    category: 'Targeting',
    description: 'Remove one target from another (main minus exclude)',
    shape: 'flow',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'unsubscribe',
    tags: ['exclusion', 'subtract', 'suppress'],
    modes: ['campaign'],
  },
  {
    type: 'deduplication',
    label: 'Deduplication',
    category: 'Targeting',
    description: 'Remove duplicate profiles by email or other field',
    shape: 'action',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'shuffle',
    tags: ['dedupe', 'duplicate', 'unique'],
    modes: ['campaign'],
    popular: true,
  },
  {
    type: 'enrichment',
    label: 'Enrichment',
    category: 'Targeting',
    description: 'Add or compute columns on the working population',
    shape: 'action',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'profile',
    tags: ['enrichment', 'columns', 'data'],
    modes: ['campaign'],
  },
  {
    type: 'list_update',
    label: 'List update',
    category: 'Targeting',
    description: 'Record the population result into an audience list',
    shape: 'action',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'list',
    tags: ['list', 'update', 'save'],
    modes: ['campaign'],
  },
  {
    type: 'split_targeting',
    label: 'Split',
    category: 'Targeting',
    description: 'Split a target into subsets (A/B cells)',
    shape: 'flow',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'split',
    tags: ['split', 'subset', 'cell'],
    outputs: AB_SPLIT,
    modes: ['campaign'],
  },
  {
    type: 'subscription_services_targeting',
    label: 'Subscription services',
    category: 'Targeting',
    description: 'Filter to subscribers of an information service',
    shape: 'action',
    accent: '#0ea5e9',
    accentBg: '#e0f2fe',
    icon: 'bell',
    tags: ['subscription', 'service', 'opt-in'],
    modes: ['campaign'],
  },
  // Entry (5) — flow orchestration
  {
    type: 'segment_entry',
    label: 'Segment members',
    category: 'Entry',
    description: 'Enter profiles from an audience cohort',
    shape: 'entry',
    accent: '#22c55e',
    accentBg: '#dcfce7',
    icon: 'users',
    tags: ['segment', 'audience', 'cohort', 'entry', 'blast'],
    modes: ['flow'],
    entryOnly: true,
    popular: true,
  },
  {
    type: 'subscription_entry',
    label: 'Service subscribers',
    category: 'Entry',
    description: 'Enter subscribers of an information service',
    shape: 'entry',
    accent: '#22c55e',
    accentBg: '#dcfce7',
    icon: 'bell',
    tags: ['subscription', 'service', 'entry'],
    modes: ['flow'],
    entryOnly: true,
  },
  {
    type: 'event_trigger',
    label: 'Event trigger',
    category: 'Entry',
    description: 'Start when a behavioral event occurs',
    shape: 'entry',
    accent: '#22c55e',
    accentBg: '#dcfce7',
    icon: 'zap',
    tags: ['event', 'trigger', 'real-time'],
    modes: ['flow'],
    entryOnly: true,
  },
  {
    type: 'schedule_blast',
    label: 'Scheduled blast',
    category: 'Entry',
    description: 'One-time or recurring scheduled send',
    shape: 'entry',
    accent: '#22c55e',
    accentBg: '#dcfce7',
    icon: 'calendar',
    tags: ['schedule', 'cron', 'blast'],
    modes: ['flow'],
    entryOnly: true,
    popular: true,
  },
  // Timing (3)
  {
    type: 'wait_duration',
    label: 'Wait',
    category: 'Timing',
    description: 'Pause for a fixed duration',
    shape: 'wait',
    accent: '#a855f7',
    accentBg: '#f3e8ff',
    icon: 'clock',
    tags: ['wait', 'delay', 'pause'],
    modes: ['flow'],
    popular: true,
  },
  {
    type: 'wait_until',
    label: 'Wait until date',
    category: 'Timing',
    description: 'Pause until a specific date/time',
    shape: 'wait',
    accent: '#a855f7',
    accentBg: '#f3e8ff',
    icon: 'calendar',
    tags: ['wait', 'schedule'],
    modes: ['flow'],
  },
  {
    type: 'wait_until_event',
    label: 'Wait for event',
    category: 'Timing',
    description: 'Pause until a profile performs an event',
    shape: 'wait',
    accent: '#a855f7',
    accentBg: '#f3e8ff',
    icon: 'alarm',
    tags: ['wait', 'event'],
    modes: ['flow'],
  },
  // Channels (6) — both blast delivery and flow sends
  {
    type: 'send_email',
    label: 'Email',
    category: 'Channels',
    description: 'Send a personalized email delivery',
    shape: 'channel',
    accent: '#3b82f6',
    accentBg: '#dbeafe',
    icon: 'mail',
    tags: ['email', 'send', 'delivery'],
    popular: true,
  },
  {
    type: 'send_sms',
    label: 'SMS',
    category: 'Channels',
    description: 'Send an SMS message',
    shape: 'channel',
    accent: '#3b82f6',
    accentBg: '#dbeafe',
    icon: 'sms',
    tags: ['sms', 'text'],
  },
  {
    type: 'send_web_push',
    label: 'Web push',
    category: 'Channels',
    description: 'Send a browser push notification',
    shape: 'channel',
    accent: '#3b82f6',
    accentBg: '#dbeafe',
    icon: 'push',
    tags: ['push', 'web'],
  },
  {
    type: 'send_whatsapp',
    label: 'WhatsApp',
    category: 'Channels',
    description: 'Send a WhatsApp message',
    shape: 'channel',
    accent: '#3b82f6',
    accentBg: '#dbeafe',
    icon: 'whatsapp',
    tags: ['whatsapp'],
  },
  {
    type: 'send_rcs',
    label: 'RCS',
    category: 'Channels',
    description: 'Send an RCS rich card message',
    shape: 'channel',
    accent: '#3b82f6',
    accentBg: '#dbeafe',
    icon: 'sms',
    tags: ['rcs', 'rich'],
  },
  {
    type: 'send_in_app',
    label: 'In-app message',
    category: 'Channels',
    description: 'Show an in-app or on-site message',
    shape: 'channel',
    accent: '#3b82f6',
    accentBg: '#dbeafe',
    icon: 'app',
    tags: ['in-app', 'onsite'],
  },
  {
    type: 'send_direct_mail',
    label: 'Direct mail',
    category: 'Channels',
    description: 'Trigger a direct mail fulfillment',
    shape: 'channel',
    accent: '#3b82f6',
    accentBg: '#dbeafe',
    icon: 'mail',
    tags: ['direct', 'mail', 'offline'],
  },
  // Decisions (7)
  {
    type: 'condition_clicked',
    label: 'Clicked email?',
    category: 'Decisions',
    description: 'Branch on email click engagement',
    shape: 'decision',
    accent: '#ec4899',
    accentBg: '#fce7f3',
    icon: 'click',
    tags: ['click', 'engagement', 'email'],
    outputs: YES_NO,
    modes: ['flow'],
    popular: true,
  },
  {
    type: 'condition_opened',
    label: 'Opened email?',
    category: 'Decisions',
    description: 'Branch on email open engagement',
    shape: 'decision',
    accent: '#ec4899',
    accentBg: '#fce7f3',
    icon: 'open',
    tags: ['open', 'engagement'],
    outputs: YES_NO,
    modes: ['flow'],
  },
  {
    type: 'condition_purchased',
    label: 'Purchased?',
    category: 'Decisions',
    description: 'Branch on purchase conversion',
    shape: 'decision',
    accent: '#ec4899',
    accentBg: '#fce7f3',
    icon: 'check',
    tags: ['purchase', 'conversion'],
    outputs: YES_NO,
    modes: ['flow'],
  },
  {
    type: 'condition_segment',
    label: 'In segment?',
    category: 'Decisions',
    description: 'Branch if profile matches an audience',
    shape: 'decision',
    accent: '#ec4899',
    accentBg: '#fce7f3',
    icon: 'target',
    tags: ['segment', 'audience'],
    outputs: YES_NO,
    modes: ['flow'],
  },
  {
    type: 'condition_attribute',
    label: 'Profile attribute',
    category: 'Decisions',
    description: 'Branch on a profile field value',
    shape: 'decision',
    accent: '#ec4899',
    accentBg: '#fce7f3',
    icon: 'profile',
    tags: ['attribute', 'field'],
    outputs: YES_NO,
    modes: ['flow'],
  },
  {
    type: 'condition_consent',
    label: 'Has consent?',
    category: 'Decisions',
    description: 'Branch on channel consent flags',
    shape: 'decision',
    accent: '#ec4899',
    accentBg: '#fce7f3',
    icon: 'shield',
    tags: ['consent', 'gdpr'],
    outputs: YES_NO,
    modes: ['flow'],
  },
  {
    type: 'condition_engagement',
    label: 'Engagement score',
    category: 'Decisions',
    description: 'Branch on engagement score threshold',
    shape: 'decision',
    accent: '#ec4899',
    accentBg: '#fce7f3',
    icon: 'percent',
    tags: ['engagement', 'score'],
    outputs: YES_NO,
    modes: ['flow'],
  },
  // Audience (5)
  {
    type: 'add_to_audience',
    label: 'Add to cohort',
    category: 'Audience',
    description: 'Add profile to an audience segment',
    shape: 'action',
    accent: '#6366f1',
    accentBg: '#e0e7ff',
    icon: 'users',
    tags: ['audience', 'cohort', 'list'],
    modes: ['flow'],
  },
  {
    type: 'add_to_list',
    label: 'Add to shared list',
    category: 'Audience',
    description: 'Add profile to a shared suppression or nurture list',
    shape: 'action',
    accent: '#6366f1',
    accentBg: '#e0e7ff',
    icon: 'list',
    tags: ['list', 'shared', 'nurture'],
    modes: ['flow'],
    popular: true,
  },
  {
    type: 'subscribe_service',
    label: 'Subscribe to service',
    category: 'Audience',
    description: 'Opt-in profile to an information service',
    shape: 'action',
    accent: '#6366f1',
    accentBg: '#e0e7ff',
    icon: 'subscribe',
    tags: ['subscription', 'opt-in'],
    modes: ['flow'],
  },
  {
    type: 'unsubscribe_service',
    label: 'Unsubscribe from service',
    category: 'Audience',
    description: 'Opt-out profile from an information service',
    shape: 'action',
    accent: '#6366f1',
    accentBg: '#e0e7ff',
    icon: 'unsubscribe',
    tags: ['unsubscribe', 'opt-out'],
    modes: ['flow'],
  },
  {
    type: 'update_profile',
    label: 'Update profile',
    category: 'Audience',
    description: 'Set or update profile attributes',
    shape: 'action',
    accent: '#6366f1',
    accentBg: '#e0e7ff',
    icon: 'profile',
    tags: ['profile', 'attribute'],
    modes: ['flow'],
  },
  {
    type: 'split_ab',
    label: 'A/B split',
    category: 'Flow',
    description: 'Split traffic between two paths',
    shape: 'flow',
    accent: '#64748b',
    accentBg: '#f1f5f9',
    icon: 'split',
    tags: ['ab', 'test', 'split'],
    outputs: AB_SPLIT,
    modes: ['flow'],
  },
  {
    type: 'split_random',
    label: 'Random split',
    category: 'Flow',
    description: 'Randomly assign profiles to paths',
    shape: 'flow',
    accent: '#64748b',
    accentBg: '#f1f5f9',
    icon: 'shuffle',
    tags: ['random', 'split'],
    outputs: AB_SPLIT,
    modes: ['flow'],
  },
  {
    type: 'merge_paths',
    label: 'Merge paths',
    category: 'Flow',
    description: 'Rejoin multiple branches',
    shape: 'flow',
    accent: '#64748b',
    accentBg: '#f1f5f9',
    icon: 'merge',
    tags: ['merge', 'join'],
    modes: ['flow'],
  },
  // Exit + webhook
  {
    type: 'webhook',
    label: 'Webhook',
    category: 'Flow',
    description: 'Call an external HTTP endpoint',
    shape: 'action',
    accent: '#64748b',
    accentBg: '#f1f5f9',
    icon: 'webhook',
    tags: ['webhook', 'api', 'http'],
    modes: ['flow'],
  },
  {
    type: 'exit',
    label: 'Exit journey',
    category: 'Exit',
    description: 'End the journey for this profile',
    shape: 'exit',
    accent: '#475569',
    accentBg: '#f1f5f9',
    icon: 'exit',
    tags: ['exit', 'end'],
    modes: ['flow'],
    terminal: true,
  },
];

export const CAMPAIGN_STEP_TYPES = CAMPAIGN_PALETTE.map((n) => n.type);

/** Map legacy journey node types to campaign types */
export const LEGACY_JOURNEY_TYPE_MAP: Record<string, string> = {
  trigger: 'event_trigger',
  condition: 'condition_attribute',
  wait: 'wait_duration',
  send_web_push: 'send_web_push',
  update_profile: 'update_profile',
  webhook: 'webhook',
  exit: 'exit',
};

export function paletteItem(type: string): CampaignPaletteItem | undefined {
  const normalized = normalizeStepType(type);
  return CAMPAIGN_PALETTE.find((n) => n.type === normalized);
}

export function normalizeStepType(type: string): string {
  return LEGACY_JOURNEY_TYPE_MAP[type] ?? type;
}

export function categoryAccent(category: CampaignNodeCategory): string {
  return CATEGORY_COLORS[category] ?? '#64748b';
}

export function defaultConfigForType(type: string): Record<string, unknown> {
  const t = normalizeStepType(type);
  switch (t) {
    case 'query':
      return defaultQueryActivityConfig();
    case 'read_list':
      return { list_slug: '', list_name: '' };
    case 'incremental_query':
      return defaultQueryActivityConfig({
        query_source: 'audience',
        audience_slug: 'email-reachable',
        schedule: '0 6 * * *',
      });
    case 'union':
    case 'intersection':
    case 'exclusion':
      return {};
    case 'deduplication':
      return { dedupe_field: 'email', keep_strategy: 'first' };
    case 'enrichment':
      return { enrich_source: 'expression', enrich_field: '', enrich_expression: '' };
    case 'list_update':
      return { list_slug: '', list_name: 'Workflow result' };
    case 'split_targeting':
      return { split_a_percent: 50 };
    case 'subscription_services_targeting':
      return { service_slug: '' };
    case 'segment_entry':
      return { audience_slug: '', audience_name: 'Nurture_Segment' };
    case 'subscription_entry':
      return { service_slug: '', service_name: '' };
    case 'event_trigger':
      return { event_type: 'cart_abandoned', event_property: '', property_operator: 'equals', property_value: '' };
    case 'schedule_blast':
      return { schedule: '0 9 * * 1', timezone: 'Asia/Kolkata' };
    case 'wait_duration':
      return { duration_value: 1, duration_unit: 'hours' };
    case 'wait_until':
      return { until_datetime: '' };
    case 'wait_until_event':
      return { event_type: 'purchase_completed', timeout_hours: 168 };
    case 'send_email':
      return {
        delivery_name: '1st Nurture Email',
        content_template_id: '',
        content_template_name: '',
        channel_provider_id: '',
        channel_provider_name: '',
        message_traffic_type: 'promotional',
        subject: '',
        delivery_content: emptyContentForChannel('email'),
      };
    case 'send_sms':
      return {
        delivery_name: 'SMS Alert',
        content_template_id: '',
        content_template_name: '',
        channel_provider_id: '',
        channel_provider_name: '',
        message_traffic_type: 'promotional',
        delivery_content: emptyContentForChannel('sms'),
      };
    case 'send_web_push':
      return {
        delivery_name: 'Push Reminder',
        content_template_id: '',
        content_template_name: '',
        channel_provider_id: '',
        channel_provider_name: '',
        title: '',
        body: '',
        delivery_content: emptyContentForChannel('web_push'),
      };
    case 'send_whatsapp':
      return {
        delivery_name: 'WhatsApp Message',
        content_template_id: '',
        content_template_name: '',
        channel_provider_id: '',
        channel_provider_name: '',
        message_traffic_type: 'promotional',
        delivery_content: emptyContentForChannel('whatsapp'),
      };
    case 'send_rcs':
      return {
        delivery_name: 'RCS Message',
        content_template_id: '',
        content_template_name: '',
        channel_provider_id: '',
        channel_provider_name: '',
        message_traffic_type: 'promotional',
        delivery_content: emptyContentForChannel('rcs'),
      };
    case 'send_in_app':
      return {
        delivery_name: 'In-app Banner',
        message_type: 'banner',
        position: 'top',
        content: '',
        cta_text: '',
        cta_url: '',
        dismiss_after_seconds: 0,
        background_color: '#ffffff',
      };
    case 'send_direct_mail':
      return {
        delivery_name: 'Direct Mail Piece',
        template: '',
        format: 'postcard',
        address_field: 'mailing_address',
        envelope_type: 'standard',
        postage_class: 'first_class',
      };
    case 'condition_clicked':
      return { delivery_ref: '1st Nurture Email', within_hours: 168, link_url: '' };
    case 'condition_opened':
      return { delivery_ref: '', within_hours: 72 };
    case 'condition_purchased':
      return { within_hours: 336, min_amount: 0, product_id: '', category: '' };
    case 'condition_segment':
      return { audience_slug: '' };
    case 'condition_attribute':
      return { field: 'status', operator: 'equals', value: 'active' };
    case 'condition_consent':
      return { channel: 'email' };
    case 'condition_engagement':
      return { metric: 'email_open_rate', operator: 'gte', value: 50 };
    case 'add_to_audience':
      return { audience_slug: '', audience_name: '' };
    case 'add_to_list':
      return { list_name: 'Not Engaged', list_operation: 'add' };
    case 'subscribe_service':
      return { service_slug: '' };
    case 'unsubscribe_service':
      return { service_slug: '' };
    case 'update_profile':
      return { field: '', value: '', operation: 'set' };
    case 'split_ab':
      return { split_a_percent: 50 };
    case 'split_random':
      return { paths: 2, split_a_percent: 50, distribution: 'equal' };
    case 'merge_paths':
      return {};
    case 'webhook':
      return {
        url: '',
        method: 'POST',
        headers: '{}',
        body_template: '',
        auth_type: 'none',
        auth_token: '',
        timeout_seconds: 30,
        retry_count: 0,
      };
    case 'exit':
      return { reason: 'completed' };
    default:
      return {};
  }
}

export function configSummary(stepType: string, config: Record<string, unknown>): string {
  const t = normalizeStepType(stepType);
  switch (t) {
    case 'query':
    case 'incremental_query':
      return queryConfigSummary(config);
    case 'read_list':
      return String(config.list_name || config.list_slug || 'Select list');
    case 'union':
      return 'Combine inbound targets';
    case 'intersection':
      return 'Overlap of inbound targets';
    case 'exclusion':
      return 'Main minus exclude';
    case 'deduplication':
      return `Dedupe by ${config.dedupe_field ?? 'email'}, keep ${config.keep_strategy ?? 'first'}`;
    case 'enrichment':
      return `${config.enrich_source ?? 'expression'}: ${config.enrich_field || 'Configure column'}`;
    case 'list_update':
      return String(config.list_name || config.list_slug || 'Save to list');
    case 'split_targeting':
      return `${config.split_a_percent ?? 50}% / ${100 - Number(config.split_a_percent ?? 50)}%`;
    case 'subscription_services_targeting':
      return String(config.service_slug || 'Select service');
    case 'segment_entry':
      return String(config.audience_name || config.audience_slug || 'Select segment');
    case 'subscription_entry':
      return String(config.service_name || config.service_slug || 'Select service');
    case 'event_trigger': {
      const ev = String(config.event_type || 'event');
      const prop = config.event_property ? ` (${config.event_property} ${config.property_operator ?? '='} ${config.property_value ?? ''})` : '';
      return ev + prop;
    }
    case 'schedule_blast':
      return String(config.schedule || 'Schedule');
    case 'wait_duration':
      return `${config.duration_value ?? 1} ${config.duration_unit ?? 'hours'}`;
    case 'wait_until':
      return config.until_datetime ? String(config.until_datetime) : 'Set date';
    case 'wait_until_event':
      return `Wait for ${config.event_type ?? 'event'}`;
    case 'send_email':
    case 'send_sms':
    case 'send_web_push':
    case 'send_whatsapp':
    case 'send_rcs': {
      const parts: string[] = [];
      if (config.content_template_name) parts.push(String(config.content_template_name));
      if (config.channel_provider_name) parts.push(String(config.channel_provider_name));
      return parts.join(' · ') || String(config.delivery_name || 'Select delivery template');
    }
    case 'send_in_app':
      return `${config.message_type ?? 'banner'} · ${config.delivery_name || 'Untitled'}`;
    case 'send_direct_mail':
      return `${config.format ?? 'postcard'} · ${config.delivery_name || 'Untitled'}`;
    case 'condition_clicked':
    case 'condition_opened':
      return String(config.delivery_ref || 'Select delivery');
    case 'condition_purchased': {
      const parts: string[] = [`Within ${config.within_hours ?? 336}h`];
      if (config.min_amount) parts.push(`≥ $${config.min_amount}`);
      if (config.category) parts.push(String(config.category));
      return parts.join(' · ');
    }
    case 'condition_segment':
      return String(config.audience_slug || 'Select segment');
    case 'condition_attribute':
      return `${config.field ?? 'field'} ${config.operator ?? '='} ${config.value ?? ''}`;
    case 'condition_consent':
      return `${config.channel ?? 'email'} consent`;
    case 'condition_engagement':
      return `Score ${config.operator ?? '≥'} ${config.value ?? 0}`;
    case 'add_to_audience':
      return String(config.audience_name || config.audience_slug || 'Cohort');
    case 'add_to_list':
      return String(config.list_name || 'Shared list');
    case 'subscribe_service':
    case 'unsubscribe_service':
      return String(config.service_slug || 'Service');
    case 'update_profile':
      return `${config.operation ?? 'set'} ${config.field ?? 'field'} → ${config.value ?? ''}`;
    case 'split_ab':
      return `${config.split_a_percent ?? 50}% / ${100 - Number(config.split_a_percent ?? 50)}%`;
    case 'split_random': {
      if (config.distribution === 'weighted')
        return `Random ${config.split_a_percent ?? 50}% / ${100 - Number(config.split_a_percent ?? 50)}%`;
      return `Random equal ${config.paths ?? 2}-way split`;
    }
    case 'webhook': {
      const method = config.method ?? 'POST';
      const url = config.url ? String(config.url) : 'Configure URL';
      const auth = config.auth_type && config.auth_type !== 'none' ? ` · ${config.auth_type}` : '';
      return `${method} ${url}${auth}`;
    }
    case 'exit':
      return String(config.reason || 'Exit');
    default:
      return '';
  }
}

const DURATION_UNITS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
];

const CONSENT_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'web_push', label: 'Web push' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const ATTRIBUTE_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'regex', label: 'Matches regex' },
];

const PROPERTY_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
];

const ENGAGEMENT_METRICS = [
  { value: 'email_open_rate', label: 'Email open rate' },
  { value: 'email_click_rate', label: 'Email click rate' },
  { value: 'engagement_score', label: 'Overall engagement score' },
  { value: 'purchase_frequency', label: 'Purchase frequency' },
  { value: 'session_count', label: 'Session count (30d)' },
  { value: 'days_since_last_activity', label: 'Days since last activity' },
  { value: 'lifetime_value', label: 'Lifetime value' },
];

const IN_APP_MESSAGE_TYPES = [
  { value: 'banner', label: 'Banner' },
  { value: 'modal', label: 'Modal dialog' },
  { value: 'fullscreen', label: 'Full-screen takeover' },
  { value: 'slide_in', label: 'Slide-in' },
  { value: 'toast', label: 'Toast notification' },
];

const IN_APP_POSITIONS = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'center', label: 'Center' },
  { value: 'top_left', label: 'Top left' },
  { value: 'top_right', label: 'Top right' },
  { value: 'bottom_left', label: 'Bottom left' },
  { value: 'bottom_right', label: 'Bottom right' },
];

const DIRECT_MAIL_FORMATS = [
  { value: 'postcard', label: 'Postcard' },
  { value: 'letter', label: 'Letter' },
  { value: 'self_mailer', label: 'Self-mailer' },
  { value: 'brochure', label: 'Brochure' },
];

const POSTAGE_CLASSES = [
  { value: 'first_class', label: 'First class' },
  { value: 'standard', label: 'Standard / bulk' },
  { value: 'priority', label: 'Priority' },
];

const PROFILE_OPERATIONS = [
  { value: 'set', label: 'Set value' },
  { value: 'increment', label: 'Increment by' },
  { value: 'append', label: 'Append to array' },
  { value: 'unset', label: 'Remove / unset' },
];

const LIST_OPERATIONS = [
  { value: 'add', label: 'Add to list' },
  { value: 'remove', label: 'Remove from list' },
];

const KEEP_STRATEGIES = [
  { value: 'first', label: 'Keep first' },
  { value: 'last', label: 'Keep last' },
  { value: 'most_recent', label: 'Keep most recent (by date)' },
];

const ENRICH_SOURCES = [
  { value: 'expression', label: 'Computed expression' },
  { value: 'lookup', label: 'Lookup table' },
  { value: 'api', label: 'External API' },
];

const WEBHOOK_AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic auth' },
  { value: 'api_key', label: 'API key header' },
];

const HTTP_METHODS = [
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'GET', label: 'GET' },
  { value: 'DELETE', label: 'DELETE' },
];

const RANDOM_DISTRIBUTION = [
  { value: 'equal', label: 'Equal (even split)' },
  { value: 'weighted', label: 'Weighted (custom %)' },
];

export const CAMPAIGN_CONFIG_FIELDS: Record<string, ConfigField[]> = {
  query: [],
  read_list: [
    { key: 'list_name', label: 'List label', kind: 'text' },
    { key: 'list_slug', label: 'Audience list', kind: 'audience' },
  ],
  incremental_query: [],
  deduplication: [
    { key: 'dedupe_field', label: 'Dedupe field', kind: 'text', placeholder: 'email' },
    { key: 'keep_strategy', label: 'Keep strategy', kind: 'select', options: KEEP_STRATEGIES },
  ],
  enrichment: [
    { key: 'enrich_source', label: 'Source type', kind: 'select', options: ENRICH_SOURCES },
    { key: 'enrich_field', label: 'Column name', kind: 'text' },
    { key: 'enrich_expression', label: 'Expression', kind: 'textarea', rows: 2 },
  ],
  list_update: [
    { key: 'list_name', label: 'List label', kind: 'text' },
    { key: 'list_slug', label: 'Target list', kind: 'audience' },
  ],
  split_targeting: [
    { key: 'split_a_percent', label: 'Subset A %', kind: 'number', min: 1, max: 99 },
  ],
  subscription_services_targeting: [
    { key: 'service_slug', label: 'Information service', kind: 'service' },
  ],
  segment_entry: [
    { key: 'audience_name', label: 'Segment label', kind: 'text', placeholder: 'Nurture_Segment' },
    { key: 'audience_slug', label: 'Audience cohort', kind: 'audience' },
  ],
  subscription_entry: [
    { key: 'service_name', label: 'Service label', kind: 'text' },
    { key: 'service_slug', label: 'Information service', kind: 'service' },
  ],
  event_trigger: [
    { key: 'event_type', label: 'Event type', kind: 'text', placeholder: 'cart_abandoned' },
    { key: 'event_property', label: 'Filter by property (optional)', kind: 'text', placeholder: 'cart_value' },
    { key: 'property_operator', label: 'Property operator', kind: 'select', options: PROPERTY_OPERATORS, showWhen: { key: 'event_property', equals: '__nonempty__' } },
    { key: 'property_value', label: 'Property value', kind: 'text', showWhen: { key: 'event_property', equals: '__nonempty__' } },
  ],
  schedule_blast: [
    { key: 'schedule', label: 'Cron expression', kind: 'text', placeholder: '0 9 * * 1' },
    { key: 'timezone', label: 'Timezone', kind: 'text', placeholder: 'Asia/Kolkata' },
  ],
  wait_duration: [
    { key: 'duration_value', label: 'Duration', kind: 'number', min: 1 },
    { key: 'duration_unit', label: 'Unit', kind: 'select', options: DURATION_UNITS },
  ],
  wait_until: [
    { key: 'until_datetime', label: 'Date & time', kind: 'text', placeholder: '2026-08-15T09:00' },
  ],
  wait_until_event: [
    { key: 'timeout_hours', label: 'Timeout (hours)', kind: 'number', min: 1 },
  ],
  send_email: [
    { key: 'delivery_name', label: 'Delivery name', kind: 'text', placeholder: '1st Nurture Email' },
    { key: 'content_template_id', label: 'Delivery template', kind: 'content_template', templateChannel: 'email' },
  ],
  send_sms: [
    { key: 'delivery_name', label: 'Delivery name', kind: 'text' },
    { key: 'content_template_id', label: 'Delivery template', kind: 'content_template', templateChannel: 'sms' },
  ],
  send_web_push: [
    { key: 'delivery_name', label: 'Delivery name', kind: 'text' },
    { key: 'content_template_id', label: 'Delivery template', kind: 'content_template', templateChannel: 'web_push' },
  ],
  send_whatsapp: [
    { key: 'delivery_name', label: 'Delivery name', kind: 'text' },
    { key: 'content_template_id', label: 'Delivery template', kind: 'content_template', templateChannel: 'whatsapp' },
  ],
  send_rcs: [
    { key: 'delivery_name', label: 'Delivery name', kind: 'text' },
    { key: 'content_template_id', label: 'Delivery template', kind: 'content_template', templateChannel: 'rcs' },
  ],
  send_in_app: [
    { key: 'delivery_name', label: 'Message name', kind: 'text' },
    { key: 'message_type', label: 'Message type', kind: 'select', options: IN_APP_MESSAGE_TYPES },
    { key: 'position', label: 'Position', kind: 'select', options: IN_APP_POSITIONS },
    { key: 'content', label: 'Content / body', kind: 'textarea', rows: 3 },
    { key: 'cta_text', label: 'CTA button text', kind: 'text', placeholder: 'Learn more' },
    { key: 'cta_url', label: 'CTA button URL', kind: 'text', placeholder: 'https://…' },
    { key: 'dismiss_after_seconds', label: 'Auto-dismiss after (seconds, 0 = manual)', kind: 'number', min: 0 },
    { key: 'background_color', label: 'Background color', kind: 'text', placeholder: '#ffffff' },
  ],
  send_direct_mail: [
    { key: 'delivery_name', label: 'Delivery name', kind: 'text' },
    { key: 'format', label: 'Mail format', kind: 'select', options: DIRECT_MAIL_FORMATS },
    { key: 'template', label: 'Template / creative ID', kind: 'text', placeholder: 'holiday-postcard-2026' },
    { key: 'address_field', label: 'Address profile field', kind: 'text', placeholder: 'mailing_address' },
    { key: 'envelope_type', label: 'Envelope type', kind: 'select', options: [
      { value: 'standard', label: 'Standard (#10)' },
      { value: 'flat', label: 'Flat / large' },
      { value: 'none', label: 'None (self-mailer / postcard)' },
    ]},
    { key: 'postage_class', label: 'Postage class', kind: 'select', options: POSTAGE_CLASSES },
  ],
  condition_clicked: [
    { key: 'delivery_ref', label: 'Email delivery', kind: 'text', placeholder: '1st Nurture Email' },
    { key: 'link_url', label: 'Specific link URL (optional)', kind: 'text', placeholder: 'https://… (blank = any link)' },
    { key: 'within_hours', label: 'Within (hours)', kind: 'number', min: 1 },
  ],
  condition_opened: [
    { key: 'delivery_ref', label: 'Email delivery', kind: 'text' },
    { key: 'within_hours', label: 'Within (hours)', kind: 'number', min: 1 },
  ],
  condition_purchased: [
    { key: 'within_hours', label: 'Lookback (hours)', kind: 'number', min: 1 },
    { key: 'min_amount', label: 'Min order amount ($)', kind: 'number', min: 0 },
    { key: 'product_id', label: 'Product ID (optional)', kind: 'text', placeholder: 'Any product' },
    { key: 'category', label: 'Product category (optional)', kind: 'text', placeholder: 'Any category' },
  ],
  condition_segment: [
    { key: 'audience_slug', label: 'Audience', kind: 'audience' },
  ],
  condition_attribute: [
    { key: 'field', label: 'Profile field', kind: 'text', placeholder: 'status' },
    { key: 'operator', label: 'Operator', kind: 'select', options: ATTRIBUTE_OPERATORS },
    { key: 'value', label: 'Value', kind: 'text', showWhen: { key: 'operator', equals: '__not_empty_op__' } },
  ],
  condition_consent: [
    { key: 'channel', label: 'Channel', kind: 'select', options: CONSENT_CHANNELS },
  ],
  condition_engagement: [
    { key: 'metric', label: 'Metric', kind: 'select', options: ENGAGEMENT_METRICS },
    { key: 'operator', label: 'Operator', kind: 'select', options: [
      { value: 'gte', label: '≥ Greater than or equal' },
      { value: 'lte', label: '≤ Less than or equal' },
      { value: 'equals', label: '= Equals' },
      { value: 'gt', label: '> Greater than' },
      { value: 'lt', label: '< Less than' },
    ]},
    { key: 'value', label: 'Threshold', kind: 'number' },
  ],
  add_to_audience: [
    { key: 'operation', label: 'Operation', kind: 'select', options: [
      { value: 'add', label: 'Add to audience (Add if not exist)' },
      { value: 'purge_refresh', label: 'Purge and refresh audience' },
      { value: 'remove', label: 'Remove from audience' },
      { value: 'create', label: 'Create audience' },
    ]},
    { key: 'audience_name', label: 'Audience Name Pattern', kind: 'text', placeholder: 'VIP_Segment_{{date}}', showWhen: { key: 'operation', equals: 'create' } },
    { key: 'audience_slug', label: 'Audience', kind: 'audience', showWhen: { key: 'operation', equals: '__not_create__' } },
    { key: 'match_field', label: 'Match key(s)', kind: 'text', placeholder: 'email or email, customer_id' },
  ],
  add_to_list: [
    { key: 'list_operation', label: 'Operation', kind: 'select', options: LIST_OPERATIONS },
    { key: 'list_name', label: 'List name', kind: 'text', placeholder: 'Not Engaged' },
  ],
  subscribe_service: [
    { key: 'service_slug', label: 'Information service', kind: 'service' },
  ],
  unsubscribe_service: [
    { key: 'service_slug', label: 'Information service', kind: 'service' },
  ],
  update_profile: [
    { key: 'operation', label: 'Operation', kind: 'select', options: PROFILE_OPERATIONS },
    { key: 'field', label: 'Field name', kind: 'text', placeholder: 'loyalty_tier' },
    { key: 'value', label: 'Value', kind: 'text', showWhen: { key: 'operation', equals: '__not_unset__' } },
  ],
  split_ab: [
    { key: 'split_a_percent', label: 'Path A %', kind: 'number', min: 1, max: 99 },
  ],
  split_random: [
    { key: 'paths', label: 'Number of paths', kind: 'number', min: 2, max: 5 },
    { key: 'distribution', label: 'Distribution', kind: 'select', options: RANDOM_DISTRIBUTION },
    { key: 'split_a_percent', label: 'Path A %', kind: 'number', min: 1, max: 99, showWhen: { key: 'distribution', equals: 'weighted' } },
  ],
  merge_paths: [],
  webhook: [
    { key: 'url', label: 'Endpoint URL', kind: 'text', placeholder: 'https://api.example.com/webhook' },
    { key: 'method', label: 'HTTP method', kind: 'select', options: HTTP_METHODS },
    { key: 'auth_type', label: 'Authentication', kind: 'select', options: WEBHOOK_AUTH_TYPES },
    { key: 'auth_token', label: 'Auth token / credentials', kind: 'text', placeholder: 'Bearer token or user:password', showWhen: { key: 'auth_type', equals: '__not_none__' } },
    { key: 'headers', label: 'Custom headers (JSON)', kind: 'textarea', rows: 2, placeholder: '{"X-Custom": "value"}' },
    { key: 'body_template', label: 'Request body template', kind: 'textarea', rows: 3, placeholder: '{"profile_id": "{{profile.id}}"}' },
    { key: 'timeout_seconds', label: 'Timeout (seconds)', kind: 'number', min: 1, max: 120 },
    { key: 'retry_count', label: 'Retry attempts', kind: 'number', min: 0, max: 5 },
  ],
  exit: [
    { key: 'reason', label: 'Exit reason', kind: 'text', placeholder: 'completed' },
  ],
};
