import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Clock, User, Star, Search, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import type { TabProps } from '../types';
import { fetchConversations, type ChatBotConversation, type ChatBotSentiment, type ChatBotConversationStatus, type ChatBotLeadStatus } from '@/lib/chatbots';
import { ConversationDetailDrawer } from './ConversationDetailDrawer';
import { supabase } from '@/lib/supabase';

const SENTIMENT_STYLE: Record<ChatBotSentiment, { icon: string; badge: 'success' | 'default' | 'error' | 'warning'; border: string }> = {
  positive: { icon: '🟢', badge: 'success', border: 'border-l-emerald-400' },
  neutral: { icon: '🔵', badge: 'default', border: 'border-l-sky-300' },
  negative: { icon: '🔴', badge: 'error', border: 'border-l-red-400' },
  mixed: { icon: '🟡', badge: 'warning', border: 'border-l-amber-400' },
};

const STATUS_LABEL: Record<ChatBotConversationStatus, string> = {
  active: 'Active', completed: 'Completed', abandoned: 'Abandoned', escalated: 'Escalated', converted: 'Converted',
};

const PURGE_OPTIONS = [
  { value: 0, label: 'Never (keep all)' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ConversationsTab({ draft }: TabProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | ChatBotConversationStatus>('all');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | ChatBotSentiment>('all');
  const [leadFilter, setLeadFilter] = useState<'all' | ChatBotLeadStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [openConversation, setOpenConversation] = useState<string | null>(null);
  const [showPurge, setShowPurge] = useState(false);
  const [purgeRetention, setPurgeRetention] = useState(0);
  const [purgeConfirm, setPurgeConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['chatbot-conversations', draft.bot.id, page, statusFilter, sentimentFilter, leadFilter, searchTerm],
    queryFn: () => fetchConversations(draft.bot.id, {
      page,
      filters: {
        status: statusFilter === 'all' ? undefined : statusFilter,
        sentiment: sentimentFilter === 'all' ? undefined : sentimentFilter,
        leadStatus: leadFilter === 'all' ? undefined : leadFilter,
        search: searchTerm || undefined,
      },
    }),
  });

  const purgeMutation = useMutation({
    mutationFn: async (retentionDays: number) => {
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
      const { error } = await supabase
        .from('mb_chatbot_conversations')
        .delete()
        .eq('chatbot_id', draft.bot.id)
        .lt('last_message_at', cutoff)
        .in('status', ['completed', 'abandoned']);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations', draft.bot.id] });
      setPurgeConfirm(false);
      setShowPurge(false);
      setPage(1);
    },
  });

  const list = data?.conversations ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / (data?.pageSize ?? 25)));

  const resetFilters = () => {
    setPage(1);
  };

  const handleSearch = () => {
    setSearchTerm(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Conversations</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalCount} conversation{totalCount !== 1 ? 's' : ''} total
            {totalCount > 0 && ` — page ${page} of ${totalPages}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowPurge(!showPurge)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Purge Policy
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, mobile..."
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={handleSearch}>Search</Button>
        {searchTerm && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); setSearchTerm(''); setPage(1); }}>Clear</Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); resetFilters(); }}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" value={sentimentFilter} onChange={(e) => { setSentimentFilter(e.target.value as typeof sentimentFilter); resetFilters(); }}>
          <option value="all">All sentiment</option>
          <option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option><option value="mixed">Mixed</option>
        </select>
        <select className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" value={leadFilter} onChange={(e) => { setLeadFilter(e.target.value as typeof leadFilter); resetFilters(); }}>
          <option value="all">All leads</option>
          <option value="new">New</option><option value="in_progress">In progress</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="dropped">Dropped</option>
        </select>
      </div>

      {/* Purge Policy Panel */}
      {showPurge && (
        <Card className="p-4 bg-red-50/50 border-red-200">
          <h3 className="text-xs font-bold text-slate-800 mb-2">Purge Completed/Abandoned Conversations</h3>
          <p className="text-[11px] text-slate-500 mb-3">Delete completed and abandoned conversations older than the selected retention period. Active and escalated conversations are never purged.</p>
          <div className="flex items-center gap-3">
            <select
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
              value={purgeRetention}
              onChange={(e) => { setPurgeRetention(Number(e.target.value)); setPurgeConfirm(false); }}
            >
              {PURGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {purgeRetention > 0 && !purgeConfirm && (
              <Button variant="danger" size="sm" onClick={() => setPurgeConfirm(true)}>
                Purge Now
              </Button>
            )}
            {purgeConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-red-600 font-medium">Are you sure? This cannot be undone.</span>
                <Button variant="danger" size="sm" onClick={() => purgeMutation.mutate(purgeRetention)} disabled={purgeMutation.isPending}>
                  {purgeMutation.isPending ? 'Purging...' : 'Confirm Purge'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPurgeConfirm(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Loading / Empty */}
      {isLoading && <Card><div className="p-10 text-center text-sm text-slate-400">Loading conversations...</div></Card>}
      {!isLoading && list.length === 0 && (
        <Card><div className="p-10 text-center text-sm text-slate-400"><MessageSquare className="h-8 w-8 mx-auto text-slate-300 mb-2" />{searchTerm ? 'No conversations match your search.' : 'No conversations yet.'}</div></Card>
      )}

      {/* Conversation List */}
      <div className="space-y-2">
        {list.map((c) => {
          const style = c.sentiment ? SENTIMENT_STYLE[c.sentiment] : null;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenConversation(c.id)}
              className={`w-full text-left rounded-xl border border-slate-200 border-l-4 ${style?.border ?? 'border-l-slate-200'} bg-white p-4 hover:shadow-sm transition`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-800 truncate">{c.visitor_id || 'Anonymous visitor'}</span>
                  <span className="text-[11px] text-slate-400 truncate">session {c.session_id?.slice(0, 8)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.feedback_rating != null && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-semibold text-yellow-700">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {c.feedback_rating}/5
                    </span>
                  )}
                  {style && <Badge variant={style.badge}>{style.icon} {c.sentiment}</Badge>}
                  <Badge>{STATUS_LABEL[c.status]}</Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(c.last_message_at)}</span>
                <span>{c.message_count} messages</span>
                {c.intent && <span>Intent: {c.intent}</span>}
                <span className="capitalize">Lead: {c.lead_status.replace('_', ' ')}</span>
                {Object.keys(c.captured_data || {}).length > 0 && (
                  <span className="truncate max-w-md">Captured: {Object.entries(c.captured_data).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-slate-500">
            Showing {((page - 1) * (data?.pageSize ?? 25)) + 1}–{Math.min(page * (data?.pageSize ?? 25), totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {generatePageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-400">...</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p as number)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    p === page ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {openConversation && <ConversationDetailDrawer conversationId={openConversation} onClose={() => setOpenConversation(null)} />}
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
