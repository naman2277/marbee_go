import { supabase } from './supabase';
import { invokeFunction } from './functions';
import { logAudit } from './audit';

// ---------------------------------------------------------------------------
// Types (columns mirror supabase/sql/75_chatbot_module.sql 1:1)
// ---------------------------------------------------------------------------

export type ChatBotStatus = 'draft' | 'testing' | 'published' | 'paused' | 'archived';

export type ExternalApiParam = {
  param_key: string;
  display_label: string;
  ask_question: string;
  data_type: 'string' | 'number' | 'email';
};

export type ExternalApiLookup = {
  lookup_key: string;
  name: string;
  description: string;
  http_method: 'GET' | 'POST';
  url_template: string;
  headers: Record<string, string>;
  body_template: string;
  params: ExternalApiParam[];
  response_path: string;
  error_message: string;
  enabled: boolean;
};

export type SessionLifecycle = {
  idle_followup_enabled: boolean;
  idle_followup_seconds: number;
  idle_followup_message: string;
  idle_close_enabled: boolean;
  idle_close_seconds: number;
  send_summary_on_close: boolean;
  feedback_enabled: boolean;
  persist_on_complete: boolean;
};

export const DEFAULT_SESSION_LIFECYCLE: SessionLifecycle = {
  idle_followup_enabled: true,
  idle_followup_seconds: 120,
  idle_followup_message: 'Hey, are we still connected? Let me know if you need anything else.',
  idle_close_enabled: true,
  idle_close_seconds: 180,
  send_summary_on_close: true,
  feedback_enabled: true,
  persist_on_complete: true,
};

export type DataProcessingTrigger = 'on_complete' | 'scheduled' | 'workflow';

export type DataProcessing = {
  trigger: DataProcessingTrigger;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  workflow_id: string | null;
  workflow_node_id: string | null;
};

export const DEFAULT_DATA_PROCESSING: DataProcessing = {
  trigger: 'on_complete',
  delay_value: 30,
  delay_unit: 'minutes',
  workflow_id: null,
  workflow_node_id: null,
};

export type ChatBotContext = {
  personality: string;
  business_context: string;
  product_info: string;
  faqs: string;
  policies: string;
  conversation_rules: string;
  do_rules: string[];
  dont_rules: string[];
  escalation_rules: string;
  fallback_response: string;
  restricted_topics: string[];
  dynamic_variables: Record<string, string>;
  api_lookups: ExternalApiLookup[];
  session_lifecycle: SessionLifecycle;
  data_processing: DataProcessing;
};

export const DEFAULT_CHATBOT_CONTEXT: ChatBotContext = {
  personality: '',
  business_context: '',
  product_info: '',
  faqs: '',
  policies: '',
  conversation_rules: '',
  do_rules: [],
  dont_rules: [],
  escalation_rules: '',
  fallback_response: "I'm sorry, I don't have that information right now. Would you like me to connect you with our team?",
  restricted_topics: [],
  dynamic_variables: {},
  api_lookups: [],
  session_lifecycle: { ...DEFAULT_SESSION_LIFECYCLE },
  data_processing: { ...DEFAULT_DATA_PROCESSING },
};

export type ChatBot = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  welcome_message: string;
  placeholder_text: string;
  primary_language: string;
  supported_languages: string[];
  business_name: string | null;
  powered_by_text: string;
  show_powered_by: boolean;
  conversation_timeout_minutes: number;
  max_conversation_length: number;
  enable_conversation_history: boolean;
  enable_sentiment_analysis: boolean;
  enable_data_capture: boolean;
  llm_provider_id: string | null;
  llm_temperature: number;
  llm_max_output_tokens: number;
  llm_system_instruction: string | null;
  llm_response_style: 'concise' | 'balanced' | 'detailed';
  llm_streaming: boolean;
  llm_timeout_seconds: number;
  llm_retry_count: number;
  context: ChatBotContext;
  context_version: number;
  target_schema_id: string | null;
  insert_mode: 'insert' | 'update' | 'upsert';
  upsert_key: string | null;
  duplicate_handling: 'update_existing' | 'skip' | 'create_new';
  validation_behaviour: 'reject_invalid' | 'store_anyway';
  status: ChatBotStatus;
  published_version_id: string | null;
  conversation_retention_days: number;
  message_retention_days: number;
  captured_data_retention_days: number;
  anonymous_session_retention_days: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  // LLM health (written by the runtime; read-only in the admin UI)
  llm_last_error: string | null;
  llm_last_error_at: string | null;
  llm_last_success_at: string | null;
};

export type ChatBotListItem = ChatBot & {
  conversations_count: number;
  leads_captured_count: number;
  dominant_sentiment: string | null;
  published_version_label: string | null;
  llm_unhealthy: boolean;
};

/** True when the most recent LLM outcome for this bot was a failure. */
export function isLlmUnhealthy(bot: { llm_last_error_at: string | null; llm_last_success_at: string | null }): boolean {
  if (!bot.llm_last_error_at) return false;
  if (!bot.llm_last_success_at) return true;
  return new Date(bot.llm_last_error_at).getTime() > new Date(bot.llm_last_success_at).getTime();
}

/** Turn a raw provider error into a short, human diagnosis. */
export function describeLlmError(raw: string | null | undefined): { title: string; detail: string } {
  const e = (raw || '').toLowerCase();
  if (!raw) return { title: 'Unknown issue', detail: 'The LLM did not respond.' };
  if (e.includes('no llm api key') || e.includes('no api key')) return { title: 'No API key reachable', detail: raw };
  if (e.includes('insufficient_quota') || e.includes('quota') || e.includes('billing') || e.includes('credit') || e.includes('payment')) return { title: 'Provider credits / billing', detail: 'The provider reports no credits or a billing problem. Top up or fix billing in the provider console.' };
  if (e.includes('rate limit') || e.includes('rate_limit') || e.includes('429') || e.includes('too many requests') || e.includes('daily limit')) return { title: 'Rate / daily limit exceeded', detail: 'The provider is throttling requests. Wait, raise your plan limits, or lower traffic.' };
  if (e.includes('401') || e.includes('invalid api key') || e.includes('incorrect api key') || e.includes('unauthorized') || e.includes('expired')) return { title: 'Invalid or expired API key', detail: 'Re-enter the API key in Settings → AI Engine and Save.' };
  if (e.includes('model') && (e.includes('not found') || e.includes('does not exist') || e.includes('404'))) return { title: 'Model not available', detail: 'The configured model name is wrong or not enabled for this key.' };
  if (e.includes('timeout') || e.includes('aborted')) return { title: 'Request timed out', detail: 'The provider was too slow. Raise the timeout in LLM settings or try again.' };
  return { title: 'LLM error', detail: raw };
}

export async function fetchChatBotLlmHealth(botId: string): Promise<{ llm_last_error: string | null; llm_last_error_at: string | null; llm_last_success_at: string | null }> {
  const { data } = await supabase
    .from('mb_chatbots')
    .select('llm_last_error, llm_last_error_at, llm_last_success_at')
    .eq('id', botId)
    .maybeSingle();
  return data ?? { llm_last_error: null, llm_last_error_at: null, llm_last_success_at: null };
}

export type ChatBotVersion = {
  id: string;
  chatbot_id: string;
  version_label: string;
  version_number: number;
  status: 'draft' | 'published' | 'archived';
  config_snapshot: Record<string, unknown>;
  change_summary: string | null;
  published_at: string | null;
  published_by_name: string | null;
  created_at: string;
};

export type ChatBotFieldDataType = 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'email' | 'phone' | 'json';

export type ChatBotField = {
  id: string;
  chatbot_id: string;
  field_key: string;
  display_label: string;
  description: string | null;
  data_type: ChatBotFieldDataType;
  required: boolean;
  validation: Record<string, unknown>;
  collection_order: number;
  ask_question: string | null;
  retry_count: number;
  default_value: string | null;
  pii_flag: boolean;
};

export type ChatBotTransform =
  | 'none' | 'lowercase' | 'uppercase' | 'trim' | 'format_phone' | 'format_date'
  | 'default_value' | 'static_value' | 'concatenate' | 'expression';

export type ChatBotFieldMapping = {
  id: string;
  chatbot_id: string;
  source_field_key: string;
  target_field: string;
  transformation: ChatBotTransform;
  transformation_config: Record<string, unknown>;
  sort_order: number;
};

export type ChatBotCtaActionType =
  | 'book_now' | 'contact_us' | 'request_callback' | 'submit_lead'
  | 'visit_website' | 'whatsapp' | 'call' | 'open_form' | 'custom_url';

export type ChatBotCta = {
  id: string;
  chatbot_id: string;
  cta_key: string;
  name: string;
  button_label: string;
  description: string | null;
  action_type: ChatBotCtaActionType;
  destination: string | null;
  conditions: { field?: string; operator?: string; value?: string };
  visibility_rule: 'always' | 'conditional';
  tracking_params: Record<string, string>;
  conversion_event: string | null;
  is_active: boolean;
  sort_order: number;
};

export type ChatBotKnowledgeSource = {
  id: string;
  chatbot_id: string;
  source_type: 'content_block' | 'document' | 'faq' | 'knowledge_article' | 'url' | 'product_catalog' | 'schema_data' | 'manual_text';
  source_name: string;
  source_ref: string | null;
  content: string | null;
  status: 'active' | 'inactive';
  indexing_status: 'pending' | 'indexed' | 'failed';
  last_indexed_at: string | null;
  sort_order: number;
};

export type ChatBotConversationStatus = 'active' | 'completed' | 'abandoned' | 'escalated' | 'converted';
export type ChatBotSentiment = 'positive' | 'neutral' | 'negative' | 'mixed';
export type ChatBotLeadStatus = 'new' | 'in_progress' | 'qualified' | 'converted' | 'dropped';

export type ChatBotConversation = {
  id: string;
  chatbot_id: string;
  chatbot_version_id: string | null;
  session_id: string | null;
  visitor_id: string | null;
  customer_id: string | null;
  channel: string;
  started_at: string;
  last_message_at: string;
  ended_at: string | null;
  status: ChatBotConversationStatus;
  language: string | null;
  message_count: number;
  sentiment: ChatBotSentiment | null;
  sentiment_score: number | null;
  intent: string | null;
  lead_status: ChatBotLeadStatus;
  captured_data: Record<string, string>;
  summary: string | null;
  metadata: Record<string, unknown>;
  feedback_rating: number | null;
  feedback_comment: string | null;
  closed_reason: string | null;
};

export type ChatBotMessage = {
  id: string;
  conversation_id: string;
  sequence_number: number;
  sender_type: 'user' | 'bot' | 'system' | 'agent';
  message_type: string;
  message_text: string | null;
  message_json: Record<string, unknown> | null;
  llm_provider: string | null;
  llm_model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  sentiment: ChatBotSentiment | null;
  sentiment_score: number | null;
  intent: string | null;
  created_at: string;
};

export type ChatBotCapturedData = {
  id: string;
  conversation_id: string;
  field_name: string;
  field_value: string | null;
  normalized_value: string | null;
  data_type: string;
  confidence: number;
  mapped_status: 'pending' | 'mapped' | 'failed';
  captured_at: string;
};

export type ChatBotCtaEvent = {
  id: string;
  conversation_id: string;
  cta_id: string;
  event_type: 'shown' | 'clicked' | 'completed' | 'failed';
  destination: string | null;
  created_at: string;
};

export type ChatBotPublishConfig = {
  id: string;
  chatbot_id: string;
  public_url_enabled: boolean;
  public_slug: string;
  iframe_enabled: boolean;
  iframe_width: string;
  iframe_height: string;
  iframe_border_radius: string;
  iframe_theme: 'light' | 'dark';
  iframe_position: string;
  widget_enabled: boolean;
  widget_position: 'bottom-right' | 'bottom-left';
  widget_icon: string | null;
  widget_greeting: string | null;
  widget_primary_color: string;
  api_enabled: boolean;
  allowed_domains: string[];
};

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

export function slugifyBotName(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chat-bot';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Bot CRUD
// ---------------------------------------------------------------------------

export async function fetchChatBots(tenantId: string, environment: string): Promise<ChatBotListItem[]> {
  const { data: bots, error } = await supabase
    .from('mb_chatbots')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  if (!bots?.length) return [];

  const ids = bots.map((b) => b.id);

  const [{ data: convCounts }, { data: leadCounts }, { data: versions }] = await Promise.all([
    supabase.from('mb_chatbot_conversations').select('chatbot_id, sentiment').in('chatbot_id', ids),
    supabase.from('mb_chatbot_captured_data').select('chatbot_id, conversation_id').in('chatbot_id', ids),
    supabase.from('mb_chatbot_versions').select('id, chatbot_id, version_label').in('chatbot_id', ids).eq('status', 'published'),
  ]);

  const convByBot = new Map<string, { total: number; sentiments: Record<string, number> }>();
  for (const row of convCounts || []) {
    const entry = convByBot.get(row.chatbot_id) || { total: 0, sentiments: {} };
    entry.total += 1;
    if (row.sentiment) entry.sentiments[row.sentiment] = (entry.sentiments[row.sentiment] || 0) + 1;
    convByBot.set(row.chatbot_id, entry);
  }

  const leadsByBot = new Map<string, Set<string>>();
  for (const row of leadCounts || []) {
    if (!leadsByBot.has(row.chatbot_id)) leadsByBot.set(row.chatbot_id, new Set());
    leadsByBot.get(row.chatbot_id)!.add(row.conversation_id);
  }

  const versionByBot = new Map<string, string>();
  for (const v of versions || []) versionByBot.set(v.chatbot_id, v.version_label);

  return bots.map((b) => {
    const conv = convByBot.get(b.id);
    const dominant = conv
      ? Object.entries(conv.sentiments).sort((a, c) => c[1] - a[1])[0]?.[0] ?? null
      : null;
    return {
      ...b,
      conversations_count: conv?.total ?? 0,
      leads_captured_count: leadsByBot.get(b.id)?.size ?? 0,
      dominant_sentiment: dominant,
      published_version_label: versionByBot.get(b.id) ?? null,
      llm_unhealthy: isLlmUnhealthy(b),
    } as ChatBotListItem;
  });
}

export async function fetchChatBot(id: string): Promise<ChatBot | null> {
  const { data, error } = await supabase.from('mb_chatbots').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as ChatBot | null;
}

export type ChatBotFullConfig = {
  bot: ChatBot;
  fields: ChatBotField[];
  mappings: ChatBotFieldMapping[];
  ctas: ChatBotCta[];
  knowledgeSources: ChatBotKnowledgeSource[];
  publishConfig: ChatBotPublishConfig | null;
};

export async function fetchChatBotFullConfig(id: string): Promise<ChatBotFullConfig | null> {
  const [{ data: bot }, { data: fields }, { data: mappings }, { data: ctas }, { data: knowledge }, { data: publish }] = await Promise.all([
    supabase.from('mb_chatbots').select('*').eq('id', id).maybeSingle(),
    supabase.from('mb_chatbot_fields').select('*').eq('chatbot_id', id).order('collection_order'),
    supabase.from('mb_chatbot_field_mappings').select('*').eq('chatbot_id', id).order('sort_order'),
    supabase.from('mb_chatbot_ctas').select('*').eq('chatbot_id', id).order('sort_order'),
    supabase.from('mb_chatbot_knowledge_sources').select('*').eq('chatbot_id', id).order('sort_order'),
    supabase.from('mb_chatbot_publish_configs').select('*').eq('chatbot_id', id).maybeSingle(),
  ]);
  if (!bot) return null;
  return {
    bot: bot as ChatBot,
    fields: (fields || []) as ChatBotField[],
    mappings: (mappings || []) as ChatBotFieldMapping[],
    ctas: (ctas || []) as ChatBotCta[],
    knowledgeSources: (knowledge || []) as ChatBotKnowledgeSource[],
    publishConfig: publish as ChatBotPublishConfig | null,
  };
}

export async function createChatBot(tenantId: string, environment: string, name: string): Promise<ChatBot> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('mb_chatbots')
    .insert({
      tenant_id: tenantId,
      environment,
      name,
      slug: slugifyBotName(name),
      created_by: userData?.user?.id ?? null,
      created_by_name: (userData?.user?.user_metadata?.name as string) ?? userData?.user?.email ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await supabase.from('mb_chatbot_publish_configs').insert({
    chatbot_id: data.id,
    tenant_id: tenantId,
    environment,
    public_slug: (data as ChatBot).slug,
  });

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'chatbot',
    resourceId: data.id,
    resourceName: `Created chat bot "${name}"`,
  });

  return data as ChatBot;
}

export async function updateChatBot(id: string, patch: Partial<ChatBot>): Promise<ChatBot> {
  const { data, error } = await supabase.from('mb_chatbots').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  void logAudit({
    tenantId: (data as ChatBot).tenant_id,
    environment: (data as ChatBot).environment,
    action: 'update',
    resourceType: 'chatbot',
    resourceId: id,
    resourceName: `Updated chat bot "${(data as ChatBot).name}"`,
  });
  return data as ChatBot;
}

export async function duplicateChatBot(id: string): Promise<ChatBot> {
  const full = await fetchChatBotFullConfig(id);
  if (!full) throw new Error('Chat bot not found');
  const { bot, fields, mappings, ctas, knowledgeSources } = full;

  const copy = await createChatBot(bot.tenant_id, bot.environment, `${bot.name} (Copy)`);
  await updateChatBot(copy.id, {
    description: bot.description,
    avatar_url: bot.avatar_url,
    welcome_message: bot.welcome_message,
    placeholder_text: bot.placeholder_text,
    primary_language: bot.primary_language,
    supported_languages: bot.supported_languages,
    business_name: bot.business_name,
    powered_by_text: bot.powered_by_text,
    show_powered_by: bot.show_powered_by,
    conversation_timeout_minutes: bot.conversation_timeout_minutes,
    max_conversation_length: bot.max_conversation_length,
    enable_conversation_history: bot.enable_conversation_history,
    enable_sentiment_analysis: bot.enable_sentiment_analysis,
    enable_data_capture: bot.enable_data_capture,
    llm_provider_id: bot.llm_provider_id,
    llm_temperature: bot.llm_temperature,
    llm_max_output_tokens: bot.llm_max_output_tokens,
    llm_system_instruction: bot.llm_system_instruction,
    llm_response_style: bot.llm_response_style,
    llm_streaming: bot.llm_streaming,
    llm_timeout_seconds: bot.llm_timeout_seconds,
    llm_retry_count: bot.llm_retry_count,
    context: bot.context,
    target_schema_id: bot.target_schema_id,
    insert_mode: bot.insert_mode,
    upsert_key: bot.upsert_key,
    duplicate_handling: bot.duplicate_handling,
    validation_behaviour: bot.validation_behaviour,
    conversation_retention_days: bot.conversation_retention_days,
    message_retention_days: bot.message_retention_days,
    captured_data_retention_days: bot.captured_data_retention_days,
    anonymous_session_retention_days: bot.anonymous_session_retention_days,
  });

  if (fields.length) {
    await supabase.from('mb_chatbot_fields').insert(
      fields.map((f) => ({ ...stripId(f), chatbot_id: copy.id, tenant_id: bot.tenant_id, environment: bot.environment })),
    );
  }
  if (ctas.length) {
    await supabase.from('mb_chatbot_ctas').insert(
      ctas.map((c) => ({ ...stripId(c), chatbot_id: copy.id, tenant_id: bot.tenant_id, environment: bot.environment })),
    );
  }
  if (mappings.length) {
    await supabase.from('mb_chatbot_field_mappings').insert(
      mappings.map((m) => ({ ...stripId(m), chatbot_id: copy.id, tenant_id: bot.tenant_id, environment: bot.environment })),
    );
  }
  if (knowledgeSources.length) {
    await supabase.from('mb_chatbot_knowledge_sources').insert(
      knowledgeSources.map((k) => ({ ...stripId(k), chatbot_id: copy.id, tenant_id: bot.tenant_id, environment: bot.environment })),
    );
  }

  return copy;
}

function stripId<T extends { id: string; chatbot_id: string }>(row: T): Omit<T, 'id' | 'chatbot_id'> {
  const { id: _id, chatbot_id: _cid, ...rest } = row;
  return rest;
}

export async function deleteChatBot(id: string): Promise<void> {
  const { error } = await supabase.from('mb_chatbots').delete().eq('id', id);
  if (error) throw error;
}

export async function setChatBotStatus(id: string, status: ChatBotStatus): Promise<ChatBot> {
  return updateChatBot(id, { status });
}

// ---------------------------------------------------------------------------
// Publish / version
// ---------------------------------------------------------------------------

export type PublishReadiness = { ready: boolean; issues: string[] };

export function checkPublishReadiness(full: ChatBotFullConfig): PublishReadiness {
  const issues: string[] = [];
  const { bot, fields, mappings, ctas } = full;
  if (!bot.name?.trim()) issues.push('Bot name is required.');
  if (!bot.llm_provider_id) issues.push('Select an LLM provider in LLM Configuration.');
  if (!bot.welcome_message?.trim()) issues.push('A welcome message is required.');
  if (!bot.context.business_context?.trim()) issues.push('Add business context so the bot knows what it represents.');
  if (bot.enable_data_capture && bot.target_schema_id) {
    const requiredFields = fields.filter((f) => f.required);
    if (requiredFields.length > 0 && mappings.length === 0) {
      issues.push('Map at least the required data-capture fields to the target schema.');
    }
    if (bot.insert_mode !== 'insert' && !bot.upsert_key) {
      issues.push('Select an upsert key for the target schema.');
    }
  }
  for (const cta of ctas) {
    if (cta.action_type === 'custom_url' && !cta.destination) issues.push(`CTA "${cta.name}" needs a destination URL.`);
    if (cta.visibility_rule === 'conditional' && !cta.conditions?.field) issues.push(`CTA "${cta.name}" has a conditional visibility rule with no condition set.`);
  }
  return { ready: issues.length === 0, issues };
}

export async function publishChatBot(id: string): Promise<ChatBot> {
  const full = await fetchChatBotFullConfig(id);
  if (!full) throw new Error('Chat bot not found');
  const readiness = checkPublishReadiness(full);
  if (!readiness.ready) throw new Error(readiness.issues[0]);

  const { data: lastVersion } = await supabase
    .from('mb_chatbot_versions')
    .select('version_number')
    .eq('chatbot_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNumber = (lastVersion?.version_number ?? 0) + 1;
  const label = nextNumber === 1 ? 'v1' : `v1.${nextNumber - 1}`;

  const { data: userData } = await supabase.auth.getUser();
  const snapshot = {
    bot: full.bot,
    fields: full.fields,
    mappings: full.mappings,
    ctas: full.ctas,
    knowledgeSources: full.knowledgeSources,
  };

  const { data: version, error } = await supabase
    .from('mb_chatbot_versions')
    .insert({
      chatbot_id: id,
      tenant_id: full.bot.tenant_id,
      environment: full.bot.environment,
      version_label: label,
      version_number: nextNumber,
      status: 'published',
      config_snapshot: snapshot,
      published_at: new Date().toISOString(),
      published_by: userData?.user?.id ?? null,
      published_by_name: (userData?.user?.user_metadata?.name as string) ?? userData?.user?.email ?? null,
      created_by: userData?.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  const updated = await updateChatBot(id, { status: 'published', published_version_id: version.id });

  void logAudit({
    tenantId: full.bot.tenant_id,
    environment: full.bot.environment,
    action: 'publish',
    resourceType: 'chatbot',
    resourceId: id,
    resourceName: `Published "${full.bot.name}" as ${label}`,
  });

  return updated;
}

export async function fetchChatBotVersions(chatbotId: string): Promise<ChatBotVersion[]> {
  const { data, error } = await supabase
    .from('mb_chatbot_versions')
    .select('id, chatbot_id, version_label, version_number, status, config_snapshot, change_summary, published_at, published_by_name, created_at')
    .eq('chatbot_id', chatbotId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data || []) as ChatBotVersion[];
}

// ---------------------------------------------------------------------------
// Section bulk-save helpers (replace-all pattern, mirrors forms/journeys UX)
// ---------------------------------------------------------------------------

// Strip client-only/PK keys so the DB assigns a fresh id via its default.
// Setting `id: undefined` in a spread is NOT reliable for array inserts —
// PostgREST can serialize the missing key as an explicit NULL and violate the
// NOT NULL primary key. Deleting the key entirely is the only safe way.
function forInsert<T extends Record<string, unknown>>(row: T, scope: { chatbot_id: string; tenant_id: string; environment: string }): Record<string, unknown> {
  const rest = { ...row };
  delete rest.id;
  delete rest.chatbot_id;
  delete rest.tenant_id;
  return { ...rest, ...scope };
}

export async function saveChatBotFields(chatbotId: string, tenantId: string, environment: string, fields: Array<Omit<ChatBotField, 'id' | 'chatbot_id'> & { id?: string }>): Promise<void> {
  await supabase.from('mb_chatbot_fields').delete().eq('chatbot_id', chatbotId);
  // Drop rows with a blank key and de-dupe by field_key so a stray duplicate
  // can't trip UNIQUE(chatbot_id, field_key) and fail the whole save.
  const seen = new Set<string>();
  const clean = fields.filter((f) => {
    const key = f.field_key?.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (clean.length === 0) return;
  const scope = { chatbot_id: chatbotId, tenant_id: tenantId, environment };
  const { error } = await supabase.from('mb_chatbot_fields').insert(clean.map((f) => forInsert(f, scope)));
  if (error) throw error;
}

export async function saveChatBotMappings(chatbotId: string, tenantId: string, environment: string, mappings: Array<Omit<ChatBotFieldMapping, 'id' | 'chatbot_id'> & { id?: string }>): Promise<void> {
  await supabase.from('mb_chatbot_field_mappings').delete().eq('chatbot_id', chatbotId);
  // Drop incomplete rows (no source or target) and any duplicate targets — both
  // would otherwise trip the UNIQUE(chatbot_id, target_field) constraint and
  // fail the whole save.
  const seen = new Set<string>();
  const clean = mappings.filter((m) => {
    if (!m.source_field_key?.trim() || !m.target_field?.trim()) return false;
    if (seen.has(m.target_field)) return false;
    seen.add(m.target_field);
    return true;
  });
  if (clean.length === 0) return;
  const scope = { chatbot_id: chatbotId, tenant_id: tenantId, environment };
  const { error } = await supabase.from('mb_chatbot_field_mappings').insert(clean.map((m) => forInsert(m, scope)));
  if (error) throw error;
}

export async function saveChatBotCtas(chatbotId: string, tenantId: string, environment: string, ctas: Array<Omit<ChatBotCta, 'id' | 'chatbot_id'> & { id?: string }>): Promise<void> {
  await supabase.from('mb_chatbot_ctas').delete().eq('chatbot_id', chatbotId);
  // De-dupe by cta_key so a stray duplicate can't trip UNIQUE(chatbot_id, cta_key).
  const seen = new Set<string>();
  const clean = ctas.filter((c) => {
    const key = c.cta_key?.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (clean.length === 0) return;
  const scope = { chatbot_id: chatbotId, tenant_id: tenantId, environment };
  const { error } = await supabase.from('mb_chatbot_ctas').insert(clean.map((c) => forInsert(c, scope)));
  if (error) throw error;
}

export async function saveChatBotKnowledgeSources(chatbotId: string, tenantId: string, environment: string, sources: Array<Omit<ChatBotKnowledgeSource, 'id' | 'chatbot_id'> & { id?: string }>): Promise<void> {
  await supabase.from('mb_chatbot_knowledge_sources').delete().eq('chatbot_id', chatbotId);
  if (sources.length === 0) return;
  const scope = { chatbot_id: chatbotId, tenant_id: tenantId, environment };
  const { error } = await supabase.from('mb_chatbot_knowledge_sources').insert(
    sources.map((s) => ({ ...forInsert(s, scope), indexing_status: 'indexed', last_indexed_at: new Date().toISOString() })),
  );
  if (error) throw error;
}

export async function saveChatBotPublishConfig(chatbotId: string, patch: Partial<ChatBotPublishConfig>): Promise<ChatBotPublishConfig | null> {
  // Update the existing row; if none exists yet (older bot, or seed), create it
  // so saving never fails on a missing publish-config row.
  const { data: updated, error: updErr } = await supabase
    .from('mb_chatbot_publish_configs')
    .update(patch)
    .eq('chatbot_id', chatbotId)
    .select('*');
  if (updErr) throw updErr;
  if (updated && updated.length > 0) return updated[0] as ChatBotPublishConfig;

  // No row yet — provision one, deriving required fields from the bot.
  const { data: bot } = await supabase
    .from('mb_chatbots')
    .select('tenant_id, environment, slug')
    .eq('id', chatbotId)
    .maybeSingle();
  if (!bot) return null;

  const { data: inserted, error: insErr } = await supabase
    .from('mb_chatbot_publish_configs')
    .insert({ chatbot_id: chatbotId, tenant_id: bot.tenant_id, environment: bot.environment, public_slug: bot.slug, ...patch })
    .select('*')
    .single();
  if (insErr) throw insErr;
  return inserted as ChatBotPublishConfig;
}

// ---------------------------------------------------------------------------
// Conversations / messages / captured data
// ---------------------------------------------------------------------------

export type ConversationFilters = {
  status?: ChatBotConversationStatus;
  sentiment?: ChatBotSentiment;
  leadStatus?: ChatBotLeadStatus;
  search?: string;
};

const CONVERSATIONS_PAGE_SIZE = 25;

export async function fetchConversations(
  chatbotId: string,
  opts: { page?: number; filters?: ConversationFilters } = {},
): Promise<{ conversations: ChatBotConversation[]; totalCount: number; page: number; pageSize: number }> {
  const page = opts.page ?? 1;
  const from = (page - 1) * CONVERSATIONS_PAGE_SIZE;
  const to = from + CONVERSATIONS_PAGE_SIZE - 1;

  let query = supabase
    .from('mb_chatbot_conversations')
    .select('*', { count: 'exact' })
    .eq('chatbot_id', chatbotId)
    .order('last_message_at', { ascending: false })
    .range(from, to);

  if (opts.filters?.status) query = query.eq('status', opts.filters.status);
  if (opts.filters?.sentiment) query = query.eq('sentiment', opts.filters.sentiment);
  if (opts.filters?.leadStatus) query = query.eq('lead_status', opts.filters.leadStatus);
  if (opts.filters?.search) {
    const term = opts.filters.search;
    query = query.or(`visitor_id.ilike.%${term}%,captured_data->>first_name.ilike.%${term}%,captured_data->>last_name.ilike.%${term}%,captured_data->>email.ilike.%${term}%,captured_data->>mobile.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    conversations: (data || []) as ChatBotConversation[],
    totalCount: count ?? 0,
    page,
    pageSize: CONVERSATIONS_PAGE_SIZE,
  };
}

export async function fetchConversationDetail(conversationId: string): Promise<{
  conversation: ChatBotConversation;
  messages: ChatBotMessage[];
  capturedData: ChatBotCapturedData[];
  ctaEvents: ChatBotCtaEvent[];
} | null> {
  const [{ data: conversation }, { data: messages }, { data: capturedData }, { data: ctaEvents }] = await Promise.all([
    supabase.from('mb_chatbot_conversations').select('*').eq('id', conversationId).maybeSingle(),
    supabase.from('mb_chatbot_messages').select('*').eq('conversation_id', conversationId).order('sequence_number'),
    supabase.from('mb_chatbot_captured_data').select('*').eq('conversation_id', conversationId),
    supabase.from('mb_chatbot_cta_events').select('*').eq('conversation_id', conversationId).order('created_at'),
  ]);
  if (!conversation) return null;
  return {
    conversation: conversation as ChatBotConversation,
    messages: (messages || []) as ChatBotMessage[],
    capturedData: (capturedData || []) as ChatBotCapturedData[],
    ctaEvents: (ctaEvents || []) as ChatBotCtaEvent[],
  };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export type ChatBotAnalytics = {
  totalConversations: number;
  activeConversations: number;
  completedConversations: number;
  abandonedConversations: number;
  uniqueVisitors: number;
  leadsCaptured: number;
  qualifiedLeads: number;
  ctaClicks: number;
  ctaConversionRate: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  mixedCount: number;
  avgMessages: number;
  avgResponseTimeMs: number;
  avgDurationSeconds: number;
  totalTokens: number;
  avgFeedbackRating: number | null;
  feedbackCount: number;
};

export async function fetchChatBotAnalytics(chatbotId: string, sinceIso?: string, untilIso?: string): Promise<ChatBotAnalytics> {
  let convQuery = supabase
    .from('mb_chatbot_conversations')
    .select('id, visitor_id, status, sentiment, lead_status, message_count, started_at, ended_at, last_message_at, feedback_rating')
    .eq('chatbot_id', chatbotId);
  if (sinceIso) convQuery = convQuery.gte('started_at', sinceIso);
  if (untilIso) convQuery = convQuery.lt('started_at', untilIso);
  const { data: conversations, error } = await convQuery;
  if (error) throw error;

  const rows = conversations || [];
  const total = rows.length;
  const visitorSet = new Set(rows.map((r) => r.visitor_id).filter(Boolean));
  const durations = rows
    .filter((r) => r.ended_at)
    .map((r) => (new Date(r.ended_at as string).getTime() - new Date(r.started_at).getTime()) / 1000)
    .filter((s) => s >= 0);

  const [{ count: ctaShown }, { count: ctaClicked }, { data: messages }] = await Promise.all([
    supabase.from('mb_chatbot_cta_events').select('id', { count: 'exact', head: true }).eq('chatbot_id', chatbotId).eq('event_type', 'shown'),
    supabase.from('mb_chatbot_cta_events').select('id', { count: 'exact', head: true }).eq('chatbot_id', chatbotId).in('event_type', ['clicked', 'completed']),
    supabase.from('mb_chatbot_messages').select('latency_ms, total_tokens, sender_type').in('conversation_id', rows.map((r) => r.id)),
  ]);

  const botMessages = (messages || []).filter((m) => m.sender_type === 'bot');
  const avgLatency = botMessages.length
    ? botMessages.reduce((sum, m) => sum + (m.latency_ms || 0), 0) / botMessages.length
    : 0;
  const totalTokens = (messages || []).reduce((sum, m) => sum + (m.total_tokens || 0), 0);

  const rated = rows.filter((r) => r.feedback_rating != null);
  const avgRating = rated.length
    ? Math.round((rated.reduce((s, r) => s + (r.feedback_rating as number), 0) / rated.length) * 10) / 10
    : null;

  return {
    totalConversations: total,
    activeConversations: rows.filter((r) => r.status === 'active').length,
    completedConversations: rows.filter((r) => r.status === 'completed' || r.status === 'converted').length,
    abandonedConversations: rows.filter((r) => r.status === 'abandoned').length,
    uniqueVisitors: visitorSet.size,
    leadsCaptured: rows.filter((r) => r.lead_status !== 'new').length,
    qualifiedLeads: rows.filter((r) => r.lead_status === 'qualified' || r.lead_status === 'converted').length,
    ctaClicks: ctaClicked || 0,
    ctaConversionRate: ctaShown ? Math.round(((ctaClicked || 0) / ctaShown) * 1000) / 10 : 0,
    positiveCount: rows.filter((r) => r.sentiment === 'positive').length,
    neutralCount: rows.filter((r) => r.sentiment === 'neutral').length,
    negativeCount: rows.filter((r) => r.sentiment === 'negative').length,
    mixedCount: rows.filter((r) => r.sentiment === 'mixed').length,
    avgMessages: total ? Math.round((rows.reduce((s, r) => s + (r.message_count || 0), 0) / total) * 10) / 10 : 0,
    avgResponseTimeMs: Math.round(avgLatency),
    avgDurationSeconds: durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0,
    totalTokens,
    avgFeedbackRating: avgRating,
    feedbackCount: rated.length,
  };
}

// ---------------------------------------------------------------------------
// Runtime invocations (Edge Function — never talks to LLM/keys from the browser)
// ---------------------------------------------------------------------------

export type RuntimeCtaPayload = { id: string; cta_key: string; name: string; button_label: string; action_type: string; destination: string | null; tracking_params: Record<string, string> };

export type RuntimeSendMessageResult = {
  conversation_id: string;
  session_id: string;
  message_id: string | null;
  reply: string;
  captured: Record<string, string>;
  intent: string;
  sentiment: ChatBotSentiment;
  sentiment_score: number;
  ctas: RuntimeCtaPayload[];
  escalate: boolean;
  lead_status: ChatBotLeadStatus;
  status: string;
  message_count: number;
  request_id: string;
  llm_degraded?: boolean;
};

export async function runtimeGetBot(params: { botId?: string; publicSlug?: string; mode?: 'live' | 'test' }) {
  const res = await invokeFunction<{ bot: Record<string, unknown> }>('chatbot-runtime', {
    action: 'get_bot',
    bot_id: params.botId,
    public_slug: params.publicSlug,
    mode: params.mode || 'live',
  });
  if (!res.ok) throw new Error(res.error || 'Could not load this chat bot.');
  return res.data!.bot;
}

export async function runtimeStartSession(botId: string, mode: 'live' | 'test', visitorId?: string) {
  const res = await invokeFunction<{ session_id: string; visitor_id: string; conversation_id: string | null }>('chatbot-runtime', {
    action: 'start_session',
    bot_id: botId,
    visitor_id: visitorId,
    mode,
  });
  if (!res.ok) throw new Error(res.error || 'Could not start a session.');
  return res.data!;
}

export async function runtimeSendMessage(input: {
  botId: string;
  sessionId: string;
  visitorId: string;
  message: string;
  clientMessageId?: string;
  mode: 'live' | 'test';
}): Promise<RuntimeSendMessageResult> {
  const res = await invokeFunction<RuntimeSendMessageResult>('chatbot-runtime', {
    action: 'send_message',
    bot_id: input.botId,
    session_id: input.sessionId,
    visitor_id: input.visitorId,
    message: input.message,
    client_message_id: input.clientMessageId,
    mode: input.mode,
  });
  if (!res.ok) throw new Error(res.error || 'The assistant could not respond right now.');
  return res.data!;
}

export async function runtimeExecuteCta(input: {
  conversationId: string;
  ctaId: string;
  eventType: 'clicked' | 'completed' | 'failed';
  visitorId?: string;
}) {
  const res = await invokeFunction('chatbot-runtime', {
    action: 'execute_cta',
    conversation_id: input.conversationId,
    cta_id: input.ctaId,
    event_type: input.eventType,
    visitor_id: input.visitorId,
  });
  if (!res.ok) throw new Error(res.error || 'Could not record CTA event.');
  return res.data;
}

// ---------------------------------------------------------------------------
// Session lifecycle runtime actions
// ---------------------------------------------------------------------------

export async function runtimeIdleFollowup(input: { botId: string; sessionId: string; conversationId: string; mode: 'live' | 'test' }) {
  const res = await invokeFunction<{ success?: boolean; skipped?: boolean; message?: string; message_type?: string }>('chatbot-runtime', {
    action: 'idle_followup',
    bot_id: input.botId,
    session_id: input.sessionId,
    conversation_id: input.conversationId,
    mode: input.mode,
  });
  if (!res.ok) throw new Error(res.error || 'Could not send idle followup.');
  return res.data!;
}

export async function runtimeCloseSession(input: { botId: string; sessionId: string; conversationId: string; reason: string; mode: 'live' | 'test' }) {
  const res = await invokeFunction<{ success?: boolean; skipped?: boolean; status?: string; closed_reason?: string; summary?: string | null; show_feedback?: boolean }>('chatbot-runtime', {
    action: 'close_session',
    bot_id: input.botId,
    session_id: input.sessionId,
    conversation_id: input.conversationId,
    reason: input.reason,
    mode: input.mode,
  });
  if (!res.ok) throw new Error(res.error || 'Could not close session.');
  return res.data!;
}

export async function runtimeSubmitFeedback(input: { conversationId: string; rating: number; comment?: string }) {
  const res = await invokeFunction<{ success?: boolean; skipped?: boolean }>('chatbot-runtime', {
    action: 'submit_feedback',
    conversation_id: input.conversationId,
    rating: input.rating,
    comment: input.comment,
  });
  if (!res.ok) throw new Error(res.error || 'Could not submit feedback.');
  return res.data!;
}

// ---------------------------------------------------------------------------
// Embed snippet generation
// ---------------------------------------------------------------------------

export function chatBotPublicUrl(publicSlug: string): string {
  return `${window.location.origin}/b/${publicSlug}`;
}

export function chatBotEmbedUrl(publicSlug: string): string {
  return `${window.location.origin}/embed/${publicSlug}`;
}

export function buildIframeSnippet(publish: ChatBotPublishConfig): string {
  return `<iframe
  src="${chatBotEmbedUrl(publish.public_slug)}"
  width="${publish.iframe_width}"
  height="${publish.iframe_height}"
  style="border:0;border-radius:${publish.iframe_border_radius}px;"
  title="Chat bot"
></iframe>`;
}

export function buildWidgetSnippet(publish: ChatBotPublishConfig): string {
  return `<script>
  (function (m, a, r, b, e, e2) {
    m.MarbeeChatConfig = { botSlug: "${publish.public_slug}", position: "${publish.widget_position}", primaryColor: "${publish.widget_primary_color}" };
    e = a.createElement(r); e.async = true; e.src = b + "/widget.js";
    e2 = a.getElementsByTagName(r)[0]; e2.parentNode.insertBefore(e, e2);
  })(window, document, "script", "${window.location.origin}");
</script>`;
}

export function buildQrCodeUrl(targetUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(targetUrl)}`;
}
