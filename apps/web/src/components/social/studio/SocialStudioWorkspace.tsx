import { useMemo, useState, type ReactNode } from 'react';
import {
  PenSquare,
  CalendarDays,
  ListChecks,
  LayoutGrid,
  BarChart3,
  Radio,
  Search,
  Sparkles,
  Plug,
  SlidersHorizontal,
  Inbox,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { AnimatedSocialIcon } from '@/components/social/AnimatedSocialIcon';
import { SocialPostCard } from '@/components/social/SocialPostCard';
import type { SocialAccount, SocialPost } from '@/lib/social-providers';
import {
  SOCIAL_NETWORK_LIST,
  getNetwork,
  isPublishableNetwork,
  type SocialNetworkId,
} from '@/lib/social-networks';
import { useSocialConfig } from '@/hooks/useSocialConfig';
import {
  draftFromPost,
  newDraft,
  type CompiledPost,
  type StudioDraft,
} from '@/lib/social-studio';
import { StudioComposer, type ComposerSaveMode } from './StudioComposer';
import { ChannelConfigPanel } from './ChannelConfigPanel';
import { StudioCalendar } from './StudioCalendar';
import { StudioQueue } from './StudioQueue';
import { StudioAnalytics } from './StudioAnalytics';

type View = 'plan' | 'calendar' | 'queue' | 'content' | 'analytics' | 'channels';

export type WorkspaceSubmit = (args: {
  mode: ComposerSaveMode;
  draft: StudioDraft;
  compiled: CompiledPost;
}) => Promise<void> | void;

type Props = {
  tenantId: string;
  environment: string;
  posts: SocialPost[];
  accounts: SocialAccount[];
  loading?: boolean;
  onSubmitPost: WorkspaceSubmit;
  onPublishNow: (id: string) => void;
  onDeletePost: (id: string) => void;
  /** real connections UI (BYOP / OAuth) — rendered inside the Channels view */
  connectionsSlot?: ReactNode;
  onRequestConnect?: (id: SocialNetworkId) => void;
  uploadMedia?: (file: File) => Promise<string>;
};

const NAV: { id: View; label: string; icon: typeof PenSquare }[] = [
  { id: 'plan', label: 'Plan', icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'queue', label: 'Queue', icon: ListChecks },
  { id: 'content', label: 'Content', icon: Inbox },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'channels', label: 'Channels', icon: Radio },
];

export function SocialStudioWorkspace({
  tenantId,
  environment,
  posts,
  accounts,
  loading,
  onSubmitPost,
  onPublishNow,
  onDeletePost,
  connectionsSlot,
  onRequestConnect,
  uploadMedia,
}: Props) {
  const { config, update, reset } = useSocialConfig(tenantId, environment);
  const [view, setView] = useState<View>('plan');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [channelsTab, setChannelsTab] = useState<'connections' | 'config'>('connections');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const connected = useMemo(() => {
    const s = new Set<SocialNetworkId>();
    for (const a of accounts) {
      if (a.status === 'connected' && getNetwork(a.platform)) s.add(a.platform as SocialNetworkId);
    }
    return s;
  }, [accounts]);

  const stats = useMemo(() => {
    const scheduled = posts.filter((p) => p.status === 'scheduled').length;
    const published = posts.filter((p) => p.status === 'published').length;
    const drafts = posts.filter((p) => p.status === 'draft').length;
    return { scheduled, published, drafts, total: posts.length };
  }, [posts]);

  function openComposer(next: StudioDraft | null) {
    setDraft(next);
    setComposerOpen(true);
  }

  const startNew = (seed?: Partial<StudioDraft>) => {
    const nets = SOCIAL_NETWORK_LIST.filter((n) => connected.has(n.id)).map((n) => n.id).slice(0, 3);
    openComposer({ ...newDraft(nets.length ? nets : ['linkedin']), ...seed });
  };

  return (
    <div className="flex gap-5">
      {/* rail */}
      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-4 space-y-4">
          <Button className="w-full" onClick={() => startNew()}>
            <PenSquare className="mr-1.5 h-4 w-4" /> New post
          </Button>
          <nav className="space-y-0.5 rounded-2xl border border-slate-200 bg-white p-2">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setView(n.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  view === n.id ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <n.icon className={`h-4 w-4 ${view === n.id ? 'text-brand-600' : 'text-slate-400'}`} />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Channels</p>
            <div className="space-y-1.5">
              {SOCIAL_NETWORK_LIST.slice(0, 6).map((n) => (
                <div key={n.id} className="flex items-center gap-2 text-[11px]">
                  <AnimatedSocialIcon platform={n.id} size="sm" animated={false} className="h-5 w-5 rounded-md p-0.5" />
                  <span className="flex-1 font-medium text-slate-600">{n.shortLabel}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${connected.has(n.id) ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setView('channels'); setChannelsTab('connections'); }}
              className="mt-2 text-[11px] font-semibold text-brand-600 hover:underline"
            >
              Manage →
            </button>
          </div>
        </div>
      </aside>

      {/* main */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* mobile nav */}
        <div className="flex gap-1.5 overflow-x-auto md:hidden">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${view === n.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {n.label}
            </button>
          ))}
        </div>

        {view === 'plan' && (
          <PlanView
            stats={stats}
            posts={posts}
            connected={connected}
            onNew={() => startNew()}
            onOpenPost={(p) => openComposer(draftFromPost(p))}
            onPublishNow={onPublishNow}
            onGoChannels={() => { setView('channels'); setChannelsTab('config'); }}
          />
        )}

        {view === 'calendar' && (
          <StudioCalendar
            posts={posts}
            config={config}
            onOpenPost={(p) => openComposer(draftFromPost(p))}
            onCreateAt={(date) => startNew({ scheduledAt: date.toISOString(), status: 'scheduled' })}
          />
        )}

        {view === 'queue' && (
          <StudioQueue
            posts={posts}
            config={config}
            connected={connected}
            onOpenPost={(p) => openComposer(draftFromPost(p))}
            onPublishNow={onPublishNow}
            onFillSlot={(date, network) =>
              startNew({ networks: [network], scheduledAt: date.toISOString(), status: 'scheduled' })
            }
          />
        )}

        {view === 'content' && (
          <ContentView
            posts={posts}
            loading={loading}
            onNew={() => startNew()}
            onEdit={(p) => openComposer(draftFromPost(p))}
            onPublishNow={onPublishNow}
            onDelete={(id) => setConfirmDelete(id)}
          />
        )}

        {view === 'analytics' && <StudioAnalytics posts={posts} />}

        {view === 'channels' && (
          <div className="space-y-4">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setChannelsTab('connections')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${channelsTab === 'connections' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                <Plug className="h-3.5 w-3.5" /> Connections
              </button>
              <button
                type="button"
                onClick={() => setChannelsTab('config')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${channelsTab === 'config' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Configuration
              </button>
            </div>
            {channelsTab === 'connections'
              ? (connectionsSlot ?? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                    Connection management isn’t available in this context.
                  </p>
                ))
              : (
                <ChannelConfigPanel
                  config={config}
                  update={update}
                  reset={reset}
                  connected={connected}
                  onConnect={(id) => { setChannelsTab('connections'); onRequestConnect?.(id); }}
                />
              )}
          </div>
        )}
      </div>

      <StudioComposer
        open={composerOpen}
        onClose={() => { setComposerOpen(false); setDraft(null); }}
        tenantId={tenantId}
        environment={environment}
        config={config}
        connected={connected}
        initialDraft={draft}
        onSubmit={onSubmitPost}
        uploadMedia={uploadMedia}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-2 flex items-center gap-2.5 text-rose-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><Trash2 className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-bold text-slate-900">Delete this post?</p>
                <p className="text-xs text-slate-500">This can’t be undone.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button size="sm" variant="danger" onClick={() => { onDeletePost(confirmDelete); setConfirmDelete(null); }}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlanView({
  stats,
  posts,
  connected,
  onNew,
  onOpenPost,
  onPublishNow,
  onGoChannels,
}: {
  stats: { scheduled: number; published: number; drafts: number; total: number };
  posts: SocialPost[];
  connected: Set<SocialNetworkId>;
  onNew: () => void;
  onOpenPost: (p: SocialPost) => void;
  onPublishNow: (id: string) => void;
  onGoChannels: () => void;
}) {
  const upcoming = posts
    .filter((p) => p.status === 'scheduled' && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    .slice(0, 6);
  const needsAttention = posts.filter((p) => p.status === 'failed' || p.status === 'draft').slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 text-white">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-brand-300">
              <Sparkles className="h-3 w-3" /> Social command
            </p>
            <h2 className="mt-1 text-xl font-black">Plan, tailor & broadcast — from one place</h2>
            <p className="mt-1 max-w-lg text-xs text-slate-300">
              {connected.size} of {SOCIAL_NETWORK_LIST.length} networks connected. Compose once, customize per network, and let the queue handle timing.
            </p>
          </div>
          <Button onClick={onNew} className="bg-white text-slate-900 hover:bg-slate-100">
            <PenSquare className="mr-1.5 h-4 w-4" /> New post
          </Button>
        </div>
        <div className="relative z-10 mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Total', stats.total],
            ['Scheduled', stats.scheduled],
            ['Published', stats.published],
            ['Drafts', stats.drafts],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-0.5 text-2xl font-black">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Up next</h3>
            <CalendarDays className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-1.5">
            {upcoming.map((p) => (
              <button key={p.id} type="button" onClick={() => onOpenPost(p)} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 p-2 text-left hover:border-brand-300">
                <span className="flex -space-x-1.5">
                  {p.platforms.slice(0, 3).map((pl) => (
                    <AnimatedSocialIcon key={pl} platform={pl} size="sm" animated={false} className="h-6 w-6 rounded-lg p-1 ring-2 ring-white" />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{p.content || 'Untitled post'}</span>
                <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                  {new Date(p.scheduledAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
            {upcoming.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nothing scheduled. Create a post to fill the queue.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Needs attention</h3>
            <button type="button" onClick={onGoChannels} className="text-[11px] font-semibold text-brand-600 hover:underline">Channel setup →</button>
          </div>
          <div className="space-y-1.5">
            {needsAttention.map((p) => (
              <button key={p.id} type="button" onClick={() => onOpenPost(p)} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 p-2 text-left hover:border-brand-300">
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.status === 'failed' ? 'bg-rose-500' : 'bg-slate-300'}`} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{p.content || 'Untitled post'}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-400">{p.status}</span>
                {p.status !== 'failed' && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onPublishNow(p.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onPublishNow(p.id); } }}
                    className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    Publish
                  </span>
                )}
              </button>
            ))}
            {needsAttention.length === 0 && <p className="py-6 text-center text-xs text-slate-400">All clear. 🎉</p>}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Network readiness</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SOCIAL_NETWORK_LIST.map((n) => (
            <div key={n.id} className={`rounded-xl border p-3 ${connected.has(n.id) ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <AnimatedSocialIcon platform={n.id} size="sm" animated={false} connected={connected.has(n.id)} className="h-6 w-6 rounded-lg p-1" />
                <span className="text-xs font-bold text-slate-800">{n.shortLabel}</span>
              </div>
              <p className="mt-1.5 text-[10px] font-semibold text-slate-400">
                {connected.has(n.id) ? 'Connected' : isPublishableNetwork(n.id) ? 'Not connected' : 'Planning only'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ContentView({
  posts,
  loading,
  onNew,
  onEdit,
  onPublishNow,
  onDelete,
}: {
  posts: SocialPost[];
  loading?: boolean;
  onNew: () => void;
  onEdit: (p: SocialPost) => void;
  onPublishNow: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | SocialPost['status']>('all');
  const [net, setNet] = useState<'all' | SocialNetworkId>('all');

  const filtered = posts.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (net !== 'all' && !(p.platforms as string[]).includes(net)) return false;
    if (q.trim() && !p.content.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search content…"
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-xs focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium">
          <option value="all">All statuses</option>
          {['draft', 'scheduled', 'published', 'failed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={net} onChange={(e) => setNet(e.target.value as typeof net)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium">
          <option value="all">All networks</option>
          {SOCIAL_NETWORK_LIST.map((n) => <option key={n.id} value={n.id}>{n.shortLabel}</option>)}
        </select>
        <Button size="sm" onClick={onNew}><PenSquare className="mr-1 h-3.5 w-3.5" /> New</Button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No posts here</p>
          <p className="mt-1 text-xs text-slate-500">{posts.length ? 'Try clearing filters.' : 'Compose your first post.'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <SocialPostCard key={p.id} post={p} onEdit={onEdit} onPublishNow={onPublishNow} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
