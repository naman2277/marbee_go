import { useMemo, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { FORM_TEMPLATES, FORM_TEMPLATE_CATEGORIES, type FormTemplate } from '@/lib/form-templates';
import { FORM_THEME_PRESETS, type FormThemePreset } from '@/lib/form-design';

const TEMPLATE_THEMES: Record<string, FormThemePreset> = {
  'tpl-1': 'indigo',
  'tpl-2': 'violet',
  'tpl-3': 'slate',
  'tpl-4': 'teal',
  'tpl-5': 'amber',
  'tpl-6': 'indigo',
  'tpl-7': 'slate',
  'tpl-8': 'teal',
  'tpl-9': 'rose',
  'tpl-10': 'violet',
};

type Props = {
  selectedId?: string;
  onSelect: (template: FormTemplate) => void;
};

export function FormTemplateGallery({ selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = useMemo(() => {
    let list = FORM_TEMPLATES;
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
  }, [search, category]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search 20 templates…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} templates</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FORM_TEMPLATE_CATEGORIES.map((cat) => (
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

      <div className="grid max-h-[460px] gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tpl, idx) => {
          const preset = TEMPLATE_THEMES[tpl.id] ?? 'indigo';
          const theme = FORM_THEME_PRESETS[preset];
          const selected = selectedId === tpl.id;
          const popular = idx < 4;

          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl)}
              className={`group overflow-hidden rounded-2xl border text-left transition-all ${
                selected
                  ? 'border-brand-500 ring-2 ring-brand-200 shadow-lg'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
              }`}
            >
              <div
                className="relative h-24 px-4 py-3"
                style={{ background: theme.gradient }}
              >
                <span className="text-2xl drop-shadow-sm">{tpl.icon}</span>
                {popular && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    <Star className="h-3 w-3 fill-current" /> Popular
                  </span>
                )}
              </div>
              <div className="bg-white p-4">
                <h4 className="font-semibold text-slate-900 group-hover:text-brand-700">{tpl.name}</h4>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{tpl.category}</p>
                <p className="mt-2 line-clamp-2 text-xs text-slate-600">{tpl.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {tpl.fields.slice(0, 3).map((f) => (
                    <span key={f.id} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {f.label}
                    </span>
                  ))}
                  {tpl.fields.length > 3 && (
                    <span className="text-[10px] text-slate-400">+{tpl.fields.length - 3}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FormTemplatePreviewCard({ template }: { template: FormTemplate }) {
  const preset = TEMPLATE_THEMES[template.id] ?? 'indigo';
  const theme = FORM_THEME_PRESETS[preset];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="h-20 px-4 py-3" style={{ background: theme.gradient }}>
        <p className="text-lg font-bold text-white">{template.name}</p>
      </div>
      <div className="space-y-2 bg-white p-4">
        {template.fields.slice(0, 4).map((f) => (
          <div key={f.id} className="h-8 rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
