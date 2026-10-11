import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Folder,
  FolderPlus,
  Globe,
  HardDrive,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  List as ListIcon,
  Lock,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { Card, Button, EmptyState } from '@/components/ui';
import { AssetCard } from '@/components/assets/AssetCard';
import { AssetFolderSidebar } from '@/components/assets/AssetFolderSidebar';
import { AssetFolderTile } from '@/components/assets/AssetFolderTile';
import { AssetLibraryToolbar } from '@/components/assets/AssetLibraryToolbar';
import { CreateFolderModal } from '@/components/assets/CreateFolderModal';
import { FolderActionModal } from '@/components/assets/FolderActionModal';
import { AssetPreviewModal } from '@/components/assets/AssetPreviewModal';
import {
  fetchAssets,
  fetchAssetFolders,
  uploadAsset,
  createAssetFolder,
  renameAssetFolder,
  deleteAssetFolder,
  moveAssetFolder,
  moveAssetToFolder,
  ensureSystemFolders,
  setAssetPublished,
  deleteAsset,
  getAssetValidity,
  sumAssetBytes,
  formatAssetSize,
  ASSET_STORAGE_QUOTA_BYTES,
  type MarbeeAsset,
} from '@/lib/assets';
import { formatBytes, formatSchemaDate } from '@/lib/schema-stats';
import {
  assetsInFolder,
  buildFolderTree,
  filterAssets,
  folderBreadcrumbs,
  folderNameFromPath,
  isSystemFolder,
  joinFolderPath,
  parentFolderPath,
  listChildFolders,
  normalizeFolderPath,
  sortAssets,
  type AssetFolder,
  type AssetSortDir,
  type AssetSortField,
} from '@/lib/asset-folders';
import { copyText } from '@/lib/schema-export';
import { useTenantScope } from '@/contexts/AuthContext';

type AssetLibraryDemo = { assets: MarbeeAsset[]; folders: AssetFolder[] };

export function AssetLibraryPage({ demo }: { demo?: AssetLibraryDemo } = {}) {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'expired'>('all');
  const [currentFolder, setCurrentFolder] = useState('/');
  const [sortField, setSortField] = useState<AssetSortField>('date');
  const [sortDir, setSortDir] = useState<AssetSortDir>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isDropzoneActive, setDropzoneActive] = useState(false);

  // Local demo state so the harness can exercise the UI without Supabase.
  const [demoAssets, setDemoAssets] = useState<MarbeeAsset[]>(() => demo?.assets ?? []);

  // Folder modals
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderActionModal, setFolderActionModal] = useState<{
    mode: 'rename' | 'delete';
    folderPath: string;
    name: string;
    assetCount: number;
  } | null>(null);

  // Drag & drop
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Lightbox preview modal state
  const [previewingAsset, setPreviewingAsset] = useState<MarbeeAsset | null>(null);
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);

  const queryKey = ['assets', tenantId, environment];
  const folderQueryKey = ['asset-folders', tenantId, environment];

  // Seed system folders on mount
  useEffect(() => {
    if (!demo && tenantId && environment) {
      void ensureSystemFolders(tenantId, environment);
    }
  }, [demo, tenantId, environment]);

  const { data: fetchedAssets = [], isLoading: assetsLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAssets(tenantId, environment),
    enabled: !demo,
  });

  const { data: fetchedFolders = [] } = useQuery({
    queryKey: folderQueryKey,
    queryFn: () => fetchAssetFolders(tenantId, environment),
    enabled: !demo,
  });

  const assets = demo ? demoAssets : fetchedAssets;
  const explicitFolders = demo ? demo.folders : fetchedFolders;
  const isLoading = demo ? false : assetsLoading;

  const patchDemoAsset = (id: string, patch: Partial<MarbeeAsset>) =>
    setDemoAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const showSuccess = (msg: string) => {
    setFeedbackSuccess(msg);
    setTimeout(() => setFeedbackSuccess(null), 3000);
  };

  const showError = (msg: string) => {
    setFeedbackError(msg);
    setTimeout(() => setFeedbackError(null), 4000);
  };

  const refresh = () => {
    if (demo) return;
    queryClient.refetchQueries({ queryKey });
    queryClient.refetchQueries({ queryKey: folderQueryKey });
  };

  const uploadFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (demo) {
      const now = new Date().toISOString();
      setDemoAssets((prev) => [
        ...list.map((f, i) => ({
          id: `demo-${Date.now()}-${i}`,
          tenant_id: 'demo',
          environment: 'production',
          name: f.name,
          file_path: `${currentFolder}/${f.name}`,
          mime_type: f.type || 'application/octet-stream',
          file_size: f.size || 24000,
          public_url: null,
          folder: currentFolder,
          metadata: { status: 'draft' as const },
          created_at: now,
          updated_at: now,
        })),
        ...prev,
      ]);
      showSuccess(`${list.length} file${list.length === 1 ? '' : 's'} added`);
      return;
    }
    list.forEach((file) => uploadMutation.mutate(file));
  };

  // UPLOAD ASSET
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAsset(tenantId, environment, file, currentFolder),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess('Asset uploaded successfully');
      refresh();
    },
    onError: (err: Error) => showError(err.message),
  });

  // CREATE FOLDER
  const createFolderMutation = useMutation({
    mutationFn: () => createAssetFolder(tenantId, environment, currentFolder, newFolderName),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      setNewFolderName('');
      setShowNewFolder(false);
      showSuccess('Folder created');
      refresh();
    },
    onError: (e: Error) => showError(e.message),
  });

  // RENAME FOLDER
  const renameFolderMutation = useMutation({
    mutationFn: async ({ oldPath, newName }: { oldPath: string; newName: string }) => {
      setFeedbackError(null);
      const res = await renameAssetFolder(tenantId, environment, oldPath, newName);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (_, { oldPath, newName }) => {
      const normOld = normalizeFolderPath(oldPath);
      const parent = parentFolderPath(normOld);
      const newPath = joinFolderPath(parent, newName);
      const current = normalizeFolderPath(currentFolder);

      if (current === normOld) {
        setCurrentFolder(newPath);
      } else if (current.startsWith(`${normOld}/`)) {
        setCurrentFolder(current.replace(normOld, newPath));
      }

      setFolderActionModal(null);
      showSuccess('Folder renamed successfully');
      refresh();
    },
    onError: (e: Error) => showError(e.message || 'Failed to rename folder'),
  });

  // DELETE FOLDER
  const deleteFolderMutation = useMutation({
    mutationFn: async ({ folderPath, deleteContents }: { folderPath: string; deleteContents: boolean }) => {
      setFeedbackError(null);
      const res = await deleteAssetFolder(
        tenantId,
        environment,
        folderPath,
        deleteContents ? 'delete_contents' : 'move_to_parent',
      );
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      const deleted = folderActionModal?.folderPath ? normalizeFolderPath(folderActionModal.folderPath) : null;
      const current = normalizeFolderPath(currentFolder);
      if (deleted && (current === deleted || current.startsWith(`${deleted}/`))) {
        setCurrentFolder('/');
      }
      setFolderActionModal(null);
      showSuccess('Folder deleted successfully');
      refresh();
    },
    onError: (e: Error) => {
      showError(e.message || 'Failed to delete folder');
    },
  });

  // MOVE ASSET TO FOLDER
  const moveAssetMutation = useMutation({
    mutationFn: ({ assetId, folderPath }: { assetId: string; folderPath: string }) =>
      moveAssetToFolder(assetId, folderPath),
    onSuccess: (result, { folderPath }) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess(`Moved file to ${folderNameFromPath(folderPath)}`);
      refresh();
    },
  });

  // MOVE FOLDER TO FOLDER
  const moveFolderMutation = useMutation({
    mutationFn: ({ sourcePath, targetPath }: { sourcePath: string; targetPath: string }) =>
      moveAssetFolder(tenantId, environment, sourcePath, targetPath),
    onSuccess: (result, { targetPath }) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess(`Moved folder to ${folderNameFromPath(targetPath)}`);
      refresh();
    },
  });

  const copyUrl = async (url: string, assetId: string) => {
    await copyText(url);
    setCopiedId(assetId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const folderTree = useMemo(
    () => buildFolderTree(assets, explicitFolders),
    [assets, explicitFolders],
  );

  const childFolders = useMemo(
    () => listChildFolders(currentFolder, assets, explicitFolders),
    [currentFolder, assets, explicitFolders],
  );

  const folderAssets = useMemo(() => {
    const inFolder = assetsInFolder(assets, currentFolder);
    const filtered = filterAssets(inFolder, search, statusFilter);
    return sortAssets(filtered, sortField, sortDir);
  }, [assets, currentFolder, search, statusFilter, sortField, sortDir]);

  const breadcrumbs = useMemo(() => folderBreadcrumbs(currentFolder), [currentFolder]);
  const folderLabel = currentFolder === '/' ? 'All assets' : folderNameFromPath(currentFolder);
  const isCurrentFolderSystem = isSystemFolder(currentFolder);

  const handleAssetDrop = (folderPath: string, assetId: string) => {
    const target = normalizeFolderPath(folderPath);
    const asset = assets.find((a) => a.id === assetId);
    if (!asset || normalizeFolderPath(asset.folder) === target) return;
    moveAssetMutation.mutate({ assetId, folderPath: target });
    setDraggingAssetId(null);
    setDropTarget(null);
  };

  const handleFolderDrop = (sourcePath: string, targetPath: string) => {
    if (isSystemFolder(sourcePath)) {
      showError('System folders cannot be moved.');
      return;
    }
    moveFolderMutation.mutate({ sourcePath, targetPath });
  };

  const dragging = draggingAssetId !== null;

  // ---- Storage stats (folds the old quota bar into the header) ----
  const usedBytes = useMemo(() => sumAssetBytes(assets), [assets]);
  const quotaPct = ASSET_STORAGE_QUOTA_BYTES > 0
    ? Math.min(100, Math.round((usedBytes / ASSET_STORAGE_QUOTA_BYTES) * 100))
    : 0;
  const publishedCount = useMemo(
    () => assets.filter((a) => a.metadata.status === 'published').length,
    [assets],
  );

  // ---- Multi-select + bulk actions ----
  const selection = useMemo(
    () => folderAssets.filter((a) => selectedIds.has(a.id)),
    [folderAssets, selectedIds],
  );
  const allVisibleSelected = folderAssets.length > 0 && selection.length === folderAssets.length;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(folderAssets.map((a) => a.id)));

  useEffect(() => {
    clearSelection();
  }, [currentFolder]);

  const bulkPublish = async (publish: boolean) => {
    if (demo) {
      selection.forEach((a) =>
        patchDemoAsset(a.id, { metadata: { ...a.metadata, status: publish ? 'published' : 'draft' } }),
      );
      showSuccess(`${selection.length} asset${selection.length === 1 ? '' : 's'} ${publish ? 'published' : 'unpublished'}`);
      clearSelection();
      return;
    }
    let ok = 0;
    for (const a of selection) {
      const r = await setAssetPublished(a, publish);
      if (!r.error) ok += 1;
    }
    showSuccess(`${ok} asset${ok === 1 ? '' : 's'} ${publish ? 'published' : 'unpublished'}`);
    clearSelection();
    refresh();
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selection.length} asset${selection.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    if (demo) {
      const ids = new Set(selection.map((a) => a.id));
      setDemoAssets((prev) => prev.filter((a) => !ids.has(a.id)));
      showSuccess(`${selection.length} asset${selection.length === 1 ? '' : 's'} deleted`);
      clearSelection();
      return;
    }
    let ok = 0;
    for (const a of selection) {
      const r = await deleteAsset(a);
      if (!r.error) ok += 1;
    }
    showSuccess(`${ok} asset${ok === 1 ? '' : 's'} deleted`);
    clearSelection();
    refresh();
  };

  const bulkMove = (folderPath: string) => {
    if (demo) {
      const ids = new Set(selection.map((a) => a.id));
      setDemoAssets((prev) =>
        prev.map((a) => (ids.has(a.id) ? { ...a, folder: normalizeFolderPath(folderPath) } : a)),
      );
      showSuccess(`Moved ${selection.length} to ${folderNameFromPath(folderPath) || 'All assets'}`);
      clearSelection();
      return;
    }
    Promise.all(selection.map((a) => moveAssetToFolder(a.id, normalizeFolderPath(folderPath)))).then(() => {
      showSuccess(`Moved ${selection.length} asset${selection.length === 1 ? '' : 's'}`);
      clearSelection();
      refresh();
    });
  };

  const stats = [
    { icon: ImageIcon, label: 'Assets', value: String(assets.length) },
    { icon: Globe, label: 'Published', value: String(publishedCount), tone: 'text-emerald-600' },
    {
      icon: HardDrive,
      label: 'Storage',
      value: `${formatBytes(usedBytes)} / ${formatBytes(ASSET_STORAGE_QUOTA_BYTES)}`,
      meter: quotaPct,
    },
  ];

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,application/pdf"
        multiple
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* ===== MODERN HEADER ===== */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Asset Library</h1>
              <p className="text-xs text-slate-500">
                Media storage, folders, validity scheduling &amp; public CDN links.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowNewFolder(true)}
              className="rounded-xl font-semibold shadow-2xs"
            >
              <FolderPlus className="mr-1.5 h-4 w-4 text-slate-500" />
              New folder
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="rounded-xl bg-brand-600 font-semibold text-white shadow-xs hover:bg-brand-700"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((s) => {
            const Ic = s.icon;
            return (
              <div
                key={s.label}
                className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Ic className="h-3.5 w-3.5" />
                  {s.label}
                </div>
                <div className={`mt-0.5 text-sm font-bold ${s.tone ?? 'text-slate-900'}`}>{s.value}</div>
                {typeof s.meter === 'number' && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        s.meter >= 90 ? 'bg-rose-500' : s.meter >= 70 ? 'bg-amber-500' : 'bg-brand-600'
                      }`}
                      style={{ width: `${Math.max(s.meter, usedBytes > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {feedbackError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800 animate-in fade-in">
          {feedbackError}
        </div>
      )}

      {feedbackSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 animate-in fade-in">
          {feedbackSuccess}
        </div>
      )}

      {/* MAIN ASSET EXPLORER CARD */}
      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-2xs">
        {/* Top Folder Breadcrumbs */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-3">
          <nav className="flex items-center gap-1.5 text-xs">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={crumb.path} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                  <button
                    type="button"
                    onClick={() => setCurrentFolder(crumb.path)}
                    className={`flex items-center gap-1 font-bold transition ${
                      isLast
                        ? 'text-slate-900 cursor-default'
                        : 'text-slate-500 hover:text-brand-600'
                    }`}
                  >
                    {crumb.path === '/' ? (
                      <Home className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <Folder className="h-3.5 w-3.5 text-brand-500" />
                    )}
                    <span>{crumb.label}</span>
                  </button>
                </div>
              );
            })}
          </nav>

          {isCurrentFolderSystem && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100/80 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
              <Lock className="h-2.5 w-2.5" /> Protected System Folder
            </span>
          )}
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Left Folder Hierarchy Sidebar */}
          <AssetFolderSidebar
            tree={folderTree}
            currentPath={currentFolder}
            dropTarget={dropTarget}
            dragging={dragging}
            onSelect={setCurrentFolder}
            onDrop={handleAssetDrop}
            onFolderDrop={handleFolderDrop}
            onDragOver={setDropTarget}
          />

          {/* Right Main Asset Grid */}
          <div
            className="relative min-w-0 flex-1 bg-slate-50/30"
            onDragOver={(e) => {
              if (dragging) return; // internal asset drag, not a file drop
              if (Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault();
                setDropzoneActive(true);
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDropzoneActive(false);
            }}
            onDrop={(e) => {
              if (dragging) return;
              const files = e.dataTransfer.files;
              if (files && files.length) {
                e.preventDefault();
                setDropzoneActive(false);
                uploadFiles(files);
              }
            }}
          >
            {/* File-drop overlay */}
            {isDropzoneActive && (
              <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90 text-brand-700 backdrop-blur-sm">
                <UploadCloud className="h-8 w-8" />
                <span className="text-sm font-bold">Drop files to upload to “{folderLabel}”</span>
              </div>
            )}

            {/* Toolbar */}
            <AssetLibraryToolbar
              search={search}
              onSearch={setSearch}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              sortField={sortField}
              sortDir={sortDir}
              onSortField={setSortField}
              onSortDir={setSortDir}
              onNewFolder={() => setShowNewFolder(true)}
              itemCount={childFolders.length + folderAssets.length}
              folderLabel={folderLabel}
            />

            {/* Secondary control row: select-all + view toggle */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 sm:px-6">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={selectAllVisible}
                  disabled={folderAssets.length === 0}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {selection.length > 0 ? `${selection.length} selected` : 'Select all'}
              </label>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                {(['grid', 'list'] as const).map((m) => {
                  const Ic = m === 'grid' ? LayoutGrid : ListIcon;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setViewMode(m)}
                      title={`${m[0].toUpperCase()}${m.slice(1)} view`}
                      className={`rounded-md p-1.5 transition ${
                        viewMode === m ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <Ic className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subfolders Section */}
            {childFolders.length > 0 && (
              <div className="p-4 sm:p-6 pb-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
                  Folders ({childFolders.length})
                </span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {childFolders.map((folder) => (
                    <AssetFolderTile
                      key={folder.path}
                      name={folder.name}
                      assetCount={folder.assetCount}
                      folderPath={folder.path}
                      isSystem={folder.isSystem}
                      isDropTarget={dropTarget === folder.path}
                      dragging={dragging}
                      onOpen={() => setCurrentFolder(folder.path)}
                      onDrop={(assetId) => handleAssetDrop(folder.path, assetId)}
                      onFolderDrop={(src) => handleFolderDrop(src, folder.path)}
                      onDragOver={setDropTarget}
                      onRename={() =>
                        setFolderActionModal({
                          mode: 'rename',
                          folderPath: folder.path,
                          name: folder.name,
                          assetCount: folder.assetCount,
                        })
                      }
                      onDelete={() =>
                        setFolderActionModal({
                          mode: 'delete',
                          folderPath: folder.path,
                          name: folder.name,
                          assetCount: folder.assetCount,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Asset Files Section */}
            {isLoading ? (
              <div className="p-16 text-center text-slate-400 font-medium animate-pulse">
                Loading assets…
              </div>
            ) : folderAssets.length > 0 ? (
              <div className="p-4 pb-24 sm:p-6 sm:pb-24">
                {childFolders.length > 0 && (
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
                    Files ({folderAssets.length})
                  </span>
                )}

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {folderAssets.map((asset) => (
                      <div key={asset.id} className="relative">
                        <label
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-2.5 top-2.5 z-20 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white/95 shadow-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(asset.id)}
                            onChange={() => toggleSelect(asset.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </label>
                        <AssetCard
                          asset={asset}
                          copied={copiedId === asset.id}
                          onCopy={(url) => copyUrl(url, asset.id)}
                          onUpdated={refresh}
                          onDeleted={refresh}
                          onPreview={(a, url) => {
                            setPreviewingAsset(a);
                            setPreviewingUrl(url);
                          }}
                          isDragging={draggingAssetId === asset.id}
                          onDragStart={() => setDraggingAssetId(asset.id)}
                          onDragEnd={() => {
                            setDraggingAssetId(null);
                            setDropTarget(null);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {folderAssets.map((asset, idx) => {
                      const validity = getAssetValidity(asset.metadata);
                      const isPublished = asset.metadata.status === 'published';
                      return (
                        <div
                          key={asset.id}
                          className={`flex items-center gap-3 px-3 py-2.5 text-xs ${
                            idx > 0 ? 'border-t border-slate-100' : ''
                          } ${selectedIds.has(asset.id) ? 'bg-brand-50/60' : 'hover:bg-slate-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(asset.id)}
                            onChange={() => toggleSelect(asset.id)}
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewingAsset(asset);
                              setPreviewingUrl(asset.public_url);
                            }}
                            className="min-w-0 flex-1 truncate text-left font-semibold text-slate-800 hover:text-brand-700"
                          >
                            {asset.name}
                          </button>
                          <span className="w-20 shrink-0 text-slate-400">{formatAssetSize(asset.file_size)}</span>
                          <span
                            className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold ${
                              validity === 'expired'
                                ? 'bg-rose-100 text-rose-700'
                                : isPublished
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {validity === 'expired' ? 'Expired' : isPublished ? 'Published' : 'Draft'}
                          </span>
                          <span className="hidden w-28 shrink-0 text-slate-400 sm:block">
                            {formatSchemaDate(asset.updated_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : !childFolders.length ? (
              <div className="p-12 text-center">
                <EmptyState
                  title="This folder is empty"
                  description="Upload images or media files, create custom subfolders, or drag assets here."
                  action={
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => setShowNewFolder(true)}>
                        New Folder
                      </Button>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                      >
                        <Upload className="mr-2 h-4 w-4" /> Upload Files
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : null}

            {/* Floating bulk-action bar */}
            {selection.length > 0 && (
              <div className="sticky bottom-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur sm:px-6">
                <span className="text-xs font-bold text-slate-700">
                  {selection.length} asset{selection.length === 1 ? '' : 's'} selected
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => bulkPublish(true)} className="rounded-lg text-xs font-semibold">
                    <Globe className="mr-1 h-3.5 w-3.5" /> Publish
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => bulkPublish(false)} className="rounded-lg text-xs font-semibold">
                    Unpublish
                  </Button>
                  <select
                    onChange={(e) => {
                      if (e.target.value) bulkMove(e.target.value);
                      e.target.value = '';
                    }}
                    defaultValue=""
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    <option value="" disabled>
                      Move to…
                    </option>
                    <option value="/">All assets (root)</option>
                    {listChildFolders('/', assets, explicitFolders).map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={bulkDelete}
                    className="rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Clear selection"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* CREATE NEW FOLDER MODAL */}
      {showNewFolder && (
        <CreateFolderModal
          parentPath={currentFolder}
          name={newFolderName}
          onNameChange={setNewFolderName}
          onSubmit={() => createFolderMutation.mutate()}
          onClose={() => setShowNewFolder(false)}
          loading={createFolderMutation.isPending}
        />
      )}

      {/* RENAME / DELETE FOLDER ACTION MODAL */}
      {folderActionModal && (
        <FolderActionModal
          mode={folderActionModal.mode}
          folderPath={folderActionModal.folderPath}
          currentName={folderActionModal.name}
          assetCount={folderActionModal.assetCount}
          loading={renameFolderMutation.isPending || deleteFolderMutation.isPending}
          error={feedbackError ?? undefined}
          onRename={(newName) =>
            renameFolderMutation.mutate({ oldPath: folderActionModal.folderPath, newName })
          }
          onDelete={(deleteContents) =>
            deleteFolderMutation.mutate({
              folderPath: folderActionModal.folderPath,
              deleteContents,
            })
          }
          onClose={() => setFolderActionModal(null)}
        />
      )}

      {/* FULL-RESOLUTION MEDIA PREVIEW LIGHTBOX MODAL */}
      {previewingAsset && (
        <AssetPreviewModal
          asset={previewingAsset}
          displayUrl={previewingUrl}
          onClose={() => {
            setPreviewingAsset(null);
            setPreviewingUrl(null);
          }}
        />
      )}
    </div>
  );
}
