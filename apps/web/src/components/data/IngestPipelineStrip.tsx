import { cn } from '@/lib/utils';

/**
 * The core loop every ingestion screen supports:
 * source → schema → transform → destination → outcome.
 * Reused as a breadcrumb on the wizard, connector details, and sync monitor.
 */
export const PIPELINE_STAGES = [
  { key: 'source', label: 'Source', hint: 'where data originates' },
  { key: 'schema', label: 'Schema', hint: 'shape & types discovered' },
  { key: 'transform', label: 'Transform', hint: 'map, cast, validate' },
  { key: 'destination', label: 'Destination', hint: 'where it lands' },
  { key: 'outcome', label: 'Outcome', hint: 'succeeded / failed / retry' },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]['key'];

export function IngestPipelineStrip({
  active,
  showHints = false,
  className,
}: {
  active?: PipelineStageKey;
  showHints?: boolean;
  className?: string;
}) {
  const activeIndex = active ? PIPELINE_STAGES.findIndex((s) => s.key === active) : -1;

  return (
    <ol className={cn('flex flex-wrap items-stretch overflow-hidden rounded-lg border border-slate-200', className)}>
      {PIPELINE_STAGES.map((stage, i) => {
        const isActive = i === activeIndex;
        const isDone = activeIndex > -1 && i < activeIndex;
        return (
          <li
            key={stage.key}
            className={cn(
              'flex-1 basis-28 border-r border-slate-200 px-3 py-2 text-center last:border-r-0',
              isActive && 'bg-brand-50',
              isDone && 'bg-slate-50',
            )}
          >
            <span
              className={cn(
                'block font-mono text-[11px] font-semibold uppercase tracking-wide',
                isActive ? 'text-brand-700' : isDone ? 'text-slate-500' : 'text-slate-700',
              )}
            >
              {stage.label}
            </span>
            {showHints && <span className="mt-0.5 block text-[11px] text-slate-400">{stage.hint}</span>}
          </li>
        );
      })}
    </ol>
  );
}
