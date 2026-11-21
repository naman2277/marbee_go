import { useState, Fragment } from 'react';
import {
  Plus, Trash2, ArrowRight, Database, Waypoints, AlertTriangle, Sparkles,
  CheckCircle2, RefreshCw, Key, Shield, Code2, Layers, Zap, Info, ArrowRightLeft,
  Check, X, Clock, Play, GitBranch
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionCard, Field, fieldInput, fieldInputSm, TabHeading } from '../studio-ui';
import type { TabProps } from '../types';
import { newId } from '../types';
import type { ChatBotFieldMapping, ChatBotTransform, DataProcessingTrigger, DataProcessing } from '@/lib/chatbots';
import { DEFAULT_DATA_PROCESSING } from '@/lib/chatbots';

const TRANSFORMS: Array<{ value: ChatBotTransform; label: string; description: string }> = [
  { value: 'none', label: 'No transform', description: 'Pass value directly to target column' },
  { value: 'lowercase', label: 'Lowercase', description: 'Convert text to lowercase (e.g. email)' },
  { value: 'uppercase', label: 'Uppercase', description: 'Convert text to UPPERCASE (e.g. country code)' },
  { value: 'trim', label: 'Trim whitespace', description: 'Strip leading and trailing whitespace' },
  { value: 'format_phone', label: 'Format phone', description: 'Normalize phone numbers into E.164 format' },
  { value: 'format_date', label: 'Format date', description: 'Parse into standard ISO date string' },
  { value: 'default_value', label: 'Default fallback', description: 'Use default value if bot field is empty' },
  { value: 'static_value', label: 'Static value', description: 'Always save a hardcoded constant value' },
  { value: 'concatenate', label: 'Concatenate', description: 'Combine multiple fields with custom text' },
  { value: 'expression', label: 'Expression', description: 'Advanced template formatting with variables' },
];

const SYSTEM_SOURCE_FIELDS = [
  { key: 'sentiment', label: 'Sentiment (Positive/Negative/Neutral)', system: true, type: 'string' },
  { key: 'intent', label: 'Primary Intent', system: true, type: 'string' },
  { key: 'lead_status', label: 'Lead Qualification Status', system: true, type: 'string' },
  { key: 'session_id', label: 'Chat Session ID', system: true, type: 'string' },
  { key: 'language', label: 'Detected Language', system: true, type: 'string' },
  { key: 'summary', label: 'Conversation Summary', system: true, type: 'string' },
];

// Helper color badge for database column data types
function TypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  const t = type.toLowerCase();
  let color = 'bg-slate-100 text-slate-600 border-slate-200';
  if (t.includes('string') || t.includes('text') || t.includes('varchar')) {
    color = 'bg-sky-50 text-sky-700 border-sky-200';
  } else if (t.includes('int') || t.includes('num') || t.includes('decimal') || t.includes('float')) {
    color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (t.includes('bool')) {
    color = 'bg-purple-50 text-purple-700 border-purple-200';
  } else if (t.includes('date') || t.includes('time') || t.includes('stamp')) {
    color = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (t.includes('json') || t.includes('object')) {
    color = 'bg-indigo-50 text-indigo-700 border-indigo-200';
  } else if (t.includes('email') || t.includes('phone')) {
    color = 'bg-teal-50 text-teal-700 border-teal-200';
  }

  return (
    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-tight', color)}>
      {type}
    </span>
  );
}

export function SchemaMappingTab({ draft, update, schemas }: TabProps) {
  const bot = draft.bot;
  const setBot = (patch: Partial<typeof bot>) => update((d) => ({ ...d, bot: { ...d.bot, ...patch } }));
  const mappings = draft.mappings;
  const setMappings = (next: ChatBotFieldMapping[]) => update((d) => ({ ...d, mappings: next }));

  const dp: DataProcessing = bot.context?.data_processing ?? DEFAULT_DATA_PROCESSING;
  const setDp = (patch: Partial<DataProcessing>) =>
    setBot({ context: { ...bot.context, data_processing: { ...dp, ...patch } } });

  const [showPreview, setShowPreview] = useState(true);

  const selectedSchema = schemas.find((s) => s.id === bot.target_schema_id);
  const targetFields = (selectedSchema?.schema_fields ?? []) as Array<{ name: string; field_type: string }>;
  const sourceOptions: Array<{ key: string; label: string; system: boolean; type: string; pii?: boolean }> = [
    ...draft.fields.map((f) => ({ key: f.field_key, label: f.display_label, system: false, type: f.data_type, pii: f.pii_flag })),
    ...SYSTEM_SOURCE_FIELDS,
  ];

  const currentUpsertKeys = (bot.upsert_key ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const toggleUpsertKey = (key: string) => {
    let next: string[];
    if (currentUpsertKeys.includes(key)) {
      next = currentUpsertKeys.filter((k) => k !== key);
    } else {
      next = [...currentUpsertKeys, key];
    }
    setBot({ upsert_key: next.length > 0 ? next.join(',') : null });
  };

  const usedTargets = new Set(mappings.map((m) => m.target_field).filter(Boolean));
  const freeTargets = targetFields.filter((f) => !usedTargets.has(f.name));
  const canAdd = Boolean(selectedSchema) && sourceOptions.length > 0 && freeTargets.length > 0;

  const addMapping = () => {
    if (!canAdd) return;
    setMappings([
      ...mappings,
      {
        id: newId(),
        chatbot_id: bot.id,
        source_field_key: sourceOptions[0].key,
        target_field: freeTargets[0].name,
        transformation: 'none',
        transformation_config: {},
        sort_order: mappings.length,
      },
    ]);
  };

  const patchMapping = (id: string, p: Partial<ChatBotFieldMapping>) =>
    setMappings(mappings.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const autoMap = () => {
    const existingTargets = new Set(mappings.map((m) => m.target_field));
    const additions: ChatBotFieldMapping[] = [];
    for (const src of sourceOptions) {
      const match = targetFields.find(
        (t) => !existingTargets.has(t.name) && t.name.toLowerCase() === src.key.toLowerCase(),
      );
      if (match) {
        existingTargets.add(match.name);
        additions.push({
          id: newId(),
          chatbot_id: bot.id,
          source_field_key: src.key,
          target_field: match.name,
          transformation: src.key === 'email' ? 'lowercase' : 'none',
          transformation_config: {},
          sort_order: mappings.length + additions.length,
        });
      }
    }
    if (additions.length) setMappings([...mappings, ...additions]);
  };

  const clearAllMappings = () => {
    if (mappings.length === 0) return;
    setMappings([]);
  };

  // Generate sample JSON payload preview based on mappings
  const samplePayload: Record<string, unknown> = {};
  mappings.forEach((m) => {
    if (!m.target_field) return;
    const src = sourceOptions.find((s) => s.key === m.source_field_key);
    let val: unknown = `<${m.source_field_key || 'field'}>`;

    if (m.transformation === 'static_value') {
      val = m.transformation_config.value || 'static_value';
    } else if (m.transformation === 'default_value') {
      val = `<${m.source_field_key}> || "${m.transformation_config.default || 'fallback'}"`;
    } else if (m.transformation === 'lowercase') {
      val = src?.key === 'email' ? 'john.doe@example.com' : 'sample_text';
    } else if (m.transformation === 'uppercase') {
      val = 'SAMPLE_TEXT';
    } else if (m.transformation === 'expression' || m.transformation === 'concatenate') {
      val = m.transformation_config.template || '{{first_name}} {{last_name}}';
    } else if (src?.key === 'email') {
      val = 'jane.smith@acme.com';
    } else if (src?.key === 'first_name') {
      val = 'Jane';
    } else if (src?.key === 'last_name') {
      val = 'Smith';
    } else if (src?.key === 'sentiment') {
      val = 'positive';
    } else if (src?.key === 'intent') {
      val = 'request_quote';
    } else if (src?.key === 'lead_status') {
      val = 'qualified';
    }

    samplePayload[m.target_field] = val;
  });

  const requiredCapturedFields = draft.fields.filter((f) => f.required);
  const mappedSourceKeys = new Set(mappings.map((m) => m.source_field_key));
  const unmappedRequiredCount = requiredCapturedFields.filter((f) => !mappedSourceKeys.has(f.field_key)).length;

  return (
    <div className="space-y-6">
      {/* Clean Tab Heading */}
      <TabHeading
        title="Schema Mapping"
        description="Where captured customer info is persisted, and how each field maps to your target schema."
      />

      {/* Target Schema & Mode Config Card */}
      <SectionCard
        icon={Database}
        title="Target Schema & Persistence Strategy"
        description="Select the schema where captured data is written and configure composite duplicate handling."
      >
        <div className="space-y-5">
          {/* Target Schema Dropdown & Quick Summary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Field label="Target Database Schema" required className="lg:col-span-7">
              <select
                className={cn(fieldInput, 'font-medium')}
                value={bot.target_schema_id ?? ''}
                onChange={(e) => setBot({ target_schema_id: e.target.value || null })}
              >
                <option value="">-- Select Target Schema --</option>
                {schemas
                  .filter((s) => s.table_name)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.table_name}) — {s.schema_fields?.length ?? 0} columns
                    </option>
                  ))}
              </select>
            </Field>

            <div className="flex items-end lg:col-span-5">
              {selectedSchema ? (
                <div className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-brand-600" />
                    <div>
                      <span className="font-semibold text-slate-900">{selectedSchema.name}</span>
                      <span className="ml-1 text-[11px] text-slate-400">({selectedSchema.table_name})</span>
                    </div>
                  </div>
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                    {targetFields.length} columns
                  </span>
                </div>
              ) : (
                <div className="flex w-full items-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-700">
                  <Info className="h-4 w-4 shrink-0 text-amber-500" />
                  Select a schema above to enable field mappings.
                </div>
              )}
            </div>
          </div>

          {/* Insert Strategy Selector (Segmented Cards) */}
          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-700">Insertion Strategy</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  id: 'insert',
                  title: 'Insert',
                  desc: 'Always add a new record row upon completion.',
                  icon: Plus,
                },
                {
                  id: 'update',
                  title: 'Update',
                  desc: 'Update existing record matching key columns.',
                  icon: RefreshCw,
                },
                {
                  id: 'upsert',
                  title: 'Upsert (Recommended)',
                  desc: 'Update matching record or insert if new.',
                  icon: ArrowRightLeft,
                },
              ].map((mode) => {
                const active = bot.insert_mode === mode.id;
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setBot({ insert_mode: mode.id as typeof bot.insert_mode })}
                    className={cn(
                      'flex flex-col items-start rounded-xl border p-3.5 text-left transition',
                      active
                        ? 'border-brand-500 bg-brand-50/50 shadow-2xs ring-2 ring-brand-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4', active ? 'text-brand-600' : 'text-slate-400')} />
                        <span className={cn('text-xs font-bold', active ? 'text-brand-900' : 'text-slate-800')}>
                          {mode.title}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-full border',
                          active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
                        )}
                      >
                        {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{mode.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced Strategy Options */}
          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
            {bot.insert_mode !== 'insert' ? (
              <Field
                label="Upsert Key Columns (Composite Key)"
                hint="Select one or more key fields to match existing records."
              >
                <div className="space-y-2">
                  {/* Selected Key Badges */}
                  <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-2xs">
                    {currentUpsertKeys.length === 0 && (
                      <span className="pl-1 text-xs text-slate-400">No key selected (Select below)</span>
                    )}
                    {currentUpsertKeys.map((k) => {
                      const opt = sourceOptions.find((s) => s.key === k);
                      return (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900"
                        >
                          <Key className="h-3 w-3 text-amber-600" />
                          {opt?.label || k}
                          <button
                            type="button"
                            onClick={() => toggleUpsertKey(k)}
                            className="ml-0.5 rounded p-0.5 text-amber-600 hover:bg-amber-100 hover:text-amber-950"
                            title="Remove key"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  {/* Add Key Dropdown */}
                  <select
                    className={fieldInputSm}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) toggleUpsertKey(e.target.value);
                    }}
                  >
                    <option value="">+ Add field to composite key...</option>
                    {sourceOptions
                      .filter((o) => !currentUpsertKeys.includes(o.key))
                      .map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label} ({o.key})
                        </option>
                      ))}
                  </select>
                </div>
              </Field>
            ) : (
              <Field label="Upsert Key Columns" hint="Disabled in Insert mode.">
                <input className={cn(fieldInput, 'bg-slate-100 text-slate-400 cursor-not-allowed')} disabled value="Not applicable" />
              </Field>
            )}

            <Field label="Duplicate Handling" hint="Action taken when duplicate record is found.">
              <select
                className={fieldInput}
                value={bot.duplicate_handling}
                onChange={(e) => setBot({ duplicate_handling: e.target.value as typeof bot.duplicate_handling })}
              >
                <option value="update_existing">Update existing record</option>
                <option value="skip">Skip insertion</option>
                <option value="create_new">Create new duplicate row</option>
              </select>
            </Field>

            <Field label="Validation Behaviour" hint="How to handle missing required values.">
              <div className="relative">
                <select
                  className={cn(fieldInput, 'pl-8')}
                  value={bot.validation_behaviour}
                  onChange={(e) => setBot({ validation_behaviour: e.target.value as typeof bot.validation_behaviour })}
                >
                  <option value="reject_invalid">Reject invalid values (Strict)</option>
                  <option value="store_anyway">Store partial values anyway</option>
                </select>
                <Shield className="absolute left-2.5 top-3 h-4 w-4 text-brand-500" />
              </div>
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* Data Processing Trigger */}
      {selectedSchema && (
        <SectionCard
          icon={Clock}
          title="Data Processing Trigger"
          description="Control when captured data is pushed to the target schema."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {([
                {
                  id: 'on_complete' as const,
                  title: 'Immediately',
                  desc: 'Push data to schema as soon as conversation is marked completed.',
                  icon: Play,
                },
                {
                  id: 'scheduled' as const,
                  title: 'Scheduled',
                  desc: 'Queue data and process after a configurable delay.',
                  icon: Clock,
                },
                {
                  id: 'workflow' as const,
                  title: 'Workflow Trigger',
                  desc: 'Queue data and trigger a pipeline/workflow node to process it.',
                  icon: GitBranch,
                },
              ] satisfies Array<{ id: DataProcessingTrigger; title: string; desc: string; icon: typeof Play }>).map((opt) => {
                const active = dp.trigger === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDp({ trigger: opt.id })}
                    className={cn(
                      'flex flex-col items-start rounded-xl border p-3.5 text-left transition',
                      active
                        ? 'border-brand-500 bg-brand-50/50 shadow-2xs ring-2 ring-brand-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4', active ? 'text-brand-600' : 'text-slate-400')} />
                        <span className={cn('text-xs font-bold', active ? 'text-brand-900' : 'text-slate-800')}>
                          {opt.title}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-full border',
                          active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
                        )}
                      >
                        {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{opt.desc}</p>
                  </button>
                );
              })}
            </div>

            {dp.trigger === 'scheduled' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <span className="mb-2 block text-xs font-semibold text-slate-700">Process After Delay</span>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={dp.delay_unit === 'days' ? 90 : dp.delay_unit === 'hours' ? 720 : 43200}
                    value={dp.delay_value}
                    onChange={(e) => setDp({ delay_value: Math.max(1, Number(e.target.value)) })}
                    className={cn(fieldInputSm, 'w-24')}
                  />
                  <select
                    className={fieldInputSm}
                    value={dp.delay_unit}
                    onChange={(e) => setDp({ delay_unit: e.target.value as DataProcessing['delay_unit'] })}
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                  <span className="text-xs text-slate-500">after conversation completes</span>
                </div>
              </div>
            )}

            {dp.trigger === 'workflow' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <span className="mb-2 block text-xs font-semibold text-slate-700">Workflow / Pipeline Node</span>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <GitBranch className="h-3.5 w-3.5 text-brand-500" />
                  <span>
                    When the conversation completes, a queue item is created. Configure a pipeline to listen for
                    chatbot completion events, or use the <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[11px]">process_queue</code> API action to process queued items.
                  </span>
                </div>
                <div className="mt-3">
                  <Field label="Workflow / Journey ID (optional)" hint="Leave blank to process via API or cron.">
                    <input
                      className={fieldInput}
                      value={dp.workflow_id ?? ''}
                      onChange={(e) => setDp({ workflow_id: e.target.value || null })}
                      placeholder="e.g. journey UUID or pipeline ID"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Field Mapping Section Card */}
      <SectionCard
        icon={Waypoints}
        title="Field Mapping"
        description="Map each chatbot field or system attribute into a column on your target schema."
        action={
          <div className="flex items-center gap-2">
            {selectedSchema && mappings.length > 0 && (
              <button
                type="button"
                onClick={clearAllMappings}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                Clear All
              </button>
            )}
            {selectedSchema && sourceOptions.length > 0 && (
              <button
                type="button"
                onClick={autoMap}
                className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Auto-map
              </button>
            )}
            <button
              type="button"
              onClick={addMapping}
              disabled={!canAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-brand-700 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add Mapping
            </button>
          </div>
        }
      >
        {!selectedSchema ? (
          <EmptyHint warn>
            Select a target schema in the section above to begin mapping chatbot fields.
          </EmptyHint>
        ) : sourceOptions.length === 0 ? (
          <EmptyHint>
            No data capture fields defined yet. Add fields in the <b>Data Capture</b> tab first.
          </EmptyHint>
        ) : targetFields.length === 0 ? (
          <EmptyHint warn>
            The <b>{selectedSchema.name}</b> schema has no columns available to map.
          </EmptyHint>
        ) : (
          <div className="space-y-3">
            {/* Warnings or info pill */}
            {unmappedRequiredCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <b>{unmappedRequiredCount}</b> required data-capture field{unmappedRequiredCount === 1 ? '' : 's'} not yet mapped to the schema.
                </span>
              </div>
            )}

            {/* Table Container */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full min-w-[650px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 pl-4 pr-2 font-semibold">Chat bot Source Field</th>
                    <th className="w-8 px-1 py-3 text-center font-semibold text-slate-400">➔</th>
                    <th className="py-3 px-2 font-semibold">Target Schema Column</th>
                    <th className="w-48 py-3 px-2 font-semibold">Transform Rule</th>
                    <th className="w-14 py-3 pl-2 pr-4 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {mappings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No mappings defined yet. Click <b>Auto-map</b> or <b>+ Add Mapping</b> to connect fields.
                      </td>
                    </tr>
                  )}

                  {mappings.map((m) => {
                    const usedByOthers = new Set(mappings.filter((x) => x.id !== m.id).map((x) => x.target_field));
                    const availableTargets = targetFields.filter((f) => !usedByOthers.has(f.name) || f.name === m.target_field);
                    const targetFieldObj = targetFields.find((f) => f.name === m.target_field);
                    const targetType = targetFieldObj?.field_type;
                    const sourceObj = sourceOptions.find((o) => o.key === m.source_field_key);

                    const incomplete = !m.source_field_key || !m.target_field;
                    const hasConfig = ['static_value', 'default_value', 'expression', 'concatenate', 'format_date'].includes(m.transformation);

                    return (
                      <Fragment key={m.id}>
                        <tr className={cn('group transition', incomplete ? 'bg-amber-50/30' : 'hover:bg-slate-50/60')}>
                          {/* Source Field Selector */}
                          <td className="py-3 pl-4 pr-2 align-top">
                            <select
                              className={cn(fieldInputSm, 'font-medium')}
                              value={m.source_field_key}
                              onChange={(e) => patchMapping(m.id, { source_field_key: e.target.value })}
                            >
                              <option value="">Select field…</option>
                              <optgroup label="Captured Fields">
                                {sourceOptions
                                  .filter((o) => !o.system)
                                  .map((o) => (
                                    <option key={o.key} value={o.key}>
                                      {o.label} ({o.key}){o.pii ? ' [PII]' : ''}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="System Attributes">
                                {sourceOptions
                                  .filter((o) => o.system)
                                  .map((o) => (
                                    <option key={o.key} value={o.key}>
                                      ⚡ {o.label}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                            {sourceObj && (
                              <div className="mt-1 flex items-center gap-1.5 pl-1 text-[11px] text-slate-400">
                                {sourceObj.system ? (
                                  <span className="inline-flex items-center gap-0.5 font-medium text-brand-600">
                                    <Zap className="h-3 w-3" /> System Variable
                                  </span>
                                ) : (
                                  <span className="font-mono text-[10px] text-slate-500">Type: {sourceObj.type || 'string'}</span>
                                )}
                                {sourceObj.pii && (
                                  <span className="rounded bg-purple-50 px-1 py-0.2 text-[9px] font-bold text-purple-600">PII</span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Direction Arrow */}
                          <td className="w-8 px-1 py-3 align-top pt-4 text-center">
                            <ArrowRight className="mx-auto h-4 w-4 text-slate-300 group-hover:text-brand-500" />
                          </td>

                          {/* Target Schema Column Selector */}
                          <td className="min-w-0 py-3 px-2 align-top">
                            <select
                              className={cn(fieldInputSm, 'font-mono text-xs font-semibold text-slate-900')}
                              value={m.target_field}
                              onChange={(e) => patchMapping(m.id, { target_field: e.target.value })}
                            >
                              <option value="">Select column…</option>
                              {availableTargets.map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.name} {f.field_type ? `(${f.field_type})` : ''}
                                </option>
                              ))}
                            </select>
                            {targetType && (
                              <div className="mt-1 flex items-center gap-1.5 pl-1">
                                <TypeBadge type={targetType} />
                              </div>
                            )}
                          </td>

                          {/* Transform Dropdown */}
                          <td className="w-48 py-3 px-2 align-top">
                            <select
                              className={fieldInputSm}
                              value={m.transformation}
                              onChange={(e) => patchMapping(m.id, { transformation: e.target.value as ChatBotTransform })}
                            >
                              {TRANSFORMS.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Delete Action Button */}
                          <td className="w-14 py-3 pl-2 pr-4 align-top text-center">
                            <button
                              type="button"
                              onClick={() => setMappings(mappings.filter((x) => x.id !== m.id))}
                              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              title="Remove Mapping"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>

                        {/* Inline Config Panel Row */}
                        {hasConfig && (
                          <tr className="bg-slate-50/80 border-t-0">
                            <td colSpan={5} className="px-4 py-2.5">
                              {(m.transformation === 'static_value' || m.transformation === 'default_value') && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-600 shrink-0">
                                    {m.transformation === 'static_value' ? 'Static Constant:' : 'Fallback Default:'}
                                  </span>
                                  <input
                                    className={fieldInputSm}
                                    placeholder={
                                      m.transformation === 'static_value'
                                        ? 'Value written to column (e.g. Chatbot Lead)'
                                        : 'Fallback value when bot field is empty (e.g. N/A)'
                                    }
                                    value={String(m.transformation_config.value ?? m.transformation_config.default ?? '')}
                                    onChange={(e) =>
                                      patchMapping(m.id, {
                                        transformation_config: {
                                          [m.transformation === 'static_value' ? 'value' : 'default']: e.target.value,
                                        },
                                      })
                                    }
                                  />
                                </div>
                              )}

                              {(m.transformation === 'expression' || m.transformation === 'concatenate') && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-600 shrink-0">Template Pattern:</span>
                                    <input
                                      className={cn(fieldInputSm, 'font-mono text-xs')}
                                      placeholder="e.g. {{first_name}} {{last_name}} - {{intent}}"
                                      value={String(m.transformation_config.template ?? '')}
                                      onChange={(e) =>
                                        patchMapping(m.id, {
                                          transformation_config: { template: e.target.value },
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                                    <span>Available variables:</span>
                                    {sourceOptions.map((s) => (
                                      <button
                                        key={s.key}
                                        type="button"
                                        onClick={() => {
                                          const current = String(m.transformation_config.template ?? '');
                                          const tag = `{{${s.key}}}`;
                                          patchMapping(m.id, {
                                            transformation_config: { template: current ? `${current} ${tag}` : tag },
                                          });
                                        }}
                                        className="rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                                      >
                                        + {`{{${s.key}}}`}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {m.transformation === 'format_date' && (
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  <Info className="h-3.5 w-3.5 text-brand-500" />
                                  <span>Automatically formats captured dates into standard ISO-8601 string format.</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Live Schema Payload Preview & Coverage Inspector */}
      {selectedSchema && mappings.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-bold text-slate-900">Live Schema Payload & Column Coverage</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              {showPreview ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          {showPreview && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Code Preview */}
              <div className="lg:col-span-7 space-y-2">
                <span className="block text-xs font-semibold text-slate-700">Sample Supabase Insert Payload</span>
                <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs font-mono text-emerald-400 shadow-inner">
                  {JSON.stringify(samplePayload, null, 2)}
                </pre>
              </div>

              {/* Coverage Grid */}
              <div className="lg:col-span-5 space-y-2">
                <span className="block text-xs font-semibold text-slate-700">Target Schema Columns ({targetFields.length})</span>
                <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                  {targetFields.map((f) => {
                    const mapped = mappings.find((m) => m.target_field === f.name);
                    return (
                      <div
                        key={f.name}
                        className={cn(
                          'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs',
                          mapped ? 'bg-white font-medium text-slate-900 border border-slate-100 shadow-2xs' : 'text-slate-400',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {mapped ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded-full border border-slate-300" />
                          )}
                          <span className="font-mono text-xs">{f.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TypeBadge type={f.field_type} />
                          {mapped && (
                            <span className="text-[10px] text-slate-400">← {mapped.source_field_key}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm font-medium',
        warn ? 'border-amber-200 bg-amber-50/40 text-amber-700' : 'border-slate-200 text-slate-400',
      )}
    >
      {warn && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
      <span>{children}</span>
    </div>
  );
}

