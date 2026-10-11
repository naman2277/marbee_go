import { useMemo } from 'react';
import {
  CalendarClock,
  Database,
  Repeat2,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';
import type { Audience } from '@/lib/audiences';
import {
  ENTRY_SOURCE_LABELS,
  JOURNEY_EVENT_TYPES,
  type EntryConfig,
  type EntrySourceType,
  type JourneyReEntryMode,
} from '@/lib/journey-builder';

type Props = {
  value: EntryConfig;
  audiences: Audience[];
  journeyStatus: string;
  onChange: (next: EntryConfig) => void;
};

const SOURCE_TILES: {
  id: EntrySourceType;
  icon: typeof Users;
  blurb: string;
}[] = [
  { id: 'audience', icon: Users, blurb: 'Batch-read an audience / segment on a schedule' },
  { id: 'event', icon: Zap, blurb: 'Enter in real time when a behavioural event fires' },
  { id: 'schedule', icon: CalendarClock, blurb: 'One-time or recurring scheduled entry' },
  { id: 'api', icon: Database, blurb: 'An external system enrolls profiles via the API' },
];

const RE_ENTRY: { id: JourneyReEntryMode; label: string; desc: string }[] = [
  { id: 'none', label: 'No re-entry', desc: 'A customer can go through this journey only once.' },
  { id: 'anytime', label: 'Re-entry anytime', desc: 'A customer can re-enter even while still active.' },
  {
    id: 'after_exit',
    label: 'Re-entry after exit',
    desc: 'A customer can re-enter once they have exited a previous run.',
  },
];

const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {desc && <p className="mt-0.5 text-xs text-slate-500">{desc}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Parse "min hour dom mon dow" into the simple recurring builder fields. */
function parseCron(cron?: string): { time: string; weekday: number } {
  const parts = (cron ?? '0 9 * * 1').split(/\s+/);
  const min = Number(parts[0] ?? 0);
  const hour = Number(parts[1] ?? 9);
  const dow = parts[4] === '*' ? 1 : Number(parts[4] ?? 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { time: `${pad(hour)}:${pad(min)}`, weekday: Number.isFinite(dow) ? dow : 1 };
}

function buildCron(time: string, weekday: number): string {
  const [h, m] = time.split(':');
  return `${Number(m ?? 0)} ${Number(h ?? 9)} * * ${weekday}`;
}

export function JourneyEntryPanel({ value, audiences, journeyStatus, onChange }: Props) {
  const locked = journeyStatus === 'published';
  const set = (patch: Partial<EntryConfig>) => onChange({ ...value, ...patch });
  const setSchedule = (patch: Partial<NonNullable<EntryConfig['schedule']>>) =>
    onChange({
      ...value,
      schedule: {
        mode: value.schedule?.mode ?? 'one_time',
        timezone: value.schedule?.timezone ?? 'Asia/Kolkata',
        ...value.schedule,
        ...patch,
      },
    });

  const selectedAudience = useMemo(
    () => audiences.find((a) => a.slug === value.audienceSlug),
    [audiences, value.audienceSlug],
  );
  const cronFields = parseCron(value.schedule?.cron);

  return (
    <div className="mx-auto max-w-2xl space-y-4 overflow-y-auto p-6">
      {locked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This journey is published. Changing the entry source needs a new draft version.
        </div>
      )}

      <Section title="How customers enter" desc="Pick the source that brings profiles into this journey.">
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_TILES.map((tile) => {
            const active = value.sourceType === tile.id;
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                disabled={locked && !active}
                onClick={() => set({ sourceType: tile.id })}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                    : 'border-slate-200 hover:border-slate-300 disabled:opacity-50'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
                <p className="mt-1.5 text-xs font-semibold text-slate-900">
                  {ENTRY_SOURCE_LABELS[tile.id]}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{tile.blurb}</p>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={locked && value.sourceType !== 'subscription'}
          onClick={() => set({ sourceType: 'subscription' })}
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
            value.sourceType === 'subscription' ? 'text-brand-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Repeat2 className="h-3.5 w-3.5" />
          Use information-service subscribers instead
        </button>
      </Section>

      {(value.sourceType === 'audience' || value.sourceType === 'subscription') && (
        <Section
          title="Selection criteria"
          desc="Which profiles qualify to enter."
        >
          <label className="block">
            <span className={labelCls}>Entry audience</span>
            <select
              value={value.audienceSlug ?? ''}
              onChange={(e) => {
                const a = audiences.find((x) => x.slug === e.target.value);
                set({ audienceSlug: e.target.value, audienceName: a?.name ?? '' });
              }}
              className={inputCls}
            >
              <option value="">Select audience…</option>
              {audiences.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                  {a.member_count != null ? ` (${a.member_count.toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelCls}>Additional filter (advisory)</span>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5">
              <input
                placeholder="field"
                value={extraField(value.extraFilter)}
                onChange={(e) =>
                  set({ extraFilter: mkExtraFilter(e.target.value, extraOp(value.extraFilter), extraValue(value.extraFilter)) })
                }
                className={inputCls}
              />
              <select
                value={extraOp(value.extraFilter)}
                onChange={(e) =>
                  set({ extraFilter: mkExtraFilter(extraField(value.extraFilter), e.target.value, extraValue(value.extraFilter)) })
                }
                className={inputCls}
              >
                <option value="equals">=</option>
                <option value="not_equals">≠</option>
                <option value="contains">contains</option>
              </select>
              <input
                placeholder="value"
                value={extraValue(value.extraFilter)}
                onChange={(e) =>
                  set({ extraFilter: mkExtraFilter(extraField(value.extraFilter), extraOp(value.extraFilter), e.target.value) })
                }
                className={inputCls}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Stored on the journey. Enrollment currently applies the audience definition itself; this
              extra rule is advisory until the runner enforces it.
            </p>
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Qualified profiles
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {selectedAudience?.member_count != null
                ? selectedAudience.member_count.toLocaleString()
                : '—'}
            </p>
            <p className="text-[10px] text-slate-400">
              {selectedAudience
                ? 'As of the audience’s last refresh'
                : 'Select an audience to see the estimate'}
            </p>
          </div>
        </Section>
      )}

      {value.sourceType === 'event' && (
        <Section title="Entry event" desc="Profiles enter the moment this event is received.">
          <label className="block">
            <span className={labelCls}>Event type</span>
            <input
              list="journey-entry-events"
              value={value.eventType ?? ''}
              onChange={(e) => set({ eventType: e.target.value })}
              placeholder="cart_abandoned"
              className={inputCls}
            />
            <datalist id="journey-entry-events">
              {JOURNEY_EVENT_TYPES.map((ev) => (
                <option key={ev.value} value={ev.value}>
                  {ev.label}
                </option>
              ))}
            </datalist>
          </label>
        </Section>
      )}

      {value.sourceType === 'api' && (
        <Section title="API entry" desc="An external system calls the journey-enter API with profile ids.">
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>
              No selection criteria — the caller decides who enters. Use the journey id as the
              enrollment key.
            </span>
          </div>
        </Section>
      )}

      <Section title="Re-entry" desc="Whether a customer can go through this journey more than once.">
        <div className="space-y-1.5">
          {RE_ENTRY.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${
                value.reEntry === r.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200'
              }`}
            >
              <input
                type="radio"
                name="journey-reentry"
                checked={value.reEntry === r.id}
                onChange={() => set({ reEntry: r.id })}
                className="mt-0.5"
              />
              <span>
                <span className="block text-xs font-semibold text-slate-800">{r.label}</span>
                <span className="block text-[10px] text-slate-500">{r.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section
        title="Schedule"
        desc={
          value.sourceType === 'schedule'
            ? 'When entry runs.'
            : 'Optional active window for this journey.'
        }
      >
        <div className="flex gap-1.5">
          {(['one_time', 'recurring'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSchedule({ mode: m })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                (value.schedule?.mode ?? 'one_time') === m
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {m === 'one_time' ? 'One time' : 'Recurring'}
            </button>
          ))}
        </div>

        {(value.schedule?.mode ?? 'one_time') === 'one_time' ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelCls}>Starts</span>
              <input
                type="datetime-local"
                value={toLocalInput(value.schedule?.startsAt)}
                onChange={(e) => setSchedule({ startsAt: fromLocalInput(e.target.value) })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Ends</span>
              <input
                type="datetime-local"
                value={toLocalInput(value.schedule?.endsAt)}
                onChange={(e) => setSchedule({ endsAt: fromLocalInput(e.target.value) })}
                className={inputCls}
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelCls}>Day</span>
              <select
                value={cronFields.weekday}
                onChange={(e) => setSchedule({ cron: buildCron(cronFields.time, Number(e.target.value)) })}
                className={inputCls}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Time</span>
              <input
                type="time"
                value={cronFields.time}
                onChange={(e) => setSchedule({ cron: buildCron(e.target.value, cronFields.weekday) })}
                className={inputCls}
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className={labelCls}>Timezone</span>
          <select
            value={value.schedule?.timezone ?? 'Asia/Kolkata'}
            onChange={(e) => setSchedule({ timezone: e.target.value })}
            className={inputCls}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
      </Section>
    </div>
  );
}

/* --- tiny helpers for the advisory single-rule extra filter --- */
type ExtraRule = { field?: string; op?: string; value?: string };
function asRule(f: unknown): ExtraRule {
  return f && typeof f === 'object' ? (f as ExtraRule) : {};
}
function extraField(f: unknown) {
  return asRule(f).field ?? '';
}
function extraOp(f: unknown) {
  return asRule(f).op ?? 'equals';
}
function extraValue(f: unknown) {
  return asRule(f).value ?? '';
}
function mkExtraFilter(field: string, op: string, value: string): ExtraRule | null {
  if (!field && !value) return null;
  return { field, op, value };
}

function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
