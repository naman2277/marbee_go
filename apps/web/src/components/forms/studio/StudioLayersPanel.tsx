import { useState } from 'react';
import {
  GripVertical,
  Copy,
  Trash2,
  Type,
  Mail,
  Phone,
  Hash,
  Calendar,
  AlignLeft,
  ChevronDown,
  Circle,
  CheckSquare,
  Star,
  Heading,
  Minus,
  EyeOff,
  ScrollText,
  Link as LinkIcon,
  Split,
  Asterisk,
} from 'lucide-react';
import type { FormField, FormFieldType } from '@/lib/forms';

const FIELD_ICONS: Record<FormFieldType, typeof Type> = {
  text: Type,
  email: Mail,
  phone: Phone,
  url: LinkIcon,
  number: Hash,
  date: Calendar,
  textarea: AlignLeft,
  select: ChevronDown,
  radio: Circle,
  multiselect: CheckSquare,
  checkbox: CheckSquare,
  rating: Star,
  heading: Heading,
  divider: Minus,
  hidden: EyeOff,
  consent: ScrollText,
};

type Props = {
  fields: FormField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
};

export function StudioLayersPanel({ fields, selectedId, onSelect, onReorder, onDuplicate, onRemove }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setOverId(id);
  };
  const handleDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) onReorder(dragId, targetId);
    setDragId(null);
    setOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setOverId(null); };

  if (fields.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">
        No fields yet. Add fields from the Fields tab.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {fields.map((f) => {
        const Icon = FIELD_ICONS[f.field_type] ?? Type;
        const isSelected = f.id === selectedId;
        const isDragOver = f.id === overId && dragId !== f.id;

        return (
          <div
            key={f.id}
            draggable
            onDragStart={() => handleDragStart(f.id)}
            onDragOver={(e) => handleDragOver(e, f.id)}
            onDrop={() => handleDrop(f.id)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(f.id)}
            className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs cursor-pointer transition ${
              isSelected
                ? 'bg-brand-50 border border-brand-200 text-brand-900'
                : isDragOver
                ? 'bg-blue-50 border border-blue-200'
                : 'border border-transparent hover:bg-slate-50'
            } ${dragId === f.id ? 'opacity-40' : ''}`}
          >
            <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-slate-300 group-hover:text-slate-500" />
            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="flex-1 truncate font-medium">{f.label || f.name}</span>

            {f.required && <span title="Required"><Asterisk className="h-3 w-3 shrink-0 text-rose-400" /></span>}
            {f.condition?.field && <span title="Has condition"><Split className="h-3 w-3 shrink-0 text-violet-400" /></span>}

            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {f.field_type}
            </span>

            <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDuplicate(f.id); }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                title="Duplicate"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(f.id); }}
                className="rounded p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
