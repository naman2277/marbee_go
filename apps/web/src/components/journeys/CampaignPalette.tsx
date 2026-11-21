import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_ICONS,
  categoryAccent,
  paletteForMode,
  type CampaignModeInput,
  type CampaignNodeCategory,
  type CampaignPaletteItem,
} from '@/lib/campaign-nodes';

type Props = {
  mode?: CampaignModeInput;
  light?: boolean;
  modern?: boolean;
  onAddNode: (type: string) => void;
  onDragStart: (event: React.DragEvent, type: string) => void;
};


export function CampaignPalette({
  mode = 'flow',
  onAddNode,
  onDragStart,
}: Props) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const palette = useMemo(() => paletteForMode(mode), [mode]);

  const filtered = useMemo(() => {
    let list = palette;
    if (selectedCategory !== 'all') {
      list = list.filter((n) => n.category === selectedCategory);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.tags.some((t) => t.includes(q)) ||
        n.category.toLowerCase().includes(q),
    );
  }, [search, selectedCategory, palette]);

  const byCategory = useMemo(() => {
    const map = new Map<CampaignNodeCategory, CampaignPaletteItem[]>();
    CAMPAIGN_CATEGORIES.forEach((c) => map.set(c, []));
    filtered.forEach((n) => map.get(n.category)?.push(n));
    return map;
  }, [filtered]);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white/95 backdrop-blur-md shadow-xs select-none">
      {/* Header */}
      <div className="border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Activity Palette
            </h3>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {filtered.length} nodes
          </span>
        </div>

        {/* Search */}
        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activities or channels…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-1.5 pl-8 pr-7 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-slate-100 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All
        </button>
        {CAMPAIGN_CATEGORIES.map((cat) => {
          const count = palette.filter((p) => p.category === cat).length;
          if (!count) return null;
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap ${
                active
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Node Items List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {CAMPAIGN_CATEGORIES.map((category) => {
          const items = byCategory.get(category) ?? [];
          if (!items.length) return null;
          const isCollapsed = collapsed[category];
          const accent = categoryAccent(category);

          return (
            <div key={category} className="space-y-1.5">
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [category]: !p[category] }))}
                className="flex w-full items-center justify-between py-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-700 transition"
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                  <span>{category}</span>
                  <span className="font-normal text-[10px] text-slate-400">({items.length})</span>
                </div>
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>

              {!isCollapsed && (
                <div className="space-y-1.5">
                  {items.map((item) => {
                    const Icon = CAMPAIGN_ICONS[item.icon] ?? Sparkles;
                    return (
                      <div
                        key={item.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, item.type)}
                        onClick={() => onAddNode(item.type)}
                        className="group relative flex cursor-grab items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-2xs transition-all hover:scale-[1.02] hover:border-brand-300 hover:shadow-md active:cursor-grabbing"
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                          style={{
                            backgroundColor: item.accentBg || `${item.accent}15`,
                            color: item.accent,
                          }}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2.2} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-900 group-hover:text-brand-700 truncate">
                              {item.label}
                            </p>
                            {item.popular && (
                              <Flame className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-tight">
                            {item.description}
                          </p>
                        </div>
                      </div>
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
