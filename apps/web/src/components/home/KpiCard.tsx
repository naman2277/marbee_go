import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type KpiCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: number | null;
  deltaLabel?: string;
  accent?: 'orange' | 'emerald' | 'sky' | 'violet' | 'purple' | 'indigo';
  subtitle?: string;
};

const ACCENT: Record<NonNullable<KpiCardProps['accent']>, string> = {
  orange: 'from-orange-500/10 to-amber-500/5 text-orange-600',
  emerald: 'from-emerald-500/10 to-teal-500/5 text-emerald-600',
  sky: 'from-sky-500/10 to-cyan-500/5 text-sky-600',
  violet: 'from-violet-500/10 to-purple-500/5 text-violet-600',
  purple: 'from-purple-500/10 to-indigo-500/5 text-purple-600',
  indigo: 'from-indigo-500/10 to-blue-500/5 text-indigo-600',
};

export function KpiCard({ label, value, icon: Icon, delta, deltaLabel = 'vs yesterday', accent = 'orange', subtitle }: KpiCardProps) {
  const deltaText =
    delta === null || delta === undefined
      ? null
      : delta === 0
        ? `No change ${deltaLabel}`
        : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}% ${deltaLabel}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', ACCENT[accent])} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm', ACCENT[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {deltaText && (
          <p
            className={cn(
              'mt-3 text-xs font-medium',
              delta === 0 ? 'text-slate-500' : (delta ?? 0) > 0 ? 'text-emerald-600' : 'text-red-600',
            )}
          >
            {deltaText}
          </p>
        )}
      </div>
    </div>
  );
}
