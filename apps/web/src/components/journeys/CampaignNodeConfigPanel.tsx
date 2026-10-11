import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlignLeft,
  CheckCircle2,
  Copy,
  Database,
  Filter,
  Flame,
  Hash,
  Layers,
  List,
  Loader2,
  Mail,
  Play,
  Server,
  Settings2,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { IconField } from '@/components/ui/IconField';
import { NodePopulationPreview } from '@/components/journeys/NodePopulationPreview';
import {
  WorkflowDeliverySetupPanel,
  deliveryChannelForStep,
} from '@/components/journeys/WorkflowDeliverySetupPanel';
import { QuerySetupPanel } from '@/components/journeys/QuerySetupPanel';
import {
  CAMPAIGN_CONFIG_FIELDS,
  CAMPAIGN_ICONS,
  categoryAccent,
  configSummary,
  isCampaignWorkflowMode,
  normalizeStepType,
  paletteItem,
  type ConfigField,
  type CampaignModeInput,
} from '@/lib/campaign-nodes';
import { fetchAudiences } from '@/lib/audiences';
import { fetchContentTemplates } from '@/lib/content-templates';
import { fetchChannelProviders } from '@/lib/channel-providers';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { fetchInformationServices } from '@/lib/subscriptions';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import type { NodePopulationResult } from '@/lib/workflow-engine';
import type { PopulationFieldDef } from '@/lib/template-personalization';
import type { Node } from 'reactflow';
import type { ReactNode } from 'react';

type Props = {
  node: Node<CampaignNodeData>;
  tenantId: string;
  environment: string;
  mode?: CampaignModeInput;
  populationResult?: NodePopulationResult | null;
  personalizationFields?: PopulationFieldDef[];
  personalizationSample?: Record<string, unknown> | null;
  previewLabel?: string;
  runPending?: boolean;
  canRun?: boolean;
  onRun?: () => void;
  onUpdate: (nodeId: string, patch: Partial<CampaignNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  variant?: 'light' | 'dark';
  showPopulationPreview?: boolean;
};

const FIELD_KIND_ICONS: Record<ConfigField['kind'], LucideIcon> = {
  text: Type,
  number: Hash,
  textarea: AlignLeft,
  select: List,
  toggle: List,
  audience: Users,
  service: Server,
  schema: Database,
  content_template: Type,
};

function FieldInput({
  field,
  value,
  onChange,
  audiences,
  services,
  schemas,
  variant,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  audiences: { slug: string; name: string }[];
  services: { slug: string; name: string }[];
  schemas: { slug: string; name: string; table_name: string | null }[];
  variant: 'light' | 'dark';
}) {
  const dark = variant === 'dark';
  const cls = dark
    ? 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/20'
    : 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
  const str = value == null ? '' : String(value);
  const Icon = FIELD_KIND_ICONS[field.kind] ?? Type;

  const wrap = (control: ReactNode) => (
    <IconField icon={Icon} dark={dark}>
      {control}
    </IconField>
  );

  switch (field.kind) {
    case 'textarea':
      return wrap(
        <textarea
          value={str}
          onChange={(e) => onChange(e.target.value)}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          className={cls}
        />,
      );
    case 'number':
      return wrap(
        <input
          type="number"
          value={str}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cls}
        />,
      );
    case 'select':
      return wrap(
        <select value={str} onChange={(e) => onChange(e.target.value)} className={cls}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>,
      );
    case 'audience':
      return wrap(
        <select value={str} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Select audience…</option>
          {audiences.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>,
      );
    case 'service':
      return wrap(
        <select value={str} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Select service…</option>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>,
      );
    case 'schema':
      return wrap(
        <select value={str} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Select schema…</option>
          {schemas.map((s) => (
            <option key={s.slug} value={s.slug} disabled={!s.table_name}>
              {s.name}
              {!s.table_name ? ' (no table)' : ''}
            </option>
          ))}
        </select>,
      );
    case 'content_template':
      return null;
    default:
      return wrap(
        <input
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />,
      );
  }
}

export function CampaignNodeConfigPanel({
  node,
  tenantId,
  environment,
  mode = 'flow',
  populationResult,
  personalizationFields,
  personalizationSample,
  previewLabel,
  runPending,
  canRun,
  onRun,
  onUpdate,
  onDelete,
  onDuplicate,
  variant = 'light',
  showPopulationPreview = true,
}: Props) {
  const dark = variant === 'dark';
  const stepType = normalizeStepType(node.data.stepType);
  const meta = paletteItem(stepType);
  const Icon = CAMPAIGN_ICONS[meta?.icon ?? 'mail'] ?? Sparkles;
  const fields = CAMPAIGN_CONFIG_FIELDS[stepType] ?? [];
  const accent = meta ? categoryAccent(meta.category) : '#64748b';
  const summary = configSummary(stepType, node.data.config ?? {});
  const deliveryChannel = deliveryChannelForStep(stepType);
  const isQueryStep = stepType === 'query' || stepType === 'incremental_query';

  const [activeTab, setActiveTab] = useState<'config' | 'rules' | 'population'>('config');

  const { data: audiences } = useQuery({
    queryKey: ['campaign-config-audiences', tenantId, environment],
    queryFn: () => fetchAudiences(tenantId, environment),
  });

  const { data: services } = useQuery({
    queryKey: ['campaign-config-services', tenantId, environment],
    queryFn: () => fetchInformationServices(tenantId, environment),
  });

  const { data: schemaList } = useQuery({
    queryKey: ['campaign-config-schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const { data: contentTemplates = [] } = useQuery({
    queryKey: ['campaign-config-content-templates', tenantId, environment],
    queryFn: () => fetchContentTemplates(tenantId, environment),
  });

  const { data: channelProviders = [] } = useQuery({
    queryKey: ['campaign-config-channel-providers', tenantId, environment, deliveryChannel],
    queryFn: () => fetchChannelProviders(tenantId, environment, deliveryChannel ?? undefined),
    enabled: Boolean(deliveryChannel),
  });

  const audienceOptions = (audiences ?? []).map((a) => ({
    slug: a.slug,
    name: a.name,
    schema_slug: a.schema_slug,
  }));
  const serviceOptions = (services ?? []).map((s) => ({ slug: s.slug, name: s.name }));
  const schemaOptions = schemaList ?? [];

  const config: Record<string, unknown> = {
    query_source:
      node.data.config?.query_source ??
      (node.data.config?.audience_slug ? 'audience' : 'schema'),
    ...node.data.config,
  };

  const visibleFields = fields.filter((field) => {
    if (deliveryChannel) return false;
    if (field.kind === 'content_template') return false;
    if (!field.showWhen) return true;
    const current = String(config[field.showWhen.key] ?? '');
    if (field.showWhen.equals === '__nonempty__') return current.length > 0;
    if (field.showWhen.equals === '__not_none__') return current !== '' && current !== 'none';
    if (field.showWhen.equals === '__not_unset__') return current !== 'unset';
    if (field.showWhen.equals === '__not_empty_op__') return current !== 'is_empty' && current !== 'is_not_empty';
    if (field.showWhen.equals === '__not_create__') return current !== 'create';
    return current === field.showWhen.equals;
  });

  const setConfig = (patch: Record<string, unknown>) => {
    onUpdate(node.id, { config: { ...node.data.config, ...patch } });
  };

  const setConfigKey = (key: string, value: unknown) => {
    let next: Record<string, unknown> = { ...node.data.config, [key]: value };
    if (key === 'query_source') {
      if (value === 'schema' && !next.schema_slug) {
        next.schema_slug = schemaOptions[0]?.slug ?? 'customer';
      }
      if (value === 'audience' && !next.audience_slug) {
        next.audience_slug = audienceOptions[0]?.slug ?? '';
      }
    }
    onUpdate(node.id, { config: next });
  };

  const setLabel = (label: string) => onUpdate(node.id, { label });

  return (
    <div className={`flex h-full flex-col ${dark ? 'bg-[#0f172a]' : 'bg-white'}`}>
      {/* Header */}
      <div className={`border-b px-4 py-3.5 ${dark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'}`}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-2xs"
            style={{ backgroundColor: `${accent}15`, color: accent }}
          >
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={node.data.label}
              onChange={(e) => setLabel(e.target.value)}
              className={`w-full border-0 bg-transparent text-sm font-black focus:outline-none ${
                dark ? 'text-white' : 'text-slate-900'
              }`}
              placeholder="Activity Label"
            />
            <p className="truncate text-[11px] font-medium text-slate-400">
              {meta?.label ?? node.data.stepType}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isCampaignWorkflowMode(mode) && canRun && onRun && (
              <button
                type="button"
                title="Run step"
                disabled={runPending}
                onClick={onRun}
                className="rounded-xl border border-brand-200 bg-brand-50 p-2 text-brand-700 hover:bg-brand-100 disabled:opacity-60 transition"
              >
                {runPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              title="Duplicate"
              onClick={() => onDuplicate(node.id)}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => onDelete(node.id)}
              className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-3 flex items-center gap-1 border-t border-slate-200/60 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              activeTab === 'config'
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Configuration
          </button>
          {isQueryStep && (
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                activeTab === 'rules'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Target Rules
            </button>
          )}
          {showPopulationPreview && (
            <button
              type="button"
              onClick={() => setActiveTab('population')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                activeTab === 'population'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Live Population
            </button>
          )}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {activeTab === 'config' && (
          <div className="space-y-4">
            {/* Delivery Channel Setup */}
            {deliveryChannel && (
              <WorkflowDeliverySetupPanel
                channel={deliveryChannel}
                config={config}
                templates={contentTemplates}
                providers={channelProviders}
                onChange={setConfig}
                variant={variant}
                populationFields={personalizationFields}
                populationSample={personalizationSample}
              />
            )}

            {/* Query Step Setup embedded if in config tab */}
            {isQueryStep && (
              <QuerySetupPanel
                config={config}
                schemas={schemaOptions}
                audiences={audienceOptions}
                tenantId={tenantId}
                environment={environment}
                onChange={setConfig}
                variant={variant}
                showSchedule={stepType === 'incremental_query'}
              />
            )}

            {/* Dynamic Step Fields */}
            {visibleFields.length > 0 && (
              <div className="space-y-3 pt-2">
                {visibleFields.map((field) => (
                  <label key={field.key} className="block space-y-1">
                    <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      {field.label}
                    </span>
                    <FieldInput
                      field={field}
                      value={config[field.key]}
                      onChange={(v) => setConfigKey(field.key, v)}
                      audiences={audienceOptions}
                      services={serviceOptions}
                      schemas={schemaOptions}
                      variant={variant}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'rules' && isQueryStep && (
          <QuerySetupPanel
            config={config}
            schemas={schemaOptions}
            audiences={audienceOptions}
            tenantId={tenantId}
            environment={environment}
            onChange={setConfig}
            variant={variant}
            showSchedule={stepType === 'incremental_query'}
          />
        )}

        {activeTab === 'population' && (
          <div className="space-y-3">
            {previewLabel && (
              <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {previewLabel}
              </p>
            )}
            <NodePopulationPreview result={populationResult} loading={runPending} dark={dark} />
          </div>
        )}
      </div>
    </div>
  );
}
