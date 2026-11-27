// Web Push → Broadcasts (D-026): send one push to all subscribers, a filtered group or a
// Marbee audience, now or scheduled, and follow the results. Sending runs on the server.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarClock, Megaphone, RefreshCw, Send, Users, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { WebPushComposer } from '@/components/content-templates/channel-studio/WebPushComposer';
import { WebPushPreview } from '@/components/content-templates/channel-studio/WebPushPreview';
import type { WebPushContent } from '@/lib/content-templates';
import { fetchContentTemplates } from '@/lib/content-templates';
import { fetchAudiences } from '@/lib/audiences';
import { fetchWebPushSubscribers, sendTestWebPushNotification } from '@/lib/web-analytics';
import {
  cancelBroadcast,
  countAudience,
  describeAudience,
  filterFor,
  listBroadcasts,
  resolveAudienceCustomerIds,
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

function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
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
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function WebPushBroadcasts({ tenantId, environment }: { tenantId: string; environment: string }) {
  const [mode, setMode] = useState<'list' | 'compose'>('list');
  return mode === 'list'
    ? <BroadcastList tenantId={tenantId} environment={environment} onNew={() => setMode('compose')} />
    : <BroadcastComposer tenantId={tenantId} environment={environment} onDone={() => setMode('list')} />;
}

// ---------------------------------------------------------------- list
function BroadcastList({ tenantId, environment, onNew }: { tenantId: string; environment: string; onNew: () => void }) {
  const qc = useQueryClient();
  const { data = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['web-push-broadcasts', tenantId, environment],
    queryFn: () => listBroadcasts(tenantId, environment),
    enabled: Boolean(tenantId),
    refetchInterval: 10_000,
  });
  const cancel = useMutation({
    mutationFn: cancelBroadcast,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['web-push-broadcasts', tenantId, environment] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">All web push campaigns</h3>
          <p className="text-xs text-slate-500">One push to all subscribers, a filtered group or an audience. Sent from the server — you can close this tab.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={onNew}>
            <Megaphone className="mr-1.5 h-3.5 w-3.5" /> New campaign
          </Button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{(error as Error).message}</p>}
      {isLoading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : data.length === 0 ? (
        <Card className="p-8 text-center">
          <Megaphone className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-800">No web push campaigns yet</p>
          <p className="text-xs text-slate-500">Send your first push to everyone who subscribed on your website.</p>
        </Card>
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
              {data.map((b) => {
                const ctr = b.delivered ? `${((b.clicked / b.delivered) * 100).toFixed(1)}%` : '—';
                const when = b.scheduled_at ?? b.created_at;
                return (
                  <tr key={b.id} className="align-top">
                    <td className="px-3 py-2">
                      <Link to={`/campaigns/web-push/${b.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{b.name}</Link>
                      <p className="text-slate-500">{String(b.content.title ?? '')}</p>
                      <p className="text-[11px] text-slate-400">{describeAudience(b.audience)}</p>
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
    </div>
  );
}

// ---------------------------------------------------------------- composer
function BroadcastComposer({ tenantId, environment, onDone }: { tenantId: string; environment: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [clientKey] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [content, setContent] = useState<WebPushContent>(EMPTY);
  const [kind, setKind] = useState<AudienceChoice['kind']>('all');
  const [filter, setFilter] = useState<BroadcastFilter>({ linked: 'any' });
  const [audienceId, setAudienceId] = useState('');
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
  const countReady = kind !== 'audience' || Boolean(audienceIds.data);

  // Debounced live count.
  const [countKey, setCountKey] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setCountKey(JSON.stringify([filterFor(choice), customerIds?.length ?? null, audienceId])), 350);
    return () => clearTimeout(t);
  }, [choice, customerIds, audienceId]);
  const count = useQuery({
    queryKey: ['broadcast-count', tenantId, environment, countKey],
    queryFn: () => countAudience(tenantId, environment, filterFor(choice), customerIds),
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
    mutationFn: () => sendBroadcast({ tenantId, environment, clientKey, name: name.trim(), content: payload, audience: choice, customerIds, scheduledAt }),
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
        <h3 className="text-sm font-bold text-slate-900">New web push campaign</h3>
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
