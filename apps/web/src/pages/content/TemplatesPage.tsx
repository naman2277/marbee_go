import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  Copy,
  LayoutGrid,
  Mail,
  MessageSquare,
  Plus,
  Rows3,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { CreateTemplateModal } from '@/components/content-templates/CreateTemplateModal';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  deleteContentTemplate,
  duplicateContentTemplate,
  fetchContentTemplates,
  templateStatusMeta,
  type ContentChannel,
} from '@/lib/content-templates';
import { formatSchemaDate } from '@/lib/schema-stats';

const CHANNEL_CARDS: Array<{
  id: ContentChannel;
  label: string;
  icon: typeof Mail;
  fg: string;
  ring: string;
  grad: string;
}> = [
  { id: 'email', label: 'Email', icon: Mail, fg: 'text-violet-600', ring: 'ring-violet-500/60', grad: 'from-violet-500/15 to-violet-500/0' },
  { id: 'rcs', label: 'RCS', icon: Smartphone, fg: 'text-indigo-600', ring: 'ring-indigo-500/60', grad: 'from-indigo-500/15 to-indigo-500/0' },
  { id: 'sms', label: 'SMS', icon: MessageSquare, fg: 'text-sky-600', ring: 'ring-sky-500/60', grad: 'from-sky-500/15 to-sky-500/0' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, fg: 'text-emerald-600', ring: 'ring-emerald-500/60', grad: 'from-emerald-500/15 to-emerald-500/0' },
  { id: 'web_push', label: 'Web Push', icon: Bell, fg: 'text-amber-600', ring: 'ring-amber-500/60', grad: 'from-amber-500/15 to-amber-500/0' },
];

type SortKey = 'recent' | 'name' | 'channel';

function Ring({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className={`h-9 w-9 -rotate-90 ${className ?? ''}`}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
      />
    </svg>
  );
}

export function TemplatesPage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<'all' | ContentChannel>('all');
  const [singleDelete, setSingleDelete] = useState<{ id: string; name: string } | null>(null);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [sort, setSort] = useState<SortKey>('recent');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const toggleId = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());

  const { data: templates = [], refetch } = useQuery({
    queryKey: ['content-templates', tenantId, environment],
    queryFn: () => fetchContentTemplates(tenantId, environment),
    staleTime: 0,
    refetchOnMount: true,
  });

  const duplicateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const result = await duplicateContentTemplate(templateId, tenantId, environment);
      if (result.error) throw new Error(result.error);
      return result.template;
    },
    onSuccess: (newTpl) => {
      refetch();
      if (newTpl) navigate(`/content/templates/${newTpl.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteContentTemplate(id);
    },
    onSuccess: () => {
      setSingleDelete(null);
      refetch();
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteContentTemplate(id)));
    },
    onSuccess: () => {
      setBulkDeleteOpen(false);
      clearSelection();
      refetch();
    },
  });

  const channelStats = useMemo(() => {
    const stats: Record<ContentChannel, { total: number; published: number }> = {
      email: { total: 0, published: 0 },
      rcs: { total: 0, published: 0 },
      sms: { total: 0, published: 0 },
      whatsapp: { total: 0, published: 0 },
      web_push: { total: 0, published: 0 },
    };
    for (const t of templates) {
      if (stats[t.channel]) {
        stats[t.channel].total += 1;
        if (t.status === 'published') stats[t.channel].published += 1;
      }
    }
    return stats;
  }, [templates]);

  const filtered = useMemo(() => {
    let list = templates;
    if (selectedChannel !== 'all') list = list.filter((t) => t.channel === selectedChannel);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          (t.settings.description ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'channel') sorted.sort((a, b) => a.channel.localeCompare(b.channel));
    else sorted.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return sorted;
  }, [templates, selectedChannel, search, sort]);

  const totalCount = templates.length;
  const publishedCount = templates.filter((t) => t.status === 'published').length;

  const filteredIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  const selectedInView = filteredIds.filter((id) => selectedIds.has(id));
  const allInViewSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length;
  const toggleAllInView = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allInViewSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  const selectedNames = filtered.filter((t) => selectedIds.has(t.id)).map((t) => t.name);

  return (
    <div className="mx-auto max-w-7xl animate-in fade-in space-y-6 select-none">
      {/* header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-slate-900">Message Templates</h1>
          <p className="text-xs text-slate-500">
            {totalCount} template{totalCount === 1 ? '' : 's'} · {publishedCount} live across 5 channels
          </p>
        </div>
      </div>

      {/* channel stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CHANNEL_CARDS.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedChannel === card.id;
          const stat = channelStats[card.id];
          const drafts = stat.total - stat.published;
          return (
            <button
              type="button"
              key={card.id}
              onClick={() => setSelectedChannel(isSelected ? 'all' : card.id)}
              className={`group relative overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-2xs transition-all ${
                isSelected
                  ? `border-transparent ring-2 ${card.ring}`
                  : 'border-slate-200/90 hover:border-slate-300 hover:shadow-md'
              }`}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.grad}`} />
              <div className="relative flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{card.label}</span>
                  <div className="mt-2 text-2xl font-black leading-none text-slate-900">
                    {stat.published}
                    <span className="text-base font-bold text-slate-300"> / {stat.total}</span>
                  </div>
                  <span className="mt-1 block text-[10px] font-semibold text-slate-400">
                    {drafts > 0 ? `${drafts} draft${drafts === 1 ? '' : 's'}` : 'Published / Total'}
                  </span>
                </div>
                <span className={`relative ${card.fg}`}>
                  <Ring value={stat.published} total={stat.total} />
                  <Icon className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedChannel !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedChannel('all')}
              className="rounded-lg px-2 text-xs font-bold text-violet-600 hover:underline"
            >
              Clear filter
            </button>
          )}

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 cursor-pointer rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 focus:border-violet-500 focus:outline-hidden"
          >
            <option value="recent">Most recent</option>
            <option value="name">Name A–Z</option>
            <option value="channel">Channel</option>
          </select>

          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('table')}
              className={`rounded-lg p-1.5 transition ${view === 'table' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}
              title="Table view"
            >
              <Rows3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`rounded-lg p-1.5 transition ${view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          <Button
            onClick={() => setCreateModalOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white shadow-lg shadow-violet-500/25 transition-all hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        </div>
      </div>

      {/* bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 shadow-2xs animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-3 text-xs font-bold text-violet-800">
            <button
              type="button"
              onClick={clearSelection}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-violet-500 transition hover:bg-violet-100"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
            <span>{selectedIds.size} selected</span>
            {!allInViewSelected && filteredIds.length > selectedInView.length && (
              <button type="button" onClick={toggleAllInView} className="font-bold text-violet-600 hover:underline">
                Select all {filteredIds.length}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setBulkDeleteOpen(true)}
            disabled={bulkDeleteMutation.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {bulkDeleteMutation.isPending ? 'Deleting…' : `Delete ${selectedIds.size}`}
          </button>
        </div>
      )}

      {/* results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-12 text-center shadow-2xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 shadow-inner">
            <Sparkles className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No templates yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Create a template to design and preview email, SMS, WhatsApp, RCS or web push messages.
          </p>
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-5 text-xs font-bold text-white shadow-md shadow-violet-500/20 hover:bg-violet-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Template
          </Button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tpl) => {
            const card = CHANNEL_CARDS.find((c) => c.id === tpl.channel) || CHANNEL_CARDS[0];
            const Icon = card.icon;
            const st = templateStatusMeta(tpl.status);
            const checked = selectedIds.has(tpl.id);
            return (
              <div
                key={tpl.id}
                onClick={() => navigate(`/content/templates/${tpl.id}`)}
                className={`group relative flex cursor-pointer flex-col rounded-2xl border bg-white p-4 shadow-2xs transition-all hover:border-violet-300 hover:shadow-md ${
                  checked ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200/90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleId(tpl.id)}
                      className={`h-3.5 w-3.5 cursor-pointer accent-violet-600 transition-opacity ${checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    />
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 ${card.fg}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
                <div className="mt-3 flex-1">
                  <div className="font-bold text-slate-900 group-hover:text-violet-700">{tpl.name}</div>
                  <div className="font-mono text-[10px] text-slate-400">/{tpl.slug}</div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] font-semibold text-slate-400">
                  <span>{card.label}</span>
                  <span>{formatSchemaDate(tpl.updated_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-10 py-3.5 pl-5 pr-1">
                  <input
                    type="checkbox"
                    checked={allInViewSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedInView.length > 0 && !allInViewSelected;
                    }}
                    onChange={toggleAllInView}
                    className="h-3.5 w-3.5 cursor-pointer accent-violet-600"
                    title={allInViewSelected ? 'Clear selection' : 'Select all'}
                  />
                </th>
                <th className="px-3 py-3.5">Template</th>
                <th className="px-4 py-3.5">Channel</th>
                <th className="px-4 py-3.5">Versions</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Updated</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((tpl) => {
                const card = CHANNEL_CARDS.find((c) => c.id === tpl.channel) || CHANNEL_CARDS[0];
                const Icon = card.icon;
                const st = templateStatusMeta(tpl.status);
                const ec = tpl.content as any;
                const enabledVersions: string[] = ec?.enabled_versions || ['html', 'amp', 'text'];
                const checked = selectedIds.has(tpl.id);
                return (
                  <tr
                    key={tpl.id}
                    onClick={() => navigate(`/content/templates/${tpl.id}`)}
                    className={`group cursor-pointer transition ${checked ? 'bg-violet-50/60' : 'hover:bg-slate-50/80'}`}
                  >
                    <td className="py-3.5 pl-5 pr-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleId(tpl.id)}
                        className={`h-3.5 w-3.5 cursor-pointer accent-violet-600 transition-opacity ${checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 ${card.fg}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 transition group-hover:text-violet-700">{tpl.name}</span>
                          <span className="block font-mono text-[10px] text-slate-400">/{tpl.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-bold ${card.fg}`}>
                        {card.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {tpl.channel === 'email' ? (
                        <div className="flex items-center gap-1.5">
                          {enabledVersions.includes('html') && (
                            <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">HTML</span>
                          )}
                          {enabledVersions.includes('amp') && (
                            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">AMP ⚡</span>
                          )}
                          {enabledVersions.includes('text') && (
                            <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">TXT</span>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] text-slate-400">Standard</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${st.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-500">{formatSchemaDate(tpl.updated_at)}</td>
                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => duplicateMutation.mutate(tpl.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          title="Duplicate"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSingleDelete({ id: tpl.id, name: tpl.name })}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          to={`/content/templates/${tpl.id}`}
                          className="ml-1 inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-violet-600"
                        >
                          Open Studio
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateTemplateModal
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          refetch();
        }}
      />

      {singleDelete && (
        <ConfirmDialog
          open={Boolean(singleDelete)}
          title="Delete Template"
          description={`Are you sure you want to delete "${singleDelete.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => deleteMutation.mutate(singleDelete.id)}
          onCancel={() => setSingleDelete(null)}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmDialog
          open={bulkDeleteOpen}
          title={`Delete ${selectedIds.size} template${selectedIds.size === 1 ? '' : 's'}`}
          description={`This permanently deletes ${
            selectedNames.length <= 3
              ? selectedNames.map((n) => `"${n}"`).join(', ')
              : `${selectedNames.slice(0, 3).map((n) => `"${n}"`).join(', ')} and ${selectedNames.length - 3} more`
          }. This action cannot be undone.`}
          confirmLabel={`Delete ${selectedIds.size}`}
          destructive
          onConfirm={() => bulkDeleteMutation.mutate([...selectedIds])}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}
    </div>
  );
}
