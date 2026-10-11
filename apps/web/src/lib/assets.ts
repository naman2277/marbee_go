import { supabase } from './supabase';
import { formatBytes, TENANT_STORAGE_QUOTA_BYTES } from './schema-stats';
import { logAudit } from './audit';
import {
  isSystemFolder,
  joinFolderPath,
  normalizeFolderPath,
  parentFolderPath,
  folderNameFromPath,
  SYSTEM_FOLDERS,
  type AssetFolder,
} from './asset-folders';

export const ASSET_STORAGE_QUOTA_BYTES = TENANT_STORAGE_QUOTA_BYTES;
export const ASSET_BUCKET = 'assets';
export const CDN_BUCKET = 'cdn-public';
const SIGNED_URL_TTL_SEC = 3600;

export type AssetStatus = 'draft' | 'published';

export type AssetMetadata = {
  status?: AssetStatus;
  valid_from?: string | null;
  valid_until?: string | null;
  cdn_path?: string | null;
};

export type MarbeeAsset = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  public_url: string | null;
  folder: string | null;
  metadata: AssetMetadata;
  created_at: string;
  updated_at: string;
};

export type AssetValidity = 'active' | 'expired' | 'scheduled' | 'none';

export function isBrokenGateUrl(url: string | null | undefined): boolean {
  return Boolean(url?.includes('/functions/v1/asset-gate'));
}

export function isAssetPubliclyAccessible(asset: MarbeeAsset): boolean {
  if (asset.metadata.status !== 'published') return false;
  if (!asset.public_url || isBrokenGateUrl(asset.public_url)) return false;
  const validity = getAssetValidity(asset.metadata);
  return validity === 'active' || validity === 'none';
}

export function parseAssetMetadata(raw: unknown): AssetMetadata {
  if (!raw || typeof raw !== 'object') return { status: 'draft' };
  const m = raw as AssetMetadata;
  return {
    status: m.status === 'published' ? 'published' : 'draft',
    valid_from: m.valid_from ?? null,
    valid_until: m.valid_until ?? null,
    cdn_path: m.cdn_path ?? null,
  };
}

export function getAssetValidity(meta: AssetMetadata): AssetValidity {
  const now = Date.now();
  const from = meta.valid_from ? new Date(meta.valid_from).getTime() : null;
  const until = meta.valid_until ? new Date(meta.valid_until).getTime() : null;

  if (!from && !until) return 'none';
  if (from && now < from) return 'scheduled';
  if (until && now > until) return 'expired';
  return 'active';
}

export function validityLabel(v: AssetValidity): string {
  if (v === 'active') return 'Active';
  if (v === 'expired') return 'Expired';
  if (v === 'scheduled') return 'Scheduled';
  return 'No expiry';
}

export function formatAssetSize(bytes: number | null): string {
  if (!bytes) return '—';
  return formatBytes(bytes);
}

export function sumAssetBytes(assets: MarbeeAsset[]): number {
  return assets.reduce((sum, a) => sum + (a.file_size ?? 0), 0);
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function cdnPathFor(asset: MarbeeAsset): string {
  return `${asset.tenant_id}/${asset.environment}/published/${asset.id}-${safeFileName(asset.name)}`;
}

export async function getAssetPreviewUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SEC);
  if (error) return null;
  return data.signedUrl;
}

/** Preview in app — published CDN URL, signed URL, or public bucket fallback */
export async function getAssetDisplayUrl(asset: MarbeeAsset): Promise<string | null> {
  if (
    asset.metadata.status === 'published' &&
    asset.public_url &&
    !isBrokenGateUrl(asset.public_url)
  ) {
    return asset.public_url;
  }

  const signed = await getAssetPreviewUrl(asset.file_path);
  if (signed) return signed;

  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(asset.file_path);
  return data.publicUrl;
}

export async function fetchAssets(tenantId: string, environment: string): Promise<MarbeeAsset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...(row as MarbeeAsset),
    metadata: parseAssetMetadata((row as { metadata?: unknown }).metadata),
  }));
}

export async function updateAsset(
  id: string,
  patch: {
    name?: string;
    metadata?: AssetMetadata;
    public_url?: string | null;
    folder?: string;
  },
): Promise<{ error?: string }> {
  const { error } = await supabase.from('assets').update(patch).eq('id', id);
  if (error) return { error: error.message };
  const { data: asset } = await supabase.from('assets').select('tenant_id, environment, name').eq('id', id).maybeSingle();
  if (asset) {
    void logAudit({
      tenantId: asset.tenant_id,
      environment: asset.environment,
      action: 'update',
      resourceType: 'asset',
      resourceId: id,
      resourceName: asset.name,
      summary: Object.keys(patch).join(', '),
    });
  }
  return {};
}

export async function moveAssetToFolder(
  assetId: string,
  folderPath: string,
): Promise<{ error?: string }> {
  return updateAsset(assetId, { folder: normalizeFolderPath(folderPath) });
}

export async function setAssetPublished(
  asset: MarbeeAsset,
  published: boolean,
): Promise<{ error?: string; publicUrl?: string | null }> {
  if (published) {
    const cdnPath = cdnPathFor(asset);
    const { data: file, error: dlError } = await supabase.storage
      .from(ASSET_BUCKET)
      .download(asset.file_path);

    if (dlError || !file) {
      return { error: `Could not read asset file: ${dlError?.message ?? 'download failed'}` };
    }

    const { error: upError } = await supabase.storage.from(CDN_BUCKET).upload(cdnPath, file, {
      upsert: true,
      contentType: asset.mime_type ?? undefined,
    });

    if (upError) {
      return {
        error: upError.message.includes('Bucket not found')
          ? 'cdn-public bucket missing. Run supabase/sql/16_assets_private_and_gate.sql'
          : upError.message,
      };
    }

    const { data: urlData } = supabase.storage.from(CDN_BUCKET).getPublicUrl(cdnPath);
    const metadata: AssetMetadata = { ...asset.metadata, status: 'published', cdn_path: cdnPath };
    const result = await updateAsset(asset.id, { metadata, public_url: urlData.publicUrl });
    if (result.error) return result;
    return { publicUrl: urlData.publicUrl };
  }

  const cdnPath = asset.metadata.cdn_path;
  if (cdnPath) {
    await supabase.storage.from(CDN_BUCKET).remove([cdnPath]);
  }

  const metadata: AssetMetadata = { ...asset.metadata, status: 'draft', cdn_path: null };
  const result = await updateAsset(asset.id, { metadata, public_url: null });
  if (result.error) return result;
  return { publicUrl: null };
}

export async function deleteAsset(asset: MarbeeAsset): Promise<{ error?: string }> {
  if (asset.metadata.cdn_path) {
    await supabase.storage.from(CDN_BUCKET).remove([asset.metadata.cdn_path]);
  }

  const { error: storageError } = await supabase.storage.from(ASSET_BUCKET).remove([asset.file_path]);
  if (storageError) {
    console.warn('Storage delete failed:', storageError.message);
  }

  const { error } = await supabase
    .from('assets')
    .update({ archived_at: new Date().toISOString(), public_url: null })
    .eq('id', asset.id);

  if (error) return { error: error.message };
  void logAudit({
    tenantId: asset.tenant_id,
    environment: asset.environment,
    action: 'archive',
    resourceType: 'asset',
    resourceId: asset.id,
    resourceName: asset.name,
  });
  return {};
}

export async function uploadAsset(
  tenantId: string,
  environment: string,
  file: File,
  folder = '/',
): Promise<{ error?: string; asset?: MarbeeAsset }> {
  const filePath = `${tenantId}/${environment}/${Date.now()}-${file.name}`;
  const folderPath = normalizeFolderPath(folder);

  const { error: uploadError } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (uploadError) return { error: uploadError.message };

  const { data, error: dbError } = await supabase.from('assets').insert({
    tenant_id: tenantId,
    environment,
    name: file.name,
    file_path: filePath,
    mime_type: file.type,
    file_size: file.size,
    public_url: null,
    folder: folderPath,
    metadata: { status: 'draft' },
  }).select().single();

  if (dbError) return { error: dbError.message };
  
  const asset: MarbeeAsset = {
    ...data,
    metadata: parseAssetMetadata(data.metadata),
  };
  return { asset };
}

export async function fetchAssetFolders(
  tenantId: string,
  environment: string,
): Promise<AssetFolder[]> {
  const { data, error } = await supabase
    .from('asset_folders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('name');

  if (error) {
    if (error.message.includes('asset_folders')) return [];
    throw error;
  }
  return (data ?? []) as AssetFolder[];
}

export async function createAssetFolder(
  tenantId: string,
  environment: string,
  parentPath: string,
  name: string,
): Promise<{ error?: string }> {
  const parent = normalizeFolderPath(parentPath);
  const path = joinFolderPath(parent, name);

  const { error } = await supabase.from('asset_folders').insert({
    tenant_id: tenantId,
    environment,
    path,
    name: name.trim(),
    parent_path: parent,
  });

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { error: 'A folder with this name already exists' };
    }
    if (error.message.includes('asset_folders')) {
      return { error: 'Run supabase/sql/17_asset_folders.sql to enable empty folders' };
    }
    return { error: error.message };
  }
  return {};
}

export async function ensureSystemFolders(tenantId: string, environment: string): Promise<void> {
  for (const sys of SYSTEM_FOLDERS) {
    try {
      await supabase.from('asset_folders').insert({
        tenant_id: tenantId,
        environment,
        path: sys.path,
        name: sys.name,
        parent_path: '/',
      });
    } catch {
      // Ignore duplicates
    }
  }
}

export async function renameAssetFolder(
  tenantId: string,
  environment: string,
  oldPath: string,
  newName: string,
): Promise<{ error?: string }> {
  const normOld = normalizeFolderPath(oldPath);
  if (isSystemFolder(normOld)) {
    return { error: 'System folders (Social, Templates, Forms, Landing Pages) cannot be renamed.' };
  }

  const cleanName = newName.trim().replace(/[/\\]/g, '-');
  if (!cleanName) return { error: 'A valid folder name is required.' };

  const parent = parentFolderPath(normOld);
  const newPath = joinFolderPath(parent, cleanName);

  if (normOld === newPath) return {};

  // Check if destination exists
  const { data: existing } = await supabase
    .from('asset_folders')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('path', newPath)
    .maybeSingle();

  if (existing) {
    return { error: `A folder named "${cleanName}" already exists in this directory.` };
  }

  // 1. Update matching folders in asset_folders
  const { data: allFolders } = await supabase
    .from('asset_folders')
    .select('id, path, parent_path')
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (allFolders) {
    let foundExact = false;
    for (const f of allFolders) {
      const fp = normalizeFolderPath(f.path);
      if (fp === normOld) {
        foundExact = true;
        await supabase
          .from('asset_folders')
          .update({ path: newPath, name: cleanName, parent_path: parent })
          .eq('id', f.id);
      } else if (fp.startsWith(`${normOld}/`)) {
        const updatedPath = fp.replace(normOld, newPath);
        const updatedParent = normalizeFolderPath(f.parent_path).replace(normOld, newPath);
        await supabase
          .from('asset_folders')
          .update({ path: updatedPath, parent_path: updatedParent })
          .eq('id', f.id);
      }
    }

    if (!foundExact) {
      try {
        await supabase.from('asset_folders').insert({
          tenant_id: tenantId,
          environment,
          path: newPath,
          name: cleanName,
          parent_path: parent,
        });
      } catch {
        // Ignore if exists
      }
    }
  } else {
    try {
      await supabase.from('asset_folders').insert({
        tenant_id: tenantId,
        environment,
        path: newPath,
        name: cleanName,
        parent_path: parent,
      });
    } catch {
      // Ignore if exists
    }
  }

  // 2. Cascade rename assets inside this folder and subfolders
  const { data: assets } = await supabase
    .from('assets')
    .select('id, folder')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .is('archived_at', null);

  if (assets) {
    for (const a of assets) {
      const af = normalizeFolderPath(a.folder);
      if (af === normOld) {
        await supabase.from('assets').update({ folder: newPath }).eq('id', a.id);
      } else if (af.startsWith(`${normOld}/`)) {
        await supabase.from('assets').update({ folder: af.replace(normOld, newPath) }).eq('id', a.id);
      }
    }
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'asset_folder',
    resourceId: normOld,
    resourceName: cleanName,
    summary: `Renamed folder from ${normOld} to ${newPath}`,
  });

  return {};
}

export async function deleteAssetFolder(
  tenantId: string,
  environment: string,
  folderPath: string,
  mode: 'move_to_parent' | 'delete_contents' = 'move_to_parent',
): Promise<{ error?: string }> {
  const normPath = normalizeFolderPath(folderPath);
  if (isSystemFolder(normPath)) {
    return { error: 'System folders (Social, Templates, Forms, Landing Pages) cannot be deleted.' };
  }

  const parent = parentFolderPath(normPath);

  // 1. Handle assets in folder and subfolders
  const { data: assets, error: assetErr } = await supabase
    .from('assets')
    .select('id, folder')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .is('archived_at', null);

  if (assetErr) {
    console.warn('Error fetching assets for folder deletion:', assetErr.message);
  }

  if (assets) {
    for (const a of assets) {
      const af = normalizeFolderPath(a.folder);
      if (af === normPath || af.startsWith(`${normPath}/`)) {
        if (mode === 'move_to_parent') {
          await supabase.from('assets').update({ folder: parent }).eq('id', a.id);
        } else {
          await supabase.from('assets').update({ archived_at: new Date().toISOString(), public_url: null }).eq('id', a.id);
        }
      }
    }
  }

  // 2. Delete folder and all child folders from asset_folders table
  const { data: allFolders } = await supabase
    .from('asset_folders')
    .select('id, path')
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (allFolders) {
    for (const f of allFolders) {
      const fp = normalizeFolderPath(f.path);
      if (fp === normPath || fp.startsWith(`${normPath}/`)) {
        await supabase.from('asset_folders').delete().eq('id', f.id);
      }
    }
  }

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'asset_folder',
    resourceId: normPath,
    resourceName: folderNameFromPath(normPath),
    summary: `Deleted folder ${normPath} (${mode})`,
  });

  return {};
}

export async function moveAssetFolder(
  tenantId: string,
  environment: string,
  sourceFolderPath: string,
  targetParentPath: string,
): Promise<{ error?: string }> {
  if (isSystemFolder(sourceFolderPath)) {
    return { error: 'System folders cannot be moved.' };
  }

  const sourceName = folderNameFromPath(sourceFolderPath);
  const targetParent = normalizeFolderPath(targetParentPath);

  // Prevent moving into self or child
  if (targetParent === sourceFolderPath || targetParent.startsWith(`${sourceFolderPath}/`)) {
    return { error: 'Cannot move a folder into itself or its own subfolder.' };
  }

  const newPath = joinFolderPath(targetParent, sourceName);
  if (sourceFolderPath === newPath) return {};

  return renameAssetFolder(tenantId, environment, sourceFolderPath, sourceName);
}

export function getPublicCopyUrl(asset: MarbeeAsset): string | null {
  if (asset.metadata.status !== 'published') return null;
  if (!asset.public_url || isBrokenGateUrl(asset.public_url)) return null;
  const validity = getAssetValidity(asset.metadata);
  if (validity === 'expired' || validity === 'scheduled') return null;
  return asset.public_url;
}

export function needsRepublish(asset: MarbeeAsset): boolean {
  return asset.metadata.status === 'published' && isBrokenGateUrl(asset.public_url);
}

export type SystemAssetTarget = 'templates' | 'forms' | 'social' | 'landing-pages';

/**
 * Uploads media specifically for system modules (Templates, Forms, Social, Landing Pages)
 * directly into their dedicated system folders and immediately publishes them to the public CDN.
 */
export async function uploadPublishedSystemAsset(
  tenantId: string,
  environment: string,
  file: File,
  target: SystemAssetTarget,
): Promise<{ error?: string; asset?: MarbeeAsset; publicUrl?: string }> {
  const folderMap: Record<SystemAssetTarget, { folder: string; name: string }> = {
    templates: { folder: '/Templates', name: 'Templates' },
    forms: { folder: '/Forms', name: 'Forms' },
    social: { folder: '/Social', name: 'Social' },
    'landing-pages': { folder: '/Landing Pages', name: 'Landing Pages' },
  };

  const targetConfig = folderMap[target];

  // 1. Ensure the system folder exists
  try {
    await createAssetFolder(tenantId, environment, '/', targetConfig.name);
  } catch {
    // Ignore if already created
  }

  // 2. Upload into the target system folder
  const uploadRes = await uploadAsset(tenantId, environment, file, targetConfig.folder);
  if (uploadRes.error || !uploadRes.asset) {
    return { error: uploadRes.error ?? 'Asset upload failed' };
  }

  // 3. Immediately publish to the public CDN bucket
  const pubRes = await setAssetPublished(uploadRes.asset, true);
  if (pubRes.error) {
    const fallbackUrl = await getAssetDisplayUrl(uploadRes.asset);
    return { asset: uploadRes.asset, publicUrl: fallbackUrl ?? undefined };
  }

  return { asset: uploadRes.asset, publicUrl: pubRes.publicUrl ?? undefined };
}

export async function uploadTemplateAsset(
  tenantId: string,
  environment: string,
  file: File,
) {
  return uploadPublishedSystemAsset(tenantId, environment, file, 'templates');
}

export async function uploadFormAsset(
  tenantId: string,
  environment: string,
  file: File,
) {
  return uploadPublishedSystemAsset(tenantId, environment, file, 'forms');
}

export async function uploadLandingPageAsset(
  tenantId: string,
  environment: string,
  file: File,
) {
  return uploadPublishedSystemAsset(tenantId, environment, file, 'landing-pages');
}

export async function uploadSocialMediaAsset(
  tenantId: string,
  environment: string,
  file: File,
) {
  return uploadPublishedSystemAsset(tenantId, environment, file, 'social');
}


