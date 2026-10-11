import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Compact area chart for operational series (throughput, error rate, …).
 *  Colour comes from `currentColor`; set a text colour on the wrapper. */
export function MiniAreaChart({
  values,
  labels,
  height = 96,
  className,
  valueFormat = (v) => String(Math.round(v)),
  tone = 'brand',
}: {
  values: number[];
  labels?: string[];
  height?: number;
  className?: string;
  valueFormat?: (v: number) => string;
  tone?: 'brand' | 'ok' | 'warn' | 'fail';
}) {
  const gid = useId();
  const toneClass = { brand: 'text-brand-500', ok: 'text-emerald-500', warn: 'text-amber-500', fail: 'text-red-500' }[tone];

  const pts = values.length ? values : [0, 0];
  const w = 100;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const stepX = pts.length > 1 ? w / (pts.length - 1) : w;
  const coords = pts.map((v, i) => [i * stepX, height - ((v - min) / span) * (height - 8) - 4] as const);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];

  return (
    <div className={cn('w-full', toneClass, className)}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-lg font-semibold tabular-nums text-slate-900">{valueFormat(last)}</span>
        <span className="font-mono text-[10px] tabular-nums text-slate-400">peak {valueFormat(max)}</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`series, latest ${valueFormat(last)}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={height - 4} x2={w} y2={height - 4} stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.5" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2" fill="currentColor" />
      </svg>
      {labels && labels.length >= 2 && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}
