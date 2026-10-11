import { useMemo, useState } from 'react';
import { TimelineIcon, timelineAccent, timelineKindLabel } from '@/components/customers/CustomerTimeline';
import type { TimelineItem } from '@/lib/customers';
import { formatRelativeTime } from '@/lib/customers';

type Filter = 'all' | 'event' | 'engagement' | 'form' | 'journey';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All activity' },
  { id: 'event', label: 'Behavior' },
  { id: 'engagement', label: 'Messages' },
  { id: 'form', label: 'Forms' },
  { id: 'journey', label: 'Journeys' },
];

export function CustomerActivityTimeline({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.kind === filter);
  }, [items, filter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">Unified timeline</h3>
          <p className="text-xs text-slate-500">Events, messages, forms, and journeys stitched together</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[640px] overflow-y-auto p-5">
        {!filtered.length ? (
          <p className="py-12 text-center text-sm text-slate-500">No activity recorded for this filter.</p>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([date, dayItems]) => (
              <div key={date}>
                <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{date}</p>
                <div className="relative space-y-0">
                  <div className="absolute bottom-2 left-[19px] top-2 w-px bg-slate-200" />
                  {dayItems.map((item) => (
                    <div key={`${item.kind}-${item.id}`} className="relative flex gap-4 pb-6 last:pb-0">
                      <div
                        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${timelineAccent(item)}`}
                      >
                        <TimelineIcon item={item} />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                            {timelineKindLabel(item)}
                          </span>
                        </div>
                        {item.subtitle && (
                          <p className="mt-0.5 text-xs text-slate-500">{item.subtitle}</p>
                        )}
                        {item.meta && (
                          <p className="mt-1 text-xs text-slate-400">{item.meta}</p>
                        )}
                        {'properties' in item && item.properties && Object.keys(item.properties).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-brand-600 hover:underline">
                              View payload
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[10px] text-slate-100">
                              {JSON.stringify(item.properties, null, 2)}
                            </pre>
                          </details>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">
                          {formatRelativeTime(item.timestamp)} · {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function groupByDate(items: TimelineItem[]): Record<string, TimelineItem[]> {
  const groups: Record<string, TimelineItem[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const item of items) {
    const d = new Date(item.timestamp);
    let label: string;
    if (isSameDay(d, today)) label = 'Today';
    else if (isSameDay(d, yesterday)) label = 'Yesterday';
    else label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return groups;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
