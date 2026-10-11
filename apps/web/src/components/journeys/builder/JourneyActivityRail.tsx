import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { CAMPAIGN_ICONS } from '@/lib/campaign-nodes';
import { JOURNEY_ACTIVITY_GROUPS } from '@/lib/journey-builder';

type Props = {
  onAddActivity: (stepType: string) => void;
  onDragStartActivity: (event: React.DragEvent, stepType: string) => void;
  disabledStepTypes?: string[];
};

/** Left palette. The Entry group is configured in the Entry tab, not dragged. */
export function JourneyActivityRail({
  onAddActivity,
  onDragStartActivity,
  disabledStepTypes = [],
}: Props) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const disabled = useMemo(() => new Set(disabledStepTypes), [disabledStepTypes]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return JOURNEY_ACTIVITY_GROUPS.filter((g) => g.id !== 'entry').map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          !term ||
          i.label.toLowerCase().includes(term) ||
          i.description.toLowerCase().includes(term),
      ),
    }));
  }, [q]);

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Activities
        </h3>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search activities…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {groups.map((g) => {
          if (!g.items.length) return null;
          const isCollapsed = collapsed[g.id];
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [g.id]: !p[g.id] }))}
                className="flex w-full items-center gap-1 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {g.label}
                <span className="font-normal text-slate-300">({g.items.length})</span>
              </button>

              {!isCollapsed && (
                <div className="mt-1 space-y-1">
                  {g.items.map((item) => {
                    const Icon = CAMPAIGN_ICONS[item.icon] ?? Search;
                    const isDisabled = disabled.has(item.stepType);
                    return (
                      <button
                        key={item.stepType}
                        type="button"
                        draggable={!isDisabled}
                        disabled={isDisabled}
                        onDragStart={(e) => onDragStartActivity(e, item.stepType)}
                        onClick={() => !isDisabled && onAddActivity(item.stepType)}
                        title={item.description}
                        className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left transition ${
                          isDisabled
                            ? 'cursor-not-allowed border-slate-100 opacity-50'
                            : 'cursor-grab border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm active:cursor-grabbing'
                        }`}
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                          style={{ backgroundColor: `${item.accent}1a`, color: item.accent }}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2.1} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-tight text-slate-400 line-clamp-2">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
