import type { EngagementCounts } from '@/lib/home-analytics';
import { formatNumber } from '@/lib/utils';

const STEPS = [
  { key: 'sent' as const, label: 'Sent', color: 'bg-slate-300' },
  { key: 'delivered' as const, label: 'Delivered', color: 'bg-sky-400' },
  { key: 'engaged' as const, label: 'Engaged', color: 'bg-brand-500' },
  { key: 'converted' as const, label: 'Converted', color: 'bg-emerald-500' },
];

export function EngagementFunnel({ counts }: { counts: EngagementCounts }) {
  const max = Math.max(counts.sent, 1);

  return (
    <div className="space-y-3">
      {STEPS.map((step, i) => {
        const value = counts[step.key];
        const width = Math.max(8, (value / max) * 100);
        const prev = i > 0 ? counts[STEPS[i - 1].key] : null;
        const drop =
          prev && prev > 0 ? `${(((prev - value) / prev) * 100).toFixed(0)}% drop` : null;

        return (
          <div key={step.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{step.label}</span>
              <span className="tabular-nums text-slate-900">
                {formatNumber(value)}
                {drop && i > 0 && <span className="ml-2 text-slate-400">{drop}</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${step.color}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
