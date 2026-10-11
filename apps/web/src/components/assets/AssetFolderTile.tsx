import { useState } from 'react';
import {
  Folder,
  FolderLock,
  GripVertical,
  Lock,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ASSET_DRAG_MIME, FOLDER_DRAG_MIME } from '@/lib/asset-folders';

type Props = {
  name: string;
  assetCount: number;
  folderPath: string;
  isSystem?: boolean;
  isDropTarget: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDrop: (assetId: string) => void;
  onFolderDrop?: (sourcePath: string) => void;
  onDragOver: (path: string | null) => void;
  onRename?: () => void;
  onDelete?: () => void;
};

export function AssetFolderTile({
  name,
  assetCount,
  folderPath,
  isSystem = false,
  isDropTarget,
  dragging,
  onOpen,
  onDrop,
  onFolderDrop,
  onDragOver,
  onRename,
  onDelete,
}: Props) {
  const [isFolderDragging, setIsFolderDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!isSystem}
      onDragStart={(e) => {
        if (isSystem) return;
        setIsFolderDragging(true);
        e.dataTransfer.setData(FOLDER_DRAG_MIME, folderPath);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setIsFolderDragging(false)}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      onDragOver={(e) => {
        if (!dragging && !e.dataTransfer.types.includes(FOLDER_DRAG_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(folderPath);
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        onDragOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const folderSrc = e.dataTransfer.getData(FOLDER_DRAG_MIME);
        const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME);

        if (folderSrc && onFolderDrop) {
          onFolderDrop(folderSrc);
        } else if (assetId) {
          onDrop(assetId);
        }
        onDragOver(null);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border p-5 text-center transition-all shadow-2xs ${
        isFolderDragging ? 'opacity-40 scale-95 border-dashed border-amber-300' : ''
      } ${
        isDropTarget
          ? 'border-amber-400 bg-amber-100/80 ring-2 ring-amber-400 scale-[1.02]'
          : isSystem
          ? 'border-slate-200/90 bg-gradient-to-b from-indigo-50/40 to-white hover:border-indigo-300 hover:shadow-xs'
          : 'border-slate-200/80 bg-white hover:border-brand-500 hover:shadow-xs'
      }`}
    >
      {/* System Lock Badge */}
      {isSystem ? (
        <span
          title="System folder (Protected)"
          className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-indigo-100/80 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-indigo-700 backdrop-blur-xs"
        >
          <Lock className="h-2.5 w-2.5" /> System
        </span>
      ) : (
        /* Action buttons for custom user folders */
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition"
        >
          {onRename && (
            <button
              type="button"
              onClick={onRename}
              title="Rename folder"
              className="rounded-lg bg-white/95 p-1.5 text-slate-500 shadow-2xs hover:bg-white hover:text-brand-600 transition"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete folder"
              className="rounded-lg bg-white/95 p-1.5 text-slate-500 shadow-2xs hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Drag handle for custom folders */}
      {!isSystem && (
        <div className="absolute left-2 bottom-2 cursor-grab rounded-lg bg-white/90 p-1 text-slate-400 opacity-0 shadow-2xs group-hover:opacity-100">
          <GripVertical className="h-3 w-3" />
        </div>
      )}

      {/* Folder Icon */}
      <div className={`mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl ${
        isDropTarget
          ? 'bg-amber-200 text-amber-700'
          : isSystem
          ? 'bg-indigo-100/70 text-indigo-600 group-hover:bg-indigo-100'
          : 'bg-brand-100/70 text-brand-600 group-hover:bg-brand-100'
      }`}>
        {isSystem ? <FolderLock className="h-6 w-6" /> : <Folder className="h-6 w-6" />}
      </div>

      <span className="max-w-[130px] truncate font-bold text-slate-900 text-xs">
        {name}
      </span>
      <span className="mt-0.5 text-[11px] text-slate-400 font-medium">
        {assetCount} {assetCount === 1 ? 'file' : 'files'}
      </span>

      {isDropTarget && (
        <span className="mt-1 rounded-md bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 animate-pulse">
          Drop here
        </span>
      )}
    </div>
  );
}
