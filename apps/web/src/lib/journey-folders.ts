import type { JourneyRow } from './journeys';
import {
  folderNameFromPath,
  joinFolderPath,
  normalizeFolderPath,
  parentFolderPath,
} from './asset-folders';

export type JourneyFolder = {
  id: string;
  tenant_id: string;
  environment: string;
  path: string;
  name: string;
  parent_path: string;
  created_at: string;
};

export type JourneyFolderEntry = {
  path: string;
  name: string;
  journeyCount: number;
};

export type JourneyFolderTreeNode = {
  path: string;
  name: string;
  directCount: number;
  children: JourneyFolderTreeNode[];
};

export const JOURNEY_DRAG_MIME = 'application/x-marbee-journey-id';

/** Short sidebar label for the root folder */
export const ROOT_FOLDER_LABEL = 'All';

/** Full label used in page headers and tooltips */
export const ROOT_FOLDER_TITLE = 'All campaigns & journeys';

export function journeyFolderBreadcrumbs(
  currentPath: string,
): Array<{ label: string; path: string }> {
  const p = normalizeFolderPath(currentPath);
  const crumbs: Array<{ label: string; path: string }> = [
    { label: ROOT_FOLDER_LABEL, path: '/' },
  ];
  if (p === '/') return crumbs;

  const parts = p.split('/').filter(Boolean);
  let built = '';
  for (const part of parts) {
    built += `/${part}`;
    crumbs.push({ label: part, path: built });
  }
  return crumbs;
}

export function journeysInFolder(
  journeys: JourneyRow[],
  folderPath: string,
): JourneyRow[] {
  const target = normalizeFolderPath(folderPath);
  return journeys.filter((j) => normalizeFolderPath(j.folder_path ?? '/') === target);
}

export function listChildJourneyFolders(
  currentPath: string,
  journeys: JourneyRow[],
  explicitFolders: JourneyFolder[],
): JourneyFolderEntry[] {
  const current = normalizeFolderPath(currentPath);
  const prefix = current === '/' ? '/' : `${current}/`;
  const names = new Map<string, number>();

  for (const f of explicitFolders) {
    if (normalizeFolderPath(f.parent_path) === current) {
      names.set(f.name, names.get(f.name) ?? 0);
    }
  }

  for (const journey of journeys) {
    const folder = normalizeFolderPath(journey.folder_path ?? '/');
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

  const entries: JourneyFolderEntry[] = [];
  for (const name of [...names.keys()].sort((a, b) => a.localeCompare(b))) {
    const path = joinFolderPath(current, name);
    const count = journeys.filter(
      (j) => normalizeFolderPath(j.folder_path ?? '/') === path,
    ).length;
    entries.push({ path, name, journeyCount: count });
  }
  return entries;
}

export function buildJourneyFolderTree(
  journeys: JourneyRow[],
  explicitFolders: JourneyFolder[],
): JourneyFolderTreeNode {
  function node(path: string): JourneyFolderTreeNode {
    return {
      path,
      name:
        path === '/'
          ? ROOT_FOLDER_LABEL
          : folderNameFromPath(path),
      directCount: journeysInFolder(journeys, path).length,
      children: listChildJourneyFolders(path, journeys, explicitFolders).map((c) =>
        node(c.path),
      ),
    };
  }
  return node('/');
}

export function remapFolderPathAfterDelete(
  folderPath: string,
  deletedPath: string,
  parentPath: string,
): string {
  const normalized = normalizeFolderPath(folderPath);
  const deleted = normalizeFolderPath(deletedPath);
  const parent = normalizeFolderPath(parentPath);
  if (normalized === deleted) return parent;
  if (!normalized.startsWith(`${deleted}/`)) return normalized;
  const suffix = normalized.slice(deleted.length);
  return normalizeFolderPath(`${parent}${suffix}`);
}

export { folderNameFromPath, joinFolderPath, normalizeFolderPath, parentFolderPath };
