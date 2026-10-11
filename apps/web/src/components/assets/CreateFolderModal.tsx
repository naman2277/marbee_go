import { FolderPlus, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { folderNameFromPath, normalizeFolderPath } from '@/lib/asset-folders';

type Props = {
  parentPath: string;
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: string;
};

export function CreateFolderModal({
  parentPath,
  name,
  onNameChange,
  onSubmit,
  onClose,
  loading,
  error,
}: Props) {
  const parentLabel =
    parentPath === '/' ? 'All assets' : folderNameFromPath(normalizeFolderPath(parentPath));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">New folder</h2>
              <p className="text-xs text-slate-500">Inside {parentLabel}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="mb-2 block text-sm font-medium text-slate-700">Folder name</label>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Campaign banners"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSubmit()}
            autoFocus
          />
          <p className="mt-2 text-xs text-slate-400">
            Drag assets onto folders to organize them.
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!name.trim() || loading}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {loading ? 'Creating…' : 'Create folder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
