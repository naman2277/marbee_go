import { ArrowDownAZ, FolderPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui';
import type { AssetSortDir, AssetSortField } from '@/lib/asset-folders';

type Props = {
  search: string;
  onSearch: (q: string) => void;
  statusFilter: 'all' | 'published' | 'draft' | 'expired';
  onStatusFilter: (s: 'all' | 'published' | 'draft' | 'expired') => void;
  sortField: AssetSortField;
  sortDir: AssetSortDir;
  onSortField: (f: AssetSortField) => void;
  onSortDir: (d: AssetSortDir) => void;
  onNewFolder: () => void;
  itemCount: number;
  folderLabel: string;
};

export function AssetLibraryToolbar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  sortField,
  sortDir,
  onSortField,
  onSortDir,
  onNewFolder,
  itemCount,
  folderLabel,
}: Props) {
  return (
    <div className="space-y-3 border-b border-slate-100 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{folderLabel}</h3>
          <p className="text-xs text-slate-500">{itemCount} items</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onNewFolder}>
          <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
          New folder
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(['all', 'published', 'draft', 'expired'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStatusFilter(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                  statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
            <ArrowDownAZ className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={sortField}
              onChange={(e) => onSortField(e.target.value as AssetSortField)}
              className="border-0 bg-transparent text-xs focus:outline-none"
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
            <select
              value={sortDir}
              onChange={(e) => onSortDir(e.target.value as AssetSortDir)}
              className="border-0 bg-transparent text-xs focus:outline-none"
            >
              <option value="desc">↓</option>
              <option value="asc">↑</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
