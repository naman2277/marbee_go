import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderLock, FolderOpen, Home } from 'lucide-react';
import { ASSET_DRAG_MIME, FOLDER_DRAG_MIME, type FolderTreeNode } from '@/lib/asset-folders';

type Props = {
  tree: FolderTreeNode;
  currentPath: string;
  dropTarget: string | null;
  dragging: boolean;
  onSelect: (path: string) => void;
  onDrop: (folderPath: string, assetId: string) => void;
  onFolderDrop?: (sourcePath: string, targetPath: string) => void;
  onDragOver: (path: string | null) => void;
};

function TreeNode({
  node,
  depth,
  currentPath,
  dropTarget,
  dragging,
  onSelect,
  onDrop,
  onFolderDrop,
  onDragOver,
}: {
  node: FolderTreeNode;
  depth: number;
  currentPath: string;
  dropTarget: string | null;
  dragging: boolean;
  onSelect: (path: string) => void;
  onDrop: (folderPath: string, assetId: string) => void;
  onFolderDrop?: (sourcePath: string, targetPath: string) => void;
  onDragOver: (path: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isActive = currentPath === node.path;
  const isDropTarget = dropTarget === node.path && dragging;
  const hasChildren = node.children.length > 0;
  const Icon = node.isSystem ? FolderLock : isActive ? FolderOpen : Folder;

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragging && !e.dataTransfer.types.includes(FOLDER_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(node.path);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const folderSrc = e.dataTransfer.getData(FOLDER_DRAG_MIME);
    const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME);

    if (folderSrc && onFolderDrop) {
      onFolderDrop(folderSrc, node.path);
    } else if (assetId) {
      onDrop(node.path, assetId);
    }
    onDragOver(null);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        draggable={!node.isSystem && node.path !== '/'}
        onDragStart={(e) => {
          if (node.isSystem || node.path === '/') return;
          e.dataTransfer.setData(FOLDER_DRAG_MIME, node.path);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onSelect(node.path)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(node.path)}
        onDragOver={handleDragOver}
        onDragLeave={() => onDragOver(null)}
        onDrop={handleDrop}
        className={`group flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-xs transition-all ${
          isActive
            ? 'bg-brand-100/80 font-bold text-brand-700 shadow-2xs'
            : 'text-slate-600 hover:bg-slate-100 font-medium'
        } ${isDropTarget ? 'ring-2 ring-amber-400 ring-offset-1 bg-amber-100 font-bold' : ''}`}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="rounded p-0.5 hover:bg-white/60"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-slate-400" />
            ) : (
              <ChevronRight className="h-3 w-3 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {node.path === '/' ? (
          <Home className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
        ) : node.isSystem ? (
          <FolderLock className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-indigo-500'}`} />
        ) : (
          <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-amber-600' : 'text-amber-500'}`} />
        )}

        <span className="min-w-0 flex-1 truncate">{node.name}</span>

        {node.isSystem && (
          <span className="rounded bg-indigo-50 px-1 py-0.2 text-[8px] font-black text-indigo-700 uppercase tracking-wider">
            Sys
          </span>
        )}

        <span className="text-[10px] tabular-nums text-slate-400 font-mono">{node.directCount}</span>
      </div>

      {hasChildren && expanded && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              currentPath={currentPath}
              dropTarget={dropTarget}
              dragging={dragging}
              onSelect={onSelect}
              onDrop={onDrop}
              onFolderDrop={onFolderDrop}
              onDragOver={onDragOver}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AssetFolderSidebar({
  tree,
  currentPath,
  dropTarget,
  dragging,
  onSelect,
  onDrop,
  onFolderDrop,
  onDragOver,
}: Props) {
  return (
    <aside className="w-full shrink-0 border-r border-slate-100 bg-slate-50/60 p-3 lg:w-60">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
          Folder Explorer
        </p>
      </div>

      {dragging && (
        <p className="mb-2 rounded-xl bg-amber-100/80 px-2.5 py-1.5 text-[10px] font-bold text-amber-800 animate-pulse">
          Drop onto folder to move
        </p>
      )}

      <TreeNode
        node={tree}
        depth={0}
        currentPath={currentPath}
        dropTarget={dropTarget}
        dragging={dragging}
        onSelect={onSelect}
        onDrop={onDrop}
        onFolderDrop={onFolderDrop}
        onDragOver={onDragOver}
      />
    </aside>
  );
}
