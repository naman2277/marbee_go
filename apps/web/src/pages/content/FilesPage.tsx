import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  HardDrive,
  Home,
  LayoutGrid,
  LinkIcon,
  List as ListIcon,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { formatBytes } from '@/lib/schema-stats';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled';

interface UploadEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  speed: number;
  status: UploadStatus;
  publicUrl: string | null;
  startedAt: number;
  folder: string;
  error?: string;
}

interface StoredFile {
  id: string;
  name: string;
  size: number;
  type: string;
  publicUrl: string;
  uploadedAt: string;
  folder: string;
}

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  fileCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileIcon(mime: string) {
  if (mime.startsWith('video/')) return FileVideo;
  if (mime.startsWith('audio/')) return FileAudio;
  if (mime.startsWith('text/csv') || mime.includes('spreadsheet') || mime.includes('excel'))
    return FileSpreadsheet;
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('gzip'))
    return FileArchive;
  if (mime.includes('json') || mime.includes('xml') || mime.includes('javascript') || mime.includes('html'))
    return FileCode;
  if (mime.includes('pdf') || mime.startsWith('text/')) return FileText;
  return FileIcon;
}

function formatEta(bytesRemaining: number, speed: number): string {
  if (speed <= 0) return '--:--';
  const seconds = Math.ceil(bytesRemaining / speed);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function generateId() {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_FOLDERS = ['/Documents', '/Images', '/Videos', '/Archives'];

function folderName(path: string): string {
  if (path === '/') return 'All Files';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

function breadcrumbs(path: string): { label: string; path: string }[] {
  if (path === '/') return [{ label: 'All Files', path: '/' }];
  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ label: 'All Files', path: '/' }];
  let current = '';
  for (const p of parts) {
    current += `/${p}`;
    crumbs.push({ label: p, path: current });
  }
  return crumbs;
}

function buildFolderTree(folders: string[], files: StoredFile[]): FolderNode[] {
  const root: FolderNode = { name: 'All Files', path: '/', children: [], fileCount: files.length };
  const nodeMap = new Map<string, FolderNode>();
  nodeMap.set('/', root);

  const sorted = [...folders].sort();
  for (const path of sorted) {
    const parts = path.split('/').filter(Boolean);
    let parentPath = '/';
    for (let i = 0; i < parts.length; i++) {
      const currentPath = '/' + parts.slice(0, i + 1).join('/');
      if (!nodeMap.has(currentPath)) {
        const node: FolderNode = {
          name: parts[i],
          path: currentPath,
          children: [],
          fileCount: files.filter((f) => f.folder === currentPath).length,
        };
        nodeMap.set(currentPath, node);
        const parent = nodeMap.get(parentPath);
        if (parent) parent.children.push(node);
      }
      parentPath = currentPath;
    }
  }

  return [root];
}

// ─── Upload Engine ────────────────────────────────────────────────────────────

function useUploadEngine() {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = intervalsRef.current.get(id);
    if (timer) {
      clearInterval(timer);
      intervalsRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    return () => {
      intervalsRef.current.forEach((timer) => clearInterval(timer));
      intervalsRef.current.clear();
    };
  }, []);

  const startSimulation = useCallback(
    (entry: UploadEntry) => {
      clearTimer(entry.id);
      const baseSpeed = 200_000 + Math.random() * 800_000;
      const timer = setInterval(() => {
        setUploads((prev) =>
          prev.map((u) => {
            if (u.id !== entry.id || u.status !== 'uploading') return u;
            const jitter = 0.6 + Math.random() * 0.8;
            const speed = baseSpeed * jitter;
            const chunkBytes = speed * 0.1;
            const uploadedBytes = (u.progress / 100) * u.size + chunkBytes;
            const rawProgress = (uploadedBytes / u.size) * 100;
            const newProgress = rawProgress >= 99.5 ? 100 : Math.min(100, rawProgress);
            if (newProgress >= 100) {
              clearTimer(u.id);
              const publicUrl = `https://cdn.marbee.io/files/${u.id}/${encodeURIComponent(u.name)}`;
              return { ...u, progress: 100, speed: 0, status: 'completed' as const, publicUrl };
            }
            return { ...u, progress: newProgress, speed };
          }),
        );
      }, 100);
      intervalsRef.current.set(entry.id, timer);
    },
    [clearTimer],
  );

  const addFiles = useCallback(
    (files: File[], folder: string) => {
      const newEntries: UploadEntry[] = files.map((file) => ({
        id: generateId(),
        file,
        name: file.name,
        size: file.size || 1024 * (10 + Math.random() * 500),
        type: file.type || 'application/octet-stream',
        progress: 0,
        speed: 0,
        status: 'uploading' as const,
        publicUrl: null,
        startedAt: Date.now(),
        folder,
      }));
      setUploads((prev) => [...newEntries, ...prev]);
      newEntries.forEach((e) => startSimulation(e));
    },
    [startSimulation],
  );

  const pauseUpload = useCallback(
    (id: string) => {
      clearTimer(id);
      setUploads((prev) =>
        prev.map((u) => (u.id === id && u.status === 'uploading' ? { ...u, status: 'paused', speed: 0 } : u)),
      );
    },
    [clearTimer],
  );

  const resumeUpload = useCallback(
    (id: string) => {
      setUploads((prev) => {
        const entry = prev.find((u) => u.id === id);
        if (entry && entry.status === 'paused') {
          startSimulation({ ...entry, status: 'uploading' });
          return prev.map((u) => (u.id === id ? { ...u, status: 'uploading' } : u));
        }
        return prev;
      });
    },
    [startSimulation],
  );

  const cancelUpload = useCallback(
    (id: string) => {
      clearTimer(id);
      setUploads((prev) =>
        prev.map((u) =>
          u.id === id && (u.status === 'uploading' || u.status === 'paused')
            ? { ...u, status: 'cancelled', speed: 0 }
            : u,
        ),
      );
      // Auto-remove cancelled entry from queue
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.id !== id));
      }, 1000);
    },
    [clearTimer],
  );

  const removeUpload = useCallback(
    (id: string) => {
      clearTimer(id);
      setUploads((prev) => prev.filter((u) => u.id !== id));
    },
    [clearTimer],
  );

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status === 'uploading' || u.status === 'paused'));
  }, []);

  return { uploads, addFiles, pauseUpload, resumeUpload, cancelUpload, removeUpload, clearCompleted };
}

// ─── Folder Tree Sidebar ──────────────────────────────────────────────────────

function FolderTreeItem({
  node,
  depth,
  currentPath,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  currentPath: string;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isActive = currentPath === node.path;
  const hasChildren = node.children.length > 0;
  const isRoot = node.path === '/';
  const FolderIcon = isActive ? FolderOpen : Folder;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(node.path);
          if (hasChildren) setExpanded((prev) => !prev);
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition',
          isActive
            ? 'bg-brand-50 text-brand-700 font-semibold'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        )}
        style={{ paddingLeft: `${depth * 16 + 10}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 text-slate-400 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isRoot ? (
          <Home className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <FolderIcon
            className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : 'text-amber-500')}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.fileCount > 0 && (
          <span
            className={cn(
              'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              isActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400',
            )}
          >
            {node.fileCount}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              currentPath={currentPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Upload Card ──────────────────────────────────────────────────────────────

function UploadCard({
  upload,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onCopyUrl,
  copiedId,
}: {
  upload: UploadEntry;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onCopyUrl: (url: string, id: string) => void;
  copiedId: string | null;
}) {
  const Icon = fileIcon(upload.type);
  const isActive = upload.status === 'uploading';
  const isPaused = upload.status === 'paused';
  const isComplete = upload.status === 'completed';
  const isCancelled = upload.status === 'cancelled';
  const isFailed = upload.status === 'failed';
  const bytesUploaded = (upload.progress / 100) * upload.size;
  const bytesRemaining = upload.size - bytesUploaded;

  const statusColor = isComplete
    ? 'text-emerald-600'
    : isFailed
    ? 'text-rose-600'
    : isCancelled
    ? 'text-slate-400'
    : isPaused
    ? 'text-amber-600'
    : 'text-brand-600';

  const barColor = isComplete
    ? 'bg-emerald-500'
    : isFailed
    ? 'bg-rose-500'
    : isCancelled
    ? 'bg-slate-300'
    : isPaused
    ? 'bg-amber-500'
    : 'bg-brand-600';

  return (
    <div
      className={cn(
        'group rounded-xl border bg-white p-3.5 transition-all',
        isActive && 'border-brand-200 shadow-sm',
        isPaused && 'border-amber-200',
        isComplete && 'border-emerald-200',
        (isCancelled || isFailed) && 'border-slate-200 opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-semibold text-slate-800">{upload.name}</p>
            <div className="flex shrink-0 items-center gap-0.5">
              {isActive && (
                <button
                  type="button"
                  onClick={onPause}
                  className="rounded-md p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition"
                  title="Pause"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
              )}
              {isPaused && (
                <button
                  type="button"
                  onClick={onResume}
                  className="rounded-md p-1 text-amber-500 hover:bg-emerald-50 hover:text-emerald-600 transition"
                  title="Resume"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
              )}
              {(isActive || isPaused) && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                  title="Stop"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {isComplete && upload.publicUrl && (
                <button
                  type="button"
                  onClick={() => onCopyUrl(upload.publicUrl!, upload.id)}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition',
                    copiedId === upload.id
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-brand-50 text-brand-700 hover:bg-brand-100',
                  )}
                >
                  {copiedId === upload.id ? (
                    <><Check className="h-3 w-3" /> Copied</>
                  ) : (
                    <><Copy className="h-3 w-3" /> URL</>
                  )}
                </button>
              )}
              {(isComplete || isCancelled || isFailed) && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-400">
            <span>{formatBytes(upload.size)}</span>
            {isActive && (
              <>
                <span className="text-brand-600 font-medium">{formatSpeed(upload.speed)}</span>
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatEta(bytesRemaining, upload.speed)}
                </span>
              </>
            )}
            {isPaused && <span className="font-medium text-amber-600">Paused</span>}
            {isComplete && <span className="font-medium text-emerald-600">Complete</span>}
            {isCancelled && <span className="font-medium text-slate-500">Cancelled</span>}
            {isFailed && <span className="font-medium text-rose-600">Failed</span>}
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full transition-all duration-150', barColor)}
              style={{ width: `${Math.max(upload.progress, upload.progress > 0 ? 2 : 0)}%` }}
            />
          </div>

          <div className="mt-0.5 flex items-center justify-between text-[10px]">
            <span className={cn('font-bold tabular-nums', statusColor)}>
              {upload.progress.toFixed(1)}%
            </span>
            {(isActive || isPaused) && (
              <span className="text-slate-400 tabular-nums">
                {formatBytes(bytesUploaded)} / {formatBytes(upload.size)}
              </span>
            )}
          </div>

          {isComplete && upload.publicUrl && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2 py-1">
              <LinkIcon className="h-3 w-3 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-emerald-800">
                {upload.publicUrl}
              </span>
              <a
                href={upload.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-emerald-600 hover:text-emerald-800"
                title="Open"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [currentFolder, setCurrentFolder] = useState('/');
  const [isDropzoneActive, setDropzoneActive] = useState(false);
  const { tenantId, environment, user } = useAuth();
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [folders, setFolders] = useState<string[]>(DEFAULT_FOLDERS);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Load folders from DB
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('file_folders')
          .select('path')
          .eq('tenant_id', tenantId)
          .eq('environment', environment || 'production')
          .order('path');
        if (data && data.length > 0) {
          setFolders(data.map((r: { path: string }) => r.path));
        }
      } catch {}
    })();
  }, [tenantId, environment]);

  // Load file entries from DB
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('file_entries')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('environment', environment || 'production')
          .order('uploaded_at', { ascending: false });
        if (data) {
          setStoredFiles(data.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            name: r.name as string,
            size: Number(r.size),
            type: r.mime_type as string,
            publicUrl: (r.public_url as string) || '',
            uploadedAt: r.uploaded_at as string,
            folder: (r.folder as string) || '/',
          })));
        }
      } catch {}
    })();
  }, [tenantId, environment]);

  const {
    uploads,
    addFiles,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    removeUpload,
    clearCompleted,
  } = useUploadEngine();

  // Persist completed uploads to DB, then remove from queue
  useEffect(() => {
    const newlyCompleted = uploads.filter(
      (u) => u.status === 'completed' && u.publicUrl && !storedFiles.some((sf) => sf.id === u.id),
    );
    if (newlyCompleted.length > 0) {
      const completedIds = new Set(newlyCompleted.map((u) => u.id));
      const newEntries = newlyCompleted.map((u) => ({
        id: u.id,
        name: u.name,
        size: u.size,
        type: u.type,
        publicUrl: u.publicUrl!,
        uploadedAt: new Date().toISOString(),
        folder: u.folder,
      }));
      setStoredFiles((prev) => [...newEntries, ...prev]);
      // Insert into DB
      if (tenantId) {
        for (const u of newlyCompleted) {
          supabase.from('file_entries').insert({
            id: u.id,
            tenant_id: tenantId,
            environment: environment || 'production',
            name: u.name,
            size: u.size,
            mime_type: u.type,
            folder: u.folder,
            storage_path: `${tenantId}/${u.folder === '/' ? '' : u.folder.slice(1) + '/'}${u.name}`,
            public_url: u.publicUrl,
            uploaded_by: user?.id,
          }).then(() => {});
        }
      }
      setTimeout(() => {
        completedIds.forEach((id) => removeUpload(id));
      }, 1500);
    }
  }, [uploads, storedFiles, removeUpload, tenantId, environment, user]);

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      addFiles(Array.from(fileList), currentFolder);
    },
    [addFiles, currentFolder],
  );

  const copyUrl = useCallback(async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const deleteStoredFile = useCallback((id: string) => {
    setStoredFiles((prev) => prev.filter((f) => f.id !== id));
    if (tenantId) {
      supabase.from('file_entries').delete().eq('id', id).then(() => {});
    }
  }, [tenantId]);

  const createFolder = useCallback(() => {
    const name = newFolderName.trim().replace(/[/\\]/g, '-');
    if (!name) return;
    const path = currentFolder === '/' ? `/${name}` : `${currentFolder}/${name}`;
    if (folders.includes(path)) return;
    const next = [...folders, path].sort();
    setFolders(next);
    if (tenantId) {
      supabase.from('file_folders').insert({
        tenant_id: tenantId,
        environment: environment || 'production',
        path,
        name,
        parent_path: currentFolder,
      }).then(() => {});
    }
    setNewFolderName('');
    setShowNewFolder(false);
  }, [newFolderName, currentFolder, folders, tenantId, environment]);

  const deleteFolder = useCallback(
    (path: string) => {
      const nextFolders = folders.filter((f) => f !== path && !f.startsWith(`${path}/`));
      setFolders(nextFolders);
      if (tenantId) {
        supabase.from('file_folders')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('environment', environment || 'production')
          .or(`path.eq.${path},path.like.${path}/%`)
          .then(() => {});
        // Move files in deleted folder to root
        supabase.from('file_entries')
          .update({ folder: '/' })
          .eq('tenant_id', tenantId)
          .or(`folder.eq.${path},folder.like.${path}/%`)
          .then(() => {});
      }
      setStoredFiles((prev) =>
        prev.map((f) =>
          f.folder === path || f.folder.startsWith(`${path}/`) ? { ...f, folder: '/' } : f,
        ),
      );
      if (currentFolder === path || currentFolder.startsWith(`${path}/`)) {
        setCurrentFolder('/');
      }
    },
    [folders, currentFolder],
  );

  const activeUploads = useMemo(
    () => uploads.filter((u) => u.status === 'uploading' || u.status === 'paused'),
    [uploads],
  );

  const folderTree = useMemo(() => buildFolderTree(folders, storedFiles), [folders, storedFiles]);

  const folderFiles = useMemo(() => {
    let list =
      currentFolder === '/'
        ? storedFiles
        : storedFiles.filter((f) => f.folder === currentFolder);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'size') list = [...list].sort((a, b) => b.size - a.size);
    else list = [...list].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return list;
  }, [storedFiles, currentFolder, search, sortBy]);

  const childFolders = useMemo(() => {
    if (currentFolder === '/') {
      return folders
        .filter((f) => f.split('/').filter(Boolean).length === 1)
        .map((f) => ({
          path: f,
          name: folderName(f),
          count: storedFiles.filter((sf) => sf.folder === f).length,
        }));
    }
    const prefix = currentFolder + '/';
    const depth = currentFolder.split('/').filter(Boolean).length + 1;
    return folders
      .filter((f) => f.startsWith(prefix) && f.split('/').filter(Boolean).length === depth)
      .map((f) => ({
        path: f,
        name: folderName(f),
        count: storedFiles.filter((sf) => sf.folder === f).length,
      }));
  }, [currentFolder, folders, storedFiles]);

  const totalStoredSize = useMemo(() => storedFiles.reduce((s, f) => s + f.size, 0), [storedFiles]);

  const overallProgress = useMemo(() => {
    if (activeUploads.length === 0) return 0;
    return activeUploads.reduce((s, u) => s + u.progress, 0) / activeUploads.length;
  }, [activeUploads]);

  const crumbs = useMemo(() => breadcrumbs(currentFolder), [currentFolder]);

  const stats = [
    { icon: FileIcon, label: 'Total Files', value: String(storedFiles.length) },
    { icon: Globe, label: 'Public URLs', value: String(storedFiles.filter((f) => f.publicUrl).length), tone: 'text-emerald-600' },
    { icon: HardDrive, label: 'Storage', value: formatBytes(totalStoredSize) },
    {
      icon: UploadCloud,
      label: 'Uploading',
      value: String(activeUploads.length),
      tone: activeUploads.length > 0 ? 'text-brand-600' : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">File Manager</h1>
              <p className="text-xs text-slate-500">
                Upload, organize &amp; share files with public CDN URLs. Pause, resume or stop any upload.
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
              New Folder
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-brand-600 font-semibold text-white shadow-xs hover:bg-brand-700"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Upload Files
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                <div className={`mt-0.5 text-sm font-bold ${s.tone ?? 'text-slate-900'}`}>
                  {s.value}
                </div>
              </div>
            );
          })}
        </div>

        {activeUploads.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-brand-700">
                Uploading {activeUploads.length} file{activeUploads.length > 1 ? 's' : ''}…
              </span>
              <span className="font-bold text-brand-600 tabular-nums">
                {overallProgress.toFixed(0)}%
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-200"
                style={{ width: `${overallProgress}%` }}
              >
                <div className="h-full w-full animate-pulse rounded-full bg-white/20" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Upload Queue (when active) ─────────────────────────────────────── */}
      {uploads.length > 0 && (
        <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <UploadCloud className="h-4 w-4 text-brand-600" />
              Upload Queue
              {activeUploads.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                  {activeUploads.length} active
                </span>
              )}
            </h2>
            {uploads.some((u) => u.status !== 'uploading' && u.status !== 'paused') && (
              <Button size="sm" variant="ghost" onClick={clearCompleted} className="text-xs text-slate-500">
                Clear finished
              </Button>
            )}
          </div>
          <div className="grid gap-2.5 p-4 sm:grid-cols-2">
            {uploads.map((u) => (
              <UploadCard
                key={u.id}
                upload={u}
                onPause={() => pauseUpload(u.id)}
                onResume={() => resumeUpload(u.id)}
                onCancel={() => cancelUpload(u.id)}
                onRemove={() => removeUpload(u.id)}
                onCopyUrl={copyUrl}
                copiedId={copiedId}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ── Main Explorer ──────────────────────────────────────────────────── */}
      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-2xs">
        {/* Breadcrumbs */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-3">
          <nav className="flex items-center gap-1.5 text-xs">
            {crumbs.map((crumb, idx) => {
              const isLast = idx === crumbs.length - 1;
              return (
                <div key={crumb.path} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                  <button
                    type="button"
                    onClick={() => setCurrentFolder(crumb.path)}
                    className={cn(
                      'flex items-center gap-1 font-bold transition',
                      isLast
                        ? 'text-slate-900 cursor-default'
                        : 'text-slate-500 hover:text-brand-600',
                    )}
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

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            {(['list', 'grid'] as const).map((m) => {
              const Ic = m === 'list' ? ListIcon : LayoutGrid;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={cn(
                    'rounded-md p-1.5 transition',
                    viewMode === m ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-700',
                  )}
                >
                  <Ic className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Sidebar — Folder Tree */}
          <div className="w-full border-b border-slate-100 bg-white p-3 lg:w-56 lg:border-b-0 lg:border-r">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Folders
            </p>
            {folderTree.map((node) => (
              <FolderTreeItem
                key={node.path}
                node={node}
                depth={0}
                currentPath={currentFolder}
                onSelect={setCurrentFolder}
              />
            ))}
          </div>

          {/* Main Content Area */}
          <div
            className="relative min-w-0 flex-1 bg-slate-50/30"
            onDragOver={(e) => {
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
              e.preventDefault();
              setDropzoneActive(false);
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
          >
            {/* Dropzone overlay */}
            {isDropzoneActive && (
              <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90 text-brand-700 backdrop-blur-sm">
                <UploadCloud className="h-8 w-8" />
                <span className="text-sm font-bold">Drop files to upload to "{folderName(currentFolder)}"</span>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 sm:px-6">
              <span className="text-xs font-bold text-slate-700">
                {folderName(currentFolder)}
                <span className="ml-1.5 font-normal text-slate-400">
                  {childFolders.length > 0 && `${childFolders.length} folder${childFolders.length > 1 ? 's' : ''}, `}
                  {folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search files…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-44 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'size')}
                    className="appearance-none rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-2.5 pr-7 text-xs font-medium text-slate-600"
                  >
                    <option value="date">Newest</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Sub-folder tiles */}
            {childFolders.length > 0 && (
              <div className="border-b border-slate-100 p-4 sm:px-6">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {childFolders.map((f) => (
                    <div
                      key={f.path}
                      role="button"
                      tabIndex={0}
                      onClick={() => setCurrentFolder(f.path)}
                      onKeyDown={(e) => e.key === 'Enter' && setCurrentFolder(f.path)}
                      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-brand-300 hover:shadow-sm cursor-pointer"
                    >
                      <Folder className="h-5 w-5 shrink-0 text-amber-500 group-hover:text-brand-600 transition" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-800">{f.name}</p>
                        <p className="text-[11px] text-slate-400">{f.count} file{f.count !== 1 ? 's' : ''}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete folder "${f.name}"? Files will be moved to root.`)) {
                            deleteFolder(f.path);
                          }
                        }}
                        className="rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition"
                        title="Delete folder"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File list / grid */}
            {folderFiles.length > 0 ? (
              viewMode === 'list' ? (
                <div className="divide-y divide-slate-100">
                  {folderFiles.map((file) => {
                    const Icon = fileIcon(file.type);
                    return (
                      <div
                        key={file.id}
                        className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/60 sm:px-6"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-slate-800">{file.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{file.publicUrl}</p>
                        </div>
                        <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                          {formatBytes(file.size)}
                        </span>
                        <span className="hidden shrink-0 text-xs text-slate-400 md:block">
                          {new Date(file.uploadedAt).toLocaleDateString()}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => copyUrl(file.publicUrl, file.id)}
                            className={cn(
                              'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition',
                              copiedId === file.id
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'text-slate-500 hover:bg-brand-50 hover:text-brand-700',
                            )}
                          >
                            {copiedId === file.id ? (
                              <><Check className="h-3 w-3" /> Copied</>
                            ) : (
                              <><Copy className="h-3 w-3" /> Copy URL</>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteStoredFile(file.id)}
                            className="rounded-lg p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Delete file"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
                  {folderFiles.map((file) => {
                    const Icon = fileIcon(file.type);
                    return (
                      <div
                        key={file.id}
                        className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-200 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition">
                            <Icon className="h-5 w-5" />
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteStoredFile(file.id)}
                            className="rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-3 truncate text-sm font-semibold text-slate-800">{file.name}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{formatBytes(file.size)}</span>
                          <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                          <LinkIcon className="h-3 w-3 shrink-0 text-brand-500" />
                          <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
                            {file.publicUrl}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyUrl(file.publicUrl, file.id)}
                            className={cn(
                              'shrink-0 rounded p-0.5 transition',
                              copiedId === file.id
                                ? 'text-emerald-600'
                                : 'text-slate-400 hover:text-brand-600',
                            )}
                          >
                            {copiedId === file.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-2 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <FileIcon className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold text-slate-600">
                  {search ? 'No files match your search' : 'This folder is empty'}
                </p>
                <p className="text-xs text-slate-400">
                  {search
                    ? 'Try a different search term'
                    : 'Drop files here or click Upload to get started'}
                </p>
                {!search && (
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 rounded-xl bg-brand-600 font-semibold text-white shadow-xs hover:bg-brand-700"
                    size="sm"
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload Files
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── New Folder Modal ───────────────────────────────────────────────── */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Create New Folder</h3>
            <p className="mt-1 text-xs text-slate-500">
              Inside: {folderName(currentFolder)}
            </p>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              placeholder="Folder name…"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={createFolder}
                disabled={!newFolderName.trim()}
                className="bg-brand-600 text-white hover:bg-brand-700"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
