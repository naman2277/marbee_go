import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlarmClock,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Braces,
  Brain,
  CalendarClock,
  Calculator,
  Code2,
  Combine,
  Copy,
  Database,
  Download,
  FileInput,
  FileSpreadsheet,
  FileText,
  Filter,
  FlaskConical,
  Gauge,
  GitBranch,
  GitFork,
  Globe,
  Hand,
  HardDrive,
  Hash,
  Languages,
  Layers,
  Link2,
  ListFilter,
  Mail,
  Merge,
  MessageCircle,
  MessageSquare,
  Paintbrush,
  PenLine,
  Plug,
  Repeat,
  Route,
  ScanSearch,
  Server,
  Shield,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Split,
  Star,
  StopCircle,
  Table2,
  Tags,
  Timer,
  Upload,
  UserCog,
  UserPlus,
  Users,
  Wand2,
  Webhook,
  Workflow,
  Zap,
  Ban,
  RefreshCw,
  AlertTriangle,
  FileSearch,
  Clock,
  Bot,
  Inbox,
  Share2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type NodeCategory =
  | 'Triggers'
  | 'Sources'
  | 'Transform'
  | 'Decisioning'
  | 'AI & Personalization'
  | 'Actions'
  | 'Control Flow'
  | 'Monitoring';

export type NodeIconKey =
  // Triggers
  | 'schedule' | 'webhook' | 'event_trigger' | 'api_trigger' | 'manual_trigger' | 'file_trigger' | 'form_trigger' | 'chat_trigger' | 'workflow_trigger'
  // Sources
  | 'database' | 'plug' | 'globe' | 'file' | 'sql' | 'db_query' | 'api_source' | 'object_storage'
  // Transform
  | 'select_fields' | 'map' | 'rename' | 'filter' | 'calculate' | 'format' | 'join'
  | 'aggregate' | 'dedupe' | 'enrich' | 'lookup' | 'split' | 'merge_transform'
  | 'set_union' | 'set_intersection' | 'set_exclusion'
  // Decisioning
  | 'condition' | 'audience_split' | 'ab_test' | 'eligibility' | 'frequency_cap'
  | 'suppression' | 'decisioning' | 'score'
  // AI
  | 'ai_generate' | 'ai_classify' | 'ai_extract' | 'ai_translate' | 'ai_personalize' | 'recommendation'
  // Actions
  | 'email' | 'sms' | 'whatsapp' | 'push' | 'webhook_out' | 'http_api'
  | 'crm_update' | 'db_write' | 'add_audience' | 'export_file'
  // Control Flow
  | 'wait' | 'delay' | 'loop' | 'batch' | 'parallel' | 'merge_flow' | 'sub_workflow' | 'end'
  // Monitoring
  | 'log' | 'track_event' | 'update_profile' | 'workflow_status' | 'alert'
  // Legacy
  | 'validate' | 'schema_check' | 'upload' | 'download' | 'connector_out' | 'branch' | 'switch'
  | 'expression' | 'script';

export type NodePaletteItem = {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  icon: NodeIconKey;
  tags: string[];
  outputs?: { id: string; label: string }[];
  popular?: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════
// Icon registry
// ═══════════════════════════════════════════════════════════════════════════

export const NODE_ICONS: Record<NodeIconKey, LucideIcon> = {
  // Triggers
  schedule: CalendarClock,
  webhook: Webhook,
  event_trigger: Zap,
  api_trigger: Globe,
  manual_trigger: Hand,
  file_trigger: FileInput,
  form_trigger: Inbox,
  chat_trigger: Bot,
  workflow_trigger: Share2,
  // Sources
  database: Database,
  plug: Plug,
  globe: Globe,
  file: FileSpreadsheet,
  sql: Code2,
  db_query: Server,
  api_source: Globe,
  object_storage: HardDrive,
  // Transform
  select_fields: ListFilter,
  map: ArrowLeftRight,
  rename: PenLine,
  filter: Filter,
  calculate: Calculator,
  format: Paintbrush,
  join: Link2,
  aggregate: Layers,
  dedupe: Copy,
  enrich: Sparkles,
  lookup: BookOpen,
  split: Split,
  merge_transform: Merge,
  set_union: Combine,
  set_intersection: Shuffle,
  set_exclusion: Ban,
  // Decisioning
  condition: GitBranch,
  audience_split: Users,
  ab_test: FlaskConical,
  eligibility: Shield,
  frequency_cap: Clock,
  suppression: Ban,
  decisioning: Brain,
  score: BarChart3,
  // AI
  ai_generate: Sparkles,
  ai_classify: Tags,
  ai_extract: FileSearch,
  ai_translate: Languages,
  ai_personalize: Wand2,
  recommendation: Star,
  // Actions
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  push: Bell,
  webhook_out: Webhook,
  http_api: Globe,
  crm_update: RefreshCw,
  db_write: Database,
  add_audience: UserPlus,
  export_file: Download,
  // Control Flow
  wait: Clock,
  delay: Timer,
  loop: Repeat,
  batch: Boxes,
  parallel: GitFork,
  merge_flow: Combine,
  sub_workflow: Workflow,
  end: StopCircle,
  // Monitoring
  log: FileText,
  track_event: Activity,
  update_profile: UserCog,
  workflow_status: Gauge,
  alert: AlertTriangle,
  // Legacy
  validate: Shield,
  schema_check: ShieldCheck,
  upload: Upload,
  download: Download,
  connector_out: Plug,
  branch: GitBranch,
  switch: Route,
  expression: Sparkles,
  script: Braces,
};

// ═══════════════════════════════════════════════════════════════════════════
// Categories
// ═══════════════════════════════════════════════════════════════════════════

export const NODE_CATEGORIES: NodeCategory[] = [
  'Triggers',
  'Sources',
  'Transform',
  'Decisioning',
  'AI & Personalization',
  'Actions',
  'Control Flow',
  'Monitoring',
];

// ═══════════════════════════════════════════════════════════════════════════
// Accent helpers per category
// ═══════════════════════════════════════════════════════════════════════════

const CAT_ACCENTS: Record<NodeCategory, { accent: string; bg: string; border: string }> = {
  Triggers:              { accent: 'text-fuchsia-700',  bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-300' },
  Sources:               { accent: 'text-emerald-700',  bg: 'bg-emerald-500/10', border: 'border-emerald-300' },
  Transform:             { accent: 'text-violet-700',   bg: 'bg-violet-500/10',  border: 'border-violet-300' },
  Decisioning:           { accent: 'text-amber-700',    bg: 'bg-amber-500/10',   border: 'border-amber-300' },
  'AI & Personalization':{ accent: 'text-pink-700',     bg: 'bg-pink-500/10',    border: 'border-pink-300' },
  Actions:               { accent: 'text-blue-700',     bg: 'bg-blue-500/10',    border: 'border-blue-300' },
  'Control Flow':        { accent: 'text-cyan-700',     bg: 'bg-cyan-500/10',    border: 'border-cyan-300' },
  Monitoring:            { accent: 'text-orange-700',   bg: 'bg-orange-500/10',  border: 'border-orange-300' },
};

function catStyle(cat: NodeCategory) { return CAT_ACCENTS[cat]; }

function n(type: string, label: string, category: NodeCategory, description: string, icon: NodeIconKey, tags: string[], opts?: { outputs?: { id: string; label: string }[]; popular?: boolean }): NodePaletteItem {
  const s = catStyle(category);
  return { type, label, category, description, accent: s.accent, accentBg: s.bg, accentBorder: s.border, icon, tags, ...opts };
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE PALETTE — 80 nodes across 8 categories
// ═══════════════════════════════════════════════════════════════════════════

export const NODE_PALETTE: NodePaletteItem[] = [
  // ─── TRIGGERS (9) ──────────────────────────────────────────────────
  n('trigger_schedule',   'Schedule',         'Triggers', 'Start workflow on a cron schedule',               'schedule',       ['cron','automated'], { popular: true }),
  n('trigger_webhook',    'Webhook Trigger',  'Triggers', 'Start when an HTTP webhook is received',          'webhook',        ['http','event']),
  n('trigger_event',      'Event Trigger',    'Triggers', 'Start when a platform event fires',               'event_trigger',  ['realtime','event'], { popular: true }),
  n('trigger_api',        'API Trigger',      'Triggers', 'Start via REST API call',                         'api_trigger',    ['rest','programmatic']),
  n('trigger_manual',     'Manual Trigger',   'Triggers', 'Start manually with optional input data',         'manual_trigger', ['manual','test']),
  n('trigger_file',       'File Arrival',     'Triggers', 'Start when a file lands in storage or SFTP',      'file_trigger',   ['sftp','s3','file']),
  n('trigger_form',       'Form Submission',  'Triggers', 'Start when a form is submitted by a visitor',     'form_trigger',   ['form','input','submission']),
  n('trigger_chat',       'Chat Submission',  'Triggers', 'Start when a message is received on chatbot',     'chat_trigger',   ['chatbot','message','bot']),
  n('trigger_workflow',   'Workflow Trigger', 'Triggers', 'Start when triggered by another workflow',         'workflow_trigger',['chain','sub','cascade']),

  // ─── SOURCES (8) ───────────────────────────────────────────────────
  n('source',             'Read Schema',      'Sources', 'Query records from a Marbee schema with filters and conditions',  'database',  ['customer','table','query','audience'], { popular: true }),
  n('source_connector',   'Read Connector',   'Sources', 'Ingest from CRM, webhook, or SFTP connector',     'plug',           ['crm','integration'], { popular: true }),
  n('source_api',         'HTTP Request',     'Sources', 'Pull data from a REST API endpoint',               'globe',          ['rest','api'], { popular: true }),
  n('source_file',        'Read File',        'Sources', 'Parse CSV, JSON, Excel, or Parquet from storage',  'file',           ['csv','json','upload']),
  n('source_query',       'SQL Query',        'Sources', 'Run a SELECT against tenant database',             'sql',            ['sql','custom']),
  n('source_db_query',    'Database Query',   'Sources', 'Query external database via connector',            'db_query',       ['postgres','mysql','snowflake']),
  n('source_api_graphql', 'API Source',       'Sources', 'Pull data from GraphQL or REST with pagination',   'api_source',     ['graphql','cursor']),
  n('source_storage',     'Object Storage',   'Sources', 'Read from S3, Azure Blob, or GCS bucket',         'object_storage', ['s3','azure','gcs']),

  // ─── TRANSFORM (13) ───────────────────────────────────────────────
  n('transform_select',     'Select Fields',   'Transform', 'Pick specific columns from the data stream',       'select_fields',   ['columns','pick']),
  n('transform_map',        'Map Fields',      'Transform', 'Map source fields to target schema columns',        'map',             ['mapping','etl'], { popular: true }),
  n('transform_rename',     'Rename Fields',   'Transform', 'Rename column headers in the data stream',          'rename',          ['alias','column']),
  n('filter',               'Filter',          'Transform', 'Keep or remove rows by conditions',                 'filter',          ['where','conditions'], { popular: true }),
  n('transform_calculate',  'Calculate',       'Transform', 'Compute new fields with expressions and formulas',  'calculate',       ['formula','math']),
  n('transform_format',     'Format',          'Transform', 'Format dates, numbers, strings, and casing',         'format',          ['date','string','lower']),
  n('transform_join',       'Join',            'Transform', 'Inner/left/right join two incoming streams',         'join',            ['merge','lookup']),
  n('transform_aggregate',  'Aggregate',       'Transform', 'Group by fields with count, sum, avg, min, max',    'aggregate',       ['group','stats']),
  n('transform_dedupe',     'Deduplicate',     'Transform', 'Remove duplicate rows by key fields',               'dedupe',          ['unique','distinct'], { outputs: [{ id: 'unique', label: 'Unique' }, { id: 'duplicates', label: 'Duplicates' }] }),
  n('enrich_lookup',        'Enrich',          'Transform', 'Enrich rows from another schema or API by key',     'enrich',          ['enrich','reference']),
  n('transform_lookup',     'Lookup',          'Transform', 'Lookup values from a reference table',              'lookup',          ['reference','vlookup']),
  n('transform_split',      'Split Stream',    'Transform', 'Route rows into parallel branches by field value',  'split',           ['branch','route'], { outputs: [{ id: 'match', label: 'Match' }, { id: 'other', label: 'Other' }] }),
  n('merge_streams',        'Merge Streams',   'Transform', 'Combine multiple branches into one stream',         'merge_transform', ['union','combine']),
  n('set_union',             'Union',           'Transform', 'Combine rows from all inputs, optionally removing duplicates by key',  'set_union',       ['combine','distinct','merge'], { popular: true }),
  n('set_intersection',      'Intersection',    'Transform', 'Keep only rows whose keys appear in ALL input streams',               'set_intersection',['overlap','common','match']),
  n('set_exclusion',         'Exclusion',       'Transform', 'Keep rows from first input that do NOT appear in other inputs',        'set_exclusion',   ['subtract','diff','except']),

  // ─── DECISIONING (8) ──────────────────────────────────────────────
  n('decision_condition',    'Condition',       'Decisioning', 'Route rows down true or false branch',              'condition',      ['if','logic'], { outputs: [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }], popular: true }),
  n('decision_audience',     'Audience Split',  'Decisioning', 'Split stream by audience membership',               'audience_split', ['segment','cohort']),
  n('decision_ab_test',      'A/B Test',        'Decisioning', 'Randomly split traffic into experiment variants',    'ab_test',        ['experiment','variant'], { outputs: [{ id: 'a', label: 'Variant A' }, { id: 'b', label: 'Variant B' }] }),
  n('decision_eligibility',  'Eligibility',     'Decisioning', 'Check offer/campaign eligibility rules',             'eligibility',    ['rules','qualify'], { outputs: [{ id: 'eligible', label: 'Eligible' }, { id: 'ineligible', label: 'Ineligible' }] }),
  n('decision_freq_cap',     'Frequency Cap',   'Decisioning', 'Suppress contacts who exceeded frequency limits',    'frequency_cap',  ['throttle','limit'], { outputs: [{ id: 'pass', label: 'Pass' }, { id: 'capped', label: 'Capped' }] }),
  n('decision_suppression',  'Suppression',     'Decisioning', 'Remove contacts matching suppression list',           'suppression',    ['exclude','blocklist'], { outputs: [{ id: 'pass', label: 'Pass' }, { id: 'suppressed', label: 'Suppressed' }] }),
  n('decision_engine',       'Decisioning',     'Decisioning', 'Run multi-criteria decision matrix for next action',  'decisioning',    ['nba','matrix']),
  n('decision_score',        'Score',           'Decisioning', 'Calculate engagement or propensity score',             'score',          ['lead','propensity']),

  // ─── AI & PERSONALIZATION (6) ─────────────────────────────────────
  n('ai_generate',      'AI Generate',      'AI & Personalization', 'Generate text, subject lines, or content with LLM',    'ai_generate',    ['llm','gpt','claude'], { popular: true }),
  n('ai_classify',      'AI Classify',      'AI & Personalization', 'Classify records into categories using AI',             'ai_classify',    ['sentiment','category']),
  n('ai_extract',       'AI Extract',       'AI & Personalization', 'Extract structured data from unstructured text',        'ai_extract',     ['ner','parsing']),
  n('ai_translate',     'AI Translate',     'AI & Personalization', 'Translate text fields to target language',              'ai_translate',   ['language','i18n']),
  n('ai_personalize',   'AI Personalize',   'AI & Personalization', 'Generate personalized content per customer',            'ai_personalize', ['dynamic','1to1']),
  n('ai_recommend',     'Recommendation',   'AI & Personalization', 'Generate product or content recommendations',           'recommendation', ['product','collaborative']),

  // ─── ACTIONS / DESTINATIONS (10) ──────────────────────────────────
  n('action_email',       'Send Email',        'Actions', 'Send email via configured provider',                    'email',        ['campaign','transactional'], { popular: true }),
  n('action_sms',         'Send SMS',          'Actions', 'Send SMS via configured SMS gateway',                   'sms',          ['text','mobile']),
  n('action_whatsapp',    'Send WhatsApp',     'Actions', 'Send WhatsApp message via BSP',                         'whatsapp',     ['chat','template']),
  n('action_push',        'Push Notification', 'Actions', 'Send web or mobile push notification',                  'push',         ['fcm','apns']),
  n('action_webhook',     'Webhook POST',      'Actions', 'Send payload to external HTTP endpoint',                'webhook_out',  ['http','notify']),
  n('action_http',        'HTTP API',          'Actions', 'Call any REST API as an action step',                    'http_api',     ['rest','integration']),
  n('action_crm',         'CRM Update',        'Actions', 'Update records in CRM connector',                       'crm_update',   ['salesforce','hubspot']),
  n('action_db_write',    'Database Write',    'Actions', 'Insert/update/upsert into database or schema',          'db_write',     ['upsert','insert'], { popular: true }),
  n('action_audience',    'Add to Audience',   'Actions', 'Add or remove contacts from an audience segment',       'add_audience', ['segment','cohort']),
  n('action_export',      'Export File',       'Actions', 'Write CSV, JSON, or Parquet to storage',                'export_file',  ['csv','download'], { popular: true }),

  // ─── CONTROL FLOW (8) ─────────────────────────────────────────────
  n('flow_wait',          'Wait / Delay',   'Control Flow', 'Pause for a duration or until a specific date/time',   'wait',         ['pause','timer','delay','until','schedule']),
  n('flow_loop',          'Loop',           'Control Flow', 'Iterate over array items one by one',                  'loop',         ['foreach','iterate']),
  n('flow_batch',         'Batch',          'Control Flow', 'Process records in configurable batch sizes',          'batch',        ['chunk','parallel']),
  n('flow_parallel',      'Parallel',       'Control Flow', 'Execute multiple branches simultaneously',             'parallel',     ['concurrent','fork'], { outputs: [{ id: 'branch_1', label: 'Branch 1' }, { id: 'branch_2', label: 'Branch 2' }] }),
  n('flow_merge',         'Merge',          'Control Flow', 'Wait for and merge results from parallel branches',    'merge_flow',   ['join','sync']),
  n('flow_sub_workflow',  'Sub-workflow',   'Control Flow', 'Call another workflow as a reusable component',         'sub_workflow', ['reuse','module']),
  n('flow_end',           'End',            'Control Flow', 'Explicitly terminate a workflow branch',                'end',          ['stop','terminate']),

  // ─── MONITORING (5) ───────────────────────────────────────────────
  n('monitor_log',        'Log',              'Monitoring', 'Write a log entry for debugging or audit',            'log',             ['debug','audit']),
  n('monitor_track',      'Track Event',      'Monitoring', 'Track a business event in analytics',                 'track_event',     ['analytics','event']),
  n('monitor_profile',    'Update Profile',   'Monitoring', 'Update customer profile attributes',                  'update_profile',  ['cdp','attribute']),
  n('monitor_status',     'Workflow Status',  'Monitoring', 'Set workflow execution status or metadata',           'workflow_status', ['metadata','state']),
  n('monitor_alert',      'Alert',            'Monitoring', 'Send alert to Slack, email, or webhook on condition', 'alert',           ['notify','ops']),

  // ─── LEGACY COMPAT (kept for existing pipelines) ──────────────────
  n('target',             'Write Schema',    'Actions',    'Upsert records into a Marbee schema',                 'upload',       ['upsert','load']),
  n('target_export',      'Export (Legacy)',  'Actions',    'Write CSV, JSON, or Parquet to storage',              'download',     ['csv','download']),
  n('target_connector',   'Send Connector',  'Actions',    'Push records to outbound connector',                  'connector_out',['crm','sync']),
  n('target_webhook',     'Webhook (Legacy)','Actions',    'Send payload to external HTTP endpoint',              'webhook_out',  ['http','notify']),
  n('target_email',       'Email Report',    'Actions',    'Send summary or file attachment by email',            'email',        ['report','alert']),
  n('validate',           'Validate Rules',  'Monitoring', 'Email format, not empty, regex, unique checks',       'validate',     ['dq','rules']),
  n('validate_schema',    'Schema Check',    'Monitoring', 'Verify rows match schema field types',                'schema_check', ['types','conformance']),
  n('validate_anomaly',   'Anomaly Detect',  'Monitoring', 'Flag outliers and unexpected value distributions',    'validate',     ['ml','outliers']),
  n('branch_if',          'If / Else',       'Decisioning','Route rows down true or false branch',                'branch',       ['condition','logic'], { outputs: [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }] }),
  n('transform_expression','Expression',     'Transform',  'Apply Lower, Year, Trim and custom fx on fields',    'expression',   ['function','fx']),
];

export function paletteItem(type: string): NodePaletteItem | undefined {
  return NODE_PALETTE.find((n) => n.type === type);
}

export function categoryAccent(category: NodeCategory | string): string {
  switch (category) {
    case 'Triggers': return '#d946ef';
    case 'Sources': return '#10b981';
    case 'Transform': return '#8b5cf6';
    case 'Decisioning': return '#f59e0b';
    case 'AI & Personalization': return '#ec4899';
    case 'Actions': return '#3b82f6';
    case 'Control Flow': return '#06b6d4';
    case 'Monitoring': return '#f97316';
    default: return '#64748b';
  }
}

export const STEP_TYPES = NODE_PALETTE.filter((n) =>
  ['source', 'filter', 'transform_map', 'validate', 'target', 'action_db_write'].includes(n.type),
).map((n) => ({ value: n.type, label: n.label }));

export const LEGACY_TYPE_MAP: Record<string, string> = {
  transform: 'transform_map',
  sql: 'source_query',
  branch_if: 'decision_condition',
  target: 'action_db_write',
  target_export: 'action_export',
  target_webhook: 'action_webhook',
  target_email: 'action_email',
  target_connector: 'action_crm',
};

export function normalizeStepType(type: string): string {
  return LEGACY_TYPE_MAP[type] ?? type;
}

// ═══════════════════════════════════════════════════════════════════════════
// Default configs
// ═══════════════════════════════════════════════════════════════════════════

export function defaultConfigForType(type: string): Record<string, unknown> {
  const t = normalizeStepType(type);
  switch (t) {
    // Triggers
    case 'trigger_schedule': return { frequency: 'daily', run_time: '02:00', timezone: 'UTC', misfire: 'skip', max_concurrent: 1, max_executions: 0, holiday_calendar: '', holiday_behavior: 'skip' };
    case 'trigger_webhook': return { path: crypto.randomUUID(), method: 'POST', auth: 'none', content_type: 'json', respond: 'immediately', response_code: 200, response_data: '', response_content_type: 'json', response_headers: '', allowed_origins: '', ip_allowlist: '', ignore_bots: false, raw_body: false, no_response_body: false, only_run_if: '', binary_field: '', idempotency_key: '', hmac_secret: '', hmac_header: 'X-Signature', hmac_algorithm: 'SHA256', payload_schema: '', response_mode: 'ASYNC', max_payload_size: 1048576, rate_limit: 1000, replay_protection: false };
    case 'trigger_event': return { event_name: '', source: 'platform', filter_expression: '', dedup_window: 0, dedup_key: '', batch_window: 0, max_batch_size: 100 };
    case 'trigger_api': return { auth: 'bearer', rate_limit: 100 };
    case 'trigger_manual': return { input_schema: '', description: '' };
    case 'trigger_file': return { source: 'storage', watch_folder: '', file_name_pattern: '', file_name_type: 'static', format: 'csv', poll_interval: 5, poll_interval_unit: 'minutes', max_checks: 0, sample_purge_days: 7 };
    case 'trigger_form': return { form_id: '', form_name: '', fields_filter: '', wait_timeout: 0 };
    case 'trigger_chat': return { chat_name: 'Workflow Bot', welcome_message: 'Hi! Send a message to start.', public_url: '' };
    case 'trigger_workflow': return { source_workflow_id: '', source_workflow_name: '', pass_data: true };
    // Sources
    case 'source': return { schema: '', selected_fields: [], filter_group: { id: 'root', logic: 'and', conditions: [] }, sort_field: '', sort_order: 'desc', limit: 10000, offset: 0, processing_mode: 'batch', batch_size: 1000, page_size: 1000, streaming: false, deduplicate: false, deduplicate_field: '', incremental: false, incremental_field: 'updated_at', on_empty: 'continue', on_error: 'stop' };
    case 'source_connector': return { connector_id: '', object: '', since_last_run: true, fields: '', filter: '' };
    case 'source_api': return { url: '', method: 'GET', headers: '{}', pagination: 'none', auth_credential: '', timeout: 30, retry_count: 3 };
    case 'source_file': return { format: 'csv', path: '', has_header: true, delimiter: ',', encoding: 'utf-8', skip_rows: 0, batch_size: 10000 };
    case 'source_query': return { query: 'SELECT * FROM customers LIMIT 1000', read_only: true, timeout: 60, max_rows: 100000 };
    case 'source_db_query': return { connector_id: '', query: '', parameterized: true, timeout: 60 };
    case 'source_api_graphql': return { url: '', query: '', variables: '{}', pagination: 'cursor', auth_credential: '' };
    case 'source_storage': return { provider: 's3', bucket: '', prefix: '', format: 'csv', recursive: false };
    // Transform
    case 'transform_select': return { fields: '', exclude: false };
    case 'transform_map': return { target_schema: '', mapping_text: '' };
    case 'transform_rename': return { renames: '' };
    case 'filter': return { mode: 'and', conditions: [{ field: '', operator: 'equals', value: '' }], emit_no_match: true, condition_expression: '' };
    case 'transform_calculate': return { output_field: '', expression: '', type: 'string' };
    case 'transform_format': return { field: '', operation: 'lowercase', format_string: '' };
    case 'transform_join': return { join_type: 'left', left_key: 'id', right_key: 'customer_id', right_schema: '' };
    case 'transform_aggregate': return { group_by: '', metrics: [{ fn: 'count', field: 'id', alias: 'total' }] };
    case 'transform_dedupe': return { keys: '', keep: 'first', max_duplicates: 0, output_duplicates: false };
    case 'enrich_lookup': return { lookup_schema: '', local_key: 'email', lookup_key: 'email', fields: '' };
    case 'transform_lookup': return { lookup_table: '', local_key: '', lookup_key: '', return_field: '', default_value: '' };
    case 'transform_split': return { field: '', operator: 'equals', value: '' };
    case 'merge_streams': return { mode: 'append', dedupe_keys: '' };
    case 'transform_expression': return { field: '', expression: 'Lower(field)', output_field: '' };
    // Set operations
    case 'set_union': return { key_fields: '', remove_duplicates: true };
    case 'set_intersection': return { key_fields: '' };
    case 'set_exclusion': return { key_fields: '' };
    // Decisioning
    case 'decision_condition': return { field: '', operator: 'equals', value: '', evaluation_mode: 'workflow', condition_expression: '' };
    case 'decision_audience': return { audience_id: '', check_type: 'is_member' };
    case 'decision_ab_test': return { split_ratio: 50, seed: '', persist_assignment: true };
    case 'decision_eligibility': return { rules: '', check_offers: true, check_campaigns: true };
    case 'decision_freq_cap': return { channel: 'all', max_per_day: 3, max_per_week: 10, max_per_month: 30, lookback_hours: 24 };
    case 'decision_suppression': return { list_id: '', match_field: 'email' };
    case 'decision_engine': return { strategy: 'highest_score', criteria: '', fallback: 'skip' };
    case 'decision_score': return { model: 'engagement', field_weights: '', output_field: 'score' };
    // AI
    case 'ai_generate': return { model: 'claude-sonnet-4', provider: 'anthropic', prompt: '', system_prompt: '', temperature: 0.7, max_tokens: 1024, top_p: 1.0, output_field: 'generated_text', response_format: 'text', json_schema: '', fallback_model: '', fallback_provider: '', track_cost: true, safety_level: 'standard', timeout: 60 };
    case 'ai_classify': return { model: 'claude-haiku-4-5', categories: '', input_field: '', output_field: 'category', confidence_threshold: 0.8 };
    case 'ai_extract': return { model: 'claude-sonnet-4', schema: '', input_field: '', output_format: 'json' };
    case 'ai_translate': return { model: 'claude-sonnet-4', source_lang: 'auto', target_lang: 'en', input_field: '', output_field: '' };
    case 'ai_personalize': return { model: 'claude-sonnet-4', template: '', context_fields: '', output_field: 'personalized_content' };
    case 'ai_recommend': return { model: 'collaborative', item_catalog: '', user_field: 'customer_id', top_k: 5, output_field: 'recommendations' };
    // Actions
    case 'action_email': return { provider: 'resend', to: '', subject: '', template_id: '', from: '', reply_to: '', track_opens: true, track_clicks: true, preheader: '', cc: '', bcc: '', communication_type: 'promotional', fallback_policy: 'use_default', suppress_duplicates: true, utm_source: '', utm_medium: 'email', utm_campaign: '', send_window_start: '', send_window_end: '', send_window_tz: 'UTC' };
    case 'action_sms': return { provider: 'twilio', to_field: 'mobile', message: '', sender_id: '' };
    case 'action_whatsapp': return { provider: 'meta', to_field: 'mobile', template_id: '', language: 'en', media_url: '' };
    case 'action_push': return { provider: 'fcm', title: '', body: '', icon: '', url: '', token_field: 'push_token' };
    case 'action_webhook': return { url: '', method: 'POST', payload_template: '{{row}}', headers: '{}', retry: 3 };
    case 'action_http': return { url: '', method: 'POST', auth_type: 'none', auth_credential: '', headers: '{}', query_params: '{}', body: '', body_content_type: 'json', timeout: 30, retry: 3, follow_redirects: true, response_type: 'json', success_codes: '200-299', pagination_type: 'none', pagination_cursor_path: '', pagination_limit: 100, pagination_max_pages: 100, rate_limit: 0 };
    case 'action_crm': return { connector_id: '', object: '', operation: 'upsert', match_field: 'email', field_mapping: '' };
    case 'action_db_write': return { schema: '', mode: 'upsert', match_key: 'email', batch_size: 500 };
    case 'action_audience': return { audience_id: '', audience_name: '', operation: 'add', match_field: 'email' };
    case 'action_export': return { format: 'csv', destination: 'storage', filename: 'export_{date}', compress: false };
    // Control Flow
    case 'flow_wait': return { wait_type: 'duration', weeks: 0, days: 0, hours: 0, minutes: 5, seconds: 0, until_datetime: '' };
    case 'flow_loop': return { input_field: 'items', variable_name: 'item', max_iterations: 10000 };
    case 'flow_batch': return { batch_size: 1000, parallel_batches: 1, delay_between: 0 };
    case 'flow_parallel': return { branches: 2, wait_for_all: true };
    case 'flow_merge': return { strategy: 'wait_all', timeout: 300 };
    case 'flow_sub_workflow': return { workflow_id: '', pass_data: true, wait: true };
    case 'flow_end': return { status: 'success', message: '' };
    // Monitoring
    case 'monitor_log': return { level: 'info', message: '', include_data: false, mask_pii: true };
    case 'monitor_track': return { event_name: '', properties: '{}', customer_id_field: 'customer_id' };
    case 'monitor_profile': return { customer_id_field: 'customer_id', attributes: '', merge_strategy: 'overwrite' };
    case 'monitor_status': return { status: 'success', metadata: '{}' };
    case 'monitor_alert': return { channel: 'slack', condition: 'always', webhook_url: '', message: '', severity: 'warning' };
    // Legacy
    case 'target': return { schema: '', mode: 'upsert', match_key: 'email' };
    case 'target_export': return { format: 'csv', destination: 'storage', compress: false, filename: 'export_{date}' };
    case 'target_connector': return { connector_id: '', batch_size: 100 };
    case 'target_webhook': return { url: '', method: 'POST', payload_template: '{{row}}' };
    case 'target_email': return { to: '', subject: 'Data job report', attach_export: true };
    case 'validate': return { on_fail: 'reject', rules_text: '' };
    case 'validate_schema': return { schema: '', strict: true };
    case 'validate_anomaly': return { field: '', method: 'zscore', threshold: 3 };
    case 'branch_if': return { field: '', operator: 'equals', value: '' };
    default: return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Config summaries (human-readable preview on node card)
// ═══════════════════════════════════════════════════════════════════════════

export function configSummary(stepType: string, config: Record<string, unknown>): string {
  const t = normalizeStepType(stepType);
  const str = (k: string) => config[k] ? String(config[k]) : '';
  const num = (k: string) => Number(config[k]) || 0;
  switch (t) {
    // Triggers
    case 'trigger_schedule': return str('frequency') === 'custom_cron' ? (str('cron') || 'Set cron') : (str('frequency') || 'daily') + (str('run_time') ? ` @ ${str('run_time')}` : '');
    case 'trigger_webhook': { const m = str('method') || 'POST'; const p = str('path'); return p ? `${m} /webhook-trigger/${p.substring(0, 8)}…` : 'Webhook ready'; }
    case 'trigger_event': { const en = str('event_name'); const dw = Number(config.dedup_window || 0); return en ? `${en}${dw > 0 ? ` (dedup ${dw}s)` : ''}` : 'Set event'; }
    case 'trigger_api': return 'REST API trigger';
    case 'trigger_manual': return 'Manual start';
    case 'trigger_file': {
      const folder = str('watch_folder');
      const nameP = str('file_name_pattern');
      if (folder && nameP) return `${folder}/${nameP}`;
      if (folder) return folder;
      if (nameP) return nameP;
      return 'Set file pattern';
    }
    case 'trigger_form': return str('form_name') || str('form_id') || 'Select form';
    case 'trigger_chat': return str('chat_name') || 'Workflow Bot';
    case 'trigger_workflow': return str('source_workflow_name') || 'Select workflow';
    // Sources
    case 'source': {
      const s = str('schema');
      if (!s) return 'Pick schema';
      const fg = config.filter_group as { conditions?: unknown[] } | undefined;
      const condCount = fg?.conditions?.length ?? 0;
      const fields = config.selected_fields as string[] | undefined;
      const parts = [s];
      if (fields && fields.length > 0) parts.push(`${fields.length} fields`);
      if (condCount > 0) parts.push(`${condCount} filter${condCount > 1 ? 's' : ''}`);
      return parts.join(' · ');
    }
    case 'validate_schema': return str('schema') || 'Pick schema';
    case 'source_connector': case 'target_connector': return str('connector_id') ? 'Connector linked' : 'Pick connector';
    case 'source_api': return str('url') ? new URL(String(config.url)).hostname : 'Set API URL';
    case 'source_file': return str('format') ? `${String(config.format).toUpperCase()} file` : 'Pick file';
    case 'source_query': return str('query') ? 'SQL ready' : 'Write query';
    case 'source_db_query': return str('connector_id') ? 'DB query ready' : 'Pick database';
    case 'source_api_graphql': return str('url') ? 'GraphQL ready' : 'Set endpoint';
    case 'source_storage': return str('bucket') ? `${str('provider')}://${str('bucket')}` : 'Set bucket';
    // Transform
    case 'transform_select': return str('fields') || 'Select fields';
    case 'transform_map': return str('target_schema') ? `→ ${str('target_schema')}` : 'Map fields';
    case 'transform_rename': return str('renames') || 'Set renames';
    case 'filter': { const ce = str('condition_expression'); if (ce) return ce.length > 30 ? ce.substring(0, 27) + '…' : ce; const ct = Array.isArray(config.conditions) ? (config.conditions as unknown[]).length : 0; return ct > 0 ? `${ct} condition(s)${config.emit_no_match === false ? '' : ' +no_match'}` : 'Add conditions'; }
    case 'transform_calculate': return str('expression') || 'Set expression';
    case 'transform_format': return str('operation') || 'Set format';
    case 'transform_join': return `${str('join_type') || 'left'} join on ${str('left_key') || '?'}`;
    case 'transform_aggregate': return str('group_by') ? `Group: ${str('group_by')}` : 'Set group by';
    case 'transform_dedupe': {
      if (!str('keys')) return 'Set dedupe keys';
      const md = Number(config.max_duplicates ?? 0);
      const dupeTag = md === -1 ? ' (tag all)' : md > 0 ? ` (keep ${md})` : '';
      return `By ${str('keys')}${dupeTag}${config.output_duplicates ? ' +excl' : ''}`;
    }
    case 'enrich_lookup': return str('lookup_schema') ? `Lookup ${str('lookup_schema')}` : 'Set lookup';
    case 'transform_lookup': return str('lookup_table') ? `Lookup ${str('lookup_table')}` : 'Set lookup';
    case 'transform_split': return str('field') ? `Split on ${str('field')}` : 'Set split field';
    case 'merge_streams': return str('mode') || 'append';
    case 'transform_expression': return str('expression') || 'Set expression';
    case 'set_union': return str('key_fields') ? `Union by ${str('key_fields')}` : 'Union all';
    case 'set_intersection': return str('key_fields') ? `Intersect by ${str('key_fields')}` : 'Set key fields';
    case 'set_exclusion': return str('key_fields') ? `Exclude by ${str('key_fields')}` : 'Set key fields';
    // Decisioning
    case 'decision_condition': case 'branch_if': { const ce = str('condition_expression'); if (ce) return ce.length > 30 ? ce.substring(0, 27) + '…' : ce; const mode = str('evaluation_mode') === 'record' ? '⟲ ' : ''; return str('field') ? `${mode}${str('field')} ${str('operator')} ${str('value')}` : 'Set condition'; }
    case 'decision_audience': return str('audience_id') ? 'Audience linked' : 'Pick audience';
    case 'decision_ab_test': return `${str('split_ratio') || 50}/${100 - Number(config.split_ratio || 50)} split`;
    case 'decision_eligibility': return 'Eligibility check';
    case 'decision_freq_cap': return str('max_per_day') ? `${str('max_per_day')}/day` : 'Set caps';
    case 'decision_suppression': return str('list_id') ? 'List linked' : 'Pick suppression list';
    case 'decision_engine': return str('strategy') || 'Set strategy';
    case 'decision_score': return str('model') ? `${str('model')} model` : 'Set model';
    // AI
    case 'ai_generate': { const m = str('model'); const p = str('provider'); const rf = str('response_format'); return m ? `${p ? p + '/' : ''}${m}${rf && rf !== 'text' ? ` → ${rf.toUpperCase()}` : ''}` : 'Set model'; }
    case 'ai_classify': return str('categories') ? 'Categories set' : 'Set categories';
    case 'ai_extract': return str('schema') ? 'Schema set' : 'Set extraction schema';
    case 'ai_translate': return str('target_lang') ? `→ ${str('target_lang')}` : 'Set language';
    case 'ai_personalize': return str('template') ? 'Template set' : 'Set template';
    case 'ai_recommend': return str('item_catalog') ? 'Catalog linked' : 'Set catalog';
    // Actions
    case 'action_email': { const s = str('subject') || str('template_id') || 'Set email'; const ct = str('communication_type'); return ct === 'transactional' ? `⚡ ${s}` : s; }
    case 'action_sms': return str('message') ? 'Message set' : 'Set message';
    case 'action_whatsapp': return str('template_id') || 'Set template';
    case 'action_push': return str('title') || 'Set notification';
    case 'action_webhook': case 'target_webhook': return str('url') ? 'Webhook set' : 'Set URL';
    case 'action_http': { if (!str('url')) return 'Set URL'; try { const h = new URL(String(config.url)).hostname; const pg = str('pagination_type'); return `${str('method') || 'POST'} ${h}${pg && pg !== 'none' ? ' (paginated)' : ''}`; } catch { return `${str('method') || 'POST'} API`; } }
    case 'action_crm': return str('connector_id') ? `${str('operation')} CRM` : 'Pick CRM';
    case 'action_db_write': case 'target': return str('schema') || 'Pick schema';
    case 'action_audience': {
      const op = str('operation') || 'add';
      const name = str('audience_name') || str('audience_id') || 'Audience';
      if (op === 'create') return `Create "${name}"`;
      if (op === 'purge_refresh') return `Purge & refresh "${name}"`;
      if (op === 'remove') return `Remove from "${name}"`;
      return `Add to "${name}"`;
    }
    case 'action_export': case 'target_export': return str('format') ? String(config.format).toUpperCase() : 'CSV';
    case 'target_email': return str('to') || 'Set recipient';
    // Control Flow
    case 'flow_wait': {
      if (str('wait_type') === 'datetime') {
        const dt = str('until_datetime');
        if (!dt) return 'Set date/time';
        const target = new Date(dt);
        const remaining = target.getTime() - Date.now();
        if (remaining <= 0) return `${dt} (passed)`;
        const d = Math.floor(remaining / 86400000);
        const h = Math.floor((remaining % 86400000) / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const rParts: string[] = [];
        if (d) rParts.push(`${d}d`);
        if (h) rParts.push(`${h}h`);
        if (m) rParts.push(`${m}m`);
        return `Until ${dt} (${rParts.join(' ') || '<1m'} left)`;
      }
      const parts: string[] = [];
      if (num('weeks')) parts.push(`${num('weeks')}w`);
      if (num('days')) parts.push(`${num('days')}d`);
      if (num('hours')) parts.push(`${num('hours')}h`);
      if (num('minutes')) parts.push(`${num('minutes')}m`);
      if (num('seconds')) parts.push(`${num('seconds')}s`);
      return parts.length ? `Wait ${parts.join(' ')}` : '5m';
    }
    case 'flow_loop': return str('input_field') ? `Over ${str('input_field')}` : 'Set input';
    case 'flow_batch': return `${str('batch_size') || '1000'} per batch`;
    case 'flow_parallel': return `${str('branches') || '2'} branches`;
    case 'flow_merge': return str('strategy') || 'Wait all';
    case 'flow_sub_workflow': return str('workflow_id') ? 'Workflow linked' : 'Pick workflow';
    case 'flow_end': return str('status') || 'End';
    // Monitoring
    case 'monitor_log': return str('level') || 'info';
    case 'monitor_track': return str('event_name') || 'Set event';
    case 'monitor_profile': return str('attributes') ? 'Attributes set' : 'Set attributes';
    case 'monitor_status': return str('status') || 'Set status';
    case 'monitor_alert': return str('channel') || 'Set channel';
    // Legacy
    case 'validate': return str('rules_text') ? `${String(config.rules_text).split('\n').filter(Boolean).length} rule(s)` : 'Add rules';
    case 'validate_anomaly': return str('field') ? `Anomaly on ${str('field')}` : 'Set field';
    default: return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Config field definitions — drives the inspector form
// ═══════════════════════════════════════════════════════════════════════════

export type ConfigField =
  | { kind: 'text'; key: string; label: string; placeholder?: string; hint?: string }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; hint?: string }
  | { kind: 'textarea'; key: string; label: string; rows?: number; placeholder?: string; mono?: boolean; hint?: string }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string }[]; hint?: string }
  | { kind: 'toggle'; key: string; label: string; hint?: string }
  | { kind: 'schema'; key: string; label: string }
  | { kind: 'connector'; key: string; label: string }
  | { kind: 'time'; key: string; label: string; hint?: string }
  | { kind: 'date'; key: string; label: string; hint?: string }
  | { kind: 'multi_select'; key: string; label: string; options: { value: string; label: string }[]; hint?: string }
  | { kind: 'column_picker'; key: string; label: string; placeholder?: string; hint?: string }
  | { kind: 'folder_picker'; key: string; label: string; placeholder?: string; hint?: string };

export type VisibleWhen = { key: string; value: string };
export type ConfigFieldExt = ConfigField & { visibleWhen?: VisibleWhen };

const TIMEZONE_OPTS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
];

const AUTH_OPTS = [
  { value: 'none', label: 'None' },
  { value: 'api_key', label: 'API Key' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'hmac', label: 'HMAC Signature' },
  { value: 'oauth2', label: 'OAuth 2.0' },
];

const HTTP_METHOD_OPTS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
];

const PAGINATION_OPTS = [
  { value: 'none', label: 'None' },
  { value: 'offset', label: 'Offset/limit' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'token', label: 'Next-page token' },
];

const FILE_FORMAT_OPTS = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'jsonl', label: 'JSONL' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'parquet', label: 'Parquet' },
  { value: 'xml', label: 'XML' },
];

const AI_MODEL_OPTS = [
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

const ON_FAIL_OPTS = [
  { value: 'stop', label: 'Stop workflow' },
  { value: 'continue', label: 'Continue' },
  { value: 'retry', label: 'Retry' },
  { value: 'skip_record', label: 'Skip record' },
  { value: 'error_path', label: 'Send to error path' },
];

const WRITE_MODE_OPTS = [
  { value: 'upsert', label: 'Upsert' },
  { value: 'insert', label: 'Insert only' },
  { value: 'update', label: 'Update only' },
  { value: 'merge', label: 'Merge' },
];

export const NODE_CONFIG_FIELDS: Record<string, ConfigFieldExt[]> = {
  // ─── TRIGGERS ──────────────────────────────────────────────────────
  trigger_schedule: [
    { kind: 'select', key: 'frequency', label: 'Frequency', options: [
      { value: 'once', label: 'Once — run one time' },
      { value: 'every_n_minutes', label: 'Every N minutes' },
      { value: 'hourly', label: 'Hourly' },
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
      { value: 'custom_cron', label: 'Custom (Cron expression)' },
    ]},
    { kind: 'number', key: 'interval_minutes', label: 'Run every (minutes)', min: 1, max: 1440, hint: 'Applies to "Every N minutes"' },
    { kind: 'time', key: 'run_time', label: 'Execution time', hint: 'Time of day to run' },
    { kind: 'multi_select', key: 'days_of_week', label: 'Days of week', options: [
      { value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' },
      { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' }, { value: '0', label: 'Sun' },
    ], hint: 'For weekly frequency' },
    { kind: 'number', key: 'day_of_month', label: 'Day of month', min: 1, max: 31, hint: 'For monthly frequency' },
    { kind: 'date', key: 'start_date', label: 'Start date', hint: 'When to begin scheduling' },
    { kind: 'date', key: 'end_date', label: 'End date', hint: 'Leave empty to run indefinitely' },
    { kind: 'text', key: 'cron', label: 'Cron expression', placeholder: '0 2 * * *', hint: 'Standard 5-field cron (custom only)' },
    { kind: 'select', key: 'timezone', label: 'Timezone', options: TIMEZONE_OPTS },
    { kind: 'select', key: 'misfire', label: 'If execution is missed', options: [
      { value: 'skip', label: 'Skip missed run' },
      { value: 'run_once', label: 'Run once to catch up' },
      { value: 'run_all', label: 'Run all missed executions' },
    ]},
    { kind: 'number', key: 'max_concurrent', label: 'Max concurrent runs', min: 1, max: 10 },
    { kind: 'number', key: 'max_executions', label: 'Max total executions', min: 0, max: 1000000, hint: '0 = unlimited' },
    { kind: 'text', key: 'holiday_calendar', label: 'Holiday calendar', placeholder: 'e.g. IN, US, UK', hint: 'ISO country code for holiday skipping' },
    { kind: 'select', key: 'holiday_behavior', label: 'On holiday', options: [
      { value: 'skip', label: 'Skip execution' },
      { value: 'next_business_day', label: 'Run next business day' },
      { value: 'previous_business_day', label: 'Run previous business day' },
    ]},
  ],
  trigger_webhook: [
    { kind: 'text', key: 'path', label: 'Webhook path', placeholder: 'auto-generated UUID', hint: 'Full URL: {SUPABASE_URL}/functions/v1/webhook-trigger/{path}' },
    { kind: 'select', key: 'method', label: 'HTTP method', options: HTTP_METHOD_OPTS },
    { kind: 'select', key: 'auth', label: 'Authentication', options: AUTH_OPTS },
    { kind: 'select', key: 'content_type', label: 'Content type', options: [
      { value: 'json', label: 'JSON' },
      { value: 'xml', label: 'XML' },
      { value: 'form', label: 'Form data' },
      { value: 'multipart', label: 'Multipart / binary' },
      { value: 'raw', label: 'Raw text' },
    ]},
    { kind: 'select', key: 'respond', label: 'Respond', options: [
      { value: 'immediately', label: 'Immediately' },
      { value: 'last_node', label: 'When last node finishes' },
      { value: 'respond_node', label: 'Using "Respond to Webhook" node' },
    ], hint: 'When to send the HTTP response back to the caller' },
    { kind: 'number', key: 'response_code', label: 'Response code', min: 100, max: 599, hint: 'HTTP status code to return' },
    { kind: 'select', key: 'response_content_type', label: 'Response content type', options: [
      { value: 'json', label: 'JSON' },
      { value: 'text', label: 'Plain text' },
      { value: 'html', label: 'HTML' },
      { value: 'xml', label: 'XML' },
      { value: 'auto', label: 'Auto-detect' },
    ]},
    { kind: 'textarea', key: 'response_data', label: 'Response data', rows: 3, mono: true, placeholder: '{"status":"ok","received":{{_count}}}', hint: 'Custom response body. Supports {{field}} templates.' },
    { kind: 'textarea', key: 'response_headers', label: 'Response headers (JSON)', rows: 2, mono: true, placeholder: '{"X-Request-Id": "{{_requestId}}"}' },
    { kind: 'text', key: 'allowed_origins', label: 'Allowed origins (CORS)', placeholder: 'https://example.com, https://app.example.com', hint: 'Comma-separated origins. Leave empty to allow all.' },
    { kind: 'text', key: 'ip_allowlist', label: 'IP allowlist', placeholder: '192.168.1.0/24, 10.0.0.1', hint: 'Comma-separated IPs or CIDR ranges. Leave empty to allow all.' },
    { kind: 'text', key: 'only_run_if', label: 'Only run if', placeholder: 'headers.x-api-version == "2"', hint: 'Expression that must be truthy for the webhook to execute' },
    { kind: 'toggle', key: 'ignore_bots', label: 'Ignore bots', hint: 'Drop requests from known bot user-agents' },
    { kind: 'toggle', key: 'raw_body', label: 'Raw body', hint: 'Pass unparsed request body as a string' },
    { kind: 'toggle', key: 'no_response_body', label: 'No response body', hint: 'Return headers only (e.g. 204 No Content)' },
    { kind: 'text', key: 'binary_field', label: 'Binary data field name', placeholder: 'file', hint: 'Field name for uploaded binary data' },
    { kind: 'text', key: 'idempotency_key', label: 'Idempotency key field', placeholder: 'e.g. eventId', hint: 'Prevents duplicate processing of the same request' },
    { kind: 'text', key: 'hmac_secret', label: 'HMAC secret', placeholder: 'Shared secret for signature verification', hint: 'Required when auth = HMAC Signature' },
    { kind: 'text', key: 'hmac_header', label: 'HMAC header', placeholder: 'X-Signature', hint: 'HTTP header containing the HMAC signature' },
    { kind: 'select', key: 'hmac_algorithm', label: 'HMAC algorithm', options: [
      { value: 'SHA256', label: 'SHA-256' },
      { value: 'SHA512', label: 'SHA-512' },
      { value: 'SHA1', label: 'SHA-1' },
    ]},
    { kind: 'textarea', key: 'payload_schema', label: 'Payload schema (JSON Schema)', rows: 4, mono: true, placeholder: '{"type":"object","required":["event"],...}', hint: 'Validate incoming payloads. Requests that don\'t match get 400.' },
    { kind: 'select', key: 'response_mode', label: 'Response mode', options: [
      { value: 'ASYNC', label: 'Async — return 202 immediately' },
      { value: 'SYNC', label: 'Sync — wait for workflow result (max 30s)' },
    ]},
    { kind: 'number', key: 'max_payload_size', label: 'Max payload size (bytes)', min: 1, max: 10485760, hint: 'Default 1 MB. Max 10 MB.' },
    { kind: 'number', key: 'rate_limit', label: 'Rate limit (req/min)', min: 1, max: 100000, hint: 'Excess requests receive 429' },
    { kind: 'toggle', key: 'replay_protection', label: 'Replay protection', hint: 'Reject requests with stale timestamps (> 5 min)' },
  ],
  trigger_event: [
    { kind: 'text', key: 'event_name', label: 'Event name', placeholder: 'order_completed' },
    { kind: 'select', key: 'source', label: 'Event source', options: [
      { value: 'platform', label: 'Marbee Platform' },
      { value: 'web', label: 'Web SDK' },
      { value: 'mobile', label: 'Mobile SDK' },
      { value: 'server', label: 'Server API' },
    ]},
    { kind: 'textarea', key: 'filter_expression', label: 'Filter expression', rows: 2, mono: true, placeholder: 'e.g. event.amount > 100' },
    { kind: 'number', key: 'dedup_window', label: 'Deduplication window (seconds)', min: 0, max: 86400, hint: '0 = no dedup. Suppresses duplicate events within this window.' },
    { kind: 'text', key: 'dedup_key', label: 'Deduplication key', placeholder: '{{event.customerId}}_{{event.eventType}}', hint: 'Expression defining dedup identity' },
    { kind: 'number', key: 'batch_window', label: 'Batch window (seconds)', min: 0, max: 3600, hint: '0 = process individually. Collect events for this duration.' },
    { kind: 'number', key: 'max_batch_size', label: 'Max batch size', min: 1, max: 10000, hint: 'Max events per batch' },
  ],
  trigger_api: [
    { kind: 'select', key: 'auth', label: 'Authentication', options: AUTH_OPTS },
    { kind: 'number', key: 'rate_limit', label: 'Rate limit (req/min)', min: 1, max: 10000 },
  ],
  trigger_manual: [
    { kind: 'textarea', key: 'input_schema', label: 'Input schema (JSON)', rows: 4, mono: true, placeholder: '{"customerId": "string"}' },
    { kind: 'text', key: 'description', label: 'Description', placeholder: 'What this workflow does' },
  ],
  trigger_file: [
    { kind: 'select', key: 'source', label: 'File source', options: [
      { value: 'storage', label: 'Marbee Storage' },
      { value: 'sftp', label: 'SFTP' },
      { value: 's3', label: 'Amazon S3' },
      { value: 'azure', label: 'Azure Blob' },
      { value: 'gcs', label: 'Google Cloud Storage' },
    ]},
    { kind: 'folder_picker', key: 'watch_folder', label: 'Watch folder', placeholder: '/imports/campaigns', hint: 'Folder in Files module where incoming files land' },
    { kind: 'select', key: 'file_name_type', label: 'File name matching', options: [
      { value: 'static', label: 'Static name' },
      { value: 'dynamic', label: 'Dynamic (with date tokens)' },
      { value: 'wildcard', label: 'Wildcard pattern' },
    ]},
    { kind: 'text', key: 'file_name_pattern', label: 'File name', placeholder: 'Daily_Import_Campaign', hint: 'Exact file name without extension', visibleWhen: { key: 'file_name_type', value: 'static' } },
    { kind: 'text', key: 'file_name_pattern', label: 'File name pattern', placeholder: 'Daily_Import_{DDMMYYYY}', hint: 'Tokens: {DDMMYYYY}, {YYYYMMDD}, {DD}, {MM}, {YYYY}, {HH}, {mm}', visibleWhen: { key: 'file_name_type', value: 'dynamic' } },
    { kind: 'text', key: 'file_name_pattern', label: 'Wildcard pattern', placeholder: 'Daily_Import_*', hint: 'Use * for any characters', visibleWhen: { key: 'file_name_type', value: 'wildcard' } },
    { kind: 'select', key: 'format', label: 'Expected format', options: FILE_FORMAT_OPTS },
    { kind: 'number', key: 'poll_interval', label: 'Check file every', min: 1, max: 1440, hint: 'How often to check for new files' },
    { kind: 'select', key: 'poll_interval_unit', label: 'Interval unit', options: [
      { value: 'minutes', label: 'Minutes' },
      { value: 'hours', label: 'Hours' },
    ]},
    { kind: 'number', key: 'max_checks', label: 'How many times to check', min: 0, max: 100000, hint: '0 = check indefinitely until file arrives' },
    { kind: 'number', key: 'sample_purge_days', label: 'Purge sample files after (days)', min: 1, max: 365, hint: 'Sample files older than this are auto-deleted from the system folder' },
  ],
  trigger_form: [
    { kind: 'text', key: 'form_id', label: 'Form ID', placeholder: 'Select or paste form ID' },
    { kind: 'text', key: 'form_name', label: 'Form name', placeholder: 'Contact Form' },
    { kind: 'textarea', key: 'fields_filter', label: 'Fields to capture', rows: 3, mono: true, placeholder: 'name\nemail\nphone\nmessage', hint: 'One field per line — leave empty to capture all fields' },
    { kind: 'number', key: 'wait_timeout', label: 'Timeout (minutes)', min: 0, max: 10080, hint: '0 = wait forever' },
  ],
  trigger_chat: [
    { kind: 'text', key: 'chat_name', label: 'Chatbot name', placeholder: 'Workflow Bot' },
    { kind: 'textarea', key: 'welcome_message', label: 'Welcome message', rows: 2, placeholder: 'Hi! Send a message to start the workflow.' },
    { kind: 'text', key: 'public_url', label: 'Public chat URL', placeholder: 'Auto-generated when workflow is live', hint: 'Share this URL to collect chat submissions' },
  ],
  trigger_workflow: [
    { kind: 'text', key: 'source_workflow_id', label: 'Source workflow ID', placeholder: 'Select workflow' },
    { kind: 'text', key: 'source_workflow_name', label: 'Source workflow name', placeholder: 'Parent Workflow' },
    { kind: 'toggle', key: 'pass_data', label: 'Pass data from source workflow' },
  ],

  // ─── SOURCES ───────────────────────────────────────────────────────
  source: [
    { kind: 'schema', key: 'schema', label: 'Schema' },
    { kind: 'select', key: 'columns', label: 'Columns', options: [{ value: 'all', label: 'All columns' }, { value: 'selected', label: 'Selected only' }] },
    { kind: 'number', key: 'limit', label: 'Max records', min: 1, max: 10000000, hint: 'Maximum records to retrieve' },
    { kind: 'number', key: 'offset', label: 'Offset', min: 0, max: 10000000, hint: 'Skip first N records' },
    { kind: 'column_picker', key: 'sort_field', label: 'Sort by', placeholder: 'created_at' },
    { kind: 'select', key: 'sort_order', label: 'Sort order', options: [
      { value: 'asc', label: 'Ascending' },
      { value: 'desc', label: 'Descending' },
    ]},
    { kind: 'toggle', key: 'streaming', label: 'Enable streaming', hint: 'Stream records in pages to downstream nodes (for large datasets)' },
    { kind: 'number', key: 'page_size', label: 'Page size', min: 100, max: 50000, hint: 'Records per page for streaming/internal pagination' },
    { kind: 'number', key: 'batch_size', label: 'Batch size', min: 1, max: 50000 },
    { kind: 'toggle', key: 'incremental', label: 'Incremental (since last run)', hint: 'Only read new/modified records' },
  ],
  source_connector: [
    { kind: 'connector', key: 'connector_id', label: 'Connector' },
    { kind: 'text', key: 'object', label: 'Object / Table', placeholder: 'Contact' },
    { kind: 'toggle', key: 'since_last_run', label: 'Incremental since last run' },
    { kind: 'text', key: 'fields', label: 'Fields (comma-separated)', placeholder: 'email, first_name, last_name' },
    { kind: 'textarea', key: 'filter', label: 'Filter conditions', rows: 2, mono: true, placeholder: 'status = "active"' },
  ],
  source_api: [
    { kind: 'text', key: 'url', label: 'API URL', placeholder: 'https://api.example.com/customers' },
    { kind: 'select', key: 'method', label: 'Method', options: HTTP_METHOD_OPTS },
    { kind: 'textarea', key: 'headers', label: 'Headers (JSON)', rows: 3, mono: true, placeholder: '{"Authorization": "Bearer …"}' },
    { kind: 'select', key: 'pagination', label: 'Pagination', options: PAGINATION_OPTS },
    { kind: 'text', key: 'auth_credential', label: 'Credential', placeholder: 'Select credential' },
    { kind: 'number', key: 'timeout', label: 'Timeout (seconds)', min: 1, max: 300 },
    { kind: 'number', key: 'retry_count', label: 'Retry count', min: 0, max: 10 },
  ],
  source_file: [
    { kind: 'select', key: 'format', label: 'File format', options: FILE_FORMAT_OPTS },
    { kind: 'text', key: 'path', label: 'Storage path', placeholder: 'imports/customers.csv' },
    { kind: 'toggle', key: 'has_header', label: 'First row is header' },
    { kind: 'text', key: 'delimiter', label: 'Delimiter', placeholder: ',' },
    { kind: 'select', key: 'encoding', label: 'Encoding', options: [
      { value: 'utf-8', label: 'UTF-8' },
      { value: 'latin1', label: 'Latin-1' },
      { value: 'utf-16', label: 'UTF-16' },
    ]},
    { kind: 'number', key: 'skip_rows', label: 'Skip rows', min: 0, max: 1000 },
    { kind: 'number', key: 'batch_size', label: 'Batch size', min: 100, max: 100000, hint: 'Process in chunks for large files' },
  ],
  source_query: [
    { kind: 'textarea', key: 'query', label: 'SQL query', rows: 8, mono: true, placeholder: 'SELECT …' },
    { kind: 'toggle', key: 'read_only', label: 'Read-only (SELECT only)' },
    { kind: 'number', key: 'timeout', label: 'Timeout (seconds)', min: 1, max: 600 },
    { kind: 'number', key: 'max_rows', label: 'Maximum rows', min: 1, max: 10000000 },
  ],
  source_db_query: [
    { kind: 'connector', key: 'connector_id', label: 'Database connector' },
    { kind: 'textarea', key: 'query', label: 'Query', rows: 6, mono: true, placeholder: 'SELECT * FROM …' },
    { kind: 'toggle', key: 'parameterized', label: 'Use parameterized queries', hint: 'Protects against SQL injection' },
    { kind: 'number', key: 'timeout', label: 'Timeout (seconds)', min: 1, max: 600 },
  ],
  source_api_graphql: [
    { kind: 'text', key: 'url', label: 'GraphQL endpoint', placeholder: 'https://api.example.com/graphql' },
    { kind: 'textarea', key: 'query', label: 'Query', rows: 6, mono: true, placeholder: 'query { customers { id email } }' },
    { kind: 'textarea', key: 'variables', label: 'Variables (JSON)', rows: 3, mono: true },
    { kind: 'select', key: 'pagination', label: 'Pagination', options: PAGINATION_OPTS },
    { kind: 'text', key: 'auth_credential', label: 'Credential' },
  ],
  source_storage: [
    { kind: 'select', key: 'provider', label: 'Provider', options: [
      { value: 's3', label: 'Amazon S3' },
      { value: 'azure', label: 'Azure Blob' },
      { value: 'gcs', label: 'Google Cloud Storage' },
    ]},
    { kind: 'text', key: 'bucket', label: 'Bucket', placeholder: 'my-data-bucket' },
    { kind: 'text', key: 'prefix', label: 'Prefix / path', placeholder: 'data/customers/' },
    { kind: 'select', key: 'format', label: 'File format', options: FILE_FORMAT_OPTS },
    { kind: 'toggle', key: 'recursive', label: 'Recursive listing' },
  ],

  // ─── TRANSFORM ─────────────────────────────────────────────────────
  transform_select: [
    { kind: 'textarea', key: 'fields', label: 'Fields to keep', rows: 4, mono: true, placeholder: 'email\nfirst_name\nlast_name', hint: 'One field per line' },
    { kind: 'toggle', key: 'exclude', label: 'Exclude mode (remove listed fields instead)' },
  ],
  transform_map: [
    { kind: 'schema', key: 'target_schema', label: 'Target schema' },
    { kind: 'textarea', key: 'mapping_text', label: 'Field mappings', rows: 6, mono: true, placeholder: 'crm.email → email\ncrm.phone → mobile' },
  ],
  transform_rename: [
    { kind: 'textarea', key: 'renames', label: 'Rename rules', rows: 4, mono: true, placeholder: 'old_name → new_name', hint: 'One per line: source → target' },
  ],
  filter: [
    { kind: 'select', key: 'mode', label: 'Match mode', options: [
      { value: 'and', label: 'All conditions (AND)' },
      { value: 'or', label: 'Any condition (OR)' },
    ]},
    { kind: 'textarea', key: 'conditions_text', label: 'Conditions', rows: 5, mono: true,
      placeholder: 'email contains @\nstatus equals active', hint: 'One per line: field operator value' },
    { kind: 'textarea', key: 'condition_expression', label: 'Expression (advanced)', rows: 2, mono: true, placeholder: '{{record.age}} >= 18 AND {{record.email}} != null', hint: 'Use instead of conditions for complex filters' },
    { kind: 'toggle', key: 'emit_no_match', label: 'Emit non-matching records', hint: 'Route non-matching records to the NO_MATCH output port' },
  ],
  transform_calculate: [
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'total_value' },
    { kind: 'textarea', key: 'expression', label: 'Expression', rows: 3, mono: true, placeholder: 'price * quantity * (1 - discount)' },
    { kind: 'select', key: 'type', label: 'Output type', options: [
      { value: 'string', label: 'String' },
      { value: 'number', label: 'Number' },
      { value: 'boolean', label: 'Boolean' },
      { value: 'date', label: 'Date' },
    ]},
  ],
  transform_format: [
    { kind: 'column_picker', key: 'field', label: 'Field', placeholder: 'email', hint: 'Select column to format' },
    { kind: 'select', key: 'operation', label: 'Operation', options: [
      { value: 'lowercase', label: 'Lowercase' },
      { value: 'uppercase', label: 'Uppercase' },
      { value: 'trim', label: 'Trim whitespace' },
      { value: 'titlecase', label: 'Title Case' },
      { value: 'date_format', label: 'Format date' },
      { value: 'number_format', label: 'Format number' },
      { value: 'phone_format', label: 'Format phone (E.164)' },
      { value: 'slug', label: 'Slugify' },
    ]},
    { kind: 'text', key: 'format_string', label: 'Format string', placeholder: 'YYYY-MM-DD', hint: 'For date/number formatting' },
  ],
  transform_join: [
    { kind: 'select', key: 'join_type', label: 'Join type', options: [
      { value: 'inner', label: 'Inner' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'full', label: 'Full outer' },
    ]},
    { kind: 'column_picker', key: 'left_key', label: 'Left key', placeholder: 'customer_id' },
    { kind: 'column_picker', key: 'right_key', label: 'Right key', placeholder: 'id' },
    { kind: 'schema', key: 'right_schema', label: 'Right schema' },
  ],
  transform_aggregate: [
    { kind: 'column_picker', key: 'group_by', label: 'Group by field', placeholder: 'country' },
    { kind: 'textarea', key: 'metrics_text', label: 'Metrics', rows: 4, mono: true,
      placeholder: 'count id total\nsum order_value revenue\navg score avg_score', hint: 'fn field alias per line' },
  ],
  transform_dedupe: [
    { kind: 'column_picker', key: 'keys', label: 'Dedupe keys', placeholder: 'email, mobile', hint: 'Comma-separated fields to identify duplicates. Run the pipeline once to populate column list.' },
    { kind: 'select', key: 'keep', label: 'Keep row', options: [
      { value: 'first', label: 'First occurrence' },
      { value: 'last', label: 'Last occurrence' },
    ]},
    { kind: 'select', key: 'max_duplicates', label: 'Duplicates to keep per key', options: [
      { value: '0', label: '0 — Only unique (no duplicates)' },
      { value: '1', label: '1 — 1 unique + 1 duplicate' },
      { value: '2', label: '2 — 1 unique + 2 duplicates' },
      { value: '3', label: '3 — 1 unique + 3 duplicates' },
      { value: '5', label: '5 — 1 unique + 5 duplicates' },
      { value: '-1', label: 'All — Keep everything (just tag duplicates)' },
    ], hint: '0 = strict dedup (only unique rows pass). Higher = allow N extra copies per key.' },
    { kind: 'toggle', key: 'output_duplicates', label: 'Output duplicate/excluded records', hint: 'Route excluded rows to the "Duplicates" output handle' },
  ],
  enrich_lookup: [
    { kind: 'schema', key: 'lookup_schema', label: 'Lookup schema' },
    { kind: 'column_picker', key: 'local_key', label: 'Local key', placeholder: 'email' },
    { kind: 'column_picker', key: 'lookup_key', label: 'Lookup key', placeholder: 'email' },
    { kind: 'text', key: 'fields', label: 'Fields to add', placeholder: 'first_name, last_name, loyalty_tier' },
  ],
  transform_lookup: [
    { kind: 'text', key: 'lookup_table', label: 'Lookup table', placeholder: 'country_codes' },
    { kind: 'column_picker', key: 'local_key', label: 'Local key', placeholder: 'country_code' },
    { kind: 'column_picker', key: 'lookup_key', label: 'Lookup key', placeholder: 'code' },
    { kind: 'text', key: 'return_field', label: 'Return field', placeholder: 'country_name' },
    { kind: 'text', key: 'default_value', label: 'Default value', placeholder: 'Unknown' },
  ],
  transform_split: [
    { kind: 'column_picker', key: 'field', label: 'Split field', placeholder: 'country' },
    { kind: 'select', key: 'operator', label: 'Operator', options: [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'in', label: 'in list' },
      { value: 'regex', label: 'regex match' },
    ]},
    { kind: 'text', key: 'value', label: 'Match value', placeholder: 'IN,US,UK' },
  ],
  merge_streams: [
    { kind: 'select', key: 'mode', label: 'Merge mode', options: [
      { value: 'append', label: 'Append all rows' },
      { value: 'union', label: 'Union distinct' },
      { value: 'interleave', label: 'Interleave by key' },
    ]},
    { kind: 'text', key: 'dedupe_keys', label: 'Dedupe keys (optional)', placeholder: 'email' },
  ],
  transform_expression: [
    { kind: 'column_picker', key: 'field', label: 'Source field', placeholder: 'first_name' },
    { kind: 'text', key: 'expression', label: 'Expression', placeholder: 'Lower(first_name)' },
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'first_name_normalized' },
  ],
  set_union: [
    { kind: 'column_picker', key: 'key_fields', label: 'Key fields for dedup', placeholder: 'email, customer_id', hint: 'Leave empty to keep all rows (append).' },
    { kind: 'toggle', key: 'remove_duplicates', label: 'Remove duplicate rows by key', hint: 'When on, rows with matching keys are deduplicated across inputs' },
  ],
  set_intersection: [
    { kind: 'column_picker', key: 'key_fields', label: 'Key fields', placeholder: 'email, customer_id', hint: 'Rows must match on ALL listed fields across ALL inputs.' },
  ],
  set_exclusion: [
    { kind: 'column_picker', key: 'key_fields', label: 'Key fields', placeholder: 'email, customer_id', hint: 'Rows from first input are kept only if NO match in other inputs.' },
  ],

  // ─── DECISIONING ───────────────────────────────────────────────────
  decision_condition: [
    { kind: 'select', key: 'evaluation_mode', label: 'Evaluation mode', options: [
      { value: 'workflow', label: 'Workflow — evaluate once, route all records' },
      { value: 'record', label: 'Record — evaluate per record, split across branches' },
    ], hint: 'Workflow mode routes the entire set; Record mode splits records individually' },
    { kind: 'column_picker', key: 'field', label: 'Field', placeholder: 'status' },
    { kind: 'select', key: 'operator', label: 'Operator', options: [
      { value: 'equals', label: 'equals' },
      { value: 'not_equals', label: 'not equals' },
      { value: 'contains', label: 'contains' },
      { value: 'not_contains', label: 'not contains' },
      { value: 'starts_with', label: 'starts with' },
      { value: 'ends_with', label: 'ends with' },
      { value: 'gt', label: 'greater than' },
      { value: 'lt', label: 'less than' },
      { value: 'gte', label: '≥' },
      { value: 'lte', label: '≤' },
      { value: 'is_empty', label: 'is empty' },
      { value: 'is_not_empty', label: 'is not empty' },
      { value: 'is_null', label: 'is null' },
      { value: 'is_not_null', label: 'is not null' },
      { value: 'in', label: 'in list' },
      { value: 'not_in', label: 'not in list' },
      { value: 'regex', label: 'regex match' },
    ]},
    { kind: 'text', key: 'value', label: 'Value' },
    { kind: 'textarea', key: 'condition_expression', label: 'Expression (advanced)', rows: 2, mono: true, placeholder: '{{input.orderValue}} > 5000 AND {{input.tier}} == "VIP"', hint: 'Use instead of field/operator/value for complex conditions' },
  ],
  decision_audience: [
    { kind: 'text', key: 'audience_id', label: 'Audience ID', placeholder: 'aud_12345' },
    { kind: 'select', key: 'check_type', label: 'Check type', options: [
      { value: 'is_member', label: 'Is member' },
      { value: 'is_not_member', label: 'Is not member' },
    ]},
  ],
  decision_ab_test: [
    { kind: 'number', key: 'split_ratio', label: 'Variant A percentage', min: 1, max: 99, hint: 'Remainder goes to Variant B' },
    { kind: 'text', key: 'seed', label: 'Random seed', placeholder: 'Optional — for reproducible splits' },
    { kind: 'toggle', key: 'persist_assignment', label: 'Persist assignment per customer', hint: 'Same customer always gets same variant' },
  ],
  decision_eligibility: [
    { kind: 'textarea', key: 'rules', label: 'Eligibility rules', rows: 4, mono: true, placeholder: 'loyalty_tier in [Gold, Platinum]\nage >= 18' },
    { kind: 'toggle', key: 'check_offers', label: 'Check offer eligibility' },
    { kind: 'toggle', key: 'check_campaigns', label: 'Check campaign eligibility' },
  ],
  decision_freq_cap: [
    { kind: 'select', key: 'channel', label: 'Channel', options: [
      { value: 'all', label: 'All channels' },
      { value: 'email', label: 'Email' },
      { value: 'sms', label: 'SMS' },
      { value: 'push', label: 'Push' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ]},
    { kind: 'number', key: 'max_per_day', label: 'Max per day', min: 0, max: 100 },
    { kind: 'number', key: 'max_per_week', label: 'Max per week', min: 0, max: 500 },
    { kind: 'number', key: 'max_per_month', label: 'Max per month', min: 0, max: 2000 },
    { kind: 'number', key: 'lookback_hours', label: 'Lookback (hours)', min: 1, max: 8760 },
  ],
  decision_suppression: [
    { kind: 'text', key: 'list_id', label: 'Suppression list ID', placeholder: 'sup_12345' },
    { kind: 'column_picker', key: 'match_field', label: 'Match field', placeholder: 'email' },
  ],
  decision_engine: [
    { kind: 'select', key: 'strategy', label: 'Strategy', options: [
      { value: 'highest_score', label: 'Highest score wins' },
      { value: 'weighted_random', label: 'Weighted random' },
      { value: 'round_robin', label: 'Round robin' },
      { value: 'priority', label: 'Priority order' },
    ]},
    { kind: 'textarea', key: 'criteria', label: 'Decision criteria', rows: 4, mono: true, placeholder: 'action: email, score: engagement * 0.7 + recency * 0.3' },
    { kind: 'select', key: 'fallback', label: 'Fallback', options: [
      { value: 'skip', label: 'Skip (no action)' },
      { value: 'default', label: 'Use default action' },
    ]},
  ],
  decision_score: [
    { kind: 'select', key: 'model', label: 'Scoring model', options: [
      { value: 'engagement', label: 'Engagement score' },
      { value: 'propensity', label: 'Propensity to buy' },
      { value: 'churn', label: 'Churn risk' },
      { value: 'lead', label: 'Lead score' },
      { value: 'custom', label: 'Custom model' },
    ]},
    { kind: 'textarea', key: 'field_weights', label: 'Field weights', rows: 4, mono: true, placeholder: 'email_opens: 0.3\nsite_visits: 0.4\npurchases: 0.3', hint: 'field: weight per line' },
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'score' },
  ],

  // ─── AI & PERSONALIZATION ─────────────────────────────────────────
  ai_generate: [
    { kind: 'select', key: 'provider', label: 'Provider', options: [
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'google', label: 'Google' },
      { value: 'azure_openai', label: 'Azure OpenAI' },
      { value: 'bedrock', label: 'AWS Bedrock' },
    ]},
    { kind: 'select', key: 'model', label: 'Model', options: AI_MODEL_OPTS },
    { kind: 'textarea', key: 'system_prompt', label: 'System prompt', rows: 3, placeholder: 'You are a helpful marketing assistant…', hint: 'System-level instructions for the model' },
    { kind: 'textarea', key: 'prompt', label: 'User prompt', rows: 6, mono: false, placeholder: 'Generate a personalized subject line for {{customer.first_name}}…' },
    { kind: 'number', key: 'temperature', label: 'Temperature', min: 0, max: 2, hint: '0 = deterministic, 2 = creative' },
    { kind: 'number', key: 'max_tokens', label: 'Max tokens', min: 1, max: 128000 },
    { kind: 'number', key: 'top_p', label: 'Top P', min: 0, max: 1, hint: 'Nucleus sampling. 1.0 = no restriction.' },
    { kind: 'select', key: 'response_format', label: 'Response format', options: [
      { value: 'text', label: 'Text' },
      { value: 'json', label: 'JSON' },
      { value: 'json_schema', label: 'JSON Schema (structured)' },
    ], hint: 'JSON Schema mode forces output to match your schema' },
    { kind: 'textarea', key: 'json_schema', label: 'JSON Schema', rows: 4, mono: true, placeholder: '{"type":"object","properties":{"sentiment":{"type":"string"}}}', hint: 'Required when response format = JSON Schema' },
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'generated_text' },
    { kind: 'text', key: 'fallback_model', label: 'Fallback model', placeholder: 'e.g. claude-haiku-4-5', hint: 'Used if primary model is unavailable' },
    { kind: 'select', key: 'fallback_provider', label: 'Fallback provider', options: [
      { value: '', label: 'None' },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'google', label: 'Google' },
    ]},
    { kind: 'toggle', key: 'track_cost', label: 'Track token usage & cost' },
    { kind: 'select', key: 'safety_level', label: 'Safety controls', options: [
      { value: 'none', label: 'None' },
      { value: 'low', label: 'Low' },
      { value: 'standard', label: 'Standard' },
      { value: 'high', label: 'High' },
    ]},
    { kind: 'number', key: 'timeout', label: 'Timeout (seconds)', min: 1, max: 300 },
  ],
  ai_classify: [
    { kind: 'select', key: 'model', label: 'Model', options: AI_MODEL_OPTS },
    { kind: 'textarea', key: 'categories', label: 'Categories', rows: 4, placeholder: 'positive\nnegative\nneutral', hint: 'One category per line' },
    { kind: 'column_picker', key: 'input_field', label: 'Input field', placeholder: 'feedback_text' },
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'sentiment' },
    { kind: 'number', key: 'confidence_threshold', label: 'Min confidence', min: 0, max: 1 },
  ],
  ai_extract: [
    { kind: 'select', key: 'model', label: 'Model', options: AI_MODEL_OPTS },
    { kind: 'textarea', key: 'schema', label: 'Extraction schema', rows: 4, mono: true, placeholder: '{"name": "string", "date": "date", "amount": "number"}' },
    { kind: 'column_picker', key: 'input_field', label: 'Input field', placeholder: 'raw_text' },
    { kind: 'select', key: 'output_format', label: 'Output format', options: [
      { value: 'json', label: 'JSON object' },
      { value: 'flat', label: 'Flat fields' },
    ]},
  ],
  ai_translate: [
    { kind: 'select', key: 'model', label: 'Model', options: AI_MODEL_OPTS },
    { kind: 'select', key: 'source_lang', label: 'Source language', options: [
      { value: 'auto', label: 'Auto-detect' },
      { value: 'en', label: 'English' },
      { value: 'hi', label: 'Hindi' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'ja', label: 'Japanese' },
      { value: 'zh', label: 'Chinese' },
    ]},
    { kind: 'select', key: 'target_lang', label: 'Target language', options: [
      { value: 'en', label: 'English' },
      { value: 'hi', label: 'Hindi' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'ja', label: 'Japanese' },
      { value: 'zh', label: 'Chinese' },
    ]},
    { kind: 'column_picker', key: 'input_field', label: 'Input field', placeholder: 'description' },
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'description_translated' },
  ],
  ai_personalize: [
    { kind: 'select', key: 'model', label: 'Model', options: AI_MODEL_OPTS },
    { kind: 'textarea', key: 'template', label: 'Template / instructions', rows: 6, placeholder: 'Write a personalized offer for {{first_name}} who last purchased {{last_purchase_category}}…' },
    { kind: 'text', key: 'context_fields', label: 'Context fields', placeholder: 'first_name, loyalty_tier, last_purchase_category' },
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'personalized_content' },
  ],
  ai_recommend: [
    { kind: 'select', key: 'model', label: 'Model', options: [
      { value: 'collaborative', label: 'Collaborative filtering' },
      { value: 'content_based', label: 'Content-based' },
      { value: 'hybrid', label: 'Hybrid' },
      { value: 'popularity', label: 'Popularity-based' },
    ]},
    { kind: 'text', key: 'item_catalog', label: 'Item catalog schema', placeholder: 'products' },
    { kind: 'text', key: 'user_field', label: 'Customer ID field', placeholder: 'customer_id' },
    { kind: 'number', key: 'top_k', label: 'Number of recommendations', min: 1, max: 50 },
    { kind: 'text', key: 'output_field', label: 'Output field', placeholder: 'recommendations' },
  ],

  // ─── ACTIONS ───────────────────────────────────────────────────────
  action_email: [
    { kind: 'select', key: 'provider', label: 'Provider', options: [
      { value: 'resend', label: 'Resend' },
      { value: 'ses', label: 'AWS SES' },
      { value: 'sendgrid', label: 'SendGrid' },
      { value: 'mailgun', label: 'Mailgun' },
      { value: 'smtp', label: 'SMTP' },
    ]},
    { kind: 'column_picker', key: 'to', label: 'To (email field)', placeholder: 'email', hint: 'Column containing recipient email address' },
    { kind: 'text', key: 'subject', label: 'Subject', placeholder: 'Hi {{first_name}}, check this out' },
    { kind: 'text', key: 'preheader', label: 'Preheader', placeholder: 'Preview text in inbox', hint: 'Shown in email client preview. Supports {{field}} templates.' },
    { kind: 'text', key: 'template_id', label: 'Template ID', placeholder: 'tpl_12345' },
    { kind: 'text', key: 'from', label: 'From address', placeholder: 'hello@company.com' },
    { kind: 'text', key: 'reply_to', label: 'Reply-to', placeholder: 'support@company.com' },
    { kind: 'text', key: 'cc', label: 'CC', placeholder: 'cc@example.com', hint: 'Comma-separated or {{field}} expression' },
    { kind: 'text', key: 'bcc', label: 'BCC', placeholder: 'bcc@example.com' },
    { kind: 'select', key: 'communication_type', label: 'Communication type', options: [
      { value: 'promotional', label: 'Promotional' },
      { value: 'transactional', label: 'Transactional' },
    ], hint: 'Transactional: send regardless of marketing consent. Promotional: requires opt-in.' },
    { kind: 'select', key: 'fallback_policy', label: 'Missing variable policy', options: [
      { value: 'use_default', label: 'Use default value' },
      { value: 'leave_blank', label: 'Leave blank' },
      { value: 'fail', label: 'Fail record' },
    ], hint: 'What to do when a personalization variable is missing' },
    { kind: 'toggle', key: 'suppress_duplicates', label: 'Suppress duplicate emails', hint: 'Skip duplicate email addresses within same execution' },
    { kind: 'toggle', key: 'track_opens', label: 'Track opens' },
    { kind: 'toggle', key: 'track_clicks', label: 'Track clicks' },
    { kind: 'text', key: 'utm_source', label: 'UTM source', placeholder: 'newsletter' },
    { kind: 'text', key: 'utm_medium', label: 'UTM medium', placeholder: 'email' },
    { kind: 'text', key: 'utm_campaign', label: 'UTM campaign', placeholder: '{{campaign_name}}' },
    { kind: 'time', key: 'send_window_start', label: 'Send window start', hint: 'Only send during this window (optional)' },
    { kind: 'time', key: 'send_window_end', label: 'Send window end' },
    { kind: 'select', key: 'send_window_tz', label: 'Send window timezone', options: TIMEZONE_OPTS },
  ],
  action_sms: [
    { kind: 'select', key: 'provider', label: 'Provider', options: [
      { value: 'twilio', label: 'Twilio' },
      { value: 'gupshup', label: 'Gupshup' },
      { value: 'kaleyra', label: 'Kaleyra' },
      { value: 'custom', label: 'Custom gateway' },
    ]},
    { kind: 'column_picker', key: 'to_field', label: 'Phone field', placeholder: 'mobile' },
    { kind: 'textarea', key: 'message', label: 'Message', rows: 3, placeholder: 'Hi {{first_name}}, your order #{{order_id}} is ready!' },
    { kind: 'text', key: 'sender_id', label: 'Sender ID', placeholder: 'MARBEE' },
  ],
  action_whatsapp: [
    { kind: 'select', key: 'provider', label: 'Provider', options: [
      { value: 'meta', label: 'Meta Cloud API' },
      { value: 'gupshup', label: 'Gupshup' },
      { value: 'twilio', label: 'Twilio' },
    ]},
    { kind: 'column_picker', key: 'to_field', label: 'Phone field', placeholder: 'mobile' },
    { kind: 'text', key: 'template_id', label: 'Template name', placeholder: 'order_confirmation' },
    { kind: 'select', key: 'language', label: 'Language', options: [
      { value: 'en', label: 'English' },
      { value: 'hi', label: 'Hindi' },
      { value: 'es', label: 'Spanish' },
    ]},
    { kind: 'text', key: 'media_url', label: 'Media URL (optional)', placeholder: 'https://…' },
  ],
  action_push: [
    { kind: 'select', key: 'provider', label: 'Provider', options: [
      { value: 'fcm', label: 'Firebase (FCM)' },
      { value: 'apns', label: 'Apple (APNs)' },
      { value: 'web', label: 'Web Push' },
    ]},
    { kind: 'text', key: 'title', label: 'Title', placeholder: 'New offer just for you!' },
    { kind: 'textarea', key: 'body', label: 'Body', rows: 2, placeholder: '{{first_name}}, check out our latest deals' },
    { kind: 'text', key: 'icon', label: 'Icon URL', placeholder: 'https://…' },
    { kind: 'text', key: 'url', label: 'Click URL', placeholder: 'https://app.example.com/offers' },
    { kind: 'column_picker', key: 'token_field', label: 'Token field', placeholder: 'push_token' },
  ],
  action_webhook: [
    { kind: 'text', key: 'url', label: 'Endpoint URL', placeholder: 'https://…' },
    { kind: 'select', key: 'method', label: 'Method', options: [{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }] },
    { kind: 'textarea', key: 'payload_template', label: 'Payload template', rows: 4, mono: true, placeholder: '{"customerId": "{{customer_id}}", "event": "…"}' },
    { kind: 'textarea', key: 'headers', label: 'Headers (JSON)', rows: 2, mono: true },
    { kind: 'number', key: 'retry', label: 'Retry count', min: 0, max: 10 },
  ],
  action_http: [
    { kind: 'text', key: 'url', label: 'URL', placeholder: 'https://api.example.com/…', hint: 'Supports {{field}} expressions. Private IPs blocked by default (SSRF protection).' },
    { kind: 'select', key: 'method', label: 'Method', options: [
      { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' },
      { value: 'PATCH', label: 'PATCH' }, { value: 'DELETE', label: 'DELETE' },
      { value: 'HEAD', label: 'HEAD' }, { value: 'OPTIONS', label: 'OPTIONS' },
    ]},
    { kind: 'select', key: 'auth_type', label: 'Authentication', options: [
      { value: 'none', label: 'None' },
      { value: 'api_key', label: 'API Key' },
      { value: 'bearer', label: 'Bearer Token' },
      { value: 'basic', label: 'Basic Auth' },
      { value: 'oauth2', label: 'OAuth 2.0' },
    ]},
    { kind: 'text', key: 'auth_credential', label: 'Credential reference', placeholder: 'Select credential' },
    { kind: 'textarea', key: 'headers', label: 'Headers (JSON)', rows: 2, mono: true, placeholder: '{"X-Custom":"value"}' },
    { kind: 'textarea', key: 'query_params', label: 'Query params (JSON)', rows: 2, mono: true, placeholder: '{"page":"1","limit":"100"}' },
    { kind: 'select', key: 'body_content_type', label: 'Body content type', options: [
      { value: 'json', label: 'JSON' },
      { value: 'form_urlencoded', label: 'Form URL-encoded' },
      { value: 'multipart', label: 'Multipart' },
      { value: 'raw', label: 'Raw text' },
      { value: 'xml', label: 'XML' },
    ]},
    { kind: 'textarea', key: 'body', label: 'Body', rows: 4, mono: true, placeholder: '{"key":"{{value}}"}' },
    { kind: 'toggle', key: 'follow_redirects', label: 'Follow redirects', hint: 'Max 5 redirects' },
    { kind: 'select', key: 'response_type', label: 'Expected response', options: [
      { value: 'json', label: 'JSON' },
      { value: 'text', label: 'Text' },
      { value: 'binary', label: 'Binary' },
      { value: 'xml', label: 'XML' },
    ]},
    { kind: 'text', key: 'success_codes', label: 'Success status codes', placeholder: '200-299', hint: 'e.g. 200-299,302. Other codes treated as error.' },
    { kind: 'select', key: 'pagination_type', label: 'Pagination', options: [
      { value: 'none', label: 'None' },
      { value: 'cursor', label: 'Cursor' },
      { value: 'page_number', label: 'Page number' },
      { value: 'offset', label: 'Offset' },
      { value: 'link_header', label: 'Link header' },
    ]},
    { kind: 'text', key: 'pagination_cursor_path', label: 'Cursor path', placeholder: '$.metadata.nextCursor', hint: 'JSONPath to next cursor in response' },
    { kind: 'number', key: 'pagination_limit', label: 'Page size', min: 1, max: 10000 },
    { kind: 'number', key: 'pagination_max_pages', label: 'Max pages', min: 1, max: 1000 },
    { kind: 'number', key: 'rate_limit', label: 'Rate limit (req/min)', min: 0, max: 10000, hint: '0 = no limit' },
    { kind: 'number', key: 'timeout', label: 'Timeout (seconds)', min: 1, max: 300 },
    { kind: 'number', key: 'retry', label: 'Retry count', min: 0, max: 10 },
  ],
  action_crm: [
    { kind: 'connector', key: 'connector_id', label: 'CRM Connector' },
    { kind: 'text', key: 'object', label: 'Object', placeholder: 'Contact' },
    { kind: 'select', key: 'operation', label: 'Operation', options: WRITE_MODE_OPTS },
    { kind: 'column_picker', key: 'match_field', label: 'Match field', placeholder: 'email' },
    { kind: 'textarea', key: 'field_mapping', label: 'Field mapping', rows: 4, mono: true, placeholder: 'email → Email\nfirst_name → FirstName' },
  ],
  action_db_write: [
    { kind: 'schema', key: 'schema', label: 'Target schema' },
    { kind: 'select', key: 'mode', label: 'Write mode', options: WRITE_MODE_OPTS },
    { kind: 'column_picker', key: 'match_key', label: 'Match key', placeholder: 'email' },
    { kind: 'number', key: 'batch_size', label: 'Batch size', min: 1, max: 10000 },
  ],
  action_audience: [
    { kind: 'select', key: 'operation', label: 'Operation', options: [
      { value: 'add', label: 'Add to audience (Add if not exist)' },
      { value: 'purge_refresh', label: 'Purge and refresh audience' },
      { value: 'remove', label: 'Remove from audience' },
      { value: 'create', label: 'Create audience' },
    ]},
    { kind: 'text', key: 'audience_name', label: 'Audience Name Pattern', placeholder: 'VIP_Segment_{{date}}', showWhen: { key: 'operation', equals: 'create' }, hint: 'Supports dynamic date expressions (e.g. {{date}}, {{now}}, {{timestamp}})' },
    { kind: 'text', key: 'audience_id', label: 'Audience ID / Name', placeholder: 'aud_12345 or Audience_{{date}}', showWhen: { key: 'operation', equals: '__not_create__' }, hint: 'Target audience identifier. Supports dynamic date expressions.' },
    { kind: 'column_picker', key: 'match_field', label: 'Match key(s)', placeholder: 'email or email, customer_id', hint: 'Specify single key (e.g. email) or multiple keys separated by comma (e.g. email, customer_id)' },
  ],
  action_export: [
    { kind: 'select', key: 'format', label: 'Format', options: FILE_FORMAT_OPTS },
    { kind: 'select', key: 'destination', label: 'Destination', options: [
      { value: 'storage', label: 'Storage bucket' },
      { value: 'sftp', label: 'SFTP' },
      { value: 's3', label: 'Amazon S3' },
      { value: 'download', label: 'Direct download' },
    ]},
    { kind: 'text', key: 'filename', label: 'Filename pattern', placeholder: 'export_{date}.csv' },
    { kind: 'toggle', key: 'compress', label: 'Gzip compress' },
  ],

  // ─── CONTROL FLOW ──────────────────────────────────────────────────
  flow_wait: [
    { kind: 'select', key: 'wait_type', label: 'Wait until', options: [
      { value: 'duration', label: 'Fixed duration' },
      { value: 'datetime', label: 'Specific date & time' },
    ]},
    { kind: 'number', key: 'weeks', label: 'Weeks', min: 0, max: 520, visibleWhen: { key: 'wait_type', value: 'duration' } },
    { kind: 'number', key: 'days', label: 'Days', min: 0, max: 365, visibleWhen: { key: 'wait_type', value: 'duration' } },
    { kind: 'number', key: 'hours', label: 'Hours', min: 0, max: 23, visibleWhen: { key: 'wait_type', value: 'duration' } },
    { kind: 'number', key: 'minutes', label: 'Minutes', min: 0, max: 59, visibleWhen: { key: 'wait_type', value: 'duration' } },
    { kind: 'number', key: 'seconds', label: 'Seconds', min: 0, max: 59, visibleWhen: { key: 'wait_type', value: 'duration' } },
    { kind: 'date', key: 'until_datetime', label: 'Resume at (date & time)', placeholder: '2026-10-23T12:55:00', visibleWhen: { key: 'wait_type', value: 'datetime' } },
  ],
  flow_loop: [
    { kind: 'text', key: 'input_field', label: 'Input array field', placeholder: 'items' },
    { kind: 'text', key: 'variable_name', label: 'Variable name', placeholder: 'item' },
    { kind: 'number', key: 'max_iterations', label: 'Max iterations', min: 1, max: 100000 },
  ],
  flow_batch: [
    { kind: 'number', key: 'batch_size', label: 'Batch size', min: 1, max: 100000 },
    { kind: 'number', key: 'parallel_batches', label: 'Parallel batches', min: 1, max: 10 },
    { kind: 'number', key: 'delay_between', label: 'Delay between batches (ms)', min: 0, max: 60000 },
  ],
  flow_parallel: [
    { kind: 'number', key: 'branches', label: 'Number of branches', min: 2, max: 10 },
    { kind: 'toggle', key: 'wait_for_all', label: 'Wait for all branches to complete' },
  ],
  flow_merge: [
    { kind: 'select', key: 'strategy', label: 'Merge strategy', options: [
      { value: 'wait_all', label: 'Wait for all inputs' },
      { value: 'wait_any', label: 'Continue on first input' },
    ]},
    { kind: 'number', key: 'timeout', label: 'Timeout (seconds)', min: 1, max: 3600 },
  ],
  flow_sub_workflow: [
    { kind: 'text', key: 'workflow_id', label: 'Workflow ID', placeholder: 'wf_12345' },
    { kind: 'toggle', key: 'pass_data', label: 'Pass current data to sub-workflow' },
    { kind: 'toggle', key: 'wait', label: 'Wait for completion' },
  ],
  flow_end: [
    { kind: 'select', key: 'status', label: 'Exit status', options: [
      { value: 'success', label: 'Success' },
      { value: 'failed', label: 'Failed' },
      { value: 'canceled', label: 'Canceled' },
    ]},
    { kind: 'text', key: 'message', label: 'Exit message', placeholder: 'Pipeline completed successfully' },
  ],

  // ─── MONITORING ────────────────────────────────────────────────────
  monitor_log: [
    { kind: 'select', key: 'level', label: 'Log level', options: [
      { value: 'debug', label: 'Debug' },
      { value: 'info', label: 'Info' },
      { value: 'warn', label: 'Warning' },
      { value: 'error', label: 'Error' },
    ]},
    { kind: 'textarea', key: 'message', label: 'Message', rows: 2, placeholder: 'Processed {{count}} records for {{customer.country}}' },
    { kind: 'toggle', key: 'include_data', label: 'Include current row data' },
    { kind: 'toggle', key: 'mask_pii', label: 'Mask PII fields' },
  ],
  monitor_track: [
    { kind: 'text', key: 'event_name', label: 'Event name', placeholder: 'campaign_sent' },
    { kind: 'textarea', key: 'properties', label: 'Properties (JSON)', rows: 3, mono: true, placeholder: '{"channel": "email", "campaign_id": "{{campaign_id}}"}' },
    { kind: 'column_picker', key: 'customer_id_field', label: 'Customer ID field', placeholder: 'customer_id' },
  ],
  monitor_profile: [
    { kind: 'column_picker', key: 'customer_id_field', label: 'Customer ID field', placeholder: 'customer_id' },
    { kind: 'textarea', key: 'attributes', label: 'Attributes to update', rows: 4, mono: true, placeholder: 'last_campaign_date: {{now}}\ncampaign_count: {{campaign_count + 1}}' },
    { kind: 'select', key: 'merge_strategy', label: 'Merge strategy', options: [
      { value: 'overwrite', label: 'Overwrite existing' },
      { value: 'merge', label: 'Deep merge' },
      { value: 'append', label: 'Append to arrays' },
    ]},
  ],
  monitor_status: [
    { kind: 'select', key: 'status', label: 'Status', options: [
      { value: 'success', label: 'Success' },
      { value: 'partial', label: 'Partial' },
      { value: 'failed', label: 'Failed' },
    ]},
    { kind: 'textarea', key: 'metadata', label: 'Metadata (JSON)', rows: 3, mono: true, placeholder: '{"records_processed": {{count}}}' },
  ],
  monitor_alert: [
    { kind: 'select', key: 'channel', label: 'Alert channel', options: [
      { value: 'slack', label: 'Slack' },
      { value: 'email', label: 'Email' },
      { value: 'webhook', label: 'Webhook' },
      { value: 'pagerduty', label: 'PagerDuty' },
    ]},
    { kind: 'select', key: 'condition', label: 'When to alert', options: [
      { value: 'always', label: 'Always' },
      { value: 'on_error', label: 'On error only' },
      { value: 'on_threshold', label: 'When threshold exceeded' },
    ]},
    { kind: 'text', key: 'webhook_url', label: 'Webhook / channel URL', placeholder: 'https://hooks.slack.com/…' },
    { kind: 'textarea', key: 'message', label: 'Alert message', rows: 2, placeholder: 'Pipeline {{workflow.name}} failed: {{error.message}}' },
    { kind: 'select', key: 'severity', label: 'Severity', options: [
      { value: 'info', label: 'Info' },
      { value: 'warning', label: 'Warning' },
      { value: 'critical', label: 'Critical' },
    ]},
  ],

  // ─── LEGACY ────────────────────────────────────────────────────────
  target: [
    { kind: 'schema', key: 'schema', label: 'Target schema' },
    { kind: 'select', key: 'mode', label: 'Write mode', options: WRITE_MODE_OPTS },
    { kind: 'text', key: 'match_key', label: 'Match key', placeholder: 'email' },
  ],
  target_export: [
    { kind: 'select', key: 'format', label: 'Format', options: FILE_FORMAT_OPTS },
    { kind: 'select', key: 'destination', label: 'Destination', options: [
      { value: 'storage', label: 'Storage bucket' },
      { value: 'sftp', label: 'SFTP' },
      { value: 'download', label: 'Direct download' },
    ]},
    { kind: 'text', key: 'filename', label: 'Filename pattern', placeholder: 'export_{date}.csv' },
    { kind: 'toggle', key: 'compress', label: 'Gzip compress' },
  ],
  target_connector: [
    { kind: 'connector', key: 'connector_id', label: 'Connector' },
    { kind: 'number', key: 'batch_size', label: 'Batch size', min: 1, max: 1000 },
  ],
  target_webhook: [
    { kind: 'text', key: 'url', label: 'Endpoint URL', placeholder: 'https://…' },
    { kind: 'select', key: 'method', label: 'Method', options: [{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }] },
    { kind: 'textarea', key: 'payload_template', label: 'Payload template', rows: 4, mono: true },
  ],
  target_email: [
    { kind: 'text', key: 'to', label: 'Recipients', placeholder: 'ops@company.com' },
    { kind: 'text', key: 'subject', label: 'Subject' },
    { kind: 'toggle', key: 'attach_export', label: 'Attach export file' },
  ],
  validate: [
    { kind: 'select', key: 'on_fail', label: 'On failure', options: ON_FAIL_OPTS },
    { kind: 'textarea', key: 'rules_text', label: 'Rules', rows: 5, mono: true, placeholder: 'email email_format\nmobile not_empty' },
  ],
  validate_schema: [
    { kind: 'schema', key: 'schema', label: 'Schema' },
    { kind: 'toggle', key: 'strict', label: 'Strict type checking' },
  ],
  validate_anomaly: [
    { kind: 'column_picker', key: 'field', label: 'Numeric field', placeholder: 'order_total' },
    { kind: 'select', key: 'method', label: 'Method', options: [
      { value: 'zscore', label: 'Z-score' },
      { value: 'iqr', label: 'IQR' },
    ]},
    { kind: 'number', key: 'threshold', label: 'Threshold', min: 1, max: 10 },
  ],
  branch_if: [
    { kind: 'column_picker', key: 'field', label: 'Field', placeholder: 'status' },
    { kind: 'select', key: 'operator', label: 'Operator', options: [
      { value: 'equals', label: 'equals' },
      { value: 'not_equals', label: 'not equals' },
      { value: 'contains', label: 'contains' },
      { value: 'gt', label: 'greater than' },
      { value: 'is_empty', label: 'is empty' },
    ]},
    { kind: 'text', key: 'value', label: 'Value' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Config validation — checks required fields before Save/Publish
// ═══════════════════════════════════════════════════════════════════════════

type ValidationRule = { key: string; label: string };

const REQUIRED_FIELDS: Record<string, ValidationRule[]> = {
  source: [{ key: 'schema', label: 'Schema' }],
  source_connector: [{ key: 'connector_id', label: 'Connector' }],
  source_api: [{ key: 'url', label: 'API URL' }],
  source_query: [{ key: 'query', label: 'SQL query' }],
  source_db_query: [{ key: 'connector_id', label: 'Database connector' }],
  source_api_graphql: [{ key: 'url', label: 'Endpoint' }, { key: 'query', label: 'Query' }],
  source_storage: [{ key: 'bucket', label: 'Bucket' }],
  filter: [{ key: 'conditions_text', label: 'Conditions' }],
  transform_map: [{ key: 'target_schema', label: 'Target schema' }],
  transform_calculate: [{ key: 'output_field', label: 'Output field' }, { key: 'expression', label: 'Expression' }],
  transform_format: [{ key: 'field', label: 'Field' }],
  transform_join: [{ key: 'left_key', label: 'Left key' }, { key: 'right_key', label: 'Right key' }],
  transform_aggregate: [{ key: 'group_by', label: 'Group by field' }],
  transform_dedupe: [{ key: 'keys', label: 'Dedupe keys' }],
  enrich_lookup: [{ key: 'lookup_schema', label: 'Lookup schema' }, { key: 'local_key', label: 'Local key' }],
  transform_lookup: [{ key: 'lookup_table', label: 'Lookup table' }, { key: 'local_key', label: 'Local key' }],
  transform_split: [{ key: 'field', label: 'Split field' }],
  decision_condition: [{ key: 'field', label: 'Field' }],
  decision_suppression: [{ key: 'list_id', label: 'Suppression list' }],
  action_email: [{ key: 'to', label: 'Recipient field' }, { key: 'subject', label: 'Subject' }],
  action_sms: [{ key: 'to_field', label: 'Phone field' }, { key: 'message', label: 'Message' }],
  action_whatsapp: [{ key: 'to_field', label: 'Phone field' }, { key: 'template_id', label: 'Template' }],
  action_push: [{ key: 'title', label: 'Title' }, { key: 'token_field', label: 'Token field' }],
  action_webhook: [{ key: 'url', label: 'Endpoint URL' }],
  action_http: [{ key: 'url', label: 'API URL' }],
  action_crm: [{ key: 'connector_id', label: 'CRM connector' }],
  action_db_write: [{ key: 'schema', label: 'Target schema' }],
  action_audience: [{ key: 'audience_id', label: 'Audience' }],
  ai_generate: [{ key: 'prompt', label: 'Prompt' }, { key: 'provider', label: 'Provider' }, { key: 'model', label: 'Model' }],
  ai_classify: [{ key: 'categories', label: 'Categories' }, { key: 'input_field', label: 'Input field' }],
  ai_extract: [{ key: 'schema', label: 'Extraction schema' }, { key: 'input_field', label: 'Input field' }],
  ai_translate: [{ key: 'input_field', label: 'Input field' }],
  trigger_event: [{ key: 'event_name', label: 'Event name' }],
  trigger_webhook: [{ key: 'path', label: 'Webhook path' }],
  monitor_track: [{ key: 'event_name', label: 'Event name' }],
  monitor_alert: [{ key: 'webhook_url', label: 'Webhook URL' }],
  validate: [{ key: 'rules_text', label: 'Validation rules' }],
  validate_schema: [{ key: 'schema', label: 'Schema' }],
  validate_anomaly: [{ key: 'field', label: 'Numeric field' }],
  target: [{ key: 'schema', label: 'Target schema' }],
  target_connector: [{ key: 'connector_id', label: 'Connector' }],
  target_email: [{ key: 'to', label: 'Recipients' }],
};

export function validateNodeConfig(stepType: string, config: Record<string, unknown>): string[] {
  const t = normalizeStepType(stepType);
  const rules = REQUIRED_FIELDS[t];
  if (!rules) return [];
  const errors: string[] = [];
  for (const rule of rules) {
    const v = config[rule.key];
    if (v == null || (typeof v === 'string' && !v.trim())) {
      errors.push(`${rule.label} is required`);
    }
  }
  return errors;
}

export const UI_ICONS = { Workflow, Boxes, Hash, Table2, ScanSearch, Repeat, Combine, Bell };
