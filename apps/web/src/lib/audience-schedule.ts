/** Structured refresh schedule stored in audiences.refresh_cron as @sch:{json} or legacy cron */

export type ScheduleFrequency =
  | 'manual'
  | 'every_n_minutes'
  | 'hourly'
  | 'daily'
  | 'multi_daily'
  | 'weekly'
  | 'monthly'
  | 'yearly';

export type RefreshSchedule = {
  frequency: ScheduleFrequency;
  /** Minutes between runs — every_n_minutes */
  intervalMinutes?: number;
  /** Minute past the hour — hourly */
  minute?: number;
  /** HH:mm — daily / weekly / monthly / yearly */
  time?: string;
  /** Multiple HH:mm — several times per day */
  times?: string[];
  /** 0=Sun … 6=Sat — weekly fixed days */
  daysOfWeek?: number[];
  /** 1–31 — monthly */
  dayOfMonth?: number;
  /** 1–12 — yearly */
  month?: number;
};

const PREFIX = '@sch:';

export const SCHEDULE_FREQUENCY_OPTIONS: {
  id: ScheduleFrequency;
  label: string;
  description: string;
}[] = [
  { id: 'every_n_minutes', label: 'Every N minutes', description: 'Run several times an hour' },
  { id: 'hourly', label: 'Hourly', description: 'Once every hour at a fixed minute' },
  { id: 'multi_daily', label: 'Several times a day', description: 'Pick multiple times each day' },
  { id: 'daily', label: 'Daily', description: 'Once per day at a set time' },
  { id: 'weekly', label: 'Weekly', description: 'Fixed days of the week' },
  { id: 'monthly', label: 'Monthly', description: 'Same day each month' },
  { id: 'yearly', label: 'Yearly', description: 'Once per year on a fixed date' },
];

export const INTERVAL_MINUTE_PRESETS = [5, 10, 15, 20, 30, 45, 60] as const;

export const WEEKDAY_LABELS = [
  { value: 0, short: 'Sun', label: 'Sunday' },
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
] as const;

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function defaultSchedule(): RefreshSchedule {
  return { frequency: 'hourly', minute: 0 };
}

export function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Legacy cron → schedule */
function legacyCronToSchedule(cron: string): RefreshSchedule | null {
  const map: Record<string, RefreshSchedule> = {
    '*/5 * * * *': { frequency: 'every_n_minutes', intervalMinutes: 5 },
    '*/10 * * * *': { frequency: 'every_n_minutes', intervalMinutes: 10 },
    '*/15 * * * *': { frequency: 'every_n_minutes', intervalMinutes: 15 },
    '*/20 * * * *': { frequency: 'every_n_minutes', intervalMinutes: 20 },
    '*/30 * * * *': { frequency: 'every_n_minutes', intervalMinutes: 30 },
    '*/45 * * * *': { frequency: 'every_n_minutes', intervalMinutes: 45 },
    '0 * * * *': { frequency: 'hourly', minute: 0 },
    '0 */6 * * *': { frequency: 'every_n_minutes', intervalMinutes: 360 },
    '0 2 * * *': { frequency: 'daily', time: '02:00' },
    '0 3 * * 1': { frequency: 'weekly', daysOfWeek: [1], time: '03:00' },
  };
  return map[cron] ?? null;
}

export function parseRefreshSchedule(stored: string | null | undefined): RefreshSchedule | null {
  if (!stored) return null;
  if (stored.startsWith(PREFIX)) {
    try {
      return JSON.parse(stored.slice(PREFIX.length)) as RefreshSchedule;
    } catch {
      return null;
    }
  }
  return legacyCronToSchedule(stored);
}

export function serializeRefreshSchedule(schedule: RefreshSchedule): string {
  if (schedule.frequency === 'manual') return '';
  return `${PREFIX}${JSON.stringify(schedule)}`;
}

export function scheduleLabel(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const sch = parseRefreshSchedule(stored);
  if (!sch || sch.frequency === 'manual') return null;
  return describeSchedule(sch);
}

export function describeSchedule(sch: RefreshSchedule): string {
  switch (sch.frequency) {
    case 'every_n_minutes':
      if (sch.intervalMinutes === 60) return 'Every hour';
      if (sch.intervalMinutes && sch.intervalMinutes >= 60 && sch.intervalMinutes % 60 === 0) {
        return `Every ${sch.intervalMinutes / 60} hours`;
      }
      return `Every ${sch.intervalMinutes ?? 15} minutes`;
    case 'hourly':
      return sch.minute ? `Hourly at :${String(sch.minute).padStart(2, '0')}` : 'Every hour';
    case 'daily':
      return `Daily at ${sch.time ?? '00:00'}`;
    case 'multi_daily': {
      const times = sch.times?.length ? sch.times.join(', ') : '09:00';
      return `${sch.times?.length ?? 1}× daily (${times})`;
    }
    case 'weekly': {
      const days = (sch.daysOfWeek ?? [1])
        .map((d) => WEEKDAY_LABELS.find((w) => w.value === d)?.short ?? String(d))
        .join(', ');
      return `${days} at ${sch.time ?? '09:00'}`;
    }
    case 'monthly':
      return `Monthly on day ${sch.dayOfMonth ?? 1} at ${sch.time ?? '09:00'}`;
    case 'yearly': {
      const mo = MONTH_LABELS[(sch.month ?? 1) - 1] ?? 'January';
      return `Yearly ${mo} ${sch.dayOfMonth ?? 1} at ${sch.time ?? '09:00'}`;
    }
    default:
      return 'Custom schedule';
  }
}

function msSinceLast(lastRefreshedAt: string | null | undefined): number {
  const last = lastRefreshedAt ? new Date(lastRefreshedAt).getTime() : 0;
  return Date.now() - last;
}

function isDueByInterval(elapsed: number, intervalMs: number, neverRun: boolean): boolean {
  if (neverRun) return true;
  return elapsed >= intervalMs;
}

function isDueAtTime(
  lastRefreshedAt: string | null | undefined,
  hour: number,
  minute: number,
  extraMatch?: (d: Date) => boolean,
): boolean {
  const now = new Date();
  if (extraMatch && !extraMatch(now)) return false;

  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (now < target) return false;

  if (!lastRefreshedAt) return true;
  const last = new Date(lastRefreshedAt);
  return last < target;
}

export function isScheduleDue(
  stored: string | null | undefined,
  lastRefreshedAt: string | null | undefined,
  autoRefresh: boolean,
): boolean {
  if (!autoRefresh || !stored) return false;

  const sch = parseRefreshSchedule(stored);
  if (!sch) {
    // Unknown legacy cron — default 1h
    return isDueByInterval(msSinceLast(lastRefreshedAt), 60 * 60_000, !lastRefreshedAt);
  }

  const elapsed = msSinceLast(lastRefreshedAt);
  const neverRun = !lastRefreshedAt;

  switch (sch.frequency) {
    case 'every_n_minutes':
      return isDueByInterval(elapsed, (sch.intervalMinutes ?? 15) * 60_000, neverRun);
    case 'hourly':
      return isDueByInterval(elapsed, 60 * 60_000, neverRun);
    case 'daily': {
      const { hour, minute } = parseTime(sch.time ?? '00:00');
      return isDueAtTime(lastRefreshedAt, hour, minute);
    }
    case 'multi_daily': {
      const times = sch.times?.length ? sch.times : ['09:00'];
      return times.some((t) => {
        const { hour, minute } = parseTime(t);
        return isDueAtTime(lastRefreshedAt, hour, minute);
      });
    }
    case 'weekly': {
      const days = sch.daysOfWeek?.length ? sch.daysOfWeek : [1];
      const { hour, minute } = parseTime(sch.time ?? '09:00');
      return days.some((day) =>
        isDueAtTime(lastRefreshedAt, hour, minute, (d) => d.getDay() === day),
      );
    }
    case 'monthly': {
      const dom = sch.dayOfMonth ?? 1;
      const { hour, minute } = parseTime(sch.time ?? '09:00');
      return isDueAtTime(lastRefreshedAt, hour, minute, (d) => d.getDate() === dom);
    }
    case 'yearly': {
      const mo = (sch.month ?? 1) - 1;
      const dom = sch.dayOfMonth ?? 1;
      const { hour, minute } = parseTime(sch.time ?? '09:00');
      return isDueAtTime(
        lastRefreshedAt,
        hour,
        minute,
        (d) => d.getMonth() === mo && d.getDate() === dom,
      );
    }
    default:
      return false;
  }
}

export function schedulePollIntervalMs(stored: string | null | undefined): number {
  const sch = parseRefreshSchedule(stored);
  if (!sch) return 60_000;
  switch (sch.frequency) {
    case 'every_n_minutes':
      return Math.min((sch.intervalMinutes ?? 15) * 60_000, 60_000);
    case 'hourly':
      return 60_000;
    case 'multi_daily':
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'yearly':
      return 60_000;
    default:
      return 60_000;
  }
}
