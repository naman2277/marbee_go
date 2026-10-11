import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy, Loader2, Pause, Play, RefreshCw, Trash2, X, Pencil,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { RtmMessageTrace } from './RtmMessageTrace';
import { RtmWizard } from './RtmWizard';
import {
  RTM_INGEST_URL, STATUS_TONE, buildSnippet, deleteDefinition, getDefinition,
  listMessages, replayMessages, setDefinitionStatus,
  type DefinitionSummary, type SnippetLang,
} from '@/lib/rtm';

const MSG_STATUSES = ['', 'delivered', 'sent', 'failed', 'suppressed', 'skipped', 'no_match'];

export function RtmDefinitionDrawer({ summary, onClose }: { summary: DefinitionSummary; onClose: () => void }) {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'messages' | 'integrate'>('overview');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [snippetLang, setSnippetLang] = useState<SnippetLang>('curl');
  const [copied, setCopied] = useState(false);

  const detail = useQuery({
    queryKey: ['rtm-definition', tenantId, summary.id],
    queryFn: () => getDefinition(tenantId, summary.id),
  });

  const messages = useQuery({
    queryKey: ['rtm-messages', tenantId, environment, summary.id, statusFilter, search],
    queryFn: () => listMessages(tenantId, environment, {
      definitionId: summary.id, status: statusFilter || undefined, search: search || undefined, limit: 60,
    }),
    enabled: tab === 'messages',
    refetchInterval: tab === 'messages' ? 8000 : false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['rtm-definitions', tenantId, environment] });
    void detail.refetch();
  };

  const toggleStatus = useMutation({
    mutationFn: (next: 'active' | 'paused') => setDefinitionStatus(tenantId, summary.id, next),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => deleteDefinition(tenantId, summary.id),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const replay = useMutation({
    mutationFn: (ids: string[]) => replayMessages(ids),
    onSuccess: () => void messages.refetch(),
  });

  const d = detail.data;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="flex-1" onClick={onClose} />
      <div className="flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{summary.name}</h2>
              <Badge variant={STATUS_TONE[summary.status]}>{summary.status}</Badge>
              {summary.latency_class === 'hot' && <Badge variant="warning">hot lane</Badge>}
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-500">event: {summary.event_type}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
            {summary.status === 'active' ? (
              <Button variant="ghost" size="sm" onClick={() => toggleStatus.mutate('paused')} disabled={toggleStatus.isPending}>
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => toggleStatus.mutate('active')} disabled={toggleStatus.isPending}>
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-6 py-2">
          {(['overview', 'messages', 'integrate'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                tab === t ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-3">
                {[
                  ['Accepted', summary.accepted_7d], ['Sent', summary.sent_7d],
                  ['Delivered', summary.delivered_7d], ['Failed', summary.failed_7d],
                ].map(([label, n]) => (
                  <div key={label as string} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{n as number}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">7-day totals</p>

              {d?.description && <p className="text-sm text-slate-600">{d.description}</p>}

              <Section title="Routing">
                <Kv k="Default channel" v={summary.default_channel} />
                <Kv k="Transactional" v={summary.is_transactional ? 'yes — bypasses marketing caps' : 'no'} />
                <Kv k="Speed lane" v={summary.latency_class} />
              </Section>

              <Section title={`Payload schema (v${d?.schema_version ?? 1})`}>
                {(d?.payload_schema ?? []).length === 0
                  ? <p className="text-xs text-slate-400">Envelope-only — no declared fields.</p>
                  : (d?.payload_schema ?? []).map((f) => (
                    <div key={f.key} className="flex items-center justify-between py-0.5 text-xs">
                      <span className="font-mono text-slate-700">{f.key}</span>
                      <span className="text-slate-400">{f.type}{f.required ? ' · required' : ''}{f.pii ? ' · PII' : ''}</span>
                    </div>
                  ))}
              </Section>

              <Section title="Guardrails">
                <Kv k="Dedupe" v={d?.guardrails.dedupe ? `${d.guardrails.dedupe.keys.join(', ')} within ${d.guardrails.dedupe.window_seconds}s` : 'off'} />
                <Kv k="Rate / recipient" v={d?.guardrails.rate_per_recipient ? `${d.guardrails.rate_per_recipient.max} per ${d.guardrails.rate_per_recipient.window_seconds}s` : 'off'} />
                <Kv k="Daily spend cap" v={d?.guardrails.spend_cap_credits_per_day ? `${d.guardrails.spend_cap_credits_per_day} credits` : 'off'} />
              </Section>
            </div>
          )}

          {tab === 'messages' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="message_id, recipient, payload…"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
                  {MSG_STATUSES.map((s) => <option key={s} value={s}>{s || 'all statuses'}</option>)}
                </select>
                <Button variant="secondary" size="sm" onClick={() => messages.refetch()}>
                  <RefreshCw className={`h-3.5 w-3.5 ${messages.isFetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {(messages.data ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">No messages yet.</p>
              )}

              <div className="space-y-1.5">
                {(messages.data ?? []).map((m) => (
                  <div key={m.message_id} className="rounded-lg border border-slate-200">
                    <button type="button" onClick={() => setOpenMsg(openMsg === m.message_id ? null : m.message_id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                      <Badge variant={STATUS_TONE[m.status] ?? 'default'}>{m.status}</Badge>
                      <span className="flex-1 truncate font-mono text-xs text-slate-500">{m.message_id}</span>
                      {m.reason_code && <span className="shrink-0 text-[11px] text-slate-400">{m.reason_code}</span>}
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                        {new Date(m.received_at).toLocaleTimeString()}
                      </span>
                    </button>
                    {openMsg === m.message_id && (
                      <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
                        <RtmMessageTrace message={m} />
                        {['failed', 'dead_letter', 'no_match'].includes(m.status) && (
                          <Button size="sm" variant="secondary" className="mt-3"
                            onClick={() => replay.mutate([m.message_id])} disabled={replay.isPending}>
                            {replay.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                            Replay
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'integrate' && d && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Endpoint</p>
                <code className="block break-all rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                  POST {RTM_INGEST_URL}
                </code>
              </div>
              <div className="flex gap-1">
                {(['curl', 'node', 'python', 'php'] as SnippetLang[]).map((l) => (
                  <button key={l} type="button" onClick={() => setSnippetLang(l)}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${snippetLang === l ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {l}
                  </button>
                ))}
                <button type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(buildSnippet(snippetLang, { event: d.event_type, schema: d.payload_schema, channel: d.default_channel }));
                    setCopied(true); setTimeout(() => setCopied(false), 1500);
                  }}
                  className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                  <Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
{buildSnippet(snippetLang, { event: d.event_type, schema: d.payload_schema, channel: d.default_channel })}
              </pre>
              <p className="text-xs text-slate-500">
                Authenticate with a tenant API key that has the <code>events:write</code> scope
                (Settings → API). Pass a unique <code>Idempotency-Key</code> per logical event so retries are safe.
              </p>
            </div>
          )}
        </div>
      </div>

      {editing && d && (
        <RtmWizard initial={d} onClose={() => { setEditing(false); invalidate(); }} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${summary.name}”?`}
        message="This removes the definition, its templates, and stops accepting its event. Message history is kept."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-slate-500">{k}</span>
      <span className="text-right text-slate-700">{v}</span>
    </div>
  );
}
