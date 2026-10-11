import type { MarbeeAsset } from './assets';

export type AssetFolder = {
  id: string;
  tenant_id: string;
  environment: string;
  path: string;
  name: string;
  parent_path: string;
  created_at: string;
};

export type AssetSortField = 'date' | 'name' | 'status';
export type AssetSortDir = 'asc' | 'desc';

export const SYSTEM_FOLDERS = [
  { path: '/Social', name: 'Social', description: 'Social Media posts & campaign media' },
  { path: '/Templates', name: 'Templates', description: 'Email, WhatsApp & omni-channel templates' },
  { path: '/Forms', name: 'Forms', description: 'Form and survey media' },
  { path: '/Landing Pages', name: 'Landing Pages', description: 'Landing page banners and hero assets' },
] as const;

export function isSystemFolder(folderPath: string | null | undefined): boolean {
  if (!folderPath) return false;
  const p = normalizeFolderPath(folderPath).toLowerCase();
  return (
    p === '/social' ||
    p === '/templates' ||
    p === '/forms' ||
    p === '/landing pages' ||
    p === '/landingpages' ||
    p === '/pages'
  );
}

/** Normalize folder path: always `/` or `/segment/segment` without trailing slash */
export function normalizeFolderPath(path: string | null | undefined): string {
  if (!path || path === '/' || path.trim() === '') return '/';
  let p = path.trim().replace(/\\/g, '/');
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/+/g, '/').replace(/\/$/, '');
  return p || '/';
}

export function joinFolderPath(parent: string, name: string): string {
  const clean = name.trim().replace(/[/\\]/g, '-').replace(/\s+/g, ' ');
  if (!clean) throw new Error('Folder name is required');
  const base = normalizeFolderPath(parent);
  return base === '/' ? `/${clean}` : `${base}/${clean}`;
}

export function folderNameFromPath(path: string): string {
  const p = normalizeFolderPath(path);
  if (p === '/') return 'Root';
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'Root';
}

export function parentFolderPath(path: string): string {
  const p = normalizeFolderPath(path);
  if (p === '/') return '/';
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

export function folderBreadcrumbs(currentPath: string): Array<{ label: string; path: string }> {
  const p = normalizeFolderPath(currentPath);
  const crumbs: Array<{ label: string; path: string }> = [{ label: 'All assets', path: '/' }];
  if (p === '/') return crumbs;

  const parts = p.split('/').filter(Boolean);
  let built = '';
  for (const part of parts) {
    built += `/${part}`;
    crumbs.push({ label: part, path: built });
  }
  return crumbs;
}

export type FolderEntry = {
  path: string;
  name: string;
  assetCount: number;
  isSystem: boolean;
};

export function listChildFolders(
  currentPath: string,
  assets: MarbeeAsset[],
  explicitFolders: AssetFolder[],
): FolderEntry[] {
  const current = normalizeFolderPath(currentPath);
  const prefix = current === '/' ? '/' : `${current}/`;
  const names = new Map<string, number>();

  // Ensure system folders are registered if at root
  if (current === '/') {
    for (const sys of SYSTEM_FOLDERS) {
      if (!names.has(sys.name)) {
        names.set(sys.name, 0);
      }
    }
  }

  for (const f of explicitFolders) {
    if (normalizeFolderPath(f.parent_path) === current) {
      names.set(f.name, names.get(f.name) ?? 0);
    }
  }

  for (const asset of assets) {
    const folder = normalizeFolderPath(asset.folder);
    if (folder === current) continue;

    if (current === '/') {
      if (folder.startsWith('/')) {
        const seg = folder.split('/').filter(Boolean)[0];
        if (seg) names.set(seg, (names.get(seg) ?? 0) + 1);
      }
    } else if (folder.startsWith(prefix)) {
      const rest = folder.slice(prefix.length);
      const seg = rest.split('/').filter(Boolean)[0];
      if (seg) names.set(seg, (names.get(seg) ?? 0) + 1);
    }
  }

  // Count assets directly in each child folder path
  const entries: FolderEntry[] = [];
  for (const name of [...names.keys()].sort((a, b) => a.localeCompare(b))) {
    const path = joinFolderPath(current, name);
    const count = assets.filter((a) => normalizeFolderPath(a.folder) === path).length;
    entries.push({ path, name, assetCount: count, isSystem: isSystemFolder(path) });
  }
  return entries;
}

export function assetsInFolder(assets: MarbeeAsset[], folderPath: string): MarbeeAsset[] {
  const target = normalizeFolderPath(folderPath);
  return assets.filter((a) => normalizeFolderPath(a.folder) === target);
}

export function sortAssets(
  items: MarbeeAsset[],
  field: AssetSortField,
  dir: AssetSortDir,
): MarbeeAsset[] {
  const mult = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (field === 'name') {
      return mult * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    if (field === 'status') {
      const sa = a.metadata.status === 'published' ? 1 : 0;
      const sb = b.metadata.status === 'published' ? 1 : 0;
      return mult * (sa - sb);
    }
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return mult * (ta - tb);
  });
}

export function filterAssets(
  items: MarbeeAsset[],
  search: string,
  statusFilter: 'all' | 'published' | 'draft' | 'expired',
): MarbeeAsset[] {
  const now = Date.now();
  return items.filter((a) => {
    const until = a.metadata?.valid_until ? new Date(a.metadata.valid_until).getTime() : null;
    const isExpired = Boolean(until && now > until);

    if (statusFilter === 'published') {
      if (a.metadata?.status !== 'published' || isExpired) return false;
    }
    if (statusFilter === 'draft' && a.metadata?.status !== 'draft') return false;
    if (statusFilter === 'expired' && !isExpired) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      (a.mime_type ?? '').toLowerCase().includes(q) ||
      normalizeFolderPath(a.folder).toLowerCase().includes(q)
    );
  });
}

export type FolderTreeNode = {
  path: string;
  name: string;
  directCount: number;
  isSystem: boolean;
  children: FolderTreeNode[];
};

export function buildFolderTree(
  assets: MarbeeAsset[],
  explicitFolders: AssetFolder[],
): FolderTreeNode {
  function node(path: string): FolderTreeNode {
    return {
      path,
      name: path === '/' ? 'All assets' : folderNameFromPath(path),
      directCount: assetsInFolder(assets, path).length,
      isSystem: isSystemFolder(path),
      children: listChildFolders(path, assets, explicitFolders).map((c) => node(c.path)),
    };
  }
  return node('/');
}

export const ASSET_DRAG_MIME = 'application/x-marbee-asset-id';
export const FOLDER_DRAG_MIME = 'application/x-marbee-folder-path';
