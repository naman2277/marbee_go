import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { cronDescribe, cronNext, parseCron } from '@/lib/cron';

/* A friendly cron editor: presets + a common-case builder + raw expression,
   with a live "next runs" preview. Emits a standard 5-field cron string. */

const PRESETS: { label: string; cron: string }[] = [
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily · 02:00', cron: '0 2 * * *' },
  { label: 'Weekdays · 07:00', cron: '0 7 * * 1-5' },
  { label: 'Weekly · Mon 03:00', cron: '0 3 * * 1' },
  { label: 'Monthly · 1st 00:00', cron: '0 0 1 * *' },
];

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'];

export function CronEditor({
  value,
  onChange,
  tz,
  onTzChange,
}: {
  value: string;
  onChange: (cron: string) => void;
  tz?: string;
  onTzChange?: (tz: string) => void;
}) {
  const [mode, setMode] = useState<'preset' | 'raw'>('raw');
  const parsed = useMemo(() => parseCron(value), [value]);

  const nextRuns = useMemo(() => {
    if (!parsed) return [];
    const out: Date[] = [];
    let cursor = new Date();
    for (let i = 0; i < 5; i++) {
      const n = cronNext(value, cursor);
      if (!n) break;
      out.push(n);
      cursor = n;
    }
    return out;
  }, [value, parsed]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
        {(['preset', 'raw'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md px-3 py-1 font-medium capitalize',
              mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {m === 'preset' ? 'Presets' : 'Expression'}
          </button>
        ))}
      </div>

      {mode === 'preset' ? (
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.cron}
              type="button"
              onClick={() => onChange(p.cron)}
              className={cn(
                'rounded-lg border px-2.5 py-1.5 text-xs font-medium',
                value === p.cron
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0 2 * * *"
          className={cn(
            'w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2',
            parsed || !value
              ? 'border-slate-200 focus:border-brand-300 focus:ring-brand-100'
              : 'border-red-300 focus:border-red-400 focus:ring-red-100',
          )}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className={cn(
            'rounded-md px-2 py-1 font-medium',
            parsed ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600',
          )}
        >
          {value ? cronDescribe(value) : 'no schedule'}
        </span>
        {onTzChange && (
          <label className="flex items-center gap-1.5 text-slate-500">
            Timezone
            <select
              value={tz ?? 'UTC'}
              onChange={(e) => onTzChange(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            >
              {TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {nextRuns.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Next 5 runs (UTC)</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-slate-600">
            {nextRuns.map((d) => (
              <li key={d.toISOString()}>
                {d.toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'UTC',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
