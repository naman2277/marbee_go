import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Bot, MessageSquare, Users, Copy, Trash2, Play, Pause,
  BarChart3, Rocket, Archive, MoreVertical, ArrowRight, LayoutGrid, List, AlertTriangle,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchChatBots, createChatBot, deleteChatBot, duplicateChatBot, setChatBotStatus,
  type ChatBotListItem, type ChatBotStatus,
} from '@/lib/chatbots';
import { formatSchemaDate } from '@/lib/schema-stats';

const STATUS_VARIANT: Record<ChatBotStatus, 'default' | 'success' | 'warning' | 'error'> = {
  draft: 'default', testing: 'warning', published: 'success', paused: 'warning', archived: 'error',
};
const STATUS_LABEL: Record<ChatBotStatus, string> = {
  draft: 'Draft', testing: 'Testing', published: 'Published', paused: 'Paused', archived: 'Archived',
};
const SENTIMENT_ICON: Record<string, string> = { positive: '🟢', neutral: '🔵', negative: '🔴', mixed: '🟡' };

export function ChatBotsPage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ChatBotStatus>('all');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatBotListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: bots, isLoading } = useQuery({
    queryKey: ['chatbots', tenantId, environment],
    queryFn: () => fetchChatBots(tenantId, environment),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['chatbots', tenantId, environment] });

  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpenId]);

  const createMutation = useMutation({
    mutationFn: (name: string) => createChatBot(tenantId, environment, name),
    onSuccess: (bot) => { invalidate(); navigate(`/content/chatbots/${bot.id}`); },
  });
  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: ChatBotStatus }) => setChatBotStatus(vars.id, vars.status),
    onSuccess: invalidate,
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateChatBot(id),
    onSuccess: invalidate,
  });

  const filtered = useMemo(() => {
    let list = bots ?? [];
    if (statusFilter !== 'all') list = list.filter((b) => b.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q) || (b.description ?? '').toLowerCase().includes(q));
    return list;
  }, [bots, search, statusFilter]);

  const totals = useMemo(() => ({
    bots: bots?.length ?? 0,
    conversations: bots?.reduce((s, b) => s + b.conversations_count, 0) ?? 0,
    leads: bots?.reduce((s, b) => s + b.leads_captured_count, 0) ?? 0,
    published: bots?.filter((b) => b.status === 'published').length ?? 0,
  }), [bots]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteChatBot(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    invalidate();
  };

  const RowMenu = ({ bot }: { bot: ChatBotListItem }) => (
    <div className="absolute right-2 top-9 z-20 w-44 rounded-xl border border-slate-200 bg-white py-1 text-left shadow-lg">
      <button type="button" onClick={() => { duplicateMutation.mutate(bot.id); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </button>
      {bot.status !== 'archived' && (
        <button type="button" onClick={() => { statusMutation.mutate({ id: bot.id, status: 'archived' }); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
          <Archive className="h-3.5 w-3.5" /> Archive
        </button>
      )}
      <button type="button" onClick={() => { setDeleteTarget(bot); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
    </div>
  );

  const StatusActions = ({ bot }: { bot: ChatBotListItem }) => (
    <>
      {bot.status === 'published' ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); statusMutation.mutate({ id: bot.id, status: 'paused' }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Pause"><Pause className="h-3.5 w-3.5" /></button>
      ) : bot.status === 'paused' ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); statusMutation.mutate({ id: bot.id, status: 'published' }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Resume"><Play className="h-3.5 w-3.5" /></button>
      ) : null}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat Bots"
        description="Build, test, and publish AI chat assistants that capture leads and answer customer questions."
        action={<Button onClick={() => setCreating(true)} className="shadow-xs"><Plus className="mr-1.5 h-4 w-4" /> Create Chat Bot</Button>}
      />

      {/* KPI ribbon */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Bots', value: totals.bots, icon: Bot, tone: 'bg-brand-50 text-brand-600' },
          { label: 'Published', value: totals.published, icon: Rocket, tone: 'bg-emerald-50 text-emerald-600' },
          { label: 'Conversations', value: totals.conversations, icon: MessageSquare, tone: 'bg-sky-50 text-sky-600' },
          { label: 'Leads Captured', value: totals.leads, icon: Users, tone: 'bg-purple-50 text-purple-600' },
        ].map((k) => (
          <Card key={k.label} className="p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{k.label}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.tone}`}><k.icon className="h-4 w-4" /></div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{k.value.toLocaleString()}</p>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex min-w-[280px] flex-1 items-center gap-3">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chat bots…" className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none">
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-slate-500 sm:inline">Showing {filtered.length} of {bots?.length ?? 0}</span>
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
              <button type="button" onClick={() => setView('grid')} className={`rounded-md p-1.5 transition ${view === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'}`} title="Grid view"><LayoutGrid className="h-4 w-4" /></button>
              <button type="button" onClick={() => setView('table')} className={`rounded-md p-1.5 transition ${view === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'}`} title="Table view"><List className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-14 text-center text-sm text-slate-400">Loading chat bots…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Bot className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <h4 className="text-sm font-bold text-slate-900">No chat bots found</h4>
            <p className="mt-1 text-xs text-slate-500">{bots?.length ? 'No bots match your filters.' : 'Create your first AI chat assistant to get started.'}</p>
            <Button size="sm" onClick={() => setCreating(true)} className="mt-4"><Plus className="mr-1 h-3.5 w-3.5" /> Create Chat Bot</Button>
          </div>
        ) : view === 'grid' ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((bot) => (
              <div key={bot.id} className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-brand-300 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                    {bot.avatar_url ? <img src={bot.avatar_url} alt="" className="h-11 w-11 object-cover" /> : <Bot className="h-5 w-5" />}
                  </div>
                  <div className="flex items-center gap-1">
                    {bot.llm_unhealthy && (
                      <Link to={`/content/chatbots/${bot.id}?tab=llm`} onClick={(e) => e.stopPropagation()} title="LLM is failing — replies are falling back. Click to see why." className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600 ring-1 ring-rose-200">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    <StatusActions bot={bot} />
                    <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === bot.id ? null : bot.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="More"><MoreVertical className="h-3.5 w-3.5" /></button>
                    {menuOpenId === bot.id && <RowMenu bot={bot} />}
                  </div>
                </div>

                <Link to={`/content/chatbots/${bot.id}`} className="mt-3 block">
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-brand-600">{bot.name}</h3>
                  {bot.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{bot.description}</p>}
                </Link>

                <div className="mt-3 flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[bot.status]}>{STATUS_LABEL[bot.status]}</Badge>
                  {bot.dominant_sentiment && <span className="text-[11px]">{SENTIMENT_ICON[bot.dominant_sentiment]}</span>}
                  {bot.published_version_label && <span className="text-[11px] text-slate-400">{bot.published_version_label}</span>}
                </div>

                <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <div><span className="text-sm font-bold text-slate-900">{bot.conversations_count.toLocaleString()}</span><span className="ml-1 text-[11px] text-slate-400">chats</span></div>
                  <div><span className="text-sm font-bold text-slate-900">{bot.leads_captured_count.toLocaleString()}</span><span className="ml-1 text-[11px] text-slate-400">leads</span></div>
                  <Link to={`/content/chatbots/${bot.id}?tab=analytics`} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Analytics"><BarChart3 className="h-4 w-4" /></Link>
                  <Link to={`/content/chatbots/${bot.id}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Open studio"><ArrowRight className="h-4 w-4" /></Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-slate-500">
                  <th className="px-6 py-3 font-semibold">Bot Name</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">LLM</th>
                  <th className="px-4 py-3 font-semibold">Chats</th>
                  <th className="px-4 py-3 font-semibold">Leads</th>
                  <th className="px-4 py-3 font-semibold">Sentiment</th>
                  <th className="px-4 py-3 font-semibold">Version</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((bot) => (
                  <tr key={bot.id} className="transition hover:bg-slate-50/80">
                    <td className="px-6 py-3">
                      <Link to={`/content/chatbots/${bot.id}`} className="font-bold text-slate-900 hover:text-brand-600">{bot.name}</Link>
                      {bot.description && <p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-400">{bot.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={STATUS_VARIANT[bot.status]}>{STATUS_LABEL[bot.status]}</Badge>
                        {bot.llm_unhealthy && (
                          <Link to={`/content/chatbots/${bot.id}?tab=llm`} title="LLM is failing — replies are falling back." className="text-rose-500 hover:text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /></Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{bot.llm_provider_id ? 'Configured' : <span className="text-amber-600">Not set</span>}</td>
                    <td className="px-4 py-3 font-bold tabular-nums text-slate-800">{bot.conversations_count.toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold tabular-nums text-slate-800">{bot.leads_captured_count.toLocaleString()}</td>
                    <td className="px-4 py-3">{bot.dominant_sentiment ? <span className="inline-flex items-center gap-1">{SENTIMENT_ICON[bot.dominant_sentiment]} <span className="capitalize text-slate-600">{bot.dominant_sentiment}</span></span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{bot.published_version_label ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatSchemaDate(bot.updated_at)}</td>
                    <td className="relative px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/content/chatbots/${bot.id}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Edit"><ArrowRight className="h-3.5 w-3.5" /></Link>
                        <Link to={`/content/chatbots/${bot.id}?tab=analytics`} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Analytics"><BarChart3 className="h-3.5 w-3.5" /></Link>
                        <StatusActions bot={bot} />
                        <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === bot.id ? null : bot.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="More"><MoreVertical className="h-3.5 w-3.5" /></button>
                      </div>
                      {menuOpenId === bot.id && <RowMenu bot={bot} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Bot className="h-5 w-5" /></div>
              <div>
                <h3 className="font-bold text-slate-900">Create Chat Bot</h3>
                <p className="text-xs text-slate-500">Give it a name — configure everything else next.</p>
              </div>
            </div>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Support Concierge" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none" onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim()); }} />
            {createMutation.isError && <p className="mt-2 text-xs text-rose-600">{createMutation.error instanceof Error ? createMutation.error.message : 'Could not create this chat bot.'}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate(newName.trim())}>{createMutation.isPending ? 'Creating…' : 'Create & Configure'}</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete chat bot"
        message={deleteTarget ? `You are about to permanently delete "${deleteTarget.name}" and all its conversations, captured data, and analytics. This cannot be undone.` : ''}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
