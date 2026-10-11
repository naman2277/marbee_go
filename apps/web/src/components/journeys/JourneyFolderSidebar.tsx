import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Home } from 'lucide-react';
import { JOURNEY_DRAG_MIME, ROOT_FOLDER_TITLE, type JourneyFolderTreeNode } from '@/lib/journey-folders';

type Props = {
  tree: JourneyFolderTreeNode;
  currentPath: string;
  dropTarget: string | null;
  dragging: boolean;
  onSelect: (path: string) => void;
  onDrop: (folderPath: string, journeyId: string) => void;
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
  onDragOver,
}: {
  node: JourneyFolderTreeNode;
  depth: number;
  currentPath: string;
  dropTarget: string | null;
  dragging: boolean;
  onSelect: (path: string) => void;
  onDrop: (folderPath: string, journeyId: string) => void;
  onDragOver: (path: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isActive = currentPath === node.path;
  const isDropTarget = dropTarget === node.path && dragging;
  const hasChildren = node.children.length > 0;
  const Icon = isActive ? FolderOpen : Folder;

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(node.path);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const journeyId =
      e.dataTransfer.getData(JOURNEY_DRAG_MIME) || e.dataTransfer.getData('text/plain');
    if (journeyId) onDrop(node.path, journeyId);
    onDragOver(null);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.path)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(node.path)}
        onDragOver={handleDragOver}
        onDragLeave={() => onDragOver(null)}
        onDrop={handleDrop}
        className={`group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-all ${
          isActive
            ? 'bg-blue-100 font-medium text-blue-900'
            : 'text-slate-600 hover:bg-slate-100'
        } ${isDropTarget ? 'ring-2 ring-blue-400 ring-offset-1 bg-blue-50' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {node.path === '/' ? (
          <Home className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
        ) : (
          <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-blue-500'}`} />
        )}
        <span
          className="min-w-0 flex-1 truncate"
          title={node.path === '/' ? ROOT_FOLDER_TITLE : node.name}
        >
          {node.name}
        </span>
        <span className="text-[10px] tabular-nums text-slate-400">{node.directCount}</span>
      </div>
      {hasChildren && expanded && (
        <div>
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
              onDragOver={onDragOver}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JourneyFolderSidebar({
  tree,
  currentPath,
  dropTarget,
  dragging,
  onSelect,
  onDrop,
  onDragOver,
}: Props) {
  return (
    <aside className="w-full shrink-0 border-r border-slate-100 bg-slate-50/80 p-3 lg:w-56">
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Folders
      </p>
      {dragging && (
        <p className="mb-2 rounded-lg bg-blue-100 px-2 py-1.5 text-[10px] text-blue-800">
          Drop onto a folder to move
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
        onDragOver={onDragOver}
      />
    </aside>
  );
}
