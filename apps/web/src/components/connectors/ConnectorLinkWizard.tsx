import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Database,
  Link2,
  Loader2,
  PlugZap,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { connectorMeta } from '@/lib/connector-meta';
import {
  createConnectorLink,
  testConnectorLink,
  type ConnectionTestResult,
} from '@/lib/connector-test';
import { TestResultCard } from '@/components/connectors/ConnectorTestPanel';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';

type ConnectorOption = {
  id: string;
  name: string;
  connector_type: string;
  direction: string;
  config: Record<string, unknown>;
  mapping: ConnectorMappingRow[];
};

type SchemaOption = { slug: string; name: string };

type Props = {
  tenantId: string;
  environment: string;
  connectors: ConnectorOption[];
  schemas: SchemaOption[];
  onClose: () => void;
  onCreated?: () => void;
};

const STEPS = ['Source system', 'Bridge & target', 'Test & connect'];

export function ConnectorLinkWizard({ tenantId, environment, connectors, schemas, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [bridgeSchema, setBridgeSchema] = useState('customer');
  const [linkName, setLinkName] = useState('');
  const [syncMode, setSyncMode] = useState('batch');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const inbound = useMemo(() => connectors.filter((c) => c.direction === 'inbound'), [connectors]);
  const outbound = useMemo(() => connectors.filter((c) => c.direction === 'outbound'), [connectors]);

  const source = connectors.find((c) => c.id === sourceId);
  const target = connectors.find((c) => c.id === targetId);

  const testMutation = useMutation({
    mutationFn: () => {
      if (!source || !target) throw new Error('Select source and target');
      return testConnectorLink({
        tenantId,
        environment,
        sourceConnector: { ...source, mapping: source.mapping ?? [] },
        targetConnector: { ...target, mapping: target.mapping ?? [] },
        bridgeSchema,
      });
    },
    onSuccess: setTestResult,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!source || !target) throw new Error('Select connectors');
      const name = linkName.trim() || `${source.name} → ${target.name}`;
      const link = await createConnectorLink({
        tenant_id: tenantId,
        environment,
        name,
        source_connector_id: source.id,
        target_connector_id: target.id,
        bridge_schema: bridgeSchema,
        sync_mode: syncMode,
      });
      if (testResult?.status === 'success') {
        await testConnectorLink({
          tenantId,
          environment,
          linkId: link.id,
          sourceConnector: { ...source, mapping: source.mapping ?? [] },
          targetConnector: { ...target, mapping: target.mapping ?? [] },
          bridgeSchema,
        });
      }
      return link;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-links'] });
      onCreated?.();
      onClose();
    },
  });

  const canNext =
    step === 0 ? Boolean(sourceId) :
    step === 1 ? Boolean(targetId && bridgeSchema) :
    true;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <Link2 className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-bold">Connect two systems</h2>
              <p className="text-sm text-teal-100">Source → Marbee schema → Destination</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex border-b border-slate-100 px-6 py-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-teal-700' : 'text-slate-400'}`}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    i < step ? 'bg-teal-600 text-white' :
                    i === step ? 'bg-teal-100 text-teal-700 ring-2 ring-teal-500' :
                    'bg-slate-100 text-slate-400'
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="hidden text-sm font-medium sm:inline">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 h-px flex-1 ${i < step ? 'bg-teal-400' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 && (
            <div>
              <p className="mb-4 text-sm text-slate-600">Select the <strong>inbound</strong> connector that receives data from your source system.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {inbound.map((c) => (
                  <ConnectorPickCard
                    key={c.id}
                    connector={c}
                    selected={sourceId === c.id}
                    onSelect={() => setSourceId(c.id)}
                  />
                ))}
              </div>
              {!inbound.length && (
                <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Create an inbound connector first (Webhook, REST API, SFTP, etc.)</p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              {/* Visual pipeline */}
              <PipelinePreview source={source} target={target} bridgeSchema={bridgeSchema} />

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Bridge schema (Marbee)</label>
                <select
                  value={bridgeSchema}
                  onChange={(e) => setBridgeSchema(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                >
                  {schemas.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Data lands here before going to the target system</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Target system (outbound)</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {outbound.map((c) => (
                    <ConnectorPickCard
                      key={c.id}
                      connector={c}
                      selected={targetId === c.id}
                      onSelect={() => setTargetId(c.id)}
                    />
                  ))}
                </div>
                {!outbound.length && (
                  <p className="mt-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Create an outbound connector (API Push, Webhook Out)</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Link name</label>
                  <input
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder={source && target ? `${source.name} → ${target.name}` : 'My integration'}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Sync mode</label>
                  <select
                    value={syncMode}
                    onChange={(e) => setSyncMode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="realtime">Realtime (on ingest)</option>
                    <option value="batch">Batch (scheduled)</option>
                    <option value="manual">Manual trigger</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && source && target && (
            <div className="space-y-6">
              <PipelinePreview source={source} target={target} bridgeSchema={bridgeSchema} large />

              <div className="flex justify-center">
                <Button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  className="bg-teal-600 hover:bg-teal-500"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <PlugZap className="mr-1.5 h-4 w-4" />
                  )}
                  Test end-to-end connection
                </Button>
              </div>

              {testResult && <TestResultCard result={testResult} />}

              {!testResult && (
                <p className="text-center text-sm text-slate-500">
                  Tests both connectors and validates mappings through the bridge schema
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <Button variant="ghost" onClick={() => (step > 0 ? setStep(step - 1) : onClose())}>
            {step > 0 ? 'Back' : 'Cancel'}
          </Button>
          <div className="flex gap-2">
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
                Continue
              </Button>
            ) : (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || testResult?.status === 'failed'}
              >
                {saveMutation.isPending ? 'Saving…' : 'Create connection'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectorPickCard({
  connector,
  selected,
  onSelect,
}: {
  connector: ConnectorOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = connectorMeta(connector.connector_type);
  const Icon = meta?.icon;
  const DirIcon = connector.direction === 'inbound' ? ArrowDownLeft : ArrowUpRight;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
        selected ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-400/30' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {Icon && (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${meta.accent}18`, color: meta.accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{connector.name}</p>
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <DirIcon className="h-3 w-3" />
          {meta?.label}
        </p>
      </div>
    </button>
  );
}

function PipelinePreview({
  source,
  target,
  bridgeSchema,
  large,
}: {
  source?: ConnectorOption;
  target?: ConnectorOption;
  bridgeSchema: string;
  large?: boolean;
}) {
  const sourceMeta = source ? connectorMeta(source.connector_type) : null;
  const targetMeta = target ? connectorMeta(target.connector_type) : null;

  return (
    <div className={`flex items-center justify-center gap-2 rounded-2xl bg-slate-950 ${large ? 'py-8' : 'py-5'} px-4`}>
      <SystemNode
        label={source?.name ?? 'Source'}
        sub={sourceMeta?.label ?? 'Inbound'}
        accent={sourceMeta?.accent ?? '#10b981'}
        icon={sourceMeta?.icon}
        large={large}
      />
      <ArrowRight className={`shrink-0 text-slate-600 ${large ? 'h-5 w-5' : 'h-4 w-4'}`} />
      <div className={`rounded-xl border border-blue-500/30 bg-blue-500/10 ${large ? 'px-5 py-4' : 'px-3 py-2'} text-center`}>
        <Database className={`mx-auto text-blue-400 ${large ? 'h-6 w-6' : 'h-4 w-4'}`} />
        <p className={`mt-1 font-bold text-blue-300 ${large ? 'text-sm' : 'text-xs'}`}>{bridgeSchema}</p>
        <p className="text-[10px] text-slate-500">Marbee</p>
      </div>
      <ArrowRight className={`shrink-0 text-slate-600 ${large ? 'h-5 w-5' : 'h-4 w-4'}`} />
      <SystemNode
        label={target?.name ?? 'Target'}
        sub={targetMeta?.label ?? 'Outbound'}
        accent={targetMeta?.accent ?? '#6366f1'}
        icon={targetMeta?.icon}
        large={large}
      />
    </div>
  );
}

function SystemNode({
  label,
  sub,
  accent,
  icon: Icon,
  large,
}: {
  label: string;
  sub: string;
  accent: string;
  icon?: React.ComponentType<{ className?: string }>;
  large?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border text-center ${large ? 'min-w-[120px] px-4 py-3' : 'min-w-[90px] px-2 py-2'}`}
      style={{ borderColor: `${accent}44`, backgroundColor: `${accent}15` }}
    >
      {Icon && (
        <div style={{ color: accent }}>
          <Icon className={`mx-auto ${large ? 'h-5 w-5' : 'h-4 w-4'}`} />
        </div>
      )}
      <p className={`mt-1 truncate font-semibold text-white ${large ? 'text-sm' : 'text-xs'}`}>{label}</p>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}
