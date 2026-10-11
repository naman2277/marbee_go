import { useMemo, useState } from 'react';
import { Bell, Mail, MessageSquare, Search, Smartphone, Star } from 'lucide-react';
import {
  CONTENT_TEMPLATE_CATEGORIES,
  CONTENT_TEMPLATE_LIBRARY,
  LIBRARY_NAME,
  LIBRARY_TEMPLATE_COUNT,
  type ContentChannel,
  type ContentTemplateLibraryItem,
} from '@/lib/content-templates';

const CHANNEL_STYLES: Record<
  ContentChannel,
  { gradient: string; icon: typeof Mail; label: string }
> = {
  email: { gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', icon: Mail, label: 'Email' },
  sms: { gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', icon: MessageSquare, label: 'SMS' },
  web_push: { gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', icon: Bell, label: 'Web push' },
  whatsapp: { gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', icon: MessageSquare, label: 'WhatsApp' },
  rcs: { gradient: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', icon: Smartphone, label: 'RCS' },
};

const CHANNEL_FILTERS: Array<{ id: ContentChannel | 'all'; label: string }> = [
  { id: 'all', label: 'All channels' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'web_push', label: 'Web push' },
  { id: 'rcs', label: 'RCS' },
];

type Props = {
  selectedId?: string;
  channelFilter?: ContentChannel | 'all';
  onSelect: (template: ContentTemplateLibraryItem) => void;
};

export function ContentTemplateGallery({ selectedId, channelFilter: externalChannel, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [channel, setChannel] = useState<ContentChannel | 'all'>(externalChannel ?? 'all');

  const activeChannel = externalChannel ?? channel;

  const filtered = useMemo(() => {
    let list = CONTENT_TEMPLATE_LIBRARY;
    if (activeChannel !== 'all') list = list.filter((t) => t.channel === activeChannel);
    if (category !== 'All') list = list.filter((t) => t.category === category);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [search, category, activeChannel]);

  const countsByChannel = useMemo(() => {
    const counts: Record<string, number> = { all: CONTENT_TEMPLATE_LIBRARY.length };
    for (const tpl of CONTENT_TEMPLATE_LIBRARY) {
      counts[tpl.channel] = (counts[tpl.channel] ?? 0) + 1;
    }
    return counts;
  }, []);

  return (
    <div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{LIBRARY_NAME}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {LIBRARY_TEMPLATE_COUNT} production-style templates · responsive email designs, SMS, WhatsApp, web push & RCS
        </p>
      </div>

      {!externalChannel && (
        <div className="mb-4 flex flex-wrap gap-2">
          {CHANNEL_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setChannel(id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                channel === id
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
              <span className="ml-1 opacity-70">({countsByChannel[id] ?? 0})</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${LIBRARY_TEMPLATE_COUNT} templates…`}
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} shown</p>
      </div>

      <div className="mb-4 flex max-h-24 flex-wrap gap-2 overflow-y-auto">
        {CONTENT_TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              category === cat
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid max-h-[460px] gap-4 overflow-y-auto sm:grid-cols-2">
        {filtered.map((tpl, idx) => {
          const style = CHANNEL_STYLES[tpl.channel];
          const Icon = style.icon;
          const selected = selectedId === tpl.id;
          const popular = tpl.name.toLowerCase().includes('welcome') || idx < 2;

          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl)}
              className={`group flex h-full min-h-[175px] flex-col justify-between overflow-hidden rounded-2xl border text-left transition-all ${
                selected
                  ? 'border-brand-500 ring-2 ring-brand-200 shadow-lg'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
              }`}
            >
              <div className="relative flex h-20 shrink-0 items-center gap-3 px-4" style={{ background: style.gradient }}>
                <span className="text-2xl">{tpl.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{tpl.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/80">
                    <Icon className="h-3 w-3" />
                    {style.label} · {tpl.category}
                  </p>
                </div>
                {popular && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    <Star className="h-3 w-3 fill-current" /> Popular
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between bg-white p-4">
                <p className="h-9 text-xs text-slate-600 line-clamp-2 leading-relaxed">{tpl.description}</p>
                <div className="mt-2 flex h-4 items-center">
                  {tpl.channel === 'email' && tpl.settings.responsive ? (
                    <p className="text-[10px] font-bold text-violet-600">Responsive · SaaS design system</p>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-medium">{tpl.category} workflow starter</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {!filtered.length && (
          <p className="col-span-full py-8 text-center text-sm text-slate-500">No templates match your search.</p>
        )}
      </div>
    </div>
  );
}
