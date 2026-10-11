/** Landing Studio — layer tree with drag-reorder, duplicate, delete, nesting. */
import { useState } from 'react';
import { GripVertical, Copy, Trash2, ChevronRight } from 'lucide-react';
import type { LandingSection } from '@/lib/landing-pages';
import { getBlockMeta } from '@/lib/landing-blocks';

type Props = {
  sections: LandingSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function StudioLayersPanel({ sections, selectedId, onSelect, onReorder, onDuplicate, onDelete }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);

  if (sections.length === 0) {
    return <p className="p-4 text-center text-xs text-slate-400">No blocks yet. Add one from the Blocks tab.</p>;
  }

  return (
    <div className="space-y-0.5 p-2">
      {sections.map((s) => (
        <LayerRow
          key={s.id}
          section={s}
          depth={0}
          selectedId={selectedId}
          dragId={dragId}
          setDragId={setDragId}
          onSelect={onSelect}
          onReorder={onReorder}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function LayerRow({
  section,
  depth,
  selectedId,
  dragId,
  setDragId,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
}: {
  section: LandingSection;
  depth: number;
  selectedId: string | null;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onSelect: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = getBlockMeta(section.type);
  const selected = selectedId === section.id;
  const isContainer = section.type === 'container';
  const children = isContainer ? section.props.children : [];

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          setDragId(section.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && dragId !== section.id) onReorder(dragId, section.id);
          setDragId(null);
        }}
        onClick={() => onSelect(section.id)}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={`group flex items-center gap-1.5 rounded-md border py-1.5 pr-1.5 text-xs transition-colors ${
          dragId === section.id ? 'opacity-40' : ''
        } ${
          selected
            ? 'border-brand-300 bg-brand-50 text-brand-900'
            : 'border-transparent text-slate-700 hover:bg-slate-100'
        }`}
      >
        <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-slate-300" />
        {isContainer ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="shrink-0"
          >
            <ChevronRight className={`h-3 w-3 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <meta.icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        <span className="flex-1 truncate font-medium">{meta.label}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(section.id);
          }}
          className="rounded p-0.5 text-slate-400 opacity-0 hover:bg-white hover:text-slate-700 group-hover:opacity-100"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(section.id);
          }}
          className="rounded p-0.5 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {isContainer && expanded && (
        <div>
          {children.length === 0 ? (
            <p style={{ paddingLeft: 8 + (depth + 1) * 14 }} className="py-1 text-[10px] italic text-slate-400">
              empty
            </p>
          ) : (
            children.map((c) => (
              <LayerRow
                key={c.id}
                section={c}
                depth={depth + 1}
                selectedId={selectedId}
                dragId={dragId}
                setDragId={setDragId}
                onSelect={onSelect}
                onReorder={onReorder}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
