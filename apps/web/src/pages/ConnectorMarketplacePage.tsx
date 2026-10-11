import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { StatusPill } from '@/components/data/StatusPill';
import { CapabilityBadge, CapabilityBadgeRow } from '@/components/data/CapabilityBadge';
import { connectorMeta } from '@/lib/connector-meta';
import {
  AUTH_METHOD_LABELS,
  CAPABILITY_LABELS,
  CONNECTOR_CATALOG,
  CONNECTOR_CATEGORIES,
  DEFAULT_CATALOG_FILTER,
  catalogEntry,
  filterCatalog,
  type CatalogEntry,
  type CatalogFilter,
  type ConnectorAuthMethod,
  type ConnectorCapability,
} from '@/lib/connector-catalog';
import {
  discardDraft,
  draftProgressLabel,
  useConnectorDrafts,
} from '@/lib/add-connector-wizard';

type ConnectorLite = {
  id: string;
  name: string;
  connector_type: string;
  status: string;
  last_sync_at: string | null;
};

export function ConnectorMarketplacePage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_CATALOG_FILTER);

  const { data: connectors } = useQuery({
    queryKey: ['connectors-lite', tenantId, environment],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data } = await supabase
        .from('connectors')
        .select('id, name, connector_type, status, last_sync_at')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .neq('status', 'draft')
        .order('last_sync_at', { ascending: false, nullsFirst: false });
      return (data ?? []) as ConnectorLite[];
    },
  });

  const { data: drafts } = useConnectorDrafts(tenantId, environment);
  const queryClient = useQueryClient();

  const removeDraft = async (id: string) => {
    if (!confirm('Discard this in-progress connector setup? This cannot be undone.')) return;
    await discardDraft(id);
    queryClient.invalidateQueries({ queryKey: ['connector-drafts'] });
  };

  const byType = useMemo(() => {
    const map = new Map<string, ConnectorLite[]>();
    for (const c of connectors ?? []) {
      const list = map.get(c.connector_type) ?? [];
      list.push(c);
      map.set(c.connector_type, list);
    }
    return map;
  }, [connectors]);

  const connectedTypes = useMemo(() => new Set(byType.keys()), [byType]);
  const draftTypes = useMemo(
    () => new Set((drafts ?? []).map((d) => d.connector_type)),
    [drafts],
  );

  const visible = useMemo(
    () => filterCatalog(CONNECTOR_CATALOG, filter, connectedTypes, draftTypes),
    [filter, connectedTypes, draftTypes],
  );

  const activeFilterCount =
    (filter.category !== 'all' ? 1 : 0) +
    (filter.capability !== 'all' ? 1 : 0) +
    (filter.auth !== 'all' ? 1 : 0) +
    (filter.connection !== 'all' ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Connector marketplace"
        description="Every source and destination Marbee can talk to — filtered by what it can do and how it authenticates."
        action={
          <button
            type="button"
            onClick={() => navigate('/data/connectors/new')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add connector
          </button>
        }
      />

      {(drafts ?? []).length > 0 && (
        <div className="mb-4 space-y-2">
          {(drafts ?? []).map((d) => {
            const entry = catalogEntry(d.connector_type);
            return (
              <div
                key={d.id}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3"
              >
                <StatusPill tone="idle" label={draftProgressLabel(d.wizard)} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {d.name}
                  {entry && <span className="ml-2 text-slate-400">· {entry.label}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/data/connectors/new?draft=${d.id}`)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  Resume setup <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeDraft(d.id)}
                  title="Discard draft"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Filter rail */}
        <aside className="space-y-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search connectors…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <FilterGroup
            label="Connection"
            value={filter.connection}
            onChange={(v) => setFilter((f) => ({ ...f, connection: v as CatalogFilter['connection'] }))}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'connected', label: 'Connected' },
              { value: 'not_connected', label: 'Not connected' },
              { value: 'draft', label: 'Draft in progress' },
            ]}
          />

          <FilterGroup
            label="Category"
            value={filter.category}
            onChange={(v) => setFilter((f) => ({ ...f, category: v as CatalogFilter['category'] }))}
            options={[
              { value: 'all', label: 'All categories' },
              ...CONNECTOR_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
            ]}
          />

          <FilterGroup
            label="Capability"
            value={filter.capability}
            onChange={(v) => setFilter((f) => ({ ...f, capability: v as CatalogFilter['capability'] }))}
            options={[
              { value: 'all', label: 'Any capability' },
              ...(Object.keys(CAPABILITY_LABELS) as ConnectorCapability[]).map((c) => ({
                value: c,
                label: CAPABILITY_LABELS[c],
              })),
            ]}
          />

          <FilterGroup
            label="Auth method"
            value={filter.auth}
            onChange={(v) => setFilter((f) => ({ ...f, auth: v as CatalogFilter['auth'] }))}
            options={[
              { value: 'all', label: 'Any auth' },
              ...(Object.keys(AUTH_METHOD_LABELS) as ConnectorAuthMethod[]).map((a) => ({
                value: a,
                label: AUTH_METHOD_LABELS[a],
              })),
            ]}
          />

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilter((f) => ({ ...DEFAULT_CATALOG_FILTER, search: f.search }))
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <X className="h-3 w-3" /> Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </aside>

        {/* Card grid */}
        <div>
          <p className="mb-3 text-xs text-slate-500">
            {visible.length} connector{visible.length === 1 ? '' : 's'}
            {connectedTypes.size > 0 && ` · ${connectedTypes.size} type${connectedTypes.size === 1 ? '' : 's'} connected`}
          </p>
          {visible.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No connectors match these filters.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((entry) => (
                <MarketplaceCard
                  key={entry.type}
                  entry={entry}
                  connected={byType.get(entry.type) ?? []}
                  onConnect={() => navigate(`/data/connectors/new?type=${entry.type}`)}
                  onOpen={(id) => navigate(`/data/connectors/${id}`)}
                  onOpenAll={() => navigate('/data/connectors')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MarketplaceCard({
  entry,
  connected,
  onConnect,
  onOpen,
  onOpenAll,
}: {
  entry: CatalogEntry;
  connected: ConnectorLite[];
  onConnect: () => void;
  onOpen: (id: string) => void;
  onOpenAll: () => void;
}) {
  const meta = entry.meta ?? connectorMeta(entry.type);
  const Icon = meta?.icon;
  const accent = meta?.accent ?? '#4b47ca';
  const isConnected = connected.length > 0;
  const comingSoon = entry.status === 'coming_soon';
  const latest = connected[0];

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}18`, color: accent }}
        >
          {Icon ? <Icon className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{entry.label}</p>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            {CONNECTOR_CATEGORIES.find((c) => c.key === entry.category)?.label ?? entry.category}
            {' · '}
            {entry.direction === 'inbound' ? 'Inbound' : 'Outbound'}
          </p>
        </div>
        {entry.popular && !isConnected && <CapabilityBadge tone="accent">Popular</CapabilityBadge>}
      </div>

      <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{entry.description}</p>

      <CapabilityBadgeRow capabilities={entry.capabilities} />

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
        {isConnected ? (
          <>
            <div className="flex items-center gap-2">
              <StatusPill status={latest.status} />
              <span className="text-[11px] text-slate-400">
                {connected.length > 1
                  ? `${connected.length} connected`
                  : latest.last_sync_at
                    ? `synced ${relTime(latest.last_sync_at)}`
                    : 'never synced'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => (connected.length > 1 ? onOpenAll() : onOpen(latest.id))}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              Open <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </>
        ) : comingSoon ? (
          <>
            <span className="text-[11px] text-slate-400">Not available yet</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-400">
              Coming soon
            </span>
          </>
        ) : (
          <>
            <span className="text-[11px] text-slate-400">
              {entry.authMethods.map((a) => AUTH_METHOD_LABELS[a]).slice(0, 2).join(' · ')}
            </span>
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              Connect <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
