// Compact standard 5-field cron support (minute hour day-of-month month day-of-week).
// Per field: "*", "a", "a-b", "a-b/n", "star/n", "a,b,c". UTC-based.

type Field = { any: boolean; values: Set<number> };

const RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

function parseField(spec: string, [min, max]: [number, number]): Field {
  if (spec === '*') return { any: true, values: new Set() };
  const values = new Set<number>();
  for (const part of spec.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    let lo = min;
    let hi = max;
    if (rangePart !== '*') {
      const [a, b] = rangePart.split('-');
      lo = parseInt(a, 10);
      hi = b !== undefined ? parseInt(b, 10) : lo;
    }
    for (let v = lo; v <= hi; v += step) if (v >= min && v <= max) values.add(v);
  }
  return { any: false, values };
}

export type ParsedCron = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field } | null;

export function parseCron(expr: string): ParsedCron {
  const parts = (expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return {
      minute: parseField(parts[0], RANGES[0]),
      hour: parseField(parts[1], RANGES[1]),
      dom: parseField(parts[2], RANGES[2]),
      month: parseField(parts[3], RANGES[3]),
      dow: parseField(parts[4], RANGES[4]),
    };
  } catch {
    return null;
  }
}

const hit = (f: Field, v: number) => f.any || f.values.has(v);

/** Next fire time at or after `from` (exclusive of `from` itself). UTC. */
export function cronNext(expr: string, from: Date = new Date()): Date | null {
  const c = parseCron(expr);
  if (!c) return null;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes()));
  d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0);

  for (let i = 0; i < 366 * 24 * 60; i++) {
    const domOk = hit(c.dom, d.getUTCDate());
    const dowOk = hit(c.dow, d.getUTCDay());
    // cron semantics: if both dom and dow are restricted, either may match.
    const dayOk = c.dom.any || c.dow.any ? domOk && dowOk : domOk || dowOk;
    if (
      hit(c.minute, d.getUTCMinutes()) &&
      hit(c.hour, d.getUTCHours()) &&
      hit(c.month, d.getUTCMonth() + 1) &&
      dayOk
    ) {
      return new Date(d);
    }
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function cronDescribe(expr: string): string {
  const c = parseCron(expr);
  if (!c) return expr || 'invalid';
  const [m, h, dom, mon, dow] = expr.trim().split(/\s+/);
  if (m === '*' && h === '*') return 'Every minute';
  if (h === '*' && dom === '*' && mon === '*' && dow === '*') return `Every hour at :${m.padStart(2, '0')}`;
  const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')} UTC`;
  if (dom === '*' && dow === '*' && mon === '*') return `Daily at ${time}`;
  if (dom === '*' && mon === '*' && dow !== '*') {
    const days = dow.includes('-')
      ? dow.split('-').map((x) => DAYS[+x % 7]).join('–')
      : dow.split(',').map((x) => DAYS[+x % 7]).join(', ');
    return `${days} at ${time}`;
  }
  if (dow === '*' && mon === '*') return `Day ${dom} of each month at ${time}`;
  return expr;
}
