import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  PlugZap,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { connectorMeta } from '@/lib/connector-meta';
import { StatusPill } from '@/components/data/StatusPill';
import { CapabilityBadge } from '@/components/data/CapabilityBadge';
import {
  AUTH_METHOD_LABELS,
  CONNECTOR_CATALOG,
  CONNECTOR_CATEGORIES,
  catalogEntry,
  type CatalogEntry,
  type ConnectorAuthMethod,
} from '@/lib/connector-catalog';
import { TRANSFORM_OPTIONS, type ConnectorMappingRow } from '@/lib/connector-mapping';
import {
  DISCOVERY_MESSAGES,
  WIZARD_STEPS,
  candidateCursorFields,
  discardDraft,
  emptyWizardState,
  loadDraft,
  promoteDraft,
  saveDraft,
  simulateDiscovery,
  type DiscoveredField,
  type SyncFrequency,
  type SyncMode,
  type TestOutcome,
  type WizardState,
} from '@/lib/add-connector-wizard';

export function AddConnectorWizardPage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draftParam = params.get('draft');
  const typeParam = params.get('type');

  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [state, setState] = useState<WizardState>(() => {
    if (typeParam && catalogEntry(typeParam)?.status === 'available') {
      const entry = catalogEntry(typeParam)!;
      return {
        ...emptyWizardState(),
        name: `${entry.label} connector`,
        source: { type: typeParam },
        auth: { method: entry.authMethods[0], connected: false },
      };
    }
    return emptyWizardState();
  });
  const [hydrating, setHydrating] = useState(Boolean(draftParam));
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resume an existing draft.
  useEffect(() => {
    if (!draftParam) return;
    let cancelled = false;
    void (async () => {
      try {
        const d = await loadDraft(draftParam);
        if (!cancelled && d) {
          setState(d.wizard);
          setDraftId(d.id);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftParam]);

  const entry = state.source ? catalogEntry(state.source.type) : undefined;

  const persist = useCallback(
    async (next: WizardState) => {
      if (!tenantId) return;
      setSaving(true);
      try {
        const id = await saveDraft({ tenantId, environment, draftId, state: next });
        setDraftId(id);
      } catch (err) {
        console.warn('Draft save failed', err);
      } finally {
        setSaving(false);
      }
    },
    [tenantId, environment, draftId],
  );

  // Update state and schedule a debounced draft save.
  const update = useCallback(
    (patch: Partial<WizardState> | ((s: WizardState) => WizardState), { immediate = false } = {}) => {
      setState((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (immediate) void persist(next);
        else saveTimer.current = setTimeout(() => void persist(next), 800);
        return next;
      });
    },
    [persist],
  );

  const goTo = (step: number) =>
    update((s) => ({ ...s, step, furthest: Math.max(s.furthest, step) }), { immediate: true });
  const next = () => goTo(Math.min(state.step + 1, WIZARD_STEPS.length - 1));
  const back = () => update((s) => ({ ...s, step: Math.max(s.step - 1, 0) }));

  const saveAndExit = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist(state);
    navigate('/data/connectors/marketplace');
  };

  const finish = async () => {
    if (!tenantId || !draftId) return;
    setSaving(true);
    try {
      await promoteDraft({ tenantId, environment, draftId, state });
      navigate(`/data/connectors/${draftId}/monitor`);
    } catch (err) {
      console.error('Could not start connector', err);
      setSaving(false);
    }
  };

  const abandon = async () => {
    if (draftId) {
      try {
        await discardDraft(draftId);
      } catch {
        /* ignore */
      }
    }
    navigate('/data/connectors/marketplace');
  };

  const canContinue = stepIsComplete(state.step, state);

  if (hydrating) {
    return (
      <div>
        <PageHeader title="Add connector" description="Loading your saved draft…" />
        <Card className="flex items-center gap-3 p-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Restoring wizard state
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Add connector"
        description="Six steps, each independently resumable. Close any time — your progress is saved as a draft."
        action={
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving draft
              </>
            ) : draftId ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" /> Draft saved
              </>
            ) : null}
          </div>
        }
      />

      <WizardStepStrip
        current={state.step}
        furthest={state.furthest}
        onJump={(i) => update((s) => ({ ...s, step: i }), { immediate: true })}
      />

      <Card className="mt-4 p-6">
        {state.step === 0 && <SourceStep state={state} onPick={(type) => {
          const e = catalogEntry(type)!;
          update((s) => ({
            ...s,
            source: { type },
            name: s.name?.trim() ? s.name : `${e.label} connector`,
            auth: { method: e.authMethods[0], connected: s.source?.type === type ? Boolean(s.auth?.connected) : false },
          }));
        }} />}

        {state.step === 1 && entry && (
          <AuthStep
            entry={entry}
            state={state}
            onChange={(auth) => update((s) => ({ ...s, auth }))}
            onName={(name) => update((s) => ({ ...s, name }))}
          />
        )}

        {state.step === 2 && entry && (
          <DiscoverStep
            state={state}
            connectorType={entry.type}
            onFields={(fields, accepted) =>
              update((s) => ({ ...s, discover: { fields, acceptedAt: accepted ? new Date().toISOString() : s.discover?.acceptedAt } }))
            }
          />
        )}

        {state.step === 3 && (
          <MapStep
            tenantId={tenantId}
            environment={environment}
            state={state}
            onChange={(targetSchema, mapping) => update((s) => ({ ...s, targetSchema, mapping }))}
          />
        )}

        {state.step === 4 && (
          <SyncStep
            state={state}
            onChange={(sync) => update((s) => ({ ...s, sync }))}
          />
        )}

        {state.step === 5 && entry && (
          <ReviewStep
            entry={entry}
            state={state}
            onTest={(key, outcome) =>
              update((s) => ({ ...s, review: { ...s.review, [key]: outcome } }), { immediate: true })
            }
          />
        )}
      </Card>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {state.step > 0 ? (
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={abandon}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {draftId && (
            <button
              type="button"
              onClick={saveAndExit}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Save &amp; exit
            </button>
          )}
          {state.step < WIZARD_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={!canContinue}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={!canContinue || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Start sync
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Progress strip
// ===========================================================================

function WizardStepStrip({
  current,
  furthest,
  onJump,
}: {
  current: number;
  furthest: number;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="flex flex-wrap overflow-hidden rounded-lg border border-slate-200">
      {WIZARD_STEPS.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const reachable = i <= furthest;
        return (
          <li key={step.key} className="flex-1 basis-40 border-r border-slate-200 last:border-r-0">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(i)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2.5 text-left transition',
                isActive && 'bg-brand-50',
                isDone && 'bg-slate-50',
                reachable ? 'hover:bg-slate-50' : 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : isDone
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate font-mono text-[11px] font-semibold uppercase tracking-wide',
                    isActive ? 'text-brand-700' : 'text-slate-600',
                  )}
                >
                  {step.label}
                </span>
                <span className="block truncate text-[11px] text-slate-400">{step.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ===========================================================================
// Step 1 · Source
// ===========================================================================

function SourceStep({ state, onPick }: { state: WizardState; onPick: (type: string) => void }) {
  const available = CONNECTOR_CATALOG.filter((c) => c.status === 'available');
  return (
    <div>
      <StepHeading
        title="What are you connecting?"
        sub="Pick the source or destination type. Everything after this adapts to your choice."
      />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((c) => {
          const meta = c.meta ?? connectorMeta(c.type);
          const Icon = meta?.icon;
          const accent = meta?.accent ?? '#4b47ca';
          const selected = state.source?.type === c.type;
          return (
            <button
              key={c.type}
              type="button"
              onClick={() => onPick(c.type)}
              className={cn(
                'flex flex-col gap-2 rounded-xl border p-3 text-left transition',
                selected
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400/30'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${accent}18`, color: accent }}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.label}</p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    {CONNECTOR_CATEGORIES.find((x) => x.key === c.category)?.label} ·{' '}
                    {c.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                  </p>
                </div>
              </div>
              <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500">{c.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Step 2 · Authenticate
// ===========================================================================

function AuthStep({
  entry,
  state,
  onChange,
  onName,
}: {
  entry: CatalogEntry;
  state: WizardState;
  onChange: (auth: NonNullable<WizardState['auth']>) => void;
  onName: (name: string) => void;
}) {
  const auth = state.auth ?? { method: entry.authMethods[0], connected: false };
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const fields = entry.meta?.configFields ?? [];

  const connect = () => {
    setConnecting(true);
    // No real auth backend — record that a secret was captured, keep non-secret hints.
    setTimeout(() => {
      const hints: Record<string, string> = {};
      for (const f of fields) {
        if (f.kind !== 'password' && secrets[f.key]) hints[f.key] = secrets[f.key];
      }
      onChange({ method: auth.method, connected: true, connectedAt: new Date().toISOString(), hints });
      setConnecting(false);
    }, 700);
  };

  return (
    <div>
      <StepHeading
        title="Connect securely"
        sub="Secrets are written straight to the secret manager — this form is write-only and never shows a stored value back."
      />

      <div className="mb-4 max-w-md">
        <label className="mb-1 block text-xs font-semibold text-slate-600">Connector name</label>
        <input
          value={state.name}
          onChange={(e) => onName(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="mb-4 max-w-md">
        <label className="mb-1 block text-xs font-semibold text-slate-600">Auth method</label>
        <select
          value={auth.method}
          disabled={auth.connected}
          onChange={(e) =>
            onChange({ ...auth, method: e.target.value as ConnectorAuthMethod, connected: false })
          }
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50"
        >
          {entry.authMethods.map((m) => (
            <option key={m} value={m}>
              {AUTH_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      {auth.connected ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Connected securely</p>
            <p className="text-xs text-emerald-700">
              {AUTH_METHOD_LABELS[auth.method]} · credentials stored in the secret manager
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...auth, connected: false })}
            className="ml-auto text-xs font-medium text-emerald-700 underline"
          >
            Re-enter
          </button>
        </div>
      ) : (
        <div className="max-w-md space-y-3">
          {fields.length === 0 && (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              This connector type needs no credentials.
            </p>
          )}
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
                {f.kind === 'password' && <Lock className="h-3 w-3 text-slate-400" />}
                {f.label}
              </label>
              {f.kind === 'select' ? (
                <select
                  value={secrets[f.key] ?? ''}
                  onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  <option value="">Choose…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.kind === 'textarea' ? (
                <textarea
                  value={secrets[f.key] ?? ''}
                  onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={3}
                  className={cn(
                    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm',
                    f.mono && 'font-mono text-xs',
                  )}
                />
              ) : (
                <input
                  type={f.kind === 'password' ? 'password' : f.kind === 'number' ? 'number' : 'text'}
                  value={secrets[f.key] ?? ''}
                  onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Connect securely
          </button>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Step 3 · Discover
// ===========================================================================

function DiscoverStep({
  state,
  connectorType,
  onFields,
}: {
  state: WizardState;
  connectorType: string;
  onFields: (fields: DiscoveredField[], accepted: boolean) => void;
}) {
  const fields = state.discover?.fields ?? [];
  const [scanning, setScanning] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => setMsgIndex((i) => Math.min(i + 1, DISCOVERY_MESSAGES.length - 1)), 550);
    const done = setTimeout(() => {
      setScanning(false);
      onFields(simulateDiscovery(connectorType), false);
    }, DISCOVERY_MESSAGES.length * 550 + 200);
    return () => {
      clearInterval(t);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const setField = (i: number, patch: Partial<DiscoveredField>) =>
    onFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)), false);

  if (scanning) {
    return (
      <div>
        <StepHeading title="Inspecting the source" sub="Reading structure and a small sample — no data is imported yet." />
        <div className="space-y-2">
          {DISCOVERY_MESSAGES.slice(0, msgIndex + 1).map((m, i) => (
            <div key={m} className="flex items-center gap-2 text-sm text-slate-600">
              {i === msgIndex ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
              ) : (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {m}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div>
        <StepHeading title="Discover the schema" sub="Marbee inspects the source and proposes a schema you can accept or edit." />
        <button
          type="button"
          onClick={() => {
            setMsgIndex(0);
            setScanning(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Sparkles className="h-4 w-4" /> Inspect source
        </button>
      </div>
    );
  }

  return (
    <div>
      <StepHeading
        title="Proposed schema"
        sub={`${fields.length} fields detected from a 100-row sample. Adjust types or exclude fields, then accept.`}
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Nullable</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Sample</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.name} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-mono text-xs text-slate-800">{f.name}</td>
                <td className="px-3 py-1.5">
                  <select
                    value={f.type}
                    onChange={(e) => setField(i, { type: e.target.value })}
                    className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                  >
                    {['string', 'number', 'boolean', 'timestamp', 'json'].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={f.nullable}
                    onChange={(e) => setField(i, { nullable: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-1.5">{f.primaryKey ? <CapabilityBadge tone="accent">PK</CapabilityBadge> : null}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{f.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onFields(fields, true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Check className="h-4 w-4" /> Accept schema
        </button>
        {state.discover?.acceptedAt && <StatusPill tone="ok" label="Accepted" />}
        <button
          type="button"
          onClick={() => onFields([], false)}
          className="text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          Re-inspect
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Step 4 · Map
// ===========================================================================

function MapStep({
  tenantId,
  environment,
  state,
  onChange,
}: {
  tenantId: string | undefined;
  environment: string;
  state: WizardState;
  onChange: (targetSchema: string, mapping: ConnectorMappingRow[]) => void;
}) {
  const { data: schemas, isLoading } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    enabled: Boolean(tenantId),
    queryFn: () => fetchSchemasWithFields(tenantId as string, environment),
  });

  const discovered = state.discover?.fields ?? [];
  const targetSlug = state.targetSchema ?? '';
  const target = (schemas ?? []).find((s) => s.slug === targetSlug);
  const targetFields = useMemo(
    () => ((target?.schema_fields ?? []) as Array<Record<string, unknown>>).map((f) => String(f.name)),
    [target],
  );

  const rows = state.mapping ?? [];

  const pickSchema = (slug: string) => {
    const sch = (schemas ?? []).find((s) => s.slug === slug);
    const fieldNames = ((sch?.schema_fields ?? []) as Array<Record<string, unknown>>).map((f) => String(f.name));
    // Auto-suggest by exact / normalised name match.
    const suggested: ConnectorMappingRow[] = discovered.map((d) => {
      const match = fieldNames.find(
        (n) => n.toLowerCase() === d.name.toLowerCase() || n.toLowerCase().replace(/_/g, '') === d.name.toLowerCase().replace(/_/g, ''),
      );
      return {
        source_field: d.name,
        transform: '',
        target_schema: slug,
        target_field: match ?? '',
      };
    });
    onChange(slug, suggested);
  };

  const setRow = (i: number, patch: Partial<ConnectorMappingRow>) =>
    onChange(targetSlug, rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const mappedCount = rows.filter((r) => r.target_field).length;

  return (
    <div>
      <StepHeading
        title="Map source fields to a schema"
        sub="Bind each discovered field to a Marbee schema field. Suggested matches are pre-filled — confirm or change them."
      />

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading schemas
        </p>
      ) : (
        <>
          <div className="mb-4 max-w-md">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Destination schema</label>
            <select
              value={targetSlug}
              onChange={(e) => pickSchema(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              <option value="">Choose a schema…</option>
              {(schemas ?? []).map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {targetSlug && (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Source field</th>
                      <th className="px-3 py-2 font-medium">Transform</th>
                      <th className="px-3 py-2 font-medium">→ Schema field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isSuggestion = Boolean(r.target_field) && !r.confirmed;
                      return (
                        <tr key={r.source_field} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-800">{r.source_field}</td>
                          <td className="px-3 py-1.5">
                            <select
                              value={r.transform}
                              onChange={(e) => setRow(i, { transform: e.target.value })}
                              className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                            >
                              {TRANSFORM_OPTIONS.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <select
                                value={r.target_field}
                                onChange={(e) => setRow(i, { target_field: e.target.value, confirmed: true })}
                                className={cn(
                                  'rounded border px-1.5 py-1 text-xs',
                                  isSuggestion ? 'border-amber-300 bg-amber-50' : 'border-slate-200',
                                )}
                              >
                                <option value="">— skip —</option>
                                {targetFields.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                              {isSuggestion && (
                                <button
                                  type="button"
                                  onClick={() => setRow(i, { confirmed: true })}
                                  className="text-[11px] font-medium text-amber-700 underline"
                                >
                                  suggested — keep
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {mappedCount} of {rows.length} fields mapped
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Step 5 · Sync
// ===========================================================================

const SYNC_MODES: { value: SyncMode; label: string; hint: string }[] = [
  { value: 'one_time', label: 'One-time', hint: 'run once, now' },
  { value: 'scheduled', label: 'Scheduled', hint: 'on a fixed cadence' },
  { value: 'continuous', label: 'Continuous', hint: 'keep polling' },
  { value: 'realtime', label: 'Realtime / webhook', hint: 'event-driven' },
  { value: 'incremental', label: 'Incremental', hint: 'only changed rows' },
];

const FREQUENCIES: { value: SyncFrequency; label: string }[] = [
  { value: 'realtime', label: 'Realtime' },
  { value: '5m', label: 'Every 5 minutes' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'custom', label: 'Custom cron' },
];

function SyncStep({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (sync: NonNullable<WizardState['sync']>) => void;
}) {
  const sync = state.sync ?? { mode: 'scheduled' as SyncMode, frequency: 'hourly' as SyncFrequency };
  const cursorCandidates = candidateCursorFields(state.discover?.fields ?? []);
  const needsCursor = sync.mode === 'incremental';
  const needsSchedule = sync.mode === 'scheduled' || sync.mode === 'incremental' || sync.mode === 'continuous';

  return (
    <div>
      <StepHeading title="Configure the sync" sub="How often should Marbee pull from this source, and how should it track progress?" />

      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SYNC_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange({ ...sync, mode: m.value })}
            className={cn(
              'rounded-xl border p-3 text-left transition',
              sync.mode === m.value
                ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400/30'
                : 'border-slate-200 hover:border-slate-300',
            )}
          >
            <p className="text-sm font-semibold text-slate-900">{m.label}</p>
            <p className="text-[11px] text-slate-500">{m.hint}</p>
          </button>
        ))}
      </div>

      {needsSchedule && (
        <div className="mb-4 max-w-md">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Frequency</label>
          <select
            value={sync.frequency}
            onChange={(e) => onChange({ ...sync, frequency: e.target.value as SyncFrequency })}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {needsSchedule && sync.frequency === 'custom' && (
        <div className="mb-4 max-w-md">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Cron expression</label>
          <input
            value={sync.cron ?? ''}
            onChange={(e) => onChange({ ...sync, cron: e.target.value })}
            placeholder="0 */6 * * *"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
          />
        </div>
      )}

      {needsCursor && (
        <div className="max-w-md">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Cursor field</label>
          <select
            value={sync.cursorField ?? ''}
            onChange={(e) => onChange({ ...sync, cursorField: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            <option value="">Choose a field…</option>
            {cursorCandidates.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Offered from discovered timestamps and sequence IDs. Marbee resumes from the last value it saw.
          </p>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Step 6 · Review
// ===========================================================================

function ReviewStep({
  entry,
  state,
  onTest,
}: {
  entry: CatalogEntry;
  state: WizardState;
  onTest: (key: 'testConnection' | 'testSync', outcome: TestOutcome) => void;
}) {
  const [running, setRunning] = useState<'testConnection' | 'testSync' | null>(null);
  const mapping = (state.mapping ?? []).filter((r) => r.target_field);

  const run = (key: 'testConnection' | 'testSync') => {
    setRunning(key);
    setTimeout(() => {
      onTest(key, {
        status: 'success',
        ranAt: new Date().toISOString(),
        message:
          key === 'testConnection'
            ? 'Reached the source and authenticated.'
            : `Dry run mapped ${mapping.length} fields across 100 sample rows — no writes.`,
        sampleRows: key === 'testSync' ? 100 : undefined,
      });
      setRunning(null);
    }, 900);
  };

  return (
    <div>
      <StepHeading title="Review & start" sub="Confirm the pipeline, run the checks, then start the sync." />

      <div className="grid gap-3 sm:grid-cols-2">
        <ReviewRow label="Source" value={entry.label} sub={AUTH_METHOD_LABELS[state.auth?.method ?? entry.authMethods[0]]} />
        <ReviewRow
          label="Schema"
          value={`${(state.discover?.fields ?? []).length} fields`}
          sub={state.discover?.acceptedAt ? 'Accepted' : 'Proposed'}
        />
        <ReviewRow label="Transform" value={`${mapping.length} field mappings`} sub={state.targetSchema ?? '—'} />
        <ReviewRow label="Destination" value={state.targetSchema ?? 'Not set'} />
        <ReviewRow
          label="Schedule"
          value={state.sync ? SYNC_MODES.find((m) => m.value === state.sync!.mode)?.label ?? state.sync.mode : 'Not set'}
          sub={state.sync?.mode === 'incremental' ? `cursor: ${state.sync.cursorField || '—'}` : state.sync?.frequency}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <TestButton
          label="Test connection"
          running={running === 'testConnection'}
          outcome={state.review?.testConnection}
          onRun={() => run('testConnection')}
        />
        <TestButton
          label="Test sync (dry run)"
          running={running === 'testSync'}
          outcome={state.review?.testSync}
          onRun={() => run('testSync')}
        />
      </div>

      {(state.review?.testConnection || state.review?.testSync) && (
        <div className="mt-4 space-y-1.5">
          {(['testConnection', 'testSync'] as const).map((k) => {
            const o = state.review?.[k];
            if (!o) return null;
            return (
              <p key={k} className="flex items-center gap-2 text-xs text-slate-600">
                <StatusPill tone={o.status === 'success' ? 'ok' : 'fail'} label={o.status === 'success' ? 'Pass' : 'Fail'} />
                {o.message}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function TestButton({
  label,
  running,
  outcome,
  onRun,
}: {
  label: string;
  running: boolean;
  outcome?: TestOutcome;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={running}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {running ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : outcome?.status === 'success' ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <PlugZap className="h-4 w-4 text-slate-400" />
      )}
      {label}
    </button>
  );
}

// ===========================================================================
// Shared bits
// ===========================================================================

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{sub}</p>
    </div>
  );
}

function stepIsComplete(step: number, s: WizardState): boolean {
  switch (step) {
    case 0:
      return Boolean(s.source?.type);
    case 1:
      return Boolean(s.auth?.connected && s.name.trim());
    case 2:
      return Boolean(s.discover?.acceptedAt);
    case 3:
      return Boolean(s.targetSchema && (s.mapping ?? []).some((r) => r.target_field));
    case 4:
      return Boolean(s.sync?.mode) && (s.sync?.mode !== 'incremental' || Boolean(s.sync?.cursorField));
    case 5:
      return s.review?.testConnection?.status === 'success';
    default:
      return false;
  }
}
