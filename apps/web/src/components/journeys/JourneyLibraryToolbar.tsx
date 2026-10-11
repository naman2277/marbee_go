import { ChevronRight, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { journeyFolderBreadcrumbs } from '@/lib/journey-folders';

type Props = {
  currentFolder: string;
  folderLabel: string;
  folderTitle?: string;
  itemCount: number;
  onNavigateFolder: (path: string) => void;
  onNewFolder: () => void;
  onRenameFolder?: () => void;
  onDeleteFolder?: () => void;
  canDeleteFolder?: boolean;
};

export function JourneyLibraryToolbar({
  currentFolder,
  folderLabel,
  folderTitle,
  itemCount,
  onNavigateFolder,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  canDeleteFolder,
}: Props) {
  const breadcrumbs = journeyFolderBreadcrumbs(currentFolder);

  return (
    <div className="space-y-3 border-b border-slate-100 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                <button
                  type="button"
                  onClick={() => onNavigateFolder(crumb.path)}
                  className={`hover:text-slate-800 ${
                    index === breadcrumbs.length - 1 ? 'font-medium text-slate-700' : ''
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
          <h3 className="font-semibold text-slate-900" title={folderTitle ?? folderLabel}>
            {folderLabel}
          </h3>
          <p className="text-xs text-slate-500">{itemCount} items</p>
        </div>
        <div className="flex gap-2">
          {canDeleteFolder && onRenameFolder && (
            <Button size="sm" variant="ghost" onClick={onRenameFolder}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Rename folder
            </Button>
          )}
          {canDeleteFolder && onDeleteFolder && (
            <Button size="sm" variant="ghost" onClick={onDeleteFolder} className="text-red-600 hover:bg-red-50">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete folder
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onNewFolder}>
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            New folder
          </Button>
        </div>
      </div>
    </div>
  );
}
