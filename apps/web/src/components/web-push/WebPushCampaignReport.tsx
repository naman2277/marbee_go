// Web Push campaign report (D-026 add-on): delivery funnel, CTA clicks, segments, timeline,
// issues and recent clicks for one broadcast. Data: web_push_broadcast_report (SQL 98).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Clock, ExternalLink, MousePointerClick, RefreshCw, Send, Target, Users } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { WebPushPreview } from '@/components/content-templates/channel-studio/WebPushPreview';
import type { WebPushContent } from '@/lib/content-templates';
import {
  ctaBreakdown,
  describeAudience,
  fetchBroadcastReport,
  formatDuration,
  type BroadcastReport,
  type ReportSegment,
} from '@/lib/web-push-broadcasts';

const statusStyle: Record<BroadcastReport['broadcast']['status'], string> = {
  scheduled: 'bg-amber-50 text-amber-800 border-amber-200',
  sending: 'bg-sky-50 text-sky-800 border-sky-200',
  sent: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Send; label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </Card>
  );
}

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

function Bar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'slate' | 'emerald' }) {
  const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  const color = tone === 'brand' ? 'bg-brand-600' : tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-300';
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function Funnel({ s }: { s: BroadcastReport['summary'] }) {
  const steps = [
    { label: 'Targeted', value: s.targeted, note: 'devices queued for this campaign' },
    { label: 'Delivered', value: s.delivered, note: pct(s.delivered, s.targeted) + ' of targeted' },
    { label: 'Clicked', value: s.clicked, note: pct(s.clicked, s.delivered) + ' of delivered (CTR)' },
  ];
  const max = Math.max(s.targeted, 1);
  return (
    <div className="space-y-3">
      {steps.map((st, i) => (
        <div key={st.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-slate-800">{st.label}</span>
            <span className="tabular-nums text-slate-600">
              <span className="font-bold text-slate-900">{st.value.toLocaleString()}</span> · {st.note}
            </span>
          </div>
          <Bar value={st.value} max={max} tone={i === 2 ? 'brand' : i === 1 ? 'emerald' : 'slate'} />
        </div>
      ))}
      {(s.failed > 0 || s.skipped > 0 || s.queued > 0 || s.excluded_at_send > 0 || s.capped_at_send > 0) && (
        <p className="text-[11px] text-slate-500">
          {[
            s.queued ? `${s.queued} still queued` : '',
            s.failed ? `${s.failed} failed` : '',
            s.skipped ? `${s.skipped} skipped` : '',
            s.excluded_at_send ? `${s.excluded_at_send} excluded (opted out)` : '',
            s.capped_at_send ? `${s.capped_at_send} held by daily cap` : '',
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

function Timeline({ data, bucket }: { data: BroadcastReport['timeline']; bucket: number | null }) {
  if (data.length === 0) return <p className="text-xs text-slate-500">No activity yet.</p>;
  const max = Math.max(...data.map((d) => Math.max(d.delivered, d.clicked)), 1);
  const H = 120;
  const fmt = (t: string) => {
    const d = new Date(t);
    return bucket && bucket >= 86400
      ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  const step = Math.ceil(data.length / 8);
  return (
    <div>
      <div className="flex h-[120px] items-end gap-px" role="img" aria-label="Delivered and clicked over time">
        {data.map((d) => (
          <div key={d.t} className="group relative flex h-full flex-1 items-end gap-px" title={`${fmt(d.t)} — ${d.delivered} delivered, ${d.clicked} clicked`}>
            <div className="flex-1 rounded-t bg-emerald-300" style={{ height: `${(d.delivered / max) * H}px` }} />
            <div className="flex-1 rounded-t bg-brand-600" style={{ height: `${(d.clicked / max) * H}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-px text-[10px] text-slate-400">
        {data.map((d, i) => (
          <div key={d.t} className="flex-1 truncate text-center">{i % step === 0 ? fmt(d.t) : ''}</div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-slate-600">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-300" /> Delivered</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-600" /> Clicked</span>
        {bucket && <span className="text-slate-400">per {formatDuration(bucket)}</span>}
      </div>
    </div>
  );
}

function SegmentTable({ title, rows }: { title: string; rows: ReportSegment[] }) {
  const max = Math.max(...rows.map((r) => r.clicked), 1);
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No data.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1 font-semibold">{title.replace('By ', '')}</th>
              <th className="py-1 text-right font-semibold">Delivered</th>
              <th className="py-1 text-right font-semibold">Clicked</th>
              <th className="py-1 text-right font-semibold">CTR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="py-1.5 pr-2">
                  <p className="font-medium text-slate-800">{r.name}</p>
                  <div className="mt-1 w-full max-w-[140px]"><Bar value={r.clicked} max={max} /></div>
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.delivered}<span className="text-slate-400">/{r.targeted}</span></td>
                <td className="py-1.5 text-right tabular-nums">{r.clicked}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{pct(r.clicked, r.delivered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function WebPushCampaignReport({ broadcastId, backTo = '/campaigns/web-push' }: { broadcastId: string; backTo?: string }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['web-push-broadcast-report', broadcastId],
    queryFn: () => fetchBroadcastReport(broadcastId),
    refetchInterval: (q) => (q.state.data?.broadcast.status === 'sending' ? 10_000 : false),
  });

  const ctas = useMemo(() => (data ? ctaBreakdown(data.broadcast.content, data.by_action) : []), [data]);

  if (isLoading) return <p className="text-xs text-slate-500">Loading report…</p>;
  if (error || !data) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm font-semibold text-slate-800">Report unavailable</p>
        <p className="text-xs text-slate-500">{(error as Error | null)?.message ?? 'Not found'}</p>
        <Link to={backTo} className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">Back to Web Push Campaigns</Link>
      </Card>
    );
  }

  const b = data.broadcast;
  const s = data.summary;
  const c = b.content;
  const preview: WebPushContent = {
    title: String(c.title ?? ''),
    body: String(c.body ?? ''),
    icon_url: (c.icon_url as string) || undefined,
    image_url: (c.image_url as string) || undefined,
    action_url: (c.click_url as string) || undefined,
    actions: Array.isArray(c.actions) ? (c.actions as WebPushContent['actions']) : [],
  };
  const totalCta = ctas.reduce((a, r) => a + r.clicks, 0);
  const topCta = [...ctas].sort((x, y) => y.clicks - x.clicks)[0];
  const sentAt = s.first_sent_at ?? b.scheduled_at ?? b.created_at;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={backTo} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Web Push Campaigns
          </Link>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            {b.name}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusStyle[b.status]}`}>{b.status}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {b.status === 'scheduled' ? 'Scheduled for ' : 'Sent '} {new Date(sentAt).toLocaleString()} · {describeAudience(b.audience)}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Target} label="Targeted" value={s.targeted.toLocaleString()} hint={`${s.queued} queued`} />
        <Kpi icon={Send} label="Delivered" value={s.delivered.toLocaleString()} hint={`${pct(s.delivered, s.targeted)} delivery rate`} />
        <Kpi icon={AlertTriangle} label="Failed" value={s.failed.toLocaleString()} hint={`${s.skipped} skipped`} />
        <Kpi icon={MousePointerClick} label="Clicks" value={s.clicked.toLocaleString()} hint={`CTR ${pct(s.clicked, s.delivered)}`} />
        <Kpi icon={Users} label="Known clickers" value={s.clicked_known.toLocaleString()} hint={`${s.clicked_anonymous} anonymous`} />
        <Kpi icon={Clock} label="Time to click" value={formatDuration(s.median_seconds_to_click)} hint={`median · 90% within ${formatDuration(s.p90_seconds_to_click)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Delivery funnel">
            <Funnel s={s} />
          </Section>

          <Section
            title="Where people clicked"
            subtitle="Clicks on the notification itself vs. each button"
            right={topCta && topCta.clicks > 0 ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Top: {topCta.label}</span> : undefined}
          >
            <div className="space-y-3">
              {ctas.map((r) => (
                <div key={r.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-800">{r.label}</span>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer noopener" className="ml-2 inline-flex max-w-[280px] items-center gap-0.5 truncate align-bottom text-slate-500 hover:text-brand-700">
                          {r.url} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      <span className="font-bold text-slate-900">{r.clicks}</span> · {pct(r.clicks, totalCta)}
                    </span>
                  </div>
                  <Bar value={r.clicks} max={Math.max(totalCta, 1)} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Activity over time" subtitle="Deliveries and clicks after sending">
            <Timeline data={data.timeline} bucket={data.bucket} />
          </Section>
        </div>

        <Section title="Message">
          <WebPushPreview content={preview} />
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Opens</dt><dd className="truncate text-right text-slate-800">{String(c.click_url ?? 'site home')}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Created</dt><dd className="text-slate-800">{new Date(b.created_at).toLocaleString()}</dd></div>
            {s.first_click_at && <div className="flex justify-between gap-2"><dt className="text-slate-500">First click</dt><dd className="text-slate-800">{new Date(s.first_click_at).toLocaleString()}</dd></div>}
            {s.last_click_at && <div className="flex justify-between gap-2"><dt className="text-slate-500">Last click</dt><dd className="text-slate-800">{new Date(s.last_click_at).toLocaleString()}</dd></div>}
            {b.cancelled_at && <div className="flex justify-between gap-2"><dt className="text-slate-500">Cancelled</dt><dd className="text-slate-800">{new Date(b.cancelled_at).toLocaleString()}</dd></div>}
          </dl>
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SegmentTable title="By browser" rows={data.by_browser} />
        <SegmentTable title="By OS" rows={data.by_os} />
        <SegmentTable title="By device" rows={data.by_device} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Recent clicks" subtitle="Last 50, newest first">
            {data.recent_clicks.length === 0 ? (
              <p className="text-xs text-slate-500">No clicks yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 font-semibold">When</th>
                      <th className="py-1 font-semibold">Clicked</th>
                      <th className="py-1 font-semibold">Customer</th>
                      <th className="py-1 font-semibold">Device</th>
                      <th className="py-1 text-right font-semibold">After send</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recent_clicks.map((r, i) => (
                      <tr key={`${r.clicked_at}-${i}`}>
                        <td className="py-1.5 text-slate-600">{new Date(r.clicked_at).toLocaleString()}</td>
                        <td className="py-1.5 text-slate-800">{ctas.find((x) => x.key === r.action)?.label ?? 'Other'}</td>
                        <td className="py-1.5">
                          {r.customer_id ? (
                            <Link to={`/customers/${r.customer_id}`} className="font-medium text-brand-700 hover:underline">{r.customer ?? 'Customer'}</Link>
                          ) : (
                            <span className="text-slate-400">Anonymous</span>
                          )}
                        </td>
                        <td className="py-1.5 text-slate-600">{r.browser} · {r.os} · {r.device}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">{formatDuration(r.seconds_to_click)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
        <Section title="Delivery issues" subtitle="Why pushes failed or were skipped">
          {data.issues.length === 0 ? (
            <p className="text-xs text-slate-500">No issues.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {data.issues.map((x) => (
                <li key={`${x.status}-${x.reason}`} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${x.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{x.status}</span>
                    <span className="break-words text-slate-700">{x.reason}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{x.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">Expired or blocked browsers are removed automatically and not sent to again.</p>
        </Section>
      </div>

      <p className="text-[11px] text-slate-400">Per-device detail is kept for 30 days after sending. Button-level clicks are recorded by the updated service worker; earlier clicks count as notification clicks.</p>
    </div>
  );
}
