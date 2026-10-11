import { useState } from 'react';
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  Circle,
  EyeOff,
  Hash,
  Heading,
  Link as LinkIcon,
  Mail,
  Minus,
  Phone,
  ScrollText,
  Search,
  Star,
  Type,
} from 'lucide-react';
import type { FormFieldType } from '@/lib/forms';

type PaletteItem = { type: FormFieldType; icon: typeof Type; label: string; category: string };

const PALETTE: PaletteItem[] = [
  { type: 'text', icon: Type, label: 'Text', category: 'Standard Inputs' },
  { type: 'email', icon: Mail, label: 'Email', category: 'Standard Inputs' },
  { type: 'phone', icon: Phone, label: 'Phone', category: 'Standard Inputs' },
  { type: 'url', icon: LinkIcon, label: 'URL', category: 'Standard Inputs' },
  { type: 'number', icon: Hash, label: 'Number', category: 'Standard Inputs' },
  { type: 'date', icon: Calendar, label: 'Date', category: 'Standard Inputs' },
  { type: 'textarea', icon: AlignLeft, label: 'Paragraph', category: 'Standard Inputs' },
  { type: 'select', icon: ChevronDown, label: 'Dropdown', category: 'Choice & Selection' },
  { type: 'radio', icon: Circle, label: 'Radio', category: 'Choice & Selection' },
  { type: 'multiselect', icon: CheckSquare, label: 'Multi-select', category: 'Choice & Selection' },
  { type: 'checkbox', icon: CheckSquare, label: 'Checkbox', category: 'Choice & Selection' },
  { type: 'rating', icon: Star, label: 'Rating', category: 'Choice & Selection' },
  { type: 'heading', icon: Heading, label: 'Heading', category: 'Layout' },
  { type: 'divider', icon: Minus, label: 'Divider', category: 'Layout' },
  { type: 'consent', icon: ScrollText, label: 'Consent', category: 'Advanced' },
  { type: 'hidden', icon: EyeOff, label: 'Hidden', category: 'Advanced' },
];

const CATEGORIES = ['Standard Inputs', 'Choice & Selection', 'Layout', 'Advanced'] as const;

type Props = {
  onAdd: (type: FormFieldType) => void;
};

export function StudioFieldLibrary({ onAdd }: Props) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();

  const filtered = q
    ? PALETTE.filter((p) => p.label.toLowerCase().includes(q) || p.type.includes(q))
    : PALETTE;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fields…"
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-500 focus:outline-none"
        />
      </div>

      {CATEGORIES.map((cat) => {
        const items = filtered.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{cat}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAdd(type)}
                  title={`Add ${label}`}
                  className="flex items-center gap-2 rounded-lg border border-transparent bg-white px-2.5 py-2 text-left text-[11px] font-semibold text-slate-700 hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-700 transition"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
