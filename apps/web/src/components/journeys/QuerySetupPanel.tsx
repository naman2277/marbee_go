import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CircleDot,
  Database,
  FileSliders,
  Layers,
  Plus,
  Settings2,
  Sparkles,
  Tag,
  Target,
} from 'lucide-react';
import { IconField } from '@/components/ui/IconField';
import { QueryActivitySection } from '@/components/journeys/query/QueryActivitySection';
import { QueryAdditionalDataModal } from '@/components/journeys/query/QueryAdditionalDataModal';
import { QueryFilterModal } from '@/components/journeys/query/QueryFilterModal';
import { buildAudienceFilterFields } from '@/lib/audiences';
import type { SchemaWithFields } from '@/lib/fetch-schemas';
import {
  buildQuerySummary,
  defaultQueryActivityConfig,
  resolveTargetingDimension,
  type QueryAggregateMode,
} from '@/lib/query-activity';
import { fetchSchemaRows } from '@/lib/schema-records';
import { createFilterRoot, type FilterRoot } from '@/lib/schema-filters';

const QUERY_SOURCE_OPTIONS = [
  { value: 'schema', label: 'Schema query' },
  { value: 'audience', label: 'Saved audience / list' },
];

const AGGREGATE_OPTIONS: { value: QueryAggregateMode; label: string }[] = [
  { value: 'none', label: 'None — return matching records' },
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
];

type AudienceOption = { slug: string; name: string; schema_slug?: string };
type Tab = 'query' | 'advanced';

type Props = {
  config: Record<string, unknown>;
  schemas: SchemaWithFields[];
  audiences: AudienceOption[];
  tenantId: string;
  environment: string;
  onChange: (patch: Record<string, unknown>) => void;
  variant?: 'light' | 'dark';
  showSchedule?: boolean;
};

export function QuerySetupPanel({
  config,
  schemas,
  audiences,
  tenantId,
  environment,
  onChange,
  variant = 'light',
  showSchedule,
}: Props) {
  const dark = variant === 'dark';
  const [tab, setTab] = useState<Tab>('query');
  const [filterOpen, setFilterOpen] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);

  const mergedConfig = useMemo(() => defaultQueryActivityConfig(config), [config]);
  const querySource = String(mergedConfig.query_source ?? 'schema');
  const schemaSlug = String(mergedConfig.schema_slug ?? 'customer');
  const audienceSlug = String(mergedConfig.audience_slug ?? '');

  const filterSchemaSlug =
    querySource === 'audience'
      ? audiences.find((a) => a.slug === audienceSlug)?.schema_slug ?? 'customer'
      : schemaSlug;

  const filterSchema =
    schemas.find((s) => s.slug === filterSchemaSlug)
    ?? schemas.find((s) => s.slug === 'customer')
    ?? schemas[0];

  const { data: sampleRows = [] } = useQuery({
    queryKey: ['query-setup-rows', filterSchema?.table_name, tenantId, environment],
    queryFn: () => fetchSchemaRows(filterSchema!.table_name!, tenantId, environment, 50),
    enabled: Boolean(filterSchema?.table_name),
  });

  const filterFields = useMemo(() => {
    if (!filterSchema?.table_name || !sampleRows.length) return [];
    return buildAudienceFilterFields(filterSchema, sampleRows);
  }, [filterSchema, sampleRows]);

  const targetingDimension = resolveTargetingDimension(
    filterSchemaSlug,
    filterFields,
    String(mergedConfig.targeting_dimension ?? ''),
  );

  const additionalFields = Array.isArray(mergedConfig.additional_fields)
    ? (mergedConfig.additional_fields as string[])
    : [];
  const aggregateMode = String(mergedConfig.aggregate_mode ?? 'none') as QueryAggregateMode;
  const aggregateGroupBy = Array.isArray(mergedConfig.aggregate_group_by)
    ? (mergedConfig.aggregate_group_by as string[])
    : [];

  const filterRoot = (mergedConfig.filter_json as FilterRoot) ?? createFilterRoot();
  const quickSearch = String(mergedConfig.quick_search ?? '');

  const computedLabel = useMemo(
    () => buildQuerySummary(filterRoot, quickSearch, filterFields),
    [filterRoot, quickSearch, filterFields],
  );
  const queryLabel = String(mergedConfig.query_label || computedLabel);

  const patch = (next: Record<string, unknown>) => onChange({ ...mergedConfig, ...next });

  const selectCls = dark
    ? 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30'
    : 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100';

  const labelCls = `mb-1 block text-xs font-medium ${dark ? 'text-slate-400' : 'text-slate-600'}`;
  const hintCls = `text-[11px] leading-relaxed ${dark ? 'text-slate-500' : 'text-slate-500'}`;
  const tabBtn = (id: Tab, label: string, Icon: typeof CircleDot) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        tab === id
          ? dark
            ? 'bg-slate-800 text-white shadow-sm'
            : 'bg-white text-slate-900 shadow-sm'
          : dark
            ? 'text-slate-400 hover:text-slate-200'
            : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className={`h-4 w-4 ${tab === id ? 'text-orange-500' : ''}`} />
      {label}
    </button>
  );

  const schemaDisplayName = filterSchema?.name ?? filterSchemaSlug;

  return (
    <div className="space-y-4">
      <div className={`flex gap-1 rounded-xl border p-1 ${dark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
        {tabBtn('query', 'Query', CircleDot)}
        {tabBtn('advanced', 'Advanced', Settings2)}
      </div>

      {tab === 'query' && (
        <div className="space-y-4">
          <label className="block">
            <span className={labelCls}>Label</span>
            <IconField icon={Target} dark={dark}>
              <input
                value={queryLabel}
                onChange={(e) => patch({ query_label: e.target.value })}
                placeholder={computedLabel}
                className={selectCls}
              />
            </IconField>
            <p className={`mt-1 ${hintCls}`}>Human-readable summary of the query — auto-updated when you edit filters.</p>
          </label>

          <QueryActivitySection title="Target selection" dark={dark}>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={`mb-3 inline-flex items-center gap-2 text-sm font-semibold ${
                dark ? 'text-orange-400 hover:text-orange-300' : 'text-orange-600 hover:text-orange-700'
              }`}
            >
              <CircleDot className="h-4 w-4" />
              Edit query…
            </button>
            <div
              className={`min-h-[72px] rounded-lg border px-3 py-2.5 text-sm ${
                dark ? 'border-slate-700 bg-slate-900/60 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              <span className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                Query:{' '}
              </span>
              <span className="font-medium">{queryLabel}</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <span className={labelCls}>Query source</span>
            <select
              value={querySource}
              onChange={(e) => {
                const value = e.target.value;
                const next: Record<string, unknown> = { query_source: value };
                if (value === 'schema' && !mergedConfig.schema_slug) {
                  next.schema_slug = schemas[0]?.slug ?? 'customer';
                }
                if (value === 'audience' && !mergedConfig.audience_slug) {
                  next.audience_slug = audiences[0]?.slug ?? '';
                }
                patch(next);
              }}
              className={selectCls}
            >
              {QUERY_SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {querySource === 'schema' ? (
            <div>
              <span className={labelCls}>Database schema</span>
              <select
                value={schemaSlug}
                onChange={(e) =>
                  patch({
                    schema_slug: e.target.value,
                    targeting_dimension: resolveTargetingDimension(e.target.value, filterFields),
                  })
                }
                className={selectCls}
              >
                <option value="">Select schema…</option>
                {schemas.map((s) => (
                  <option key={s.slug} value={s.slug} disabled={!s.table_name}>
                    {s.name}{!s.table_name ? ' (no table)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <span className={labelCls}>Audience / list</span>
              <select
                value={audienceSlug}
                onChange={(e) => patch({ audience_slug: e.target.value })}
                className={selectCls}
              >
                <option value="">Select audience…</option>
                {audiences.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
          </QueryActivitySection>

          <QueryActivitySection
            title="Complementary information"
            dark={dark}
            action={
              <button
                type="button"
                onClick={() => setAdditionalOpen(true)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  dark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-700'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                Add data…
              </button>
            }
          >
            {additionalFields.length === 0 ? (
              <div
                className={`flex min-h-[64px] items-center justify-center rounded-lg border border-dashed text-xs ${
                  dark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'
                }`}
              >
                No additional data — click Add data… to attach work-table columns for personalization.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className={`text-[10px] font-semibold uppercase tracking-wide ${dark ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                    <tr>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2">Expression</th>
                      <th className="px-3 py-2">Alias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {additionalFields.map((key) => {
                      const field = filterFields.find((f) => f.key === key);
                      return (
                        <tr key={key} className={dark ? 'text-slate-300' : 'text-slate-700'}>
                          <td className="px-3 py-2 font-medium">{field?.label ?? key}</td>
                          <td className="px-3 py-2 font-mono">@{key}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{key}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className={`mt-2 ${hintCls}`}>
              <Layers className="mr-1 inline h-3.5 w-3.5" />
              {additionalFields.length} field(s) copied into the temporary work table alongside primary keys.
            </p>
          </QueryActivitySection>

          <QueryActivitySection title="Results" dark={dark}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelCls}>Label</span>
                <IconField icon={FileSliders} dark={dark}>
                  <input
                    value={String(mergedConfig.work_table_label ?? 'Result')}
                    onChange={(e) => patch({ work_table_label: e.target.value })}
                    placeholder="Result"
                    className={selectCls}
                  />
                </IconField>
              </label>
              <label>
                <span className={labelCls}>Segment code</span>
                <IconField icon={Tag} dark={dark}>
          <input
                    value={String(mergedConfig.segment_code ?? '')}
                    onChange={(e) => patch({ segment_code: e.target.value })}
                    placeholder="e.g. VIP_Q4_2026"
            className={selectCls}
          />
                </IconField>
              </label>
            </div>
            <p className={`mt-2 ${hintCls}`}>
              Work table stores <code className="text-[10px]">{targetingDimension}</code> as primary key
              {additionalFields.length ? ` + ${additionalFields.length} complementary field(s)` : ''}
              {mergedConfig.segment_code ? ' + segment code' : ''}.
            </p>
          </QueryActivitySection>
        </div>
      )}

      {tab === 'advanced' && (
        <div className="space-y-4">
          <QueryActivitySection title="Targeting dimension" dark={dark}>
            <label>
              <span className={labelCls}>Primary key (work table)</span>
              <IconField icon={Database} dark={dark}>
          <select
            value={targetingDimension}
            onChange={(e) => patch({ targeting_dimension: e.target.value })}
            className={selectCls}
          >
            {filterFields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
              </IconField>
              </label>
          </QueryActivitySection>

          <QueryActivitySection title="Aggregates" dark={dark}>
        <div className="space-y-4">
              <label>
            <span className={labelCls}>Aggregate calculation</span>
            <select
              value={aggregateMode}
              onChange={(e) => patch({ aggregate_mode: e.target.value as QueryAggregateMode })}
              className={selectCls}
            >
              {AGGREGATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
              </label>
          {aggregateMode !== 'none' && (
            <>
                  <label>
                <span className={labelCls}>Measure field</span>
                <select
                  value={String(mergedConfig.aggregate_field ?? '')}
                  onChange={(e) => patch({ aggregate_field: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Select field…</option>
                  {filterFields
                    .filter((f) => f.type === 'number')
                    .map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                </select>
                  </label>
              <div>
                <span className={labelCls}>Group by</span>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-dashed p-2">
                  {filterFields.map((f) => (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                        dark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={aggregateGroupBy.includes(f.key)}
                            onChange={() => {
                              const next = aggregateGroupBy.includes(f.key)
                                ? aggregateGroupBy.filter((k) => k !== f.key)
                                : [...aggregateGroupBy, f.key];
                              patch({ aggregate_group_by: next });
                            }}
                        className="rounded border-slate-300"
                      />
                          <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
          </QueryActivitySection>

      {showSchedule && (
            <QueryActivitySection title="Incremental schedule" dark={dark}>
          <input
            value={String(mergedConfig.schedule ?? '')}
            onChange={(e) => patch({ schedule: e.target.value })}
            placeholder="0 6 * * *"
            className={selectCls}
          />
            </QueryActivitySection>
          )}

          <div className={`rounded-xl border px-4 py-3 ${dark ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50/80'}`}>
            <p className={`flex items-center gap-1.5 text-xs font-semibold ${dark ? 'text-emerald-300' : 'text-emerald-800'}`}>
              <Sparkles className="h-3.5 w-3.5" />
              Outgoing transition
            </p>
            <p className={`mt-1 ${hintCls}`}>
              On execution, matching records are written to a temporary workflow work table and passed through
              the outgoing thread. Transition data is cleared when the workflow finishes.
            </p>
          </div>
        </div>
      )}

      <QueryFilterModal
        open={filterOpen}
        fields={filterFields}
        filterRoot={filterRoot}
        quickSearch={quickSearch}
        sampleRow={sampleRows[0]}
        onClose={() => setFilterOpen(false)}
        onSave={(root, search, summary) =>
          patch({ filter_json: root, quick_search: search, query_label: summary })
        }
      />

      <QueryAdditionalDataModal
        open={additionalOpen}
        schemaName={schemaDisplayName}
        fields={filterFields}
        selectedKeys={additionalFields}
        targetingDimension={targetingDimension}
        onClose={() => setAdditionalOpen(false)}
        onSave={(keys) => patch({ additional_fields: keys })}
      />
    </div>
  );
}
