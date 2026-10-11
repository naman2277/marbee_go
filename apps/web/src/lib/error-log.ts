/* Best-effort parsing of the free-form `error_log` JSONB array carried by
   connector_runs / data_job_runs. Entries may be strings or objects with
   assorted key names, so we normalise defensively. */

export type ErrorEntry = {
  message: string;
  cause: string;
  record?: string | number;
  raw: unknown;
};

export type ErrorCause = { label: string; count: number };

function truncate(s: string, n = 80): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function parseErrorLog(log: unknown): ErrorEntry[] {
  if (!Array.isArray(log)) return [];
  return log.map((entry) => {
    if (typeof entry === 'string') return { message: truncate(entry, 200), cause: truncate(entry), raw: entry };
    if (entry && typeof entry === 'object') {
      const o = entry as Record<string, unknown>;
      const message = str(o.message ?? o.error ?? o.detail ?? o.reason) ?? 'Unspecified error';
      const cause = str(o.reason ?? o.code ?? o.type ?? o.rule ?? o.error) ?? message;
      const record = (typeof o.record === 'string' || typeof o.record === 'number')
        ? o.record
        : (typeof o.row === 'number' ? o.row : typeof o.id === 'string' ? o.id : undefined);
      return { message: truncate(message, 200), cause: truncate(cause), record, raw: entry };
    }
    return { message: 'Unparseable error entry', cause: 'unknown', raw: entry };
  });
}

export function groupErrorCauses(entries: ErrorEntry[], max = 6): ErrorCause[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.cause, (counts.get(e.cause) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
