import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  ExternalLink,
  GripVertical,
  LayoutTemplate,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { JourneyFolderSidebar } from '@/components/journeys/JourneyFolderSidebar';
import { JourneyLibraryToolbar } from '@/components/journeys/JourneyLibraryToolbar';
import { RenameModal } from '@/components/journeys/RenameModal';
import { CreateFolderModal } from '@/components/assets/CreateFolderModal';
import { DuplicateCampaignModal, type DuplicateOptions } from '@/components/campaigns/DuplicateCampaignModal';
import { CampaignStatusBadge, channelIcon } from '@/components/campaigns/CampaignUi';
import { useAuth } from '@/contexts/AuthContext';
import {
  CAMPAIGN_PRESETS,
  CAMPAIGN_STATUS_CONFIG,
  CAMPAIGN_TYPES,
  CampaignLinkMissingError,
  campaignCode,
  campaignMeta,
  compactNumber,
  deriveCampaignStatus,
  duplicateCampaign,
  emptyEngagement,
  fetchEngagement,
  fetchExecution,
  fetchLinkedPipelines,
  formatDate,
  setCampaignArchived,
  setCampaignPaused,
  summarizeEngagement,
  type CampaignStatus,
  type CampaignWorkflow,
} from '@/lib/campaigns';
import {
  buildJourneyFolderTree,
  folderNameFromPath,
  joinFolderPath,
  JOURNEY_DRAG_MIME,
  journeysInFolder,
  normalizeFolderPath,
  parentFolderPath,
  ROOT_FOLDER_LABEL,
} from '@/lib/journey-folders';
import {
  createJourneyFolder,
  deleteJourney,
  deleteJourneyFolder,
  fetchJourneyFolders,
  fetchJourneys,
  journeyType,
  moveJourneyToFolder,
  renameJourneyFolder,
  type JourneyRow,
} from '@/lib/journeys';

// ─── Columns ───────────────────────────────────────────────────────────

type ColumnId =
  | 'campaign'
  | 'status'
  | 'owner'
  | 'type'
  | 'start'
  | 'end'
  | 'workflows'
  | 'deliveries'
  | 'targeted'
  | 'sent'
  | 'delivered'
  | 'updated';

const COLUMNS: { id: ColumnId; label: string; align?: 'right'; locked?: boolean; defaultOn: boolean }[] = [
  { id: 'campaign', label: 'Campaign', locked: true, defaultOn: true },
  { id: 'status', label: 'Status', defaultOn: true },
  { id: 'owner', label: 'Owner', defaultOn: true },
  { id: 'type', label: 'Type', defaultOn: false },
  { id: 'start', label: 'Start Date', defaultOn: true },
  { id: 'end', label: 'End Date', defaultOn: true },
  { id: 'workflows', label: 'Workflows', align: 'right', defaultOn: true },
  { id: 'deliveries', label: 'Deliveries', align: 'right', defaultOn: true },
  { id: 'targeted', label: 'Targeted', align: 'right', defaultOn: true },
  { id: 'sent', label: 'Sent', align: 'right', defaultOn: true },
  { id: 'delivered', label: 'Delivered', align: 'right', defaultOn: true },
  { id: 'updated', label: 'Last Updated', defaultOn: true },
];

const COLUMN_PREFS_KEY = 'marbee_campaign_columns_v1';
const PAGE_SIZE = 20;

function loadColumnPrefs(): ColumnId[] {
  try {
    const raw = localStorage.getItem(COLUMN_PREFS_KEY);
    if (raw) return JSON.parse(raw) as ColumnId[];
  } catch {}
  return COLUMNS.filter((c) => c.defaultOn).map((c) => c.id);
}

type DateField = 'created' | 'start' | 'end';

type Row = {
  journey: JourneyRow;
  code: string;
  status: CampaignStatus;
  owner: string;
  type: string;
  workflows: CampaignWorkflow[];
  deliveries: number;
  channels: string[];
  targeted: number;
  sent: number;
  delivered: number | null;
};

export function CampaignsPage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentFolder, setCurrentFolder] = useState('/');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateField, setDateField] = useState<DateField>('created');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<{ col: ColumnId; dir: 'asc' | 'desc' }>({ col: 'updated', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [visibleCols, setVisibleCols] = useState<ColumnId[]>(loadColumnPrefs);
  const [showColumns, setShowColumns] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<JourneyRow | null>(null);
  const [deleting, setDeleting] = useState<JourneyRow | null>(null);
  const [actionError, setActionError] = useState('');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<{ path: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(visibleCols));
    } catch {}
  }, [visibleCols]);

  useEffect(() => setPage(1), [search, statusFilter, ownerFilter, typeFilter, dateField, dateFrom, dateTo, currentFolder]);

  // ─── Data ────────────────────────────────────────────────────────────
  const { data: journeys, isLoading } = useQuery({
    queryKey: ['journeys', tenantId, environment],
    queryFn: () => fetchJourneys(tenantId, environment),
  });
  const campaigns = useMemo(() => (journeys ?? []).filter((j) => journeyType(j) === 'campaign'), [journeys]);
  const campaignIds = useMemo(() => campaigns.map((c) => c.id), [campaigns]);

  const { data: explicitFolders = [] } = useQuery({
    queryKey: ['journey-folders', tenantId, environment],
    queryFn: () => fetchJourneyFolders(tenantId, environment),
  });

  const linkedQuery = useQuery({
    queryKey: ['campaign-linked-pipelines', tenantId, environment],
    queryFn: () => fetchLinkedPipelines(tenantId, environment),
    retry: false,
  });
  const linkMissing = linkedQuery.error instanceof CampaignLinkMissingError;

  const { data: execution } = useQuery({
    queryKey: ['campaign-execution-all', linkedQuery.data?.map((p) => p.id)],
    queryFn: () => fetchExecution(linkedQuery.data ?? [], 1000),
    enabled: Boolean(linkedQuery.data?.length),
    refetchInterval: 30_000,
  });

  const { data: engagementRows = [] } = useQuery({
    queryKey: ['campaign-engagement-all', campaignIds],
    queryFn: () => fetchEngagement(campaignIds),
    enabled: campaignIds.length > 0,
    refetchInterval: 60_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['journeys'] });
    queryClient.invalidateQueries({ queryKey: ['journey-folders'] });
    queryClient.invalidateQueries({ queryKey: ['campaign-linked-pipelines'] });
    queryClient.invalidateQueries({ queryKey: ['campaign-execution-all'] });
  };

  const rows: Row[] = useMemo(() => {
    const engagement = summarizeEngagement(engagementRows);
    return campaigns.map((j) => {
      const workflows = (execution?.workflows ?? []).filter((w) => w.pipeline.campaign_id === j.id);
      const deliveries = workflows.flatMap((w) => w.deliveries);
      const eng = engagement[j.id] ?? emptyEngagement();
      const meta = campaignMeta(j);
      return {
        journey: j,
        code: campaignCode(j),
        status: deriveCampaignStatus(j, workflows),
        owner: j.settings?.campaign_owner || '—',
        type: meta.type || '—',
        workflows,
        deliveries: deliveries.length,
        channels: [...new Set([...deliveries.map((d) => d.channel), ...Object.keys(eng.byChannel)])],
        targeted: deliveries.reduce((s, d) => s + d.targeted, 0),
        sent: deliveries.reduce((s, d) => s + d.sent, 0) + eng.sent,
        delivered: eng.delivered || null,
      };
    });
  }, [campaigns, execution, engagementRows]);

  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner).filter((o) => o !== '—'))].sort(), [rows]);
  const statusCounts = useMemo(() => {
    const c: Partial<Record<CampaignStatus, number>> = {};
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inFolder = new Set(journeysInFolder(campaigns, currentFolder).map((j) => j.id));
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return rows.filter((r) => {
      // Search spans all folders; otherwise scope to the open folder.
      if (q) {
        const hay = [r.journey.name, r.code, r.journey.id, r.owner, r.journey.description ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      } else if (!inFolder.has(r.journey.id)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (ownerFilter !== 'all' && r.owner !== ownerFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (from !== null || to !== null) {
        const iso = dateField === 'created' ? r.journey.created_at : dateField === 'start' ? r.journey.starts_at : r.journey.ends_at;
        if (!iso) return false;
        const t = new Date(iso).getTime();
        if (from !== null && t < from) return false;
        if (to !== null && t > to) return false;
      }
      return true;
    });
  }, [rows, campaigns, currentFolder, search, statusFilter, ownerFilter, typeFilter, dateField, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const val = (r: Row): string | number => {
      switch (sort.col) {
        case 'campaign': return r.journey.name.toLowerCase();
        case 'status': return r.status;
        case 'owner': return r.owner.toLowerCase();
        case 'type': return r.type;
        case 'start': return r.journey.starts_at ?? '';
        case 'end': return r.journey.ends_at ?? '';
        case 'workflows': return r.workflows.length;
        case 'deliveries': return r.deliveries;
        case 'targeted': return r.targeted;
        case 'sent': return r.sent;
        case 'delivered': return r.delivered ?? -1;
        case 'updated': return r.journey.updated_at ?? '';
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilterCount = [statusFilter !== 'all', ownerFilter !== 'all', typeFilter !== 'all', Boolean(dateFrom || dateTo)].filter(Boolean).length;

  // ─── Mutations ───────────────────────────────────────────────────────
  const pauseMutation = useMutation({
    mutationFn: ({ j, paused }: { j: JourneyRow; paused: boolean }) => setCampaignPaused(j, paused, tenantId, environment),
    onSuccess: refresh,
    onError: (e: Error) => setActionError(e.message),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ j, archived }: { j: JourneyRow; archived: boolean }) => setCampaignArchived(j, archived, tenantId, environment),
    onSuccess: refresh,
    onError: (e: Error) => setActionError(e.message),
  });
  const duplicateMutation = useMutation({
    mutationFn: (opts: DuplicateOptions) => duplicateCampaign({ source: duplicating!, tenantId, environment, ...opts }),
    onSuccess: (created) => {
      setDuplicating(null);
      refresh();
      navigate(`/campaigns/${created.id}`);
    },
    onError: (e: Error) => setActionError(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: async (j: JourneyRow) => {
      const r = await deleteJourney(j.id, tenantId, environment, j.name);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => {
      setDeleting(null);
      setActionError(e.message);
    },
  });
  const moveMutation = useMutation({
    mutationFn: async ({ id, folderPath }: { id: string; folderPath: string }) => {
      const r = await moveJourneyToFolder(id, folderPath);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: refresh,
    onError: (e: Error) => setActionError(e.message),
  });
  const createFolderMutation = useMutation({
    mutationFn: () => createJourneyFolder(tenantId, environment, currentFolder, newFolderName),
    onSuccess: (r) => {
      if (r.error) return setFolderError(r.error);
      setShowNewFolder(false);
      setNewFolderName('');
      refresh();
    },
    onError: (e: Error) => setFolderError(e.message),
  });
  const renameFolderMutation = useMutation({
    mutationFn: ({ path, value }: { path: string; value: string }) => renameJourneyFolder(tenantId, environment, path, value),
    onSuccess: (r, { path, value }) => {
      if (r.error) return setRenameError(r.error);
      setRenamingFolder(null);
      if (normalizeFolderPath(currentFolder) === normalizeFolderPath(path)) {
        setCurrentFolder(normalizeFolderPath(joinFolderPath(parentFolderPath(path), value)));
      }
      refresh();
    },
    onError: (e: Error) => setRenameError(e.message),
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (path: string) => deleteJourneyFolder(tenantId, environment, path),
    onSuccess: (r) => {
      if (r.error) return setActionError(r.error);
      setCurrentFolder(parentFolderPath(currentFolder));
      refresh();
    },
  });

  const handleDrop = (folderPath: string, id: string) => {
    setDraggingId(null);
    setDropTarget(null);
    const target = normalizeFolderPath(folderPath);
    const c = campaigns.find((x) => x.id === id);
    if (c && normalizeFolderPath(c.folder_path ?? '/') !== target) moveMutation.mutate({ id, folderPath: target });
  };

  const toggleSort = (col: ColumnId) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'campaign' || col === 'owner' ? 'asc' : 'desc' }));

  const folderTree = useMemo(() => buildJourneyFolderTree(campaigns, explicitFolders), [campaigns, explicitFolders]);
  const isRoot = normalizeFolderPath(currentFolder) === '/';
  const folderLabel = isRoot ? ROOT_FOLDER_LABEL : folderNameFromPath(currentFolder);
  const cols = COLUMNS.filter((c) => visibleCols.includes(c.id));
  const createHref = `/campaigns/new${isRoot ? '' : `?folder=${encodeURIComponent(currentFolder)}`}`;

  const selectCls = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
            Campaigns
            <span className="rounded-full border border-indigo-200/60 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              {campaigns.length}
            </span>
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-500 sm:text-sm">
            Business campaigns on top of your Pipelines — plan, attach workflows, and monitor deliveries from one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="secondary" onClick={() => setShowTemplates((v) => !v)} className="text-xs">
              <LayoutTemplate className="mr-1.5 h-4 w-4" />
              Campaign Templates
            </Button>
            {showTemplates && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowTemplates(false)} />
                <div className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {CAMPAIGN_PRESETS.map((p) => {
                    const Icon = channelIcon(p.meta.primary_channel ?? '');
                    return (
                      <Link
                        key={p.id}
                        to={`/campaigns/new?preset=${p.id}${isRoot ? '' : `&folder=${encodeURIComponent(currentFolder)}`}`}
                        className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-indigo-50"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                        <span>
                          <span className="block text-xs font-semibold text-slate-800">{p.name}</span>
                          <span className="block text-[11px] text-slate-500">{p.description}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <Button
            onClick={() => navigate(createHref)}
            className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-md hover:shadow-indigo-500/20"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Campaign
          </Button>
        </div>
      </div>

      {linkMissing && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Workflow counts and delivery metrics need the campaign ↔ pipeline link. Run <code className="font-mono font-semibold">supabase/sql/82_campaign_pipeline_link.sql</code> once in the SQL editor.
          </span>
        </div>
      )}
      {actionError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
          {actionError}
          <button onClick={() => setActionError('')}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col lg:flex-row">
          <JourneyFolderSidebar
            tree={folderTree}
            currentPath={currentFolder}
            dropTarget={dropTarget}
            dragging={draggingId !== null}
            onSelect={(p) => {
              setCurrentFolder(p);
              setSearch('');
            }}
            onDrop={handleDrop}
            onDragOver={setDropTarget}
          />

          <div className="min-w-0 flex-1">
            <JourneyLibraryToolbar
              currentFolder={currentFolder}
              folderLabel={folderLabel}
              folderTitle={isRoot ? 'All campaigns' : folderLabel}
              itemCount={filtered.length}
              onNavigateFolder={setCurrentFolder}
              onNewFolder={() => {
                setFolderError('');
                setNewFolderName('');
                setShowNewFolder(true);
              }}
              canDeleteFolder={!isRoot}
              onRenameFolder={
                isRoot
                  ? undefined
                  : () => {
                      setRenamingFolder({ path: currentFolder, name: folderLabel });
                      setRenameName(folderLabel);
                      setRenameError('');
                    }
              }
              onDeleteFolder={() => {
                if (window.confirm(`Delete folder "${folderLabel}"? Campaigns inside move to the parent folder.`)) deleteFolderMutation.mutate(currentFolder);
              }}
            />

            {/* ── Search + filters ─────────────────────────────── */}
            <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, campaign ID, owner, description…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-8 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Button variant="secondary" onClick={() => setShowColumns((v) => !v)} className="text-xs">
                    <Columns3 className="mr-1.5 h-3.5 w-3.5" />
                    Columns
                  </Button>
                  {showColumns && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowColumns(false)} />
                      <div className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                        {COLUMNS.map((c) => (
                          <label key={c.id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${c.locked ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                            <input
                              type="checkbox"
                              disabled={c.locked}
                              checked={visibleCols.includes(c.id)}
                              onChange={(e) =>
                                setVisibleCols((v) => (e.target.checked ? COLUMNS.filter((x) => v.includes(x.id) || x.id === c.id).map((x) => x.id) : v.filter((x) => x !== c.id)))
                              }
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | 'all')} className={selectCls}>
                  <option value="all">All statuses</option>
                  {(Object.keys(CAMPAIGN_STATUS_CONFIG) as CampaignStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {CAMPAIGN_STATUS_CONFIG[s].label} ({statusCounts[s] ?? 0})
                    </option>
                  ))}
                </select>
                <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className={selectCls}>
                  <option value="all">All owners</option>
                  {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
                  <option value="all">All types</option>
                  {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white pl-1">
                  <select value={dateField} onChange={(e) => setDateField(e.target.value as DateField)} className="border-0 bg-transparent py-1.5 text-xs font-medium text-slate-700 focus:outline-none">
                    <option value="created">Created</option>
                    <option value="start">Start date</option>
                    <option value="end">End date</option>
                  </select>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border-0 bg-transparent py-1.5 text-xs text-slate-700 focus:outline-none" />
                  <span className="text-xs text-slate-400">–</span>
                  <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="border-0 bg-transparent py-1.5 pr-2 text-xs text-slate-700 focus:outline-none" />
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setOwnerFilter('all');
                      setTypeFilter('all');
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Table ────────────────────────────────────────── */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {cols.map((c) => (
                      <th key={c.id} className={`whitespace-nowrap px-3 py-2.5 first:pl-5 ${c.align === 'right' ? 'text-right' : ''}`}>
                        <button onClick={() => toggleSort(c.id)} className={`inline-flex items-center gap-1 hover:text-slate-800 ${sort.col === c.id ? 'text-indigo-700' : ''}`}>
                          {c.label}
                          {sort.col === c.id && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      </th>
                    ))}
                    <th className="w-12 px-3 py-2.5 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={cols.length + 1} className="py-14 text-center text-sm text-slate-500">Loading campaigns…</td></tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length + 1} className="py-14 text-center">
                        <p className="text-sm font-semibold text-slate-700">No campaigns found</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {search || activeFilterCount ? 'Try a different search or clear filters.' : isRoot ? 'Create your first campaign to get started.' : `Folder "${folderLabel}" is empty — drag campaigns here.`}
                        </p>
                        <Button onClick={() => navigate(createHref)} className="mt-4 text-xs">
                          <Plus className="mr-1 h-3.5 w-3.5" /> Create Campaign
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r) => {
                      const j = r.journey;
                      const href = `/campaigns/${j.id}`;
                      return (
                        <tr
                          key={j.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(JOURNEY_DRAG_MIME, j.id);
                            e.dataTransfer.setData('text/plain', j.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingId(j.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                          onClick={() => navigate(href)}
                          className={`group cursor-pointer hover:bg-indigo-50/40 ${draggingId === j.id ? 'opacity-40' : ''}`}
                        >
                          {cols.map((c) => (
                            <td key={c.id} className={`whitespace-nowrap px-3 py-2.5 first:pl-5 ${c.align === 'right' ? 'text-right font-mono tabular-nums text-slate-700' : 'text-slate-600'}`}>
                              {c.id === 'campaign' ? (
                                <div className="flex items-center gap-2">
                                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300 opacity-0 group-hover:opacity-100" />
                                  <div className="min-w-0 max-w-[280px]">
                                    <Link to={href} onClick={(e) => e.stopPropagation()} className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-700">
                                      {j.name}
                                    </Link>
                                    <div className="mt-0.5 flex items-center gap-1.5">
                                      <span className="font-mono text-[10px] text-slate-400">{r.code}</span>
                                      {r.channels.map((ch) => {
                                        const Icon = channelIcon(ch);
                                        return <Icon key={ch} className="h-3 w-3 text-slate-400" aria-label={ch} />;
                                      })}
                                      {search && normalizeFolderPath(j.folder_path ?? '/') !== '/' && (
                                        <span className="text-[10px] text-slate-400">· {folderNameFromPath(normalizeFolderPath(j.folder_path ?? '/'))}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : c.id === 'status' ? (
                                <CampaignStatusBadge status={r.status} size="sm" />
                              ) : c.id === 'owner' ? (
                                <span className="text-xs">{r.owner}</span>
                              ) : c.id === 'type' ? (
                                <span className="text-xs">{r.type}</span>
                              ) : c.id === 'start' ? (
                                <span className="text-xs">{formatDate(j.starts_at)}</span>
                              ) : c.id === 'end' ? (
                                <span className="text-xs">{formatDate(j.ends_at)}</span>
                              ) : c.id === 'workflows' ? (
                                r.workflows.length
                              ) : c.id === 'deliveries' ? (
                                r.deliveries
                              ) : c.id === 'targeted' ? (
                                r.targeted ? compactNumber(r.targeted) : '—'
                              ) : c.id === 'sent' ? (
                                r.sent ? compactNumber(r.sent) : '—'
                              ) : c.id === 'delivered' ? (
                                r.delivered ? compactNumber(r.delivered) : '—'
                              ) : (
                                <span className="text-xs">{formatDate(j.updated_at)}</span>
                              )}
                            </td>
                          ))}
                          <td className="relative px-3 py-2.5 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setMenuFor(menuFor === j.id ? null : j.id)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {menuFor === j.id && (
                              <RowMenu
                                row={r}
                                onClose={() => setMenuFor(null)}
                                onOpen={() => navigate(href)}
                                onEdit={() => navigate(`${href}?tab=settings`)}
                                onDuplicate={() => setDuplicating(j)}
                                onPause={(paused) => pauseMutation.mutate({ j, paused })}
                                onArchive={(archived) => archiveMutation.mutate({ j, archived })}
                                onDelete={() => setDeleting(j)}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ───────────────────────────────────── */}
            {sorted.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
                </span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1 font-medium text-slate-700">
                    {page} / {pageCount}
                  </span>
                  <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {duplicating && (
        <DuplicateCampaignModal
          source={duplicating}
          busy={duplicateMutation.isPending}
          onClose={() => setDuplicating(null)}
          onConfirm={(opts) => duplicateMutation.mutate(opts)}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete campaign</h3>
                <p className="text-xs text-slate-500">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Delete <strong className="text-slate-900">"{deleting.name}"</strong>? Linked pipelines are kept and become unassigned; consider <em>Archive</em> to keep history visible here.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="ghost" onClick={() => setDeleting(null)} className="text-xs">Cancel</Button>
              <Button variant="danger" onClick={() => deleteMutation.mutate(deleting)} disabled={deleteMutation.isPending} className="text-xs font-semibold">
                {deleteMutation.isPending ? 'Deleting…' : 'Delete campaign'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showNewFolder && (
        <CreateFolderModal
          parentPath={currentFolder}
          name={newFolderName}
          onNameChange={setNewFolderName}
          onSubmit={() => createFolderMutation.mutate()}
          onClose={() => setShowNewFolder(false)}
          loading={createFolderMutation.isPending}
          error={folderError}
        />
      )}
      {renamingFolder && (
        <RenameModal
          title="Rename folder"
          subtitle={renamingFolder.name}
          name={renameName}
          onNameChange={setRenameName}
          onSubmit={() => renameFolderMutation.mutate({ path: renamingFolder.path, value: renameName })}
          onClose={() => setRenamingFolder(null)}
          loading={renameFolderMutation.isPending}
          error={renameError}
          placeholder="Folder name"
        />
      )}
    </div>
  );
}

function RowMenu({
  row,
  onClose,
  onOpen,
  onEdit,
  onDuplicate,
  onPause,
  onArchive,
  onDelete,
}: {
  row: Row;
  onClose: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onPause: (paused: boolean) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false) => (
    <button
      onClick={() => {
        onClose();
        fn();
      }}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left ${danger ? 'font-semibold text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
    >
      {icon}
      {label}
    </button>
  );
  const archived = row.status === 'archived';
  const paused = row.status === 'paused';
  const canPause = ['running', 'scheduled'].includes(row.status);
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-4 top-9 z-40 w-44 rounded-xl border border-slate-200 bg-white py-1.5 text-left text-xs font-medium shadow-xl">
        {item(<ExternalLink className="h-3.5 w-3.5 text-indigo-500" />, 'Open', onOpen)}
        {item(<Pencil className="h-3.5 w-3.5 text-slate-500" />, 'Edit', onEdit)}
        {item(<Copy className="h-3.5 w-3.5 text-purple-500" />, 'Duplicate', onDuplicate)}
        {(canPause || paused) && <div className="my-1 border-t border-slate-100" />}
        {canPause && item(<Pause className="h-3.5 w-3.5 text-amber-500" />, 'Pause', () => onPause(true))}
        {paused && item(<Play className="h-3.5 w-3.5 text-emerald-600" />, 'Resume', () => onPause(false))}
        <div className="my-1 border-t border-slate-100" />
        {archived
          ? item(<ArchiveRestore className="h-3.5 w-3.5 text-slate-500" />, 'Restore', () => onArchive(false))
          : item(<Archive className="h-3.5 w-3.5 text-slate-500" />, 'Archive', () => onArchive(true))}
        {item(<Trash2 className="h-3.5 w-3.5 text-red-500" />, 'Delete', onDelete, true)}
      </div>
    </>
  );
}
