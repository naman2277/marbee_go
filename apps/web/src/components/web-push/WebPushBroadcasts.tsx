// Campaigns → Web Push Campaigns (D-026): campaigns in folders, filters, move, and a composer
// that sends one push to all subscribers, a filtered group or a Marbee audience — on every
// website or chosen ones — now or scheduled. Sending runs on the server.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarClock, FolderPlus, Globe, Megaphone, Pencil, RefreshCw, Search, Send, Trash2, Users, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { JourneyFolderSidebar } from '@/components/journeys/JourneyFolderSidebar';
import { JOURNEY_DRAG_MIME } from '@/lib/journey-folders';
import { WebPushComposer } from '@/components/content-templates/channel-studio/WebPushComposer';
import { WebPushPreview } from '@/components/content-templates/channel-studio/WebPushPreview';
import type { WebPushContent } from '@/lib/content-templates';
import { fetchContentTemplates } from '@/lib/content-templates';
import { fetchAudiences } from '@/lib/audiences';
import { fetchWebPushSubscribers, sendTestWebPushNotification } from '@/lib/web-analytics';
import {
  buildCampaignFolderTree,
  cancelBroadcast,
  countAudience,
  describeAudience,
  fetchCampaignFolders,
  fetchPushSites,
  filterFor,
  listBroadcasts,
  moveBroadcast,
  resolveAudienceCustomerIds,
  saveCampaignFolder,
  sendBroadcast,
  toPushPayload,
  type AudienceChoice,
  type BroadcastFilter,
  type BroadcastRow,
} from '@/lib/web-push-broadcasts';

const BROWSERS = ['Chrome', 'Edge', 'Firefox', 'Safari', 'Other'];
const DEVICES = ['desktop', 'mobile', 'tablet'];
const OSES = ['Windows', 'macOS', 'Android', 'iOS', 'Linux'];

const EMPTY: WebPushContent = { title: '', body: '', action_url: '' };

const statusStyle: Record<BroadcastRow['status'], string> = {
  scheduled: 'bg-amber-50 text-amber-800 border-amber-200',
  sending: 'bg-sky-50 text-sky-800 border-sky-200',
  sent: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const folderLabel = (path: string) => (path === '/' ? 'All' : path.slice(path.lastIndexOf('/') + 1));

function Chips({ options, value, onChange, labels }: { options: string[]; value: string[]; onChange: (v: string[]) => void; labels?: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            aria-pressed={on}
          >
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

export function WebPushBroadcasts({ tenantId, environment }: { tenantId: string; environment: string }) {
  const [mode, setMode] = useState<'list' | 'compose'>('list');
  const [folder, setFolder] = useState('/');
  return mode === 'list'
    ? <CampaignExplorer tenantId={tenantId} environment={environment} folder={folder} onFolder={setFolder} onNew={() => setMode('compose')} />
    : <BroadcastComposer tenantId={tenantId} environment={environment} folderPath={folder} onDone={() => setMode('list')} />;
}

// ---------------------------------------------------------------- explorer (folders + list)
function CampaignExplorer({ tenantId, environment, folder, onFolder, onNew }: {
  tenantId: string; environment: string; folder: string; onFolder: (p: string) => void; onNew: () => void;
}) {
  const qc = useQueryClient();
  const listKey = ['web-push-broadcasts', tenantId, environment];
  const foldersKey = ['web-push-campaign-folders', tenantId, environment];
  const { data = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: listKey,
    queryFn: () => listBroadcasts(tenantId, environment),
    enabled: Boolean(tenantId),
    refetchInterval: 10_000,
  });
  const folders = useQuery({ queryKey: foldersKey, queryFn: () => fetchCampaignFolders(tenantId, environment), enabled: Boolean(tenantId) });
  const tree = useMemo(() => buildCampaignFolderTree(folders.data ?? [], data), [folders.data, data]);
  const allFolderPaths = useMemo(() => {
    const out: string[] = [];
    const walk = (n: typeof tree) => { out.push(n.path); n.children.forEach(walk); };
    walk(tree);
    return out;
  }, [tree]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | BroadcastRow['status']>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [folderInput, setFolderInput] = useState<{ op: 'create' | 'rename'; value: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: listKey });
    void qc.invalidateQueries({ queryKey: foldersKey });
  };
  const cancel = useMutation({ mutationFn: cancelBroadcast, onSuccess: refresh });
  const move = useMutation({
    mutationFn: ({ id, path }: { id: string; path: string }) => moveBroadcast(id, path),
    onSuccess: refresh,
    onError: (e) => setMsg((e as Error).message),
  });
  const folderOp = useMutation({
    mutationFn: ({ op, name }: { op: 'create' | 'rename' | 'delete'; name?: string }) => saveCampaignFolder(tenantId, environment, op, folder, name),
    onSuccess: (path, v) => {
      setFolderInput(null);
      setMsg(null);
      if (v.op !== 'create') onFolder(path);
      refresh();
    },
    onError: (e) => setMsg((e as Error).message),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return data.filter((b) => {
      // Search spans every folder; otherwise show the open folder only.
      if (q) {
        const hay = `${b.name} ${b.id} ${String(b.content.title ?? '')} ${String(b.content.body ?? '')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      } else if (folder !== '/' && (b.folder_path || '/') !== folder) {
        return false; // "All" shows every campaign; a folder shows its own
      }
      if (status && b.status !== status) return false;
      const t = new Date(b.created_at).getTime();
      if (fromT && t < fromT) return false;
      if (toT && t > toT) return false;
      return true;
    });
  }, [data, search, status, from, to, folder]);

  const subfolders = findNode(tree, folder)?.children ?? [];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col lg:flex-row">
        <JourneyFolderSidebar
          tree={tree}
          currentPath={folder}
          dropTarget={dropTarget}
          dragging={dragging}
          onSelect={(p) => { onFolder(p); setFolderInput(null); setMsg(null); }}
          onDragOver={setDropTarget}
          onDrop={(path, id) => { setDragging(false); setDropTarget(null); move.mutate({ id, path }); }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-xs text-slate-500">
                {folder === '/' ? 'All' : ['All', ...folder.split('/').filter(Boolean)].join(' / ')}
              </p>
              <h3 className="text-lg font-bold text-slate-900">{folderLabel(folder)}</h3>
              <p className="text-xs text-slate-500">{rows.length} campaign{rows.length === 1 ? '' : 's'}{subfolders.length ? ` · ${subfolders.length} folder${subfolders.length === 1 ? '' : 's'}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {folder !== '/' && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setFolderInput({ op: 'rename', value: folderLabel(folder) })}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Rename
                  </Button>
                  <Button variant="ghost" size="sm" disabled={folderOp.isPending}
                    onClick={() => { if (window.confirm(`Delete folder "${folderLabel(folder)}"? Campaigns inside move up one level; nothing is deleted.`)) folderOp.mutate({ op: 'delete' }); }}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </>
              )}
              <Button variant="secondary" size="sm" onClick={() => setFolderInput({ op: 'create', value: '' })}>
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" /> New folder
              </Button>
              <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" onClick={onNew}>
                <Megaphone className="mr-1.5 h-3.5 w-3.5" /> New campaign
              </Button>
            </div>
          </div>

          {folderInput && (
            <form
              className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3"
              onSubmit={(e) => { e.preventDefault(); folderOp.mutate({ op: folderInput.op, name: folderInput.value }); }}
            >
              <span className="text-xs font-semibold text-slate-600">
                {folderInput.op === 'create' ? `New folder in “${folderLabel(folder)}”` : 'Rename folder'}
              </span>
              <input autoFocus maxLength={60} value={folderInput.value} onChange={(e) => setFolderInput({ ...folderInput, value: e.target.value })}
                placeholder="Folder name" className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
              <Button size="sm" type="submit" disabled={!folderInput.value.trim() || folderOp.isPending}>Save</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setFolderInput(null)}>Cancel</Button>
            </form>
          )}

          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, campaign ID, title… (all folders)"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" />
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="sending">Sending</option>
                <option value="sent">Sent</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs text-slate-500">
                Created
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="py-1.5 text-sm text-slate-700" aria-label="Created from" />
                –
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="py-1.5 text-sm text-slate-700" aria-label="Created to" />
              </label>
            </div>

            {msg && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{msg}</p>}
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{(error as Error).message}</p>}

            {!search && subfolders.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {subfolders.map((f) => (
                  <button key={f.path} type="button" onClick={() => onFolder(f.path)}
                    onDragOver={(e) => { if (dragging) { e.preventDefault(); setDropTarget(f.path); } }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData(JOURNEY_DRAG_MIME); setDragging(false); setDropTarget(null); if (id) move.mutate({ id, path: f.path }); }}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50 ${dropTarget === f.path ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                    <span className="text-blue-500">📁</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{f.name}</span>
                    <span className="text-[11px] tabular-nums text-slate-400">{f.directCount}</span>
                  </button>
                ))}
              </div>
            )}

            {isLoading ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <Megaphone className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-800">{search || status || from || to ? 'No campaigns match' : 'No campaigns in this folder'}</p>
                <p className="text-xs text-slate-500">Create one with “New campaign” — it will be saved in this folder.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Campaign</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">When</th>
                      <th className="px-3 py-2 text-right font-semibold">Queued</th>
                      <th className="px-3 py-2 text-right font-semibold">Delivered</th>
                      <th className="px-3 py-2 text-right font-semibold">Failed</th>
                      <th className="px-3 py-2 text-right font-semibold">Clicked</th>
                      <th className="px-3 py-2 text-right font-semibold">CTR</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((b) => {
                      const ctr = b.delivered ? `${((b.clicked / b.delivered) * 100).toFixed(1)}%` : '—';
                      const when = b.scheduled_at ?? b.created_at;
                      return (
                        <tr key={b.id} className="align-top" draggable
                          onDragStart={(e) => { e.dataTransfer.setData(JOURNEY_DRAG_MIME, b.id); e.dataTransfer.effectAllowed = 'move'; setDragging(true); }}
                          onDragEnd={() => { setDragging(false); setDropTarget(null); }}>
                          <td className="px-3 py-2">
                            <Link to={`/campaigns/web-push/${b.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{b.name}</Link>
                            <p className="text-slate-500">{String(b.content.title ?? '')}</p>
                            <p className="text-[11px] text-slate-400">{describeAudience(b.audience)}</p>
                            {(search || folder === '/') && (b.folder_path || '/') !== '/' && <p className="text-[11px] text-slate-400">📁 {b.folder_path.slice(1)}</p>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusStyle[b.status]}`}>{b.status}</span>
                            {(b.result.capped ?? 0) > 0 && <p className="mt-1 text-[11px] text-amber-700">{b.result.capped} held by daily cap</p>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{new Date(when).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.queued}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.delivered}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.failed}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.clicked}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{ctr}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <Link
                              to={`/campaigns/web-push/${b.id}`}
                              title="Open report"
                              aria-label={`Open report for ${b.name}`}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                            >
                              <BarChart3 className="h-3.5 w-3.5" /> Report
                            </Link>
                            <select
                              aria-label={`Move ${b.name} to folder`}
                              value=""
                              onChange={(e) => { if (e.target.value) move.mutate({ id: b.id, path: e.target.value }); }}
                              className="ml-1 rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600"
                            >
                              <option value="">Move…</option>
                              {allFolderPaths.filter((p) => p !== (b.folder_path || '/')).map((p) => (
                                <option key={p} value={p}>{p === '/' ? 'All (top level)' : p.slice(1)}</option>
                              ))}
                            </select>
                            {(b.status === 'scheduled' || (b.status === 'sending' && b.queued > 0)) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={cancel.isPending}
                                onClick={() => {
                                  if (window.confirm(`Cancel "${b.name}"? Pushes not yet sent will not go out.`)) cancel.mutate(b.id);
                                }}
                              >
                                <X className="mr-1 h-3.5 w-3.5" /> Cancel
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400">Tip: drag a campaign onto a folder to move it. Deleting a folder never deletes campaigns.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function findNode(n: ReturnType<typeof buildCampaignFolderTree>, path: string): ReturnType<typeof buildCampaignFolderTree> | null {
  if (n.path === path) return n;
  for (const c of n.children) {
    const f = findNode(c, path);
    if (f) return f;
  }
  return null;
}

// ---------------------------------------------------------------- composer
function BroadcastComposer({ tenantId, environment, folderPath, onDone }: { tenantId: string; environment: string; folderPath: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [clientKey] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [content, setContent] = useState<WebPushContent>(EMPTY);
  const [kind, setKind] = useState<AudienceChoice['kind']>('all');
  const [filter, setFilter] = useState<BroadcastFilter>({ linked: 'any' });
  const [audienceId, setAudienceId] = useState('');
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [testToken, setTestToken] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const templates = useQuery({
    queryKey: ['content-templates', tenantId, environment],
    queryFn: () => fetchContentTemplates(tenantId, environment),
    enabled: Boolean(tenantId),
  });
  const pushTemplates = (templates.data ?? []).filter((t) => t.channel === 'web_push');
  const audiences = useQuery({
    queryKey: ['audiences', tenantId, environment],
    queryFn: () => fetchAudiences(tenantId, environment),
    enabled: Boolean(tenantId) && kind === 'audience',
  });
  const subscribers = useQuery({
    queryKey: ['web-push-subscribers', tenantId, environment, 'broadcast-test'],
    queryFn: () => fetchWebPushSubscribers(tenantId, environment),
    enabled: Boolean(tenantId),
  });
  const activeSubs = (subscribers.data ?? []).filter((s) => s.subscriptionStatus === 'active').slice(0, 50);
  const sites = useQuery({
    queryKey: ['web-push-sites', tenantId, environment],
    queryFn: () => fetchPushSites(tenantId, environment),
    enabled: Boolean(tenantId),
  });
  const knownSites = (sites.data ?? []).filter((s) => s.site_id);
  const unknownSiteDevices = (sites.data ?? []).find((s) => !s.site_id)?.devices ?? 0;
  const siteLabel = (id: string) => {
    const s = knownSites.find((x) => x.site_id === id);
    return s ? `${s.name || s.domain || id} (${s.devices})` : id;
  };

  const selectedAudience = (audiences.data ?? []).find((a) => a.id === audienceId);
  const audienceIds = useQuery({
    queryKey: ['broadcast-audience-ids', tenantId, environment, audienceId],
    queryFn: () => resolveAudienceCustomerIds(tenantId, environment, selectedAudience!),
    enabled: kind === 'audience' && Boolean(selectedAudience),
    staleTime: 60_000,
  });

  const choice: AudienceChoice = useMemo(
    () => (kind === 'all' ? { kind } : kind === 'filter' ? { kind, filter } : { kind, audienceId, audienceName: selectedAudience?.name ?? '' }),
    [kind, filter, audienceId, selectedAudience?.name],
  );
  const customerIds = kind === 'audience' ? audienceIds.data?.ids ?? null : null;
  const effectiveFilter: BroadcastFilter = useMemo(
    () => ({ ...filterFor(choice), ...(siteIds.length ? { sites: siteIds } : {}) }),
    [choice, siteIds],
  );
  const countReady = kind !== 'audience' || Boolean(audienceIds.data);

  // Debounced live count.
  const [countKey, setCountKey] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setCountKey(JSON.stringify([effectiveFilter, customerIds?.length ?? null, audienceId])), 350);
    return () => clearTimeout(t);
  }, [effectiveFilter, customerIds, audienceId]);
  const count = useQuery({
    queryKey: ['broadcast-count', tenantId, environment, countKey],
    queryFn: () => countAudience(tenantId, environment, effectiveFilter, customerIds),
    enabled: Boolean(tenantId) && countReady && countKey !== '',
  });

  const payload = toPushPayload(content);
  const scheduledAt = when === 'later' && at ? new Date(at).toISOString() : null;
  const reach = count.data ? Math.min(count.data.devices - count.data.excluded, count.data.cap_remaining) : 0;
  const problems = [
    !name.trim() && 'Give the campaign a name',
    !payload.title && 'Add a title',
    when === 'later' && (!at || new Date(at).getTime() <= Date.now()) && 'Pick a future date and time',
    kind === 'audience' && !audienceId && 'Pick an audience',
    count.data && count.data.devices === 0 && 'Nobody matches this audience yet',
  ].filter(Boolean) as string[];

  const send = useMutation({
    mutationFn: () => sendBroadcast({
      tenantId, environment, clientKey, name: name.trim(), content: payload,
      audience: { ...choice, ...(siteIds.length ? { sites: siteIds, siteNames: siteIds.map((id) => knownSites.find((x) => x.site_id === id)?.name || id) } : {}) },
      filter: effectiveFilter, customerIds, scheduledAt, folderPath,
    }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['web-push-broadcasts', tenantId, environment] });
      setNotice(r.already_sent ? 'This campaign was already sent.' : `${scheduledAt ? 'Scheduled' : 'Sending'}: ${r.queued} push${r.queued === 1 ? '' : 'es'} queued${r.capped ? `, ${r.capped} held by the daily cap` : ''}.`);
      setTimeout(onDone, 1200);
    },
    onError: (e) => { setConfirming(false); setNotice((e as Error).message); },
  });

  const test = useMutation({
    mutationFn: () => sendTestWebPushNotification({
      title: String(payload.title || 'Test'),
      body: String(payload.body ?? ''),
      iconUrl: payload.icon_url as string | undefined,
      clickUrl: payload.click_url as string | undefined,
      tenantId,
      environment,
      fcmToken: testToken,
    }),
    onSuccess: (r) => setNotice(r.ok ? 'Test sent to that browser.' : r.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">New web push campaign</h3>
          <p className="text-[11px] text-slate-500">Saved in folder: {folderPath === '/' ? 'All (top level)' : folderPath.slice(1)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDone}><X className="mr-1 h-3.5 w-3.5" /> Close</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <label className="block text-xs font-semibold text-slate-700">
              Name (internal)
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Diwali flash sale"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            {pushTemplates.length > 0 && (
              <label className="block text-xs font-semibold text-slate-700">
                Start from a template
                <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" defaultValue=""
                  onChange={(e) => {
                    const t = pushTemplates.find((x) => x.id === e.target.value);
                    if (t) setContent({ ...EMPTY, ...(t.content as WebPushContent) });
                  }}>
                  <option value="">— write it here —</option>
                  {pushTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
            <WebPushComposer content={content} onChange={setContent} />
          </Card>

          <Card className="space-y-3 p-4">
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900"><Globe className="h-3.5 w-3.5" /> Website</p>
              {knownSites.length === 0 ? (
                <p className="text-[11px] text-slate-500">All websites (no websites registered yet).</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setSiteIds([])} aria-pressed={siteIds.length === 0}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${siteIds.length === 0 ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      All websites
                    </button>
                    <Chips options={knownSites.map((s) => s.site_id as string)} value={siteIds} onChange={setSiteIds}
                      labels={Object.fromEntries(knownSites.map((s) => [s.site_id as string, siteLabel(s.site_id as string)]))} />
                  </div>
                  {siteIds.length > 0 && unknownSiteDevices > 0 && (
                    <p className="text-[11px] text-amber-700">{unknownSiteDevices} subscriber{unknownSiteDevices === 1 ? '' : 's'} haven’t revisited since websites started being recorded, so they are only reached with “All websites”.</p>
                  )}
                </>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900"><Users className="h-3.5 w-3.5" /> Who</p>
            <div className="flex flex-wrap gap-2">
              {([['all', 'All subscribers'], ['filter', 'Filtered'], ['audience', 'Marbee audience']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${kind === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
                  {label}
                </button>
              ))}
            </div>
            {kind === 'filter' && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <div><p className="mb-1 text-[11px] font-semibold text-slate-500">Browser</p>
                  <Chips options={BROWSERS} value={filter.browsers ?? []} onChange={(v) => setFilter({ ...filter, browsers: v.length ? v : undefined })} /></div>
                <div><p className="mb-1 text-[11px] font-semibold text-slate-500">Device</p>
                  <Chips options={DEVICES} value={filter.devices ?? []} onChange={(v) => setFilter({ ...filter, devices: v.length ? v : undefined })} /></div>
                <div><p className="mb-1 text-[11px] font-semibold text-slate-500">Operating system</p>
                  <Chips options={OSES} value={filter.os ?? []} onChange={(v) => setFilter({ ...filter, os: v.length ? v : undefined })} /></div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-[11px] font-semibold text-slate-500">Subscribed in last (days)
                    <input type="number" min={1} max={3650} value={filter.subscribed_within_days ?? ''} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      onChange={(e) => setFilter({ ...filter, subscribed_within_days: e.target.value ? Number(e.target.value) : undefined })} /></label>
                  <label className="text-[11px] font-semibold text-slate-500">Active in last (days)
                    <input type="number" min={1} max={3650} value={filter.active_within_days ?? ''} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      onChange={(e) => setFilter({ ...filter, active_within_days: e.target.value ? Number(e.target.value) : undefined })} /></label>
                  <label className="text-[11px] font-semibold text-slate-500">Known customers
                    <select value={filter.linked ?? 'any'} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      onChange={(e) => setFilter({ ...filter, linked: e.target.value as BroadcastFilter['linked'] })}>
                      <option value="any">Everyone</option>
                      <option value="linked">Known customers only</option>
                      <option value="anonymous">Anonymous visitors only</option>
                    </select></label>
                </div>
              </div>
            )}
            {kind === 'audience' && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                <select value={audienceId} onChange={(e) => setAudienceId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Pick an audience…</option>
                  {(audiences.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {audienceIds.isFetching && <p className="text-[11px] text-slate-500">Working out who is in this audience…</p>}
                {audienceIds.error && <p className="text-[11px] text-red-700">{(audienceIds.error as Error).message}</p>}
                {audienceIds.data?.truncated && (
                  <p className="text-[11px] text-amber-700">Audience targeting currently reaches at most 5,000 customers. Use “All subscribers” or filters for larger sends.</p>
                )}
                <p className="text-[11px] text-slate-500">Only subscribers linked to a customer can be reached this way. A scheduled send uses the audience as it is now.</p>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs" aria-live="polite">
              {count.isFetching || !count.data ? (
                <span className="text-slate-500">Counting…</span>
              ) : (
                <span className="text-slate-700">
                  Will reach <strong className="text-slate-900">{reach.toLocaleString()}</strong> device{reach === 1 ? '' : 's'}
                  {' '}({count.data.linked.toLocaleString()} known customers, {count.data.anonymous.toLocaleString()} anonymous
                  {count.data.excluded ? `, ${count.data.excluded} excluded` : ''}).
                  {count.data.devices - count.data.excluded > count.data.cap_remaining && (
                    <span className="text-amber-700"> Daily cap: {count.data.cap_remaining.toLocaleString()} left today — the rest will be held.</span>
                  )}
                </span>
              )}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900"><CalendarClock className="h-3.5 w-3.5" /> When</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setWhen('now')} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${when === 'now' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>Send now</button>
              <button type="button" onClick={() => setWhen('later')} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${when === 'later' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>Schedule</button>
              {when === 'later' && (
                <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="p-4">
            <p className="mb-2 text-xs font-bold text-slate-900">Preview</p>
            <WebPushPreview content={content} />
          </Card>
          <Card className="space-y-2 p-4">
            <p className="text-xs font-bold text-slate-900">Send a test</p>
            <select value={testToken} onChange={(e) => setTestToken(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="">Pick a subscribed browser…</option>
              {activeSubs.map((s) => (
                <option key={s.id} value={s.fcmToken}>{s.browser} · {s.os} · {new Date(s.lastSeen).toLocaleDateString()}</option>
              ))}
            </select>
            <Button variant="secondary" size="sm" className="w-full" disabled={!testToken || !payload.title || test.isPending} onClick={() => test.mutate()}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> Send test
            </Button>
          </Card>
          {notice && <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" role="status">{notice}</p>}
          {problems.length > 0 && <ul className="list-disc pl-5 text-[11px] text-slate-500">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {!confirming ? (
            <Button className="w-full" disabled={problems.length > 0 || !count.data} onClick={() => setConfirming(true)}>
              <Megaphone className="mr-1.5 h-4 w-4" /> {when === 'later' ? 'Schedule campaign' : 'Send campaign'}
            </Button>
          ) : (
            <Card className="space-y-2 border-brand-200 p-3">
              <p className="text-xs text-slate-800">
                {when === 'later' ? 'Schedule' : 'Send'} <strong>{payload.title as string}</strong> to <strong>{reach.toLocaleString()}</strong> device{reach === 1 ? '' : 's'}
                {scheduledAt ? ` on ${new Date(scheduledAt).toLocaleString()}` : ' now'}?
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Sending…' : 'Yes, send'}</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Back</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
