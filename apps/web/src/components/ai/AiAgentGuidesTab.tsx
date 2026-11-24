import { useState } from 'react';
import { BookOpen, Search, ArrowRight } from 'lucide-react';
import { KNOWLEDGE_BASE } from './knowledgeBase';

interface AiAgentGuidesTabProps {
  onAskQuestion: (q: string) => void;
}

export function AiAgentGuidesTab({ onAskQuestion }: AiAgentGuidesTabProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Guides' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'journeys', label: 'Journeys' },
    { id: 'audiences', label: 'Audiences & SQL' },
    { id: 'channels', label: 'Web Push & Channels' },
    { id: 'loyalty', label: 'Loyalty & Offers' },
    { id: 'schemas', label: 'Data Schemas' },
  ];

  const filtered = KNOWLEDGE_BASE.filter((item) => {
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
    const q = String(search || '').toLowerCase().trim();
    if (!q) return matchCat;
    const matchSearch =
      String(item.title || '').toLowerCase().includes(q) ||
      String(item.summary || '').toLowerCase().includes(q) ||
      (Array.isArray(item.tags) && item.tags.some((t) => String(t || '').toLowerCase().includes(q)));
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 font-extrabold text-sm border border-purple-200 shadow-xs">
              <BookOpen className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-black text-slate-900">CRM Architecture Guides &amp; SOPs</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Technical implementation manuals, troubleshooting runbooks, and PostgreSQL schema references.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search guides, SQL, error codes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:outline-hidden transition"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedCategory === cat.id
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Guides Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-3xl bg-white p-5 border border-slate-200/90 hover:border-purple-300 hover:shadow-sm transition space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200 uppercase tracking-wider">
                  {item.category}
                </span>
                <span className="text-[10px] font-mono text-slate-400">{item.id}</span>
              </div>

              <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{item.summary}</p>
            </div>

            {item.codeSample && (
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200 font-mono text-[10px] text-purple-700 line-clamp-2 overflow-hidden">
                {item.codeSample}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                {item.tags.slice(0, 3).join(' • ')}
              </span>

              <button
                type="button"
                onClick={() => onAskQuestion(`Explain guide ${item.title} and generate the implementation steps.`)}
                className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline transition"
              >
                <span>Ask Copilot</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
