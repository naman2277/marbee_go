import { useState } from 'react';
import { AlertTriangle, Folder, FolderEdit, Loader2, Lock, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { isSystemFolder } from '@/lib/asset-folders';

type Props = {
  mode: 'rename' | 'delete';
  folderPath: string;
  currentName: string;
  assetCount: number;
  loading?: boolean;
  error?: string;
  onRename: (newName: string) => void;
  onDelete: (deleteContents: boolean) => void;
  onClose: () => void;
};

export function FolderActionModal({
  mode,
  folderPath,
  currentName,
  assetCount,
  loading,
  error,
  onRename,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(currentName);
  const [deleteMode, setDeleteMode] = useState<'move_to_parent' | 'delete_contents'>('move_to_parent');
  const isSystem = isSystemFolder(folderPath);

  if (isSystem) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Lock className="h-6 w-6" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-base font-extrabold text-slate-900">Protected System Folder</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              <strong>{currentName}</strong> is a core Marbee system folder. System folders are used by automated workflows and templates and cannot be renamed or deleted.
            </p>
          </div>
          <Button onClick={onClose} className="w-full rounded-xl font-bold">
            Understood
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
              mode === 'rename' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {mode === 'rename' ? <FolderEdit className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">
              {mode === 'rename' ? 'Rename Folder' : 'Delete Folder'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            {error}
          </div>
        )}

        {mode === 'rename' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onRename(name.trim());
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Folder Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer Promo"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !name.trim()} className="rounded-xl font-bold bg-brand-600 hover:bg-brand-700 text-white min-w-[130px]">
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" /> Renaming…
                  </span>
                ) : (
                  'Rename Folder'
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3.5 text-xs text-rose-900 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Are you sure you want to delete &ldquo;{currentName}&rdquo;?
              </p>
              {assetCount > 0 ? (
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  This folder contains <strong>{assetCount} {assetCount === 1 ? 'file' : 'files'}</strong>. Choose what to do with the files inside:
                </p>
              ) : (
                <p className="text-[11px] text-rose-700">This folder is empty and will be permanently removed.</p>
              )}
            </div>

            {assetCount > 0 && (
              <div className="space-y-2 text-xs">
                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === 'move_to_parent'}
                    onChange={() => setDeleteMode('move_to_parent')}
                    className="mt-0.5 text-brand-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Move files to parent folder</span>
                    <span className="text-[11px] text-slate-500">Safely keeps all files without breaking links.</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/30 p-3 cursor-pointer hover:bg-rose-50/60">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === 'delete_contents'}
                    onChange={() => setDeleteMode('delete_contents')}
                    className="mt-0.5 text-rose-600"
                  />
                  <div>
                    <span className="font-bold text-rose-800 block">Permanently delete all files inside</span>
                    <span className="text-[11px] text-rose-600">Archives all files in this folder.</span>
                  </div>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} className="rounded-xl">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => onDelete(deleteMode === 'delete_contents')}
                disabled={loading}
                className="rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs min-w-[130px]"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                  </span>
                ) : (
                  'Confirm Delete'
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
