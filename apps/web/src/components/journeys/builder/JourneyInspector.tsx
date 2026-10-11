import { useMemo } from 'react';
import { ArrowRight, Copy, LogIn, Trash2, X } from 'lucide-react';
import {
  WorkflowDeliverySetupPanel,
  deliveryChannelForStep,
} from '@/components/journeys/WorkflowDeliverySetupPanel';
import {
  CAMPAIGN_CONFIG_FIELDS,
  CAMPAIGN_ICONS,
  configSummary,
  defaultConfigForType,
  normalizeStepType,
  paletteItem,
  type ConfigField,
} from '@/lib/campaign-nodes';
import { journeyActivityDef, JOURNEY_EVENT_TYPES } from '@/lib/journey-builder';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import type { Audience } from '@/lib/audiences';
import type { InformationService } from '@/lib/subscriptions';
import type { MarbeeContentTemplate } from '@/lib/content-templates';
import type { ChannelProviderRow } from '@/lib/channel-providers';
import type { Node } from 'reactflow';

type Props = {
  node: Node<CampaignNodeData> | null;
  tenantId: string;
  environment: string;
  audiences: Audience[];
  services: InformationService[];
  templates: MarbeeContentTemplate[];
  providers: ChannelProviderRow[];
  onUpdate: (nodeId: string, patch: Partial<CampaignNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onClose: () => void;
  onEditEntry?: () => void;
};

const CONDITION_TYPES: { value: string; label: string }[] = [
  { value: 'condition_attribute', label: 'Profile attribute' },
  { value: 'condition_segment', label: 'In audience' },
  { value: 'condition_clicked', label: 'Clicked email' },
  { value: 'condition_opened', label: 'Opened email' },
  { value: 'condition_purchased', label: 'Purchased' },
  { value: 'condition_engagement', label: 'Engagement score' },
  { value: 'condition_consent', label: 'Has consent' },
];

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';

function FieldInput({
  field,
  value,
  onChange,
  audiences,
  services,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  audiences: { slug: string; name: string }[];
  services: { slug: string; name: string }[];
}) {
  const str = value == null ? '' : String(value);
  switch (field.kind) {
    case 'textarea':
      return (
        <textarea
          value={str}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} resize-y`}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={str}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
        />
      );
    case 'select':
      return (
        <select value={str} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'toggle':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
      );
    case 'audience':
      return (
        <select value={str} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Select audience…</option>
          {audiences.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>
      );
    case 'service':
      return (
        <select value={str} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Select service…</option>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
  }
}

export function JourneyInspector({
  node,
  tenantId: _tenantId,
  environment: _environment,
  audiences,
  services,
  templates,
  providers,
  onUpdate,
  onDelete,
  onDuplicate,
  onClose,
  onEditEntry,
}: Props) {
  const open = Boolean(node);
  const stepType = node ? normalizeStepType(node.data.stepType) : '';
  const meta = paletteItem(stepType);
  const def = journeyActivityDef(stepType);
  const Icon = CAMPAIGN_ICONS[meta?.icon ?? 'zap'] ?? LogIn;
  const accent = def?.accent ?? meta?.accent ?? '#6366f1';
  const config = (node?.data.config ?? {}) as Record<string, unknown>;
  const deliveryChannel = deliveryChannelForStep(stepType);
  const isEntry = Boolean(meta?.entryOnly);
  const isCondition = stepType.startsWith('condition_');

  const audienceOpts = useMemo(
    () => audiences.map((a) => ({ slug: a.slug, name: a.name })),
    [audiences],
  );
  const serviceOpts = useMemo(
    () => services.map((s) => ({ slug: s.slug, name: s.name })),
    [services],
  );

  const setConfig = (patch: Record<string, unknown>) => {
    if (!node) return;
    onUpdate(node.id, { config: { ...node.data.config, ...patch } });
  };

  const allFields = (CAMPAIGN_CONFIG_FIELDS[stepType] ?? []).filter(
    (f) => f.kind !== 'content_template',
  );

  const fields = allFields.filter((f) => {
    if (!f.showWhen) return true;
    const depVal = config[f.showWhen.key];
    const depStr = depVal == null ? '' : String(depVal);
    if (f.showWhen.equals === '__nonempty__') return depStr.length > 0;
    if (f.showWhen.equals === '__not_none__') return depStr !== '' && depStr !== 'none';
    if (f.showWhen.equals === '__not_unset__') return depStr !== 'unset';
    if (f.showWhen.equals === '__not_empty_op__') return depStr !== 'is_empty' && depStr !== 'is_not_empty';
    return depStr === f.showWhen.equals;
  });

  return (
    <aside
      className={`absolute right-0 top-0 bottom-0 z-20 flex w-[400px] flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {node && (
        <>
          <header className="flex items-start gap-2.5 border-b border-slate-200 px-4 py-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
            </span>
            <div className="min-w-0 flex-1">
              <input
                value={node.data.label}
                onChange={(e) => onUpdate(node.id, { label: e.target.value })}
                className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-slate-900 focus:outline-none"
              />
              <p className="truncate text-[11px] text-slate-400">{meta?.label ?? stepType}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {!isEntry && (
                <>
                  <button
                    type="button"
                    title="Duplicate"
                    onClick={() => onDuplicate(node.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => onDelete(node.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                title="Close"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {isEntry ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Entry decides how customers get into this journey and the selection criteria
                  that qualify them.
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {configSummary(stepType, config) || 'Not configured'}
                </div>
                <button
                  type="button"
                  onClick={onEditEntry}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Edit entry step
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : deliveryChannel ? (
              <WorkflowDeliverySetupPanel
                channel={deliveryChannel}
                config={config}
                templates={templates}
                providers={providers}
                onChange={setConfig}
              />
            ) : (
              <>
                {isCondition && (
                  <label className="block">
                    <span className={labelCls}>Condition type</span>
                    <select
                      value={stepType}
                      onChange={(e) => {
                        const next = e.target.value;
                        onUpdate(node.id, {
                          stepType: next,
                          label: paletteItem(next)?.label ?? node.data.label,
                          config: defaultConfigForType(next),
                        });
                      }}
                      className={inputCls}
                    >
                      {CONDITION_TYPES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {stepType === 'wait_until_event' && (
                  <label className="block">
                    <span className={labelCls}>Event</span>
                    <input
                      list="journey-event-types"
                      value={String(config.event_type ?? '')}
                      onChange={(e) => setConfig({ event_type: e.target.value })}
                      placeholder="cart_abandoned"
                      className={inputCls}
                    />
                    <datalist id="journey-event-types">
                      {JOURNEY_EVENT_TYPES.map((ev) => (
                        <option key={ev.value} value={ev.value}>
                          {ev.label}
                        </option>
                      ))}
                    </datalist>
                  </label>
                )}

                {fields.map((field) => (
                  <label key={field.key} className="block">
                    <span className={labelCls}>{field.label}</span>
                    <FieldInput
                      field={field}
                      value={config[field.key]}
                      onChange={(v) => setConfig({ [field.key]: v })}
                      audiences={audienceOpts}
                      services={serviceOpts}
                    />
                  </label>
                ))}

                {!fields.length && !isCondition && stepType !== 'wait_until_event' && (
                  <p className="text-xs text-slate-400">
                    {configSummary(stepType, config) || 'No configuration for this activity.'}
                  </p>
                )}

                {(isCondition || meta?.outputs?.length) && (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold">
                    {meta?.outputs?.map((o) => (
                      <span key={o.id} className="inline-flex items-center gap-1 text-slate-600">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: o.color ?? '#94a3b8' }}
                        />
                        {o.label} branch
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
