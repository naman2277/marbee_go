import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';

/**
 * Dense operational metric tile: uppercase label, large mono value, optional
 * sub-line and sparkline. Numeric-tabular so columns of digits align.
 */
export function MetricTile({
  label,
  value,
  sub,
  spark,
  sparkTone = 'brand',
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  spark?: number[];
  sparkTone?: 'brand' | 'ok' | 'warn' | 'fail';
  className?: string;
}) {
  const sparkColor = {
    brand: 'text-brand-500',
    ok: 'text-emerald-500',
    warn: 'text-amber-500',
    fail: 'text-red-500',
  }[sparkTone];

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        {spark && spark.length > 1 && <Sparkline values={spark} className={cn('shrink-0', sparkColor)} />}
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
