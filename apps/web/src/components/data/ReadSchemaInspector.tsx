import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Eye,
  GripVertical, Search, X, Table2, Filter as FilterIcon,
  ArrowUpDown, Settings2, Database, Layers,
  ChevronsRight, ChevronsLeft, ChevronLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type Condition = {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueType: 'static' | 'variable' | 'expression';
};

type ConditionGroup = {
  id: string;
  logic: 'and' | 'or';
  conditions: (Condition | ConditionGroup)[];
};

type ReadSchemaConfig = {
  schema: string;
  table_name: string;
  selected_fields: string[];
  filter_group: ConditionGroup;
  sort_field: string;
  sort_order: 'asc' | 'desc';
  limit: number;
  processing_mode: 'all' | 'batch';
  batch_size: number;
  deduplicate: boolean;
  deduplicate_field: string;
  incremental: boolean;
  incremental_field: string;
  on_empty: 'continue' | 'end' | 'alternate' | 'notify';
  on_error: 'stop' | 'retry' | 'continue_empty' | 'error_branch';
};

type CanvasNode = {
  id: string;
  stepType: string;
  label: string;
  config: Record<string, unknown>;
  x: number;
  y: number;
  disabled?: boolean;
};

type Props = {
  node: CanvasNode;
  onChange: (n: CanvasNode) => void;
};

// ═══════════════════════════════════════════════════════════════════════════
// Schema registry — fetched from Supabase schema_definitions + schema_fields
// ═══════════════════════════════════════════════════════════════════════════

type SchemaEntry = { label: string; tableName: string | null; fields: { name: string; type: string; pii?: boolean }[] };
type SchemaMap = Record<string, SchemaEntry>;

const FALLBACK_SCHEMAS: SchemaMap = {
  customer: {
    label: 'Customer', tableName: 'customers',
    fields: [
      { name: 'id', type: 'string' }, { name: 'title', type: 'string' },
      { name: 'first_name', type: 'string', pii: true }, { name: 'middle_name', type: 'string', pii: true },
      { name: 'last_name', type: 'string', pii: true }, { name: 'email', type: 'string', pii: true },
      { name: 'mobile_country_code', type: 'string' }, { name: 'mobile', type: 'string', pii: true },
      { name: 'dob', type: 'date', pii: true }, { name: 'gender', type: 'string' },
      { name: 'city', type: 'string', pii: true }, { name: 'state', type: 'string', pii: true },
      { name: 'country', type: 'string', pii: true }, { name: 'pincode', type: 'string', pii: true },
      { name: 'consent_email', type: 'boolean' }, { name: 'consent_sms', type: 'boolean' },
      { name: 'consent_web_push', type: 'boolean' }, { name: 'consent_whatsapp', type: 'boolean' },
      { name: 'global_consent', type: 'boolean' }, { name: 'status', type: 'string' },
      { name: 'created_at', type: 'date' }, { name: 'updated_at', type: 'date' },
    ],
  },
  customer_identity: {
    label: 'Customer Identity', tableName: 'customer_identities',
    fields: [
      { name: 'id', type: 'string' }, { name: 'customer_id', type: 'string' },
      { name: 'identity_type', type: 'string' }, { name: 'identity_value', type: 'string', pii: true },
      { name: 'created_at', type: 'date' },
    ],
  },
  events: {
    label: 'Events', tableName: 'events',
    fields: [
      { name: 'id', type: 'string' }, { name: 'customer_id', type: 'string' },
      { name: 'event', type: 'string' }, { name: 'channel', type: 'string' },
      { name: 'properties', type: 'string' }, { name: 'timestamp', type: 'date' },
    ],
  },
  engagement_log: {
    label: 'Engagement Log', tableName: 'engagement_log',
    fields: [
      { name: 'id', type: 'string' }, { name: 'customer_id', type: 'string' },
      { name: 'campaign_id', type: 'string' }, { name: 'channel', type: 'string' },
      { name: 'event', type: 'string' }, { name: 'timestamp', type: 'date' },
    ],
  },
  delivery: {
    label: 'Delivery', tableName: 'deliveries',
    fields: [
      { name: 'id', type: 'string' }, { name: 'campaign_id', type: 'string' },
      { name: 'channel', type: 'string' }, { name: 'status', type: 'string' },
      { name: 'sent_count', type: 'number' }, { name: 'delivered_count', type: 'number' },
      { name: 'failed_count', type: 'number' }, { name: 'created_at', type: 'date' },
    ],
  },
  exclusion: {
    label: 'Exclusion', tableName: 'exclusions',
    fields: [
      { name: 'id', type: 'string' }, { name: 'customer_id', type: 'string' },
      { name: 'reason', type: 'string' }, { name: 'channel', type: 'string' },
      { name: 'created_at', type: 'date' },
    ],
  },
  web_push_subscriber: {
    label: 'Web Push Subscriber', tableName: 'web_push_subscribers',
    fields: [
      { name: 'id', type: 'string' }, { name: 'customer_id', type: 'string' },
      { name: 'fcm_token', type: 'string' }, { name: 'browser', type: 'string' },
      { name: 'os', type: 'string' }, { name: 'subscription_status', type: 'string' },
      { name: 'created_at', type: 'date' },
    ],
  },
  real_time_triggers: {
    label: 'Real-Time Triggers', tableName: 'real_time_triggers',
    fields: [
      { name: 'id', type: 'string' }, { name: 'name', type: 'string' },
      { name: 'event_name', type: 'string' }, { name: 'channel', type: 'string' },
      { name: 'status', type: 'string' }, { name: 'created_at', type: 'date' },
    ],
  },
};

function mapFieldType(dbType: string): string {
  switch (dbType) {
    case 'integer': case 'float': case 'decimal': case 'bigint': return 'number';
    case 'date': case 'datetime': case 'timestamp': case 'timestamptz': return 'date';
    case 'boolean': case 'bool': return 'boolean';
    case 'uuid': return 'string';
    case 'email': case 'phone': case 'url': return 'string';
    default: return dbType || 'string';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Operator definitions by field type
// ═══════════════════════════════════════════════════════════════════════════

const STRING_OPS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'in', label: 'in list' },
];

const NUMBER_OPS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equal' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater than or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less than or equal' },
  { value: 'between', label: 'between' },
];

const DATE_OPS = [
  { value: 'equals', label: 'equals' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
  { value: 'between', label: 'between' },
  { value: 'in_last', label: 'in last' },
  { value: 'in_next', label: 'in next' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

const BOOL_OPS = [
  { value: 'is_true', label: 'is true' },
  { value: 'is_false', label: 'is false' },
];

function opsForType(type: string) {
  switch (type) {
    case 'number': return NUMBER_OPS;
    case 'date': return DATE_OPS;
    case 'boolean': return BOOL_OPS;
    default: return STRING_OPS;
  }
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom date' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

let _idCounter = 0;
function uid() { return `cond_${Date.now()}_${++_idCounter}`; }

function isGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return 'conditions' in item;
}

function emptyCondition(): Condition {
  return { id: uid(), field: '', operator: 'equals', value: '', valueType: 'static' };
}

function emptyGroup(logic: 'and' | 'or' = 'and'): ConditionGroup {
  return { id: uid(), logic, conditions: [emptyCondition()] };
}

function getDefaultConfig(): ReadSchemaConfig {
  return {
    schema: '',
    table_name: '',
    selected_fields: [],
    filter_group: emptyGroup(),
    sort_field: '',
    sort_order: 'desc',
    limit: 10000,
    processing_mode: 'batch',
    batch_size: 1000,
    deduplicate: false,
    deduplicate_field: '',
    incremental: false,
    incremental_field: 'updated_at',
    on_empty: 'continue',
    on_error: 'stop',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function ReadSchemaInspector({ node, onChange }: Props) {
  const { tenantId, environment } = useAuth();
  const raw = node.config as Partial<ReadSchemaConfig>;
  const cfg: ReadSchemaConfig = { ...getDefaultConfig(), ...raw };

  const update = useCallback((patch: Partial<ReadSchemaConfig>) => {
    onChange({ ...node, config: { ...node.config, ...patch } });
  }, [node, onChange]);

  // Fetch real schemas + fields from DB
  const [dbSchemas, setDbSchemas] = useState<SchemaMap>({});
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    (async () => {
      // Fetch schema definitions with their fields
      const { data: defs, error: defsError } = await supabase
        .from('schema_definitions')
        .select('id, name, slug, table_name, schema_fields(name, field_type, is_pii, sort_order)')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .order('name');

      if (cancelled) return;

      if (defsError || !defs || defs.length === 0) {
        // Fallback: use known real table schemas so the dropdown always works
        setDbSchemas(FALLBACK_SCHEMAS);
        return;
      }

      const map: SchemaMap = {};
      for (const d of defs) {
        const sf = (d.schema_fields as { name: string; field_type: string; is_pii?: boolean; sort_order?: number }[]) ?? [];
        sf.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
        map[d.slug] = {
          label: d.name,
          tableName: d.table_name,
          fields: sf.map((f) => ({ name: f.name, type: mapFieldType(f.field_type), pii: f.is_pii || false })),
        };
      }
      if (!cancelled) setDbSchemas(map);

      // Fetch real record counts for tables that have a table_name
      const tableNames = [...new Set(defs.filter((d) => d.table_name).map((d) => d.table_name as string))];
      const counts: Record<string, number> = {};
      for (const table of tableNames) {
        try {
          const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('environment', environment);
          if (count != null) {
            for (const d of defs) {
              if (d.table_name === table) counts[d.slug] = count;
            }
          }
        } catch { /* skip count for this table */ }
      }
      if (!cancelled) setRecordCounts(counts);
    })();

    return () => { cancelled = true; };
  }, [tenantId, environment]);

  const SCHEMAS = dbSchemas;
  const schema = SCHEMAS[cfg.schema];
  const fields = schema?.fields ?? [];

  const [fieldSearch, setFieldSearch] = useState('');
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    source: true, fields: true, filter: true, options: false, advanced: false,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const toggleSection = (key: string) => setSectionsOpen((p) => ({ ...p, [key]: !p[key] }));

  const filteredFields = useMemo(() => {
    if (!fieldSearch) return fields;
    const q = fieldSearch.toLowerCase();
    return fields.filter((f) => f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q));
  }, [fields, fieldSearch]);

  const selectedFields = cfg.selected_fields.length > 0 ? cfg.selected_fields : fields.map((f) => f.name);
  const allSelected = selectedFields.length === fields.length;

  // ─── Condition group helpers ──────────────────────────────────

  const updateFilterGroup = (newGroup: ConditionGroup) => update({ filter_group: newGroup });

  const updateInGroup = (group: ConditionGroup, targetId: string, updater: (item: Condition | ConditionGroup) => Condition | ConditionGroup | null): ConditionGroup => {
    const newConditions: (Condition | ConditionGroup)[] = [];
    for (const item of group.conditions) {
      if (item.id === targetId) {
        const result = updater(item);
        if (result) newConditions.push(result);
      } else if (isGroup(item)) {
        newConditions.push(updateInGroup(item, targetId, updater));
      } else {
        newConditions.push(item);
      }
    }
    return { ...group, conditions: newConditions };
  };

  const addConditionTo = (groupId: string) => {
    const addTo = (g: ConditionGroup): ConditionGroup => {
      if (g.id === groupId) return { ...g, conditions: [...g.conditions, emptyCondition()] };
      return { ...g, conditions: g.conditions.map((c) => isGroup(c) ? addTo(c) : c) };
    };
    updateFilterGroup(addTo(cfg.filter_group));
  };

  const addGroupTo = (parentGroupId: string) => {
    const addTo = (g: ConditionGroup): ConditionGroup => {
      if (g.id === parentGroupId) return { ...g, conditions: [...g.conditions, emptyGroup(g.logic === 'and' ? 'or' : 'and')] };
      return { ...g, conditions: g.conditions.map((c) => isGroup(c) ? addTo(c) : c) };
    };
    updateFilterGroup(addTo(cfg.filter_group));
  };

  const updateCondition = (id: string, patch: Partial<Condition>) => {
    updateFilterGroup(updateInGroup(cfg.filter_group, id, (item) => {
      if (isGroup(item)) return item;
      return { ...item, ...patch };
    }));
  };

  const removeCondition = (id: string) => {
    updateFilterGroup(updateInGroup(cfg.filter_group, id, () => null));
  };

  const toggleGroupLogic = (groupId: string) => {
    const toggle = (g: ConditionGroup): ConditionGroup => {
      if (g.id === groupId) return { ...g, logic: g.logic === 'and' ? 'or' : 'and' };
      return { ...g, conditions: g.conditions.map((c) => isGroup(c) ? toggle(c) : c) };
    };
    updateFilterGroup(toggle(cfg.filter_group));
  };

  // ─── Preview mock (deterministic, seeded by schema + field count) ──

  const previewData = useMemo(() => {
    if (!previewOpen || !schema) return [];
    const FIRST = ['Rahul', 'Priya', 'Amit', 'Neha', 'Vikram', 'Ananya', 'Arjun', 'Deepa', 'Karthik', 'Meera'];
    const LAST = ['Sharma', 'Patel', 'Kumar', 'Gupta', 'Singh', 'Verma', 'Reddy', 'Jain', 'Nair', 'Das'];
    const CITIES = ['Mumbai', 'Delhi', 'London', 'Berlin', 'Tokyo'];
    const COUNTRIES = ['India', 'US', 'UK', 'DE', 'JP'];
    const STATUSES_L = ['active', 'inactive', 'pending'];
    const TIERS_L = ['Bronze', 'Silver', 'Gold', 'Platinum'];
    const CHANNELS_L = ['email', 'sms', 'push', 'whatsapp'];
    const CATEGORIES_L = ['Electronics', 'Clothing', 'Food', 'Books'];
    // Simple seeded PRNG for deterministic preview
    let seed = 7;
    const sRand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0x100000000; };
    return Array.from({ length: 10 }, (_, i) => {
      const row: Record<string, unknown> = {};
      fields.forEach((f) => {
        if (!selectedFields.includes(f.name)) return;
        switch (f.type) {
          case 'string':
            if (f.name.includes('id')) row[f.name] = `${f.name.replace('_id', '').charAt(0).toUpperCase()}${String(1000 + i)}`;
            else if (f.name.includes('email')) row[f.name] = `${FIRST[i].toLowerCase()}@example.com`;
            else if (f.name.includes('name') && f.name.includes('first')) row[f.name] = FIRST[i];
            else if (f.name.includes('name') && f.name.includes('last')) row[f.name] = LAST[i];
            else if (f.name.includes('country')) row[f.name] = COUNTRIES[i % 5];
            else if (f.name.includes('city')) row[f.name] = CITIES[i % 5];
            else if (f.name.includes('status')) row[f.name] = STATUSES_L[i % 3];
            else if (f.name.includes('tier')) row[f.name] = TIERS_L[i % 4];
            else if (f.name.includes('channel')) row[f.name] = CHANNELS_L[i % 4];
            else if (f.name.includes('category')) row[f.name] = CATEGORIES_L[i % 4];
            else row[f.name] = `value_${i}`;
            break;
          case 'number':
            if (f.name.includes('value') || f.name.includes('amount') || f.name.includes('mrr')) row[f.name] = Math.round(sRand() * 50000) / 100;
            else if (f.name.includes('score')) row[f.name] = Math.round(sRand() * 100);
            else if (f.name.includes('count') || f.name.includes('viewed')) row[f.name] = Math.floor(sRand() * 50);
            else if (f.name.includes('age')) row[f.name] = 18 + Math.floor(sRand() * 55);
            else row[f.name] = Math.floor(sRand() * 1000);
            break;
          case 'date':
            row[f.name] = new Date(Date.now() - Math.floor(sRand() * 365 * 86400000)).toISOString().split('T')[0];
            break;
          case 'boolean':
            row[f.name] = sRand() > 0.3;
            break;
        }
      });
      return row;
    });
  }, [previewOpen, schema, fields, selectedFields]);

  const estimatedRecords = recordCounts[cfg.schema] ?? 0;

  // ─── Render ───────────────────────────────────────────────────

  const inputCls = 'w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40';
  const selectCls = 'px-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/40';

  return (
    <div className="space-y-1">
      {/* ─── Node Name ─────────────────────────────────────────── */}
      <div className="mb-3">
        <label className="block text-[10px] font-medium text-gray-500 mb-1">Node Name</label>
        <input value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })}
          className={inputCls} placeholder="e.g. Get Eligible Customers" />
      </div>

      {/* ═══ DATA SOURCE ═══ */}
      <SectionHeader icon={Database} title="Data Source" open={sectionsOpen.source} onToggle={() => toggleSection('source')} />
      {sectionsOpen.source && (
        <div className="pl-1 space-y-2.5 pb-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Schema</label>
            <select value={cfg.schema} onChange={(e) => { const slug = e.target.value; update({ schema: slug, selected_fields: [], table_name: SCHEMAS[slug]?.tableName || '' }); }} className={`${selectCls} w-full`}>
              <option value="">Select schema…</option>
              {Object.entries(SCHEMAS).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </select>
          </div>
          {schema && (
            <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
              <Table2 className="w-3.5 h-3.5 text-emerald-600" />
              <div>
                <p className="text-[10px] text-emerald-700 font-medium">{schema.label}</p>
                <p className="text-[9px] text-emerald-600">{fields.length} fields available</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ SELECT FIELDS ═══ */}
      {schema && (
        <>
          <SectionHeader icon={Layers} title={`Fields (${selectedFields.length}/${fields.length})`} open={sectionsOpen.fields} onToggle={() => toggleSection('fields')} />
          {sectionsOpen.fields && (
            <div className="pl-1 space-y-2 pb-3">
              <div className="flex flex-wrap gap-1">
                {selectedFields.slice(0, 6).map((f) => (
                  <span key={f} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-mono">{f}</span>
                ))}
                {selectedFields.length > 6 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">+{selectedFields.length - 6} more</span>
                )}
              </div>
              <button onClick={() => { setFieldPickerOpen(true); setPickerSearch(''); }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200/60">
                <Layers className="w-3 h-3" /> Edit Fields ({selectedFields.length})
              </button>
            </div>
          )}

          {/* ─── Field Picker Modal ─── */}
          {fieldPickerOpen && (() => {
            const LINKED_RELATIONS: Record<string, string> = {
              customer_events: '1:N',
              orders: '1:N',
              bookings: '1:N',
              transactions: '1:N',
              loyalty: '1:1',
              subscriptions: '1:N',
              website_visitors: '1:N',
              campaign_interactions: '1:N',
              customer_profile: '1:1',
            };
            return (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
                onClick={(e) => { if (e.target === e.currentTarget) setFieldPickerOpen(false); }}>
                <div className="bg-white rounded-xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}
                  style={{ width: 'min(860px, calc(100vw - 80px))', height: 'min(620px, calc(100vh - 80px))' }}>
                  <div className="flex-1 flex min-h-0">
                    {/* Left: Available */}
                    <div className="flex-1 border-r border-gray-200 flex flex-col min-h-0">
                      <div className="px-3 py-2.5 border-b border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-600 mb-1.5">Available Fields</p>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                          <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                            placeholder="Search fields…" autoFocus />
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto px-1.5 py-1">
                        {/* Current schema */}
                        <div className="flex items-center gap-1.5 px-2 pt-1 pb-1">
                          <Database className="w-3 h-3 text-emerald-500" />
                          <span className="text-[10px] font-semibold text-gray-500 uppercase">{schema?.label ?? cfg.schema}</span>
                          <span className="text-[8px] px-1 py-0.5 bg-emerald-50 text-emerald-600 rounded font-medium">Primary</span>
                        </div>
                        {fields
                          .filter((f) => !pickerSearch || f.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                          .map((f) => {
                            const isSelected = selectedFields.includes(f.name);
                            return (
                              <div key={f.name}
                                onClick={() => { if (!isSelected) update({ selected_fields: [...selectedFields, f.name] }); }}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[11px] ${isSelected ? 'opacity-40 cursor-default' : 'hover:bg-indigo-50'}`}>
                                <span className="font-mono flex-1">{f.name}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                  f.type === 'string' ? 'bg-blue-50 text-blue-600' :
                                  f.type === 'number' ? 'bg-amber-50 text-amber-600' :
                                  f.type === 'date' ? 'bg-purple-50 text-purple-600' :
                                  'bg-green-50 text-green-600'
                                }`}>{f.type}</span>
                                {f.pii && <span className="text-[8px] px-1 py-0.5 rounded bg-red-50 text-red-500">PII</span>}
                                {!isSelected && <ChevronsRight className="w-3 h-3 text-gray-300" />}
                              </div>
                            );
                          })}
                        {/* Linked schemas */}
                        {Object.entries(SCHEMAS)
                          .filter(([key]) => key !== cfg.schema)
                          .map(([key, s]) => {
                            const linkedFields = s.fields.filter((f) =>
                              !pickerSearch || f.name.toLowerCase().includes(pickerSearch.toLowerCase())
                            );
                            if (linkedFields.length === 0) return null;
                            const rel = LINKED_RELATIONS[key] ?? '1:N';
                            return (
                              <React.Fragment key={key}>
                                <div className="flex items-center gap-1.5 px-2 pt-3 pb-1">
                                  <Layers className="w-3 h-3 text-indigo-400" />
                                  <span className="text-[10px] font-semibold text-gray-500 uppercase">{s.label}</span>
                                  <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${rel === '1:1' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>{rel}</span>
                                </div>
                                {linkedFields.map((f) => {
                                  const qName = `${key}.${f.name}`;
                                  const isSelected = selectedFields.includes(qName);
                                  return (
                                    <div key={qName}
                                      onClick={() => { if (!isSelected) update({ selected_fields: [...selectedFields, qName] }); }}
                                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[11px] ${isSelected ? 'opacity-40 cursor-default' : 'hover:bg-indigo-50'}`}>
                                      <span className="font-mono flex-1 text-gray-500">{qName}</span>
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                        f.type === 'string' ? 'bg-blue-50 text-blue-600' :
                                        f.type === 'number' ? 'bg-amber-50 text-amber-600' :
                                        f.type === 'date' ? 'bg-purple-50 text-purple-600' :
                                        'bg-green-50 text-green-600'
                                      }`}>{f.type}</span>
                                      {!isSelected && <ChevronsRight className="w-3 h-3 text-gray-300" />}
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                      </div>
                    </div>
                    {/* Center: actions */}
                    <div className="flex flex-col items-center justify-center gap-2 px-2">
                      <button onClick={() => update({ selected_fields: fields.map((f) => f.name) })}
                        title="Add all"
                        className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500"><ChevronsRight className="w-4 h-4" /></button>
                      <button onClick={() => update({ selected_fields: [] })}
                        title="Remove all"
                        className="p-1.5 rounded hover:bg-red-50 text-red-400"><ChevronsLeft className="w-4 h-4" /></button>
                    </div>
                    {/* Right: Outbound Columns */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="px-3 py-2.5 border-b border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-600">Outbound Columns ({selectedFields.length})</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">Used for personalization, transformation &amp; downstream nodes</p>
                      </div>
                      <div className="flex-1 overflow-y-auto px-1.5 py-1">
                        {selectedFields.length === 0 && (
                          <p className="text-[11px] text-gray-400 px-2 py-6 text-center">Click fields on the left to add them here</p>
                        )}
                        {selectedFields.map((name) => {
                          const dotIdx = name.indexOf('.');
                          const fName = dotIdx >= 0 ? name.slice(dotIdx + 1) : name;
                          const schemaKey = dotIdx >= 0 ? name.slice(0, dotIdx) : cfg.schema;
                          const fDef = SCHEMAS[schemaKey]?.fields.find((f) => f.name === fName);
                          return (
                            <div key={name}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-red-50 cursor-pointer text-[11px] group">
                              <span className="font-mono flex-1">{name}</span>
                              {fDef && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                  fDef.type === 'string' ? 'bg-blue-50 text-blue-600' :
                                  fDef.type === 'number' ? 'bg-amber-50 text-amber-600' :
                                  fDef.type === 'date' ? 'bg-purple-50 text-purple-600' :
                                  'bg-green-50 text-green-600'
                                }`}>{fDef.type}</span>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); update({ selected_fields: selectedFields.filter((n) => n !== name) }); }}
                                className="p-0.5 rounded hover:bg-red-100 text-gray-300 group-hover:text-red-500 transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-200 bg-gray-50/50">
                    <button onClick={() => setFieldPickerOpen(false)}
                      className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Done</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ═══ FILTER CONDITIONS ═══ */}
          <SectionHeader icon={FilterIcon} title="Filter Conditions" open={sectionsOpen.filter} onToggle={() => toggleSection('filter')} badge={countConditions(cfg.filter_group)} />
          {sectionsOpen.filter && (
            <div className="pl-1 space-y-2 pb-3">
              <ConditionGroupUI
                group={cfg.filter_group}
                fields={fields}
                depth={0}
                onUpdateCondition={updateCondition}
                onRemoveCondition={removeCondition}
                onAddCondition={addConditionTo}
                onAddGroup={addGroupTo}
                onToggleLogic={toggleGroupLogic}
              />
            </div>
          )}

          {/* ═══ QUERY OPTIONS ═══ */}
          <SectionHeader icon={ArrowUpDown} title="Query Options" open={sectionsOpen.options} onToggle={() => toggleSection('options')} />
          {sectionsOpen.options && (
            <div className="pl-1 space-y-2.5 pb-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Sort By</label>
                  <select value={cfg.sort_field} onChange={(e) => update({ sort_field: e.target.value })} className={`${selectCls} w-full`}>
                    <option value="">None</option>
                    {fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Order</label>
                  <select value={cfg.sort_order} onChange={(e) => update({ sort_order: e.target.value as 'asc' | 'desc' })} className={`${selectCls} w-full`}>
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Limit</label>
                <div className="flex items-center gap-1.5">
                  <select value={[0, 100, 500, 1000, 5000, 10000, 50000, 100000].includes(cfg.limit) ? cfg.limit : 'custom'}
                    onChange={(e) => { if (e.target.value === 'custom') return; update({ limit: Number(e.target.value) }); }}
                    className={`${selectCls} flex-1`}>
                    <option value={0}>No Limit</option>
                    <option value={100}>100</option>
                    <option value={500}>500</option>
                    <option value={1000}>1,000</option>
                    <option value={5000}>5,000</option>
                    <option value={10000}>10,000</option>
                    <option value={50000}>50,000</option>
                    <option value={100000}>100,000</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input type="number" value={cfg.limit} min={0} max={1000000}
                    onChange={(e) => update({ limit: Number(e.target.value) })}
                    className={`${inputCls} w-20 text-center font-mono`}
                    placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Processing</label>
                  <select value={cfg.processing_mode} onChange={(e) => update({ processing_mode: e.target.value as 'all' | 'batch' })} className={`${selectCls} w-full`}>
                    <option value="all">All at once</option>
                    <option value="batch">Batch</option>
                  </select>
                </div>
                {cfg.processing_mode === 'batch' && (
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Batch Size</label>
                    <input type="number" value={cfg.batch_size} min={100} max={100000}
                      onChange={(e) => update({ batch_size: Number(e.target.value) })}
                      className={inputCls} />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                <input type="checkbox" checked={cfg.deduplicate}
                  onChange={(e) => update({ deduplicate: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3" />
                Deduplicate records
              </label>
              {cfg.deduplicate && (
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Deduplicate By</label>
                  <select value={cfg.deduplicate_field} onChange={(e) => update({ deduplicate_field: e.target.value })} className={`${selectCls} w-full`}>
                    <option value="">Select field…</option>
                    {fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ═══ ADVANCED ═══ */}
          <SectionHeader icon={Settings2} title="Advanced" open={sectionsOpen.advanced} onToggle={() => toggleSection('advanced')} />
          {sectionsOpen.advanced && (
            <div className="pl-1 space-y-2.5 pb-3">
              <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                <input type="checkbox" checked={cfg.incremental}
                  onChange={(e) => update({ incremental: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3" />
                Incremental (since last run)
              </label>
              {cfg.incremental && (
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Incremental Field</label>
                  <select value={cfg.incremental_field} onChange={(e) => update({ incremental_field: e.target.value })} className={`${selectCls} w-full`}>
                    {fields.filter((f) => f.type === 'date').map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">When No Records Found</label>
                <select value={cfg.on_empty} onChange={(e) => update({ on_empty: e.target.value as ReadSchemaConfig['on_empty'] })} className={`${selectCls} w-full`}>
                  <option value="continue">Continue workflow</option>
                  <option value="end">End workflow</option>
                  <option value="alternate">Execute alternate branch</option>
                  <option value="notify">Send notification</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">On Query Error</label>
                <select value={cfg.on_error} onChange={(e) => update({ on_error: e.target.value as ReadSchemaConfig['on_error'] })} className={`${selectCls} w-full`}>
                  <option value="stop">Stop workflow</option>
                  <option value="retry">Retry (3 attempts)</option>
                  <option value="continue_empty">Continue with empty result</option>
                  <option value="error_branch">Send to error branch</option>
                </select>
              </div>
            </div>
          )}

          {/* ═══ PREVIEW ═══ */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <button onClick={() => setPreviewOpen(!previewOpen)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200/60">
              <Eye className="w-3.5 h-3.5" />
              {previewOpen ? 'Hide Preview' : 'Preview Records'}
            </button>

            {previewOpen && previewData.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-2.5 py-1.5 flex items-center justify-between border-b border-gray-200">
                  <span className="text-[10px] text-gray-600 font-medium">
                    Estimated: <span className="text-emerald-600 font-bold">{estimatedRecords.toLocaleString()}</span> records
                  </span>
                  <span className="text-[9px] text-gray-400">Showing 10 of {estimatedRecords.toLocaleString()}</span>
                </div>
                <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                  <table className="w-full text-[10px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {Object.keys(previewData[0] ?? {}).map((k) => (
                          <th key={k} className="text-left px-2 py-1 font-medium text-gray-500 whitespace-nowrap border-b border-gray-200">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {previewData.map((row, i) => (
                        <tr key={i} className="hover:bg-blue-50/40">
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="px-2 py-1 text-gray-700 whitespace-nowrap font-mono">
                              {v === true ? '✓' : v === false ? '✗' : String(v ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {schema && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-emerald-600 font-medium">Estimated Records</p>
                <p className="text-xl font-bold text-emerald-700">{estimatedRecords.toLocaleString()}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ DISABLED TOGGLE ═══ */}
      <div className="border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!node.disabled}
            onChange={(e) => onChange({ ...node, disabled: e.target.checked })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          Disabled (skip during execution)
        </label>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function SectionHeader({ icon: Icon, title, open, onToggle, badge }: {
  icon: React.ElementType; title: string; open: boolean; onToggle: () => void; badge?: number;
}) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center gap-2 py-2 px-1 text-xs font-semibold text-gray-600 hover:text-gray-800 border-t border-gray-100">
      {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      <Icon className="w-3.5 h-3.5" />
      <span className="flex-1 text-left">{title}</span>
      {badge != null && badge > 0 && (
        <span className="px-1.5 py-0.5 text-[9px] font-medium bg-indigo-100 text-indigo-700 rounded-full">{badge}</span>
      )}
    </button>
  );
}

function countConditions(group: ConditionGroup): number {
  let count = 0;
  for (const item of group.conditions) {
    if (isGroup(item)) count += countConditions(item);
    else if (item.field) count++;
  }
  return count;
}

function ConditionGroupUI({ group, fields, depth, onUpdateCondition, onRemoveCondition, onAddCondition, onAddGroup, onToggleLogic }: {
  group: ConditionGroup;
  fields: { name: string; type: string }[];
  depth: number;
  onUpdateCondition: (id: string, patch: Partial<Condition>) => void;
  onRemoveCondition: (id: string) => void;
  onAddCondition: (groupId: string) => void;
  onAddGroup: (groupId: string) => void;
  onToggleLogic: (groupId: string) => void;
}) {
  const borderColor = depth === 0 ? 'border-gray-200' : depth === 1 ? 'border-indigo-200' : 'border-purple-200';
  const bgColor = depth === 0 ? '' : depth === 1 ? 'bg-indigo-50/30' : 'bg-purple-50/30';

  return (
    <div className={`space-y-1.5 ${depth > 0 ? `rounded-lg border ${borderColor} ${bgColor} p-2` : ''}`}>
      {group.conditions.map((item, idx) => (
        <React.Fragment key={item.id}>
          {idx > 0 && (
            <div className="flex items-center gap-2 pl-1">
              <button onClick={() => onToggleLogic(group.id)}
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                  group.logic === 'and'
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}>
                {group.logic.toUpperCase()}
              </button>
              <div className="flex-1 border-t border-gray-200/60" />
            </div>
          )}

          {isGroup(item) ? (
            <ConditionGroupUI
              group={item} fields={fields} depth={depth + 1}
              onUpdateCondition={onUpdateCondition}
              onRemoveCondition={onRemoveCondition}
              onAddCondition={onAddCondition}
              onAddGroup={onAddGroup}
              onToggleLogic={onToggleLogic}
            />
          ) : (
            <ConditionRow
              condition={item}
              fields={fields}
              onUpdate={(patch) => onUpdateCondition(item.id, patch)}
              onRemove={() => onRemoveCondition(item.id)}
            />
          )}
        </React.Fragment>
      ))}

      <div className="flex items-center gap-1.5 pt-1">
        <button onClick={() => onAddCondition(group.id)}
          className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">
          <Plus className="w-3 h-3" /> Add Condition
        </button>
        <span className="text-gray-300">|</span>
        <button onClick={() => onAddGroup(group.id)}
          className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 font-medium">
          <Plus className="w-3 h-3" /> Add Group
        </button>
      </div>
    </div>
  );
}

function ConditionRow({ condition, fields, onUpdate, onRemove }: {
  condition: Condition;
  fields: { name: string; type: string }[];
  onUpdate: (patch: Partial<Condition>) => void;
  onRemove: () => void;
}) {
  const selectedField = fields.find((f) => f.name === condition.field);
  const fieldType = selectedField?.type ?? 'string';
  const operators = opsForType(fieldType);
  const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(condition.operator);
  const isDateRelative = fieldType === 'date' && ['in_last', 'in_next'].includes(condition.operator);

  const selectCls = 'px-1.5 py-1 text-[11px] border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/40';

  return (
    <div className="flex items-start gap-1 group">
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-1">
          <select value={condition.field} onChange={(e) => onUpdate({ field: e.target.value, operator: 'equals', value: '' })}
            className={`${selectCls} flex-1 min-w-0`}>
            <option value="">Field…</option>
            {fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          <select value={condition.operator} onChange={(e) => onUpdate({ operator: e.target.value })}
            className={`${selectCls} w-[100px]`}>
            {operators.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>
        </div>
        {needsValue && (
          <div className="flex items-center gap-1">
            {isDateRelative ? (
              <div className="flex items-center gap-1 flex-1">
                <input type="number" value={condition.value.split(' ')[0] || '30'} min={1}
                  onChange={(e) => onUpdate({ value: `${e.target.value} ${condition.value.split(' ')[1] || 'days'}` })}
                  className={`${selectCls} w-16`} />
                <select value={condition.value.split(' ')[1] || 'days'}
                  onChange={(e) => onUpdate({ value: `${condition.value.split(' ')[0] || '30'} ${e.target.value}` })}
                  className={`${selectCls} flex-1`}>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </select>
              </div>
            ) : fieldType === 'boolean' ? null : fieldType === 'date' && ['equals', 'before', 'after'].includes(condition.operator) ? (
              <div className="flex-1 space-y-1">
                <select value={DATE_PRESETS.find((p) => p.value === condition.value) ? condition.value : 'custom'}
                  onChange={(e) => onUpdate({ value: e.target.value, valueType: 'static' })}
                  className={`${selectCls} w-full`}>
                  {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                {(!DATE_PRESETS.find((p) => p.value === condition.value) || condition.value === 'custom') && (
                  <input type="date" value={/^\d{4}-\d{2}-\d{2}/.test(condition.value) ? condition.value.slice(0, 10) : ''}
                    className={`${selectCls} w-full`}
                    onChange={(e) => onUpdate({ value: e.target.value })} />
                )}
              </div>
            ) : fieldType === 'date' && condition.operator === 'between' ? (
              <div className="flex items-center gap-1 flex-1">
                <input type="date" value={(condition.value.split(',')[0] || '').trim()}
                  className={`${selectCls} flex-1`}
                  onChange={(e) => onUpdate({ value: `${e.target.value},${(condition.value.split(',')[1] || '').trim()}` })} />
                <span className="text-[9px] text-gray-400">to</span>
                <input type="date" value={(condition.value.split(',')[1] || '').trim()}
                  className={`${selectCls} flex-1`}
                  onChange={(e) => onUpdate({ value: `${(condition.value.split(',')[0] || '').trim()},${e.target.value}` })} />
              </div>
            ) : (
              <input value={condition.value} onChange={(e) => onUpdate({ value: e.target.value })}
                placeholder={fieldType === 'number' ? '0' : condition.operator === 'in' ? 'value1, value2, …' : 'Value'}
                className={`${selectCls} flex-1 min-w-0 font-mono`} />
            )}
            <select value={condition.valueType} onChange={(e) => onUpdate({ valueType: e.target.value as Condition['valueType'] })}
              className="px-1 py-1 text-[9px] border border-gray-200 rounded bg-gray-50 text-gray-500 w-[50px]"
              title="Value source">
              <option value="static">Static</option>
              <option value="variable">Var</option>
              <option value="expression">Expr</option>
            </select>
          </div>
        )}
      </div>
      <button onClick={onRemove}
        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default ReadSchemaInspector;
