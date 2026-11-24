import { useQuery } from '@tanstack/react-query';
import { Copy, Eye, Info, Power, Settings2, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  NODE_CONFIG_FIELDS,
  NODE_ICONS,
  categoryAccent,
  normalizeStepType,
  paletteItem,
  type ConfigField,
  type WorkflowNodeData,
} from '@/lib/data-jobs';
import { supabase } from '@/lib/supabase';
import { ExpressionField } from '@/components/data/ExpressionField';
import type { Node } from 'reactflow';
import { SendEmailActivityConfigurator } from '@/components/channels/SendEmailActivityConfigurator';
import { FilterConditionsEditor, FieldMappingEditor } from '@/components/data-jobs/TransformBuilders';

type Props = {
  node: Node<WorkflowNodeData>;
  tenantId: string;
  environment: string;
  onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onToggleDisabled?: () => void;
  /** Preview mode + run-until-this-node — server-side sample of this node's real output. */
  onPreview?: () => void;
};

function ConfigFieldInput({
  field,
  value,
  onChange,
  schemas,
  connectors,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  schemas: { slug: string; name: string }[];
  connectors: { id: string; name: string; connector_type: string }[];
}) {
  const str = value == null ? '' : String(value);
  const bool = Boolean(value);

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  switch (field.kind) {
    case 'text':
      return <ExpressionField value={str} onChange={onChange} placeholder={field.placeholder} />;
    case 'number':
      return (
        <input
          type="number"
          value={str}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(Number(e.target.value))}
          className={inputClass}
        />
      );
    case 'textarea': {
      if (field.key === 'conditions_text' || field.key === 'mapping_text') {
        const Builder = field.key === 'conditions_text' ? FilterConditionsEditor : FieldMappingEditor;
        return (
          <div>
            <Builder value={str} onChange={onChange} />
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600">Edit as text</summary>
              <div className="mt-1">
                <ExpressionField value={str} onChange={onChange} multiline rows={field.rows ?? 3} mono />
              </div>
            </details>
          </div>
        );
      }
      return (
        <ExpressionField
          value={str}
          onChange={onChange}
          placeholder={field.placeholder}
          multiline
          rows={field.rows ?? 4}
          mono={field.mono}
        />
      );
    }
    case 'select':
      return (
        <select value={str} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'toggle':
      return (
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <span className="text-sm text-slate-700">{field.label}</span>
          <input
            type="checkbox"
            checked={bool}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>
      );
    case 'schema':
      return (
        <select value={str || 'customer'} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {(schemas.length ? schemas : [{ slug: 'customer', name: 'Customer' }]).map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      );
    case 'connector':
      return (
        <select value={str} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select connector…</option>
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.connector_type})
            </option>
          ))}
        </select>
      );
    default:
      return null;
  }
}

export function WorkflowNodeConfigPanel({
  node,
  tenantId,
  environment,
  onUpdate,
  onDelete,
  onDuplicate,
  onToggleDisabled,
  onPreview,
}: Props) {
  const stepType = normalizeStepType(node.data.stepType);
  const disabled = Boolean(node.data.disabled);
  const meta = paletteItem(stepType);
  const Icon = meta ? NODE_ICONS[meta.icon] : Settings2;
  const accent = meta ? categoryAccent(meta.category) : '#64748b';
  const config = node.data.config ?? {};
  const fields = NODE_CONFIG_FIELDS[stepType] ?? [];

  const { data: schemas = [] } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: async () => {
      const { data } = await supabase
        .from('schema_definitions')
        .select('slug, name')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .order('name');
      return data ?? [];
    },
  });

  const { data: connectors = [] } = useQuery({
    queryKey: ['connectors', tenantId, environment],
    queryFn: async () => {
      const { data } = await supabase
        .from('connectors')
        .select('id, name, connector_type')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .order('name');
      return data ?? [];
    },
  });

  const patchConfig = (key: string, value: unknown) => {
    onUpdate(node.id, { config: { ...config, [key]: value } });
  };

  const visibleFields = fields.filter((field) => {
    if (!field.showWhen) return true;
    const current = String(config[field.showWhen.key] ?? '');
    if (field.showWhen.equals === '__nonempty__') return current.length > 0;
    if (field.showWhen.equals === '__not_none__') return current !== '' && current !== 'none';
    if (field.showWhen.equals === '__not_unset__') return current !== 'unset';
    if (field.showWhen.equals === '__not_empty_op__') return current !== 'is_empty' && current !== 'is_not_empty';
    if (field.showWhen.equals === '__not_create__') return current !== 'create';
    return current === field.showWhen.equals;
  });

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-white to-slate-50/80">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{meta?.category ?? 'Node'}</p>
            <p className="truncate text-base font-bold text-slate-900">{meta?.label ?? stepType}</p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{meta?.description}</p>
        {meta?.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {meta.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Node-level actions — the controls the canvas was missing */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white px-5 py-3">
        <button
          type="button"
          onClick={onToggleDisabled}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            disabled
              ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
          title={disabled ? 'Enable this node — it will run again' : 'Disable this node — it will be skipped and pass data through'}
        >
          <Power className="h-3.5 w-3.5" />
          {disabled ? 'Disabled — click to enable' : 'Enabled'}
        </button>
        {onPreview && (
          <button
            type="button"
            onClick={onPreview}
            disabled={disabled}
            title="Run a real, capped preview through this node and see its output"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview output
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {stepType === 'action_email' || stepType === 'target_email' || stepType === 'send_email' || stepType === 'email' ? (
          <SendEmailActivityConfigurator
            activityName={node.data.label}
            onActivityNameChange={(label) => onUpdate(node.id, { label })}
            config={config}
            onChange={(updatedConfig) => onUpdate(node.id, { config: updatedConfig })}
            tenantId={tenantId}
            environment={environment}
          />
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600">
                <Zap className="h-3 w-3 text-amber-500" />
                Display name
              </span>
              <input
                value={node.data.label}
                onChange={(e) => onUpdate(node.id, { label: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            {visibleFields.length > 0 && (
              <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Configuration</p>
            )}

        {visibleFields.map((field) =>
          field.kind === 'toggle' ? (
            <div key={field.key}>
              <ConfigFieldInput
                field={field}
                value={config[field.key]}
                onChange={(v) => patchConfig(field.key, v)}
                schemas={schemas}
                connectors={connectors}
              />
              {'hint' in field && field.hint && (
                <p className="mt-1 text-[11px] text-slate-400">{field.hint}</p>
              )}
            </div>
          ) : (
            <label key={field.key} className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">{field.label}</span>
              <ConfigFieldInput
                field={field}
                value={config[field.key]}
                onChange={(v) => patchConfig(field.key, v)}
                schemas={schemas}
                connectors={connectors}
              />
              {'hint' in field && field.hint && (
                <p className="mt-1 text-[11px] text-slate-400">{field.hint}</p>
              )}
            </label>
          ),
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <p className="text-[11px] leading-relaxed text-slate-500">
              Node ID: <span className="font-mono">{node.id.slice(0, 8)}…</span>
              {meta?.outputs?.length ? ` · ${meta.outputs.length} output branches` : ''}
              {disabled && ' · disabled: skipped at run time, input passes straight through'}
            </p>
          </div>
        </div>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-200/80 p-4">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => onDuplicate(node.id)}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Duplicate node
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => onDelete(node.id)}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete node
        </Button>
      </div>
    </div>
  );
}
