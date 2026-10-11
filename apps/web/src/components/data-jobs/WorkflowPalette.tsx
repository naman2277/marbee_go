import { useMemo, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import {
  NODE_CATEGORIES,
  NODE_ICONS,
  NODE_PALETTE,
  categoryAccent,
  type NodeCategory,
  type NodePaletteItem,
} from '@/lib/data-jobs';

type Props = {
  onAddNode: (type: string) => void;
  onDragStart: (event: React.DragEvent, type: string) => void;
};

export function WorkflowPalette({ onAddNode, onDragStart }: Props) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return NODE_PALETTE;
    return NODE_PALETTE.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.tags.some((t) => t.includes(q)),
    );
  }, [search]);

  const byCategory = useMemo(() => {
    const map = new Map<NodeCategory, NodePaletteItem[]>();
    NODE_CATEGORIES.forEach((c) => map.set(c, []));
    filtered.forEach((n) => map.get(n.category)?.push(n));
    return map;
  }, [filtered]);

  const toggleCategory = (cat: NodeCategory) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-slate-800/50 bg-slate-900 text-white">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">Node library</p>
            <p className="text-[11px] text-slate-400">{NODE_PALETTE.length} nodes available</p>
          </div>
          <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
            {filtered.length}
          </span>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes…"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {NODE_CATEGORIES.map((category) => {
          const items = byCategory.get(category) ?? [];
          if (!items.length) return null;
          const isCollapsed = collapsed[category];
          const accent = categoryAccent(category);

          return (
            <div key={category} className="mb-2">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                  {category}
                </span>
                <span className="text-[10px] text-slate-500">{items.length}</span>
              </button>

              {!isCollapsed && (
                <div className="space-y-1 px-1 pb-2">
                  {items.map((item) => {
                    const Icon = NODE_ICONS[item.icon];
                    return (
                      <button
                        key={item.type}
                        type="button"
                        draggable
                        onDragStart={(e) => onDragStart(e, item.type)}
                        onDoubleClick={() => onAddNode(item.type)}
                        className="group flex w-full items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-800/40 p-2.5 text-left transition-all hover:border-slate-600 hover:bg-slate-800 hover:shadow-lg"
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${accent}22`, color: accent }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-xs font-semibold text-slate-100">{item.label}</span>
                            {item.popular && <Star className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400" />}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500 group-hover:text-slate-400">
                            {item.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!filtered.length && (
          <p className="px-3 py-8 text-center text-xs text-slate-500">No nodes match your search</p>
        )}
      </div>
    </aside>
  );
}
