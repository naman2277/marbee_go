/** Landing Studio — searchable block catalogue (click or drag onto the canvas). */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { LandingSectionType } from '@/lib/landing-pages';
import { LANDING_BLOCKS, LANDING_BLOCK_CATEGORIES, searchBlocks } from '@/lib/landing-blocks';

export function StudioBlockLibrary({ onAdd }: { onAdd: (type: LandingSectionType) => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchBlocks(q), [q]);
  const grouped = useMemo(
    () =>
      LANDING_BLOCK_CATEGORIES.map((cat) => ({
        cat,
        blocks: results.filter((b) => b.category === cat),
      })).filter((g) => g.blocks.length > 0),
    [results],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search blocks…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        {grouped.map((g) => (
          <div key={g.cat}>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.cat}</p>
            <div className="grid grid-cols-2 gap-2">
              {g.blocks.map((b) => (
                <button
                  key={b.type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/marbee-block-type', b.type);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(b.type)}
                  title={b.description}
                  className="group flex flex-col items-start gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 active:cursor-grabbing"
                >
                  <b.icon className="h-4 w-4 text-slate-400 group-hover:text-brand-500" />
                  <span className="text-[11px] font-semibold text-slate-700">{b.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="px-1 py-8 text-center text-xs text-slate-400">No blocks match “{q}”.</p>
        )}
      </div>

      <p className="border-t border-slate-100 p-2 text-center text-[10px] text-slate-400">
        Drag onto the canvas, or click to insert after the selected block
      </p>
    </div>
  );
}

export { LANDING_BLOCKS };
