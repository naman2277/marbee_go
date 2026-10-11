import { cn } from '@/lib/utils';

/**
 * Canonical operational tones for the ingestion console.
 * State is encoded in shape (pill + dot + label) as well as colour so it
 * survives greyscale and colour-blindness.
 */
export type StatusTone = 'ok' | 'run' | 'warn' | 'fail' | 'idle';

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20',
  run: 'text-blue-700 bg-blue-50 ring-blue-600/20',
  warn: 'text-amber-700 bg-amber-50 ring-amber-600/20',
  fail: 'text-red-700 bg-red-50 ring-red-600/20',
  idle: 'text-slate-600 bg-slate-100 ring-slate-500/20',
};

const TONE_DOT: Record<StatusTone, string> = {
  ok: 'bg-emerald-500',
  run: 'bg-blue-500',
  warn: 'bg-amber-500',
  fail: 'bg-red-500',
  idle: 'bg-slate-400',
};

/** Map any raw status string coming from the DB to a canonical tone + label. */
export function toneForStatus(raw: string | null | undefined): { tone: StatusTone; label: string } {
  const s = (raw ?? '').toLowerCase().trim();
  if (!s) return { tone: 'idle', label: 'Unknown' };

  if (['completed', 'success', 'succeeded', 'done', 'active', 'connected', 'healthy'].includes(s))
    return { tone: 'ok', label: cap(s === 'active' || s === 'connected' ? 'connected' : 'completed') };
  if (['running', 'processing', 'syncing', 'in_progress', 'started', 'queued', 'pending'].includes(s))
    return { tone: s === 'queued' || s === 'pending' ? 'idle' : 'run', label: cap(s === 'in_progress' ? 'running' : s) };
  if (['partial', 'partially_completed', 'partial_success', 'delayed', 'rate_limited', 'warning', 'stale'].includes(s))
    return { tone: 'warn', label: cap(s.replace(/_/g, ' ')) };
  if (['failed', 'error', 'errored', 'cancelled', 'canceled', 'auth_expired', 'disconnected'].includes(s))
    return { tone: 'fail', label: cap(s.replace(/_/g, ' ')) };
  if (['paused', 'inactive', 'disabled', 'draft', 'archived'].includes(s))
    return { tone: 'idle', label: cap(s) };

  return { tone: 'idle', label: cap(s.replace(/_/g, ' ')) };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusPill({
  status,
  tone,
  label,
  className,
}: {
  /** Raw DB status — resolved to a tone/label automatically. */
  status?: string | null;
  /** Or set the tone explicitly. */
  tone?: StatusTone;
  /** Override the displayed text. */
  label?: string;
  className?: string;
}) {
  const resolved = status !== undefined ? toneForStatus(status) : { tone: tone ?? 'idle', label: label ?? '' };
  const t = tone ?? resolved.tone;
  const text = label ?? resolved.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[t],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[t])} />
      {text}
    </span>
  );
}
