import { useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import { CONNECTOR_TYPE_META, type ConnectorTypeMeta } from '@/lib/connector-meta';

type Props = {
  value: string;
  onChange: (type: string) => void;
  directionFilter?: 'inbound' | 'outbound' | 'all';
};

export function ConnectorTypePicker({ value, onChange, directionFilter = 'all' }: Props) {
  const [search, setSearch] = useState('');

  const filtered = CONNECTOR_TYPE_META.filter((t) => {
    if (directionFilter !== 'all' && t.direction !== directionFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.label.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.value.includes(q)
    );
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search connector types…"
          className="h-10 w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-9 text-xs font-medium text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-indigo-400 focus:outline-hidden focus:ring-3 focus:ring-indigo-100"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {filtered.map((type) => (
          <TypeCard
            key={type.value}
            type={type}
            selected={value === type.value}
            onSelect={() => onChange(type.value)}
          />
        ))}
      </div>
    </div>
  );
}

function TypeCard({
  type,
  selected,
  onSelect,
}: {
  type: ConnectorTypeMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = type.icon;
  const isInbound = type.direction === 'inbound';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
        selected
          ? isInbound
            ? 'border-emerald-500 bg-emerald-50/40 shadow-xs ring-2 ring-emerald-500/30'
            : 'border-purple-500 bg-purple-50/40 shadow-xs ring-2 ring-purple-500/30'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs'
      }`}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition shadow-2xs"
        style={{ backgroundColor: `${type.accent}18`, color: type.accent }}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-900">{type.label}</span>
          {type.popular && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
          <span
            className={`ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
              isInbound
                ? 'bg-emerald-100/80 text-emerald-800 border border-emerald-200'
                : 'bg-purple-100/80 text-purple-800 border border-purple-200'
            }`}
          >
            {isInbound ? '↓ INBOUND' : '↑ OUTBOUND'}
          </span>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
          {type.description}
        </p>
      </div>
    </button>
  );
}
