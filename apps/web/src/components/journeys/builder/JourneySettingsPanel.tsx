import { Button } from '@/components/ui';
import type { Audience } from '@/lib/audiences';
import { JOURNEY_EVENT_TYPES, type JourneySettings } from '@/lib/journey-builder';

type Props = {
  value: JourneySettings;
  audiences: Audience[];
  saving?: boolean;
  saveMessage?: string;
  error?: string;
  onChange: (next: JourneySettings) => void;
  onSave: () => void;
};

const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore'];
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

function EventInput({
  value,
  onChange,
  placeholder,
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <>
      <input
        list="journey-settings-events"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'event_type'}
        className={inputCls}
      />
      <datalist id="journey-settings-events">
        {JOURNEY_EVENT_TYPES.map((ev) => (
          <option key={ev.value} value={ev.value}>
            {ev.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

export function JourneySettingsPanel({
  value,
  audiences,
  saving,
  saveMessage,
  error,
  onChange,
  onSave,
}: Props) {
  const set = (patch: Partial<JourneySettings>) => onChange({ ...value, ...patch });

  return (
    <div className="mx-auto max-w-2xl space-y-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Journey settings</h2>
          <p className="text-xs text-slate-500">Global rules that apply to every customer in the journey.</p>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-rose-600">{error}</span>}
          {saveMessage && <span className="text-xs text-emerald-600">{saveMessage}</span>}
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </div>

      <Section
        title="Global exit criteria"
        desc="Customers leave the journey immediately when any of these is true."
      >
        <label className="block">
          <span className={labelCls}>Exit if in audience</span>
          <select
            value={value.exitCriteria.audienceSlug ?? ''}
            onChange={(e) =>
              set({ exitCriteria: { ...value.exitCriteria, audienceSlug: e.target.value || undefined } })
            }
            className={inputCls}
          >
            <option value="">None</option>
            {audiences.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block">
            <span className={labelCls}>Exit on event</span>
            <EventInput
              value={value.exitCriteria.eventType}
              onChange={(v) =>
                set({ exitCriteria: { ...value.exitCriteria, eventType: v || undefined } })
              }
              placeholder="purchase_completed"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Within (h)</span>
            <input
              type="number"
              min={1}
              value={value.exitCriteria.withinHours ?? ''}
              onChange={(e) =>
                set({
                  exitCriteria: {
                    ...value.exitCriteria,
                    withinHours: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
              className={`${inputCls} w-20`}
            />
          </label>
        </div>
      </Section>

      <Section title="Conversion goal" desc="Measure how many customers complete this action after entering.">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block">
            <span className={labelCls}>Goal event</span>
            <EventInput
              value={value.goal.eventType}
              onChange={(v) => set({ goal: { ...value.goal, eventType: v || undefined } })}
              placeholder="purchase_completed"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Window (h)</span>
            <input
              type="number"
              min={1}
              value={value.goal.windowHours ?? ''}
              onChange={(e) =>
                set({
                  goal: { ...value.goal, windowHours: e.target.value ? Number(e.target.value) : undefined },
                })
              }
              className={`${inputCls} w-20`}
            />
          </label>
        </div>
      </Section>

      <Section title="Quiet hours" desc="Hold channel messages until outside this window.">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.quietHours.enabled}
            onChange={(e) => set({ quietHours: { ...value.quietHours, enabled: e.target.checked } })}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-xs font-medium text-slate-700">Enable quiet hours</span>
        </label>
        {value.quietHours.enabled && (
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className={labelCls}>From</span>
              <input
                type="time"
                value={value.quietHours.start}
                onChange={(e) => set({ quietHours: { ...value.quietHours, start: e.target.value } })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>To</span>
              <input
                type="time"
                value={value.quietHours.end}
                onChange={(e) => set({ quietHours: { ...value.quietHours, end: e.target.value } })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Timezone</span>
              <select
                value={value.quietHours.timezone}
                onChange={(e) => set({ quietHours: { ...value.quietHours, timezone: e.target.value } })}
                className={inputCls}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Section>

      <p className="text-[10px] text-slate-400">
        Re-entry is configured on the <span className="font-semibold">Entry</span> tab. Exit criteria,
        goal and quiet hours are stored on the journey and honored as the runner adds support.
      </p>
    </div>
  );
}
