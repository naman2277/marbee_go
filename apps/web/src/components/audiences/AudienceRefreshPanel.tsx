import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  defaultSchedule,
  describeSchedule,
  formatTime,
  INTERVAL_MINUTE_PRESETS,
  MONTH_LABELS,
  parseRefreshSchedule,
  parseTime,
  SCHEDULE_FREQUENCY_OPTIONS,
  serializeRefreshSchedule,
  WEEKDAY_LABELS,
  type RefreshSchedule,
  type ScheduleFrequency,
} from '@/lib/audience-schedule';
import { formatRelativeTime, updateAudience, type Audience } from '@/lib/audiences';

type Props = {
  audience: Audience;
  onUpdated?: () => void;
};

export function AudienceRefreshPanel({ audience, onUpdated }: Props) {
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(audience.auto_refresh);
  const [schedule, setSchedule] = useState<RefreshSchedule>(() =>
    parseRefreshSchedule(audience.refresh_cron) ?? defaultSchedule(),
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setAutoRefresh(audience.auto_refresh);
    setSchedule(parseRefreshSchedule(audience.refresh_cron) ?? defaultSchedule());
    setDirty(false);
  }, [audience.id, audience.auto_refresh, audience.refresh_cron]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const refresh_cron = autoRefresh ? serializeRefreshSchedule(schedule) : audience.refresh_cron;
      return updateAudience(audience.id, { auto_refresh: autoRefresh, refresh_cron });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audience', audience.id] });
      queryClient.invalidateQueries({ queryKey: ['audiences'] });
      setDirty(false);
      onUpdated?.();
    },
  });

  const patch = (next: Partial<RefreshSchedule>) => {
    setSchedule((s) => ({ ...s, ...next }));
    setDirty(true);
  };

  const setFrequency = (frequency: ScheduleFrequency) => {
    const base: RefreshSchedule = { frequency };
    switch (frequency) {
      case 'every_n_minutes':
        base.intervalMinutes = 15;
        break;
      case 'hourly':
        base.minute = 0;
        break;
      case 'daily':
        base.time = '09:00';
        break;
      case 'multi_daily':
        base.times = ['09:00', '14:00', '18:00'];
        break;
      case 'weekly':
        base.daysOfWeek = [1, 3, 5];
        base.time = '09:00';
        break;
      case 'monthly':
        base.dayOfMonth = 1;
        base.time = '09:00';
        break;
      case 'yearly':
        base.month = 1;
        base.dayOfMonth = 1;
        base.time = '09:00';
        break;
    }
    setSchedule(base);
    setDirty(true);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Refresh schedule</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Customise how often member counts recompute from live schema data
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <label className="flex cursor-pointer items-center justify-between rounded-xl border-2 border-slate-200 px-4 py-3.5 transition hover:border-violet-200 hover:bg-violet-50/30 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50/50">
          <div className="flex items-center gap-3">
            <Zap className={`h-5 w-5 ${autoRefresh ? 'text-amber-500' : 'text-slate-400'}`} />
            <div>
              <p className="text-sm font-semibold text-slate-800">Auto refresh</p>
              <p className="text-xs text-slate-500">Runs on schedule while Marbee is open</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => {
              setAutoRefresh(e.target.checked);
              setDirty(true);
            }}
            className="h-5 w-5 rounded border-slate-300 text-violet-600"
          />
        </label>

        {autoRefresh && (
          <>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Frequency</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCHEDULE_FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFrequency(opt.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      schedule.frequency === opt.id
                        ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                        : 'border-slate-200 hover:border-violet-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                    <p className="text-[11px] text-slate-500">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {schedule.frequency === 'every_n_minutes' && (
              <Field label="Interval">
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_MINUTE_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => patch({ intervalMinutes: m })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                        schedule.intervalMinutes === m
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Custom:</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={schedule.intervalMinutes ?? 15}
                    onChange={(e) => patch({ intervalMinutes: Number(e.target.value) })}
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-slate-500">minutes</span>
                </div>
              </Field>
            )}

            {schedule.frequency === 'hourly' && (
              <Field label="Run at minute past the hour">
                <select
                  value={schedule.minute ?? 0}
                  onChange={(e) => patch({ minute: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i} value={i}>:{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
              </Field>
            )}

            {schedule.frequency === 'daily' && (
              <Field label="Time of day">
                <TimeInput value={schedule.time ?? '09:00'} onChange={(time) => patch({ time })} />
              </Field>
            )}

            {schedule.frequency === 'multi_daily' && (
              <Field label="Times per day">
                <div className="space-y-2">
                  {(schedule.times ?? ['09:00']).map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TimeInput
                        value={t}
                        onChange={(time) => {
                          const times = [...(schedule.times ?? ['09:00'])];
                          times[i] = time;
                          patch({ times });
                        }}
                      />
                      {(schedule.times?.length ?? 1) > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const times = (schedule.times ?? []).filter((_, j) => j !== i);
                            patch({ times: times.length ? times : ['09:00'] });
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => patch({ times: [...(schedule.times ?? ['09:00']), '12:00'] })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add time slot
                  </Button>
                </div>
              </Field>
            )}

            {schedule.frequency === 'weekly' && (
              <>
                <Field label="Fixed days">
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((d) => {
                      const selected = (schedule.daysOfWeek ?? []).includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => {
                            const cur = schedule.daysOfWeek ?? [];
                            const next = selected
                              ? cur.filter((x) => x !== d.value)
                              : [...cur, d.value].sort();
                            patch({ daysOfWeek: next.length ? next : [d.value] });
                          }}
                          className={`rounded-lg px-3 py-2 text-sm font-medium ${
                            selected
                              ? 'bg-violet-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Time">
                  <TimeInput value={schedule.time ?? '09:00'} onChange={(time) => patch({ time })} />
                </Field>
              </>
            )}

            {schedule.frequency === 'monthly' && (
              <>
                <Field label="Day of month">
                  <select
                    value={schedule.dayOfMonth ?? 1}
                    onChange={(e) => patch({ dayOfMonth: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Time">
                  <TimeInput value={schedule.time ?? '09:00'} onChange={(time) => patch({ time })} />
                </Field>
              </>
            )}

            {schedule.frequency === 'yearly' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Month">
                    <select
                      value={schedule.month ?? 1}
                      onChange={(e) => patch({ month: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      {MONTH_LABELS.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Day">
                    <select
                      value={schedule.dayOfMonth ?? 1}
                      onChange={(e) => patch({ dayOfMonth: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Time">
                  <TimeInput value={schedule.time ?? '09:00'} onChange={(time) => patch({ time })} />
                </Field>
              </>
            )}

            <div className="rounded-xl bg-violet-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Summary</p>
              <p className="mt-1 text-sm font-medium text-violet-900">{describeSchedule(schedule)}</p>
            </div>
          </>
        )}

        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <RefreshCw className="h-4 w-4 text-slate-400" />
            <span>
              Last refreshed:{' '}
              <strong className="text-slate-800">
                {audience.last_refreshed_at ? formatRelativeTime(audience.last_refreshed_at) : 'Never'}
              </strong>
            </span>
          </div>
        </div>

        {(dirty || saveMutation.isPending) && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save schedule'}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { hour, minute } = parseTime(value);
  return (
    <input
      type="time"
      value={formatTime(hour, minute)}
      onChange={(e) => onChange(e.target.value || '00:00')}
      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
    />
  );
}
