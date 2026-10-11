import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CAMPAIGN_ICONS } from '@/lib/campaign-nodes';
import { JOURNEY_ACTIVITY_GROUPS } from '@/lib/journey-builder';

type Props = {
  onPick: (stepType: string) => void;
  onClose: () => void;
};

/** Compact popover of activities that may be inserted mid-thread. */
export function InsertActivityMenu({ onPick, onClose }: Props) {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return JOURNEY_ACTIVITY_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.insertable &&
          (!term ||
            i.label.toLowerCase().includes(term) ||
            i.description.toLowerCase().includes(term)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <div
      className="nodrag nopan w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Insert activity…"
          className="w-full text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1.5">
        {groups.map((g) => (
          <div key={g.id} className="mb-1.5 last:mb-0">
            <p className="px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {g.label}
            </p>
            {g.items.map((item) => {
              const Icon = CAMPAIGN_ICONS[item.icon] ?? Search;
              return (
                <button
                  key={item.stepType}
                  type="button"
                  onClick={() => onPick(item.stepType)}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-50"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${item.accent}1a`, color: item.accent }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {item.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {!groups.length && (
          <p className="px-2 py-3 text-center text-xs text-slate-400">No matches</p>
        )}
      </div>
    </div>
  );
}
