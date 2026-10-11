import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import type { SocialPost } from '@/lib/social-providers';
import { getNetwork, DAY_LABELS } from '@/lib/social-networks';
import type { SocialConfig } from '@/lib/social-config';

type Props = {
  posts: SocialPost[];
  config: SocialConfig;
  onOpenPost: (post: SocialPost) => void;
  onCreateAt: (date: Date) => void;
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function postDate(p: SocialPost): Date {
  return new Date(p.scheduledAt || p.publishedAt || p.createdAt);
}

export function StudioCalendar({ posts, config, onOpenPost, onCreateAt }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => new Date());

  const byDate = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    for (const p of posts) {
      const k = dateKey(postDate(p));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [posts]);

  // union of all network queue slots -> { "day": ["09:00", …] }
  const slotsByDay = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const n of Object.values(config.networks)) {
      if (!n.enabled) continue;
      for (const s of n.queue) {
        if (!m.has(s.day)) m.set(s.day, new Set());
        m.get(s.day)!.add(s.time);
      }
    }
    return m;
  }, [config.networks]);

  const today = new Date();
  const todayKey = dateKey(today);

  const days: Date[] = useMemo(() => {
    if (view === 'week') {
      const start = new Date(cursor);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const total = 42;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor, view]);

  const move = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  const label = view === 'week'
    ? `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-900">{label}</h3>
          <Button size="sm" variant="secondary" onClick={() => setCursor(new Date())}>Today</Button>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${view === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => move(-1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => move(1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className={`grid grid-cols-7 ${view === 'week' ? 'auto-rows-[minmax(180px,1fr)]' : 'auto-rows-[minmax(110px,1fr)]'} divide-x divide-y divide-slate-100`}>
        {days.map((d) => {
          const k = dateKey(d);
          const inMonth = view === 'week' || d.getMonth() === cursor.getMonth();
          const dayPosts = (byDate.get(k) ?? []).sort((a, b) => postDate(a).getTime() - postDate(b).getTime());
          const slots = Array.from(slotsByDay.get(d.getDay()) ?? []).sort();

          return (
            <div key={k} className={`group flex flex-col gap-1 p-1.5 ${inMonth ? 'bg-white' : 'bg-slate-50/40'} ${k === todayKey ? 'ring-1 ring-inset ring-brand-300' : ''}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${k === todayKey ? 'bg-brand-600 text-white' : inMonth ? 'text-slate-600' : 'text-slate-300'}`}>
                  {d.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => onCreateAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0))}
                  className="rounded p-0.5 text-slate-300 opacity-0 transition hover:bg-brand-50 hover:text-brand-600 group-hover:opacity-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-1 overflow-hidden">
                {dayPosts.slice(0, view === 'week' ? 8 : 3).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenPost(p)}
                    className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-left shadow-xs hover:border-brand-400"
                  >
                    <StatusDot status={p.status} />
                    <span className="flex -space-x-1">
                      {p.platforms.slice(0, 3).map((pl) => (
                        <span key={pl} className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ backgroundColor: getNetwork(pl)?.brandColor ?? '#64748b' }} />
                      ))}
                    </span>
                    <span className="truncate text-[10px] font-medium text-slate-700">
                      {postDate(p).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {p.content || 'Untitled'}
                    </span>
                  </button>
                ))}
                {dayPosts.length > (view === 'week' ? 8 : 3) && (
                  <span className="pl-1 text-[10px] font-semibold text-slate-400">+{dayPosts.length - (view === 'week' ? 8 : 3)} more</span>
                )}

                {inMonth && slots.filter((t) => !dayPosts.some((p) => postDate(p).toTimeString().slice(0, 5) === t)).slice(0, view === 'week' ? 6 : 2).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const [hh, mm] = t.split(':').map(Number);
                      onCreateAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm));
                    }}
                    className="flex items-center gap-1 rounded-md border border-dashed border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:border-brand-300 hover:text-brand-600"
                  >
                    <Sparkles className="h-2.5 w-2.5" /> {t} slot
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: SocialPost['status'] }) {
  if (status === 'published') return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />;
  if (status === 'scheduled') return <Clock className="h-3 w-3 shrink-0 text-amber-500" />;
  if (status === 'failed') return <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" />;
  return <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />;
}
