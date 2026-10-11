import { useMemo } from 'react';
import { Clock, Plus, Send, Pencil, CheckCircle2, AlertTriangle, CalendarClock } from 'lucide-react';
import { AnimatedSocialIcon } from '@/components/social/AnimatedSocialIcon';
import type { SocialPost } from '@/lib/social-providers';
import { getNetwork, type SocialNetworkId } from '@/lib/social-networks';
import type { SocialConfig } from '@/lib/social-config';

type Props = {
  posts: SocialPost[];
  config: SocialConfig;
  connected: Set<SocialNetworkId>;
  onOpenPost: (post: SocialPost) => void;
  onFillSlot: (date: Date, network: SocialNetworkId) => void;
  onPublishNow: (id: string) => void;
};

type QueueEntry =
  | { kind: 'post'; when: Date; post: SocialPost }
  | { kind: 'slot'; when: Date; network: SocialNetworkId };

/** next 14 days of slots + scheduled posts, merged & sorted */
function buildTimeline(posts: SocialPost[], config: SocialConfig): { day: string; entries: QueueEntry[] }[] {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 14);

  const entries: QueueEntry[] = [];

  for (const p of posts) {
    if (p.status !== 'scheduled' || !p.scheduledAt) continue;
    const when = new Date(p.scheduledAt);
    if (when >= now && when <= horizon) entries.push({ kind: 'post', when, post: p });
  }

  for (let i = 0; i < 14; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    for (const [netId, nc] of Object.entries(config.networks) as [SocialNetworkId, SocialConfig['networks'][SocialNetworkId]][]) {
      if (!nc.enabled) continue;
      for (const slot of nc.queue) {
        if (slot.day !== d.getDay()) continue;
        const [hh, mm] = slot.time.split(':').map(Number);
        const when = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
        if (when < now) continue;
        const taken = entries.some(
          (e) =>
            e.kind === 'post' &&
            Math.abs(e.when.getTime() - when.getTime()) < 30 * 60 * 1000 &&
            (e.post.platforms as string[]).includes(netId),
        );
        if (!taken) entries.push({ kind: 'slot', when, network: netId });
      }
    }
  }

  entries.sort((a, b) => a.when.getTime() - b.when.getTime());

  const groups = new Map<string, QueueEntry[]>();
  for (const e of entries) {
    const key = e.when.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries()).map(([day, list]) => ({ day, entries: list }));
}

export function StudioQueue({ posts, config, connected, onOpenPost, onFillSlot, onPublishNow }: Props) {
  const timeline = useMemo(() => buildTimeline(posts, config), [posts, config]);
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;
  const weeklySlots = Object.values(config.networks).filter((n) => n.enabled).reduce((s, n) => s + n.queue.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><CalendarClock className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-bold text-slate-900">Publishing queue</p>
            <p className="text-[11px] text-slate-500">{scheduledCount} queued · {weeklySlots} slots/week · next 14 days</p>
          </div>
        </div>
        <p className="ml-auto max-w-sm text-[11px] text-slate-400">
          Empty slots come from each network's schedule in Channels → Publishing schedule. Click one to drop a post in.
        </p>
      </div>

      {timeline.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Clock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Nothing queued</p>
          <p className="mt-1 text-xs text-slate-500">Add queue slots per network, or schedule a post from the composer.</p>
        </div>
      )}

      <div className="space-y-4">
        {timeline.map(({ day, entries }) => (
          <div key={day}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{day}</p>
            <div className="space-y-1.5">
              {entries.map((e, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    e.kind === 'post' ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <span className="w-16 shrink-0 text-xs font-bold text-slate-500">
                    {e.when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {e.kind === 'post' ? (
                    <>
                      <span className="flex -space-x-1.5">
                        {e.post.platforms.slice(0, 4).map((pl) => (
                          <AnimatedSocialIcon key={pl} platform={pl} size="sm" animated={false} className="h-6 w-6 rounded-lg p-1 ring-2 ring-white" />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{e.post.content || 'Untitled post'}</span>
                      <StatusPill status={e.post.status} />
                      <button type="button" onClick={() => onOpenPost(e.post)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => onPublishNow(e.post.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Publish now"><Send className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <AnimatedSocialIcon platform={e.network} size="sm" animated={false} className="h-6 w-6 rounded-lg p-1 opacity-70" />
                      <span className="min-w-0 flex-1 text-xs font-medium text-slate-400">
                        Open {getNetwork(e.network)?.label} slot
                        {!connected.has(e.network) && <span className="ml-1.5 text-[10px] text-amber-600">· not connected</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => onFillSlot(e.when, e.network)}
                        className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-brand-600 hover:border-brand-300"
                      >
                        <Plus className="h-3 w-3" /> Fill
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: SocialPost['status'] }) {
  const map: Record<string, { c: string; label: string; Icon: typeof Clock }> = {
    scheduled: { c: 'bg-amber-50 text-amber-700', label: 'Scheduled', Icon: Clock },
    published: { c: 'bg-emerald-50 text-emerald-700', label: 'Published', Icon: CheckCircle2 },
    failed: { c: 'bg-rose-50 text-rose-700', label: 'Failed', Icon: AlertTriangle },
    draft: { c: 'bg-slate-100 text-slate-500', label: 'Draft', Icon: Pencil },
    publishing: { c: 'bg-sky-50 text-sky-700', label: 'Publishing', Icon: Send },
  };
  const m = map[status] ?? map.draft;
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.c}`}>
      <m.Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}
