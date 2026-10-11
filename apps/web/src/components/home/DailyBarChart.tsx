import type { DailyVolume } from '@/lib/home-analytics';
import { formatNumber } from '@/lib/utils';

export function DailyBarChart({ data }: { data: DailyVolume[] }) {
  const max = Math.max(...data.map((d) => d.sent), 1);
  const peak = Math.max(...data.map((d) => d.sent), 0);

  return (
    <div>
      <div className="flex h-44 items-end gap-2">
      {data.map((day) => {
        const sentHeight = Math.max(4, (day.sent / max) * 100);
        const engagedHeight = day.sent ? Math.max(2, (day.engaged / day.sent) * sentHeight) : 0;

        return (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
            <div className="relative flex h-32 w-full items-end justify-center">
              <div
                className="w-full max-w-[2rem] rounded-t-md bg-slate-200"
                style={{ height: `${sentHeight}%` }}
                title={`${day.sent} sent`}
              />
              {engagedHeight > 0 && (
                <div
                  className="absolute bottom-0 w-full max-w-[2rem] rounded-t-md bg-brand-500"
                  style={{ height: `${engagedHeight}%` }}
                  title={`${day.engaged} engaged`}
                />
              )}
            </div>
            <span className="text-center text-[10px] font-medium leading-tight text-slate-500">
              {day.label.split(',')[0]}
            </span>
          </div>
        );
      })}
      {!data.length && (
        <p className="flex h-full w-full items-center justify-center text-sm text-slate-400">No data for this period</p>
      )}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />
          Sent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />
          Engaged
        </span>
        {peak > 0 && <span className="ml-auto tabular-nums">Peak day: {formatNumber(peak)} sent</span>}
      </div>
    </div>
  );
}
