import { Folder, Pencil, Trash2 } from 'lucide-react';
import { JOURNEY_DRAG_MIME, type JourneyFolderEntry } from '@/lib/journey-folders';

type Props = {
  folder?: JourneyFolderEntry;
  name?: string;
  journeyCount?: number;
  folderPath?: string;
  dropTarget?: string | null;
  isDropTarget?: boolean;
  dragging?: boolean;
  onNavigate?: (path: string) => void;
  onOpen?: () => void;
  onDrop: (folderPath: string, journeyId: string) => void;
  onDragOver: (path: string | null) => void;
  onRename?: (folder: JourneyFolderEntry) => void;
  onDelete?: (folder: JourneyFolderEntry) => void;
};

export function JourneyFolderTile({
  folder,
  name,
  journeyCount,
  folderPath,
  dropTarget,
  isDropTarget,
  dragging,
  onNavigate,
  onOpen,
  onDrop,
  onDragOver,
  onRename,
  onDelete,
}: Props) {
  const fName = folder?.name || name || 'Folder';
  const fPath = folder?.path || folderPath || '/';
  const fCount = folder?.journeyCount ?? journeyCount ?? 0;
  const isTarget = isDropTarget || (dropTarget === fPath);

  const handleOpen = () => {
    if (onNavigate) onNavigate(fPath);
    else if (onOpen) onOpen();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(fPath);
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        onDragOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const journeyId =
          e.dataTransfer.getData(JOURNEY_DRAG_MIME) || e.dataTransfer.getData('text/plain');
        if (journeyId) {
          onDrop(fPath, journeyId);
        }
        onDragOver(null);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border p-6 text-center transition-all duration-150 ${
        isTarget
          ? 'border-brand-500 bg-brand-50/80 ring-2 ring-brand-400 scale-[1.02] shadow-md'
          : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {onDelete && folder && (
        <button
          type="button"
          title="Delete folder"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(folder);
          }}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {onRename && folder && (
        <button
          type="button"
          title="Rename folder"
          onClick={(e) => {
            e.stopPropagation();
            onRename(folder);
          }}
          className="absolute right-2 top-9 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      <Folder
        className={`mb-3 h-10 w-10 transition ${
          isTarget ? 'text-brand-600 scale-110' : 'text-slate-400 group-hover:text-brand-600'
        }`}
      />
      <span className="truncate font-bold text-slate-900 text-sm max-w-[90%]">{fName}</span>
      <span className="mt-1 text-xs text-slate-500 font-medium">
        {fCount} {fCount === 1 ? 'item' : 'items'}
      </span>
      {isTarget && (
        <span className="mt-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
          Drop into {fName}
        </span>
      )}
    </div>
  );
}
