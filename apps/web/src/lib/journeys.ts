import { supabase } from './supabase';
import { nurtureBlastTemplate, emptyCampaignCanvas } from './campaign-templates';
import { logAudit } from './audit';
import {
  folderNameFromPath,
  joinFolderPath,
  normalizeFolderPath,
  parentFolderPath,
  remapFolderPathAfterDelete,
  type JourneyFolder,
} from './journey-folders';

export type JourneyType = 'flow' | 'campaign' | 'blast';

export type CampaignSettings = {
  journey_type?: JourneyType | string;
  campaign_owner?: string;
  campaign_owner_id?: string;
  campaign_developer?: string;
  campaign_developer_id?: string;
  approval_status?: 'none' | 'pending' | 'approved' | 'rejected';
  approval_notes?: string;
  /** Flow-journey builder settings — re-entry, exit criteria, goal, quiet hours */
  journey_builder?: Record<string, unknown>;
};

export type JourneyDisplayStatus =
  | 'draft'
  | 'published'
  | 'paused'
  | 'archived'
  | 'scheduled'
  | 'started'
  | 'finished';

export type JourneyRow = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  description: string | null;
  status: string;
  folder_path?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  current_version_id: string | null;
  entry_trigger_config: Record<string, unknown>;
  settings: CampaignSettings | null;
  /** Editable, instance-unique campaign ID (supabase/sql/83_campaign_code.sql). */
  campaign_code?: string | null;
  created_at?: string;
  updated_at?: string;
  journey_versions?: Array<{
    id: string;
    journey_id: string;
    version_number: number;
    canvas_json: unknown;
    published_at?: string | null;
  }>;
};

export function normalizeJourneyType(type?: JourneyType | string | null): 'flow' | 'campaign' {
  return type === 'flow' ? 'flow' : 'campaign';
}

export function isCampaignJourney(j: Pick<JourneyRow, 'settings'>): boolean {
  return normalizeJourneyType(j.settings?.journey_type) === 'campaign';
}

export async function markCampaignDeployed(
  journeyId: string,
  tenantId: string,
  environment: string,
  name: string,
) {
  const { error } = await supabase
    .from('journeys')
    .update({ status: 'published' })
    .eq('id', journeyId)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'publish',
    resourceType: 'journey',
    resourceId: journeyId,
    resourceName: name,
    summary: `Campaign "${name}" deployed`,
  });
}

export function journeyType(j: Pick<JourneyRow, 'settings'>): 'flow' | 'campaign' {
  return normalizeJourneyType(j.settings?.journey_type);
}

export function resolveJourneyDisplayStatus(
  journey: Pick<JourneyRow, 'status' | 'starts_at' | 'ends_at' | 'settings'>,
): JourneyDisplayStatus {
  const now = Date.now();
  const isCampaign = isCampaignJourney(journey);

  if (journey.status === 'archived') return 'archived';
  if (journey.status === 'paused') return 'paused';

  if (isCampaign) {
    const end = journey.ends_at ? new Date(journey.ends_at).getTime() : NaN;
    const start = journey.starts_at ? new Date(journey.starts_at).getTime() : NaN;

    if (!Number.isNaN(end) && end < now) return 'finished';
    if (!Number.isNaN(start) && start > now) return 'scheduled';

    // Date window drives Started for campaigns — not DB publish status
    if (!Number.isNaN(start) && start <= now && (Number.isNaN(end) || end >= now)) {
      return 'started';
    }
    if (Number.isNaN(start) && !Number.isNaN(end) && end >= now) {
      return 'started';
    }
  }

  if (journey.status === 'published') return 'published';
  return 'draft';
}

export const JOURNEY_DISPLAY_STATUS_LABELS: Record<JourneyDisplayStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  paused: 'Paused',
  archived: 'Archived',
  scheduled: 'Scheduled',
  started: 'Started',
  finished: 'Finished',
};

/** Fetch journey + versions without ambiguous PostgREST embed (journeys ↔ journey_versions circular FK). */
export async function fetchJourneyDetail(
  id: string,
  tenantId: string,
  environment: string,
): Promise<JourneyRow | null> {
  const { data: journey, error } = await supabase
    .from('journeys')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!journey) return null;

  const { data: versions, error: versionError } = await supabase
    .from('journey_versions')
    .select('*')
    .eq('journey_id', id)
    .order('version_number', { ascending: false });

  if (versionError) throw versionError;

  return {
    ...(journey as JourneyRow),
    journey_versions: versions ?? [],
  };
}

export async function fetchJourneys(tenantId: string, environment: string): Promise<JourneyRow[]> {
  const { data, error } = await supabase
    .from('journeys')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  const journeys = (data ?? []) as JourneyRow[];
  return attachJourneyCanvasSummaries(journeys);
}

async function attachJourneyCanvasSummaries(journeys: JourneyRow[]): Promise<JourneyRow[]> {
  const versionIds = [
    ...new Set(journeys.map((j) => j.current_version_id).filter(Boolean)),
  ] as string[];

  if (!versionIds.length) return journeys;

  const { data: versions, error } = await supabase
    .from('journey_versions')
    .select('id, journey_id, version_number, canvas_json')
    .in('id', versionIds);

  if (error) throw error;

  const versionById = new Map((versions ?? []).map((v) => [v.id, v]));

  return journeys.map((journey) => {
    const version = journey.current_version_id
      ? versionById.get(journey.current_version_id)
      : null;
    return {
      ...journey,
      journey_versions: version ? [version] : [],
    };
  });
}

export async function fetchJourneyFolders(
  tenantId: string,
  environment: string,
): Promise<JourneyFolder[]> {
  const { data, error } = await supabase
    .from('journey_folders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('name');

  if (error) {
    if (error.message.includes('journey_folders')) return [];
    throw error;
  }
  return (data ?? []) as JourneyFolder[];
}

export async function createJourneyFolder(
  tenantId: string,
  environment: string,
  parentPath: string,
  name: string,
): Promise<{ error?: string }> {
  const parent = normalizeFolderPath(parentPath);
  const path = joinFolderPath(parent, name);

  const { error } = await supabase.from('journey_folders').insert({
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
    if (error.message.includes('journey_folders')) {
      return { error: 'Run supabase/sql/35_journey_folders_and_schedule.sql to enable folders' };
    }
    return { error: error.message };
  }
  return {};
}

export async function deleteJourneyFolder(
  tenantId: string,
  environment: string,
  folderPath: string,
): Promise<{ error?: string }> {
  const path = normalizeFolderPath(folderPath);
  if (path === '/') return { error: 'Cannot delete the root folder' };
  const parent = parentFolderPath(path);

  const { data: journeys, error: listError } = await supabase
    .from('journeys')
    .select('id, folder_path')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .is('deleted_at', null)
    .or(`folder_path.eq.${path},folder_path.like.${path}/%`);

  if (listError) return { error: listError.message };

  for (const journey of journeys ?? []) {
    const nextPath = remapFolderPathAfterDelete(journey.folder_path ?? '/', path, parent);
    const { error } = await supabase
      .from('journeys')
      .update({ folder_path: nextPath })
      .eq('id', journey.id);
    if (error) return { error: error.message };
  }

  const { error: folderDeleteError } = await supabase
    .from('journey_folders')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .or(`path.eq.${path},path.like.${path}/%`);

  if (folderDeleteError) return { error: folderDeleteError.message };
  return {};
}

export async function renameJourneyFolder(
  tenantId: string,
  environment: string,
  folderPath: string,
  newName: string,
): Promise<{ error?: string }> {
  const oldPath = normalizeFolderPath(folderPath);
  if (oldPath === '/') return { error: 'Cannot rename the root folder' };

  const trimmed = newName.trim();
  if (!trimmed) return { error: 'Folder name is required' };

  const parent = parentFolderPath(oldPath);
  let newPath: string;
  try {
    newPath = joinFolderPath(parent, trimmed);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid folder name' };
  }

  if (oldPath === newPath) return {};

  const { data: conflict } = await supabase
    .from('journey_folders')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('path', newPath)
    .maybeSingle();

  if (conflict) return { error: 'A folder with this name already exists' };

  const { data: journeys, error: listError } = await supabase
    .from('journeys')
    .select('id, folder_path')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .is('deleted_at', null)
    .or(`folder_path.eq.${oldPath},folder_path.like.${oldPath}/%`);

  if (listError) return { error: listError.message };

  for (const journey of journeys ?? []) {
    const nextPath = normalizeFolderPath(
      (journey.folder_path ?? '/').replace(oldPath, newPath),
    );
    const { error } = await supabase
      .from('journeys')
      .update({ folder_path: nextPath })
      .eq('id', journey.id);
    if (error) return { error: error.message };
  }

  const { data: folders, error: folderListError } = await supabase
    .from('journey_folders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .or(`path.eq.${oldPath},path.like.${oldPath}/%`);

  if (folderListError) return { error: folderListError.message };

  for (const folder of folders ?? []) {
    if (folder.path === oldPath) {
      const { error } = await supabase
        .from('journey_folders')
        .update({ path: newPath, name: trimmed, parent_path: parent })
        .eq('id', folder.id);
      if (error) return { error: error.message };
      continue;
    }

    const updatedPath = normalizeFolderPath(folder.path.replace(oldPath, newPath));
    const updatedParent = normalizeFolderPath(
      folder.parent_path === oldPath
        ? newPath
        : folder.parent_path.replace(oldPath, newPath),
    );
    const { error } = await supabase
      .from('journey_folders')
      .update({
        path: updatedPath,
        parent_path: updatedParent,
        name: folderNameFromPath(updatedPath),
      })
      .eq('id', folder.id);
    if (error) return { error: error.message };
  }

  return {};
}

export async function renameJourney(
  journeyId: string,
  tenantId: string,
  environment: string,
  name: string,
): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Name is required' };

  const { error } = await supabase
    .from('journeys')
    .update({ name: trimmed })
    .eq('id', journeyId)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (error) return { error: error.message };

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: journeyId,
    resourceName: trimmed,
    summary: `Renamed to "${trimmed}"`,
  });

  return {};
}

export async function deleteJourney(
  journeyId: string,
  tenantId: string,
  environment: string,
  name?: string,
): Promise<{ error?: string }> {
  try {
    // Delete journey versions
    await supabase.from('journey_versions').delete().eq('journey_id', journeyId);

    // Delete journey
    const { error } = await supabase
      .from('journeys')
      .delete()
      .eq('id', journeyId)
      .eq('tenant_id', tenantId)
      .eq('environment', environment);

    if (error) {
      // Fallback to soft delete if constraints exist
      const { error: softErr } = await supabase
        .from('journeys')
        .update({ deleted_at: new Date().toISOString(), status: 'archived' })
        .eq('id', journeyId);
      if (softErr) return { error: softErr.message };
    }

    void logAudit({
      tenantId,
      environment,
      action: 'delete',
      resourceType: 'journey',
      resourceId: journeyId,
      resourceName: name || 'Journey',
      summary: `Permanently deleted journey "${name || journeyId}"`,
    });

    return {};
  } catch (err: any) {
    return { error: err?.message || 'Failed to delete journey' };
  }
}

export async function updateCampaignDetails(
  journeyId: string,
  tenantId: string,
  environment: string,
  patch: {
    name?: string;
    description?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    settings?: Partial<CampaignSettings>;
  },
  currentSettings?: CampaignSettings | null,
): Promise<{ error?: string }> {
  const row: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) return { error: 'Name is required' };
    row.name = trimmed;
  }
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.settings !== undefined) {
    row.settings = { ...(currentSettings ?? {}), ...patch.settings };
  }

  if (!Object.keys(row).length) return {};

  const { error } = await supabase
    .from('journeys')
    .update(row)
    .eq('id', journeyId)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (error) return { error: error.message };

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: journeyId,
    resourceName: patch.name?.trim(),
    summary: 'Updated campaign details',
  });

  return {};
}

/** Pipeline-style lifecycle controls for campaigns: Start · Pause · Resume · Stop. */
export type CampaignLifecycleAction = 'start' | 'pause' | 'resume' | 'stop';

export async function setCampaignLifecycle(
  journey: Pick<JourneyRow, 'id' | 'name' | 'ends_at'>,
  tenantId: string,
  environment: string,
  action: CampaignLifecycleAction,
): Promise<{ error?: string }> {
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {};

  if (action === 'start' || action === 'resume') {
    row.status = 'published';
    // Restarting a campaign that was stopped (end date in the past) re-opens its window.
    if (journey.ends_at && new Date(journey.ends_at).getTime() < Date.now()) row.ends_at = null;
  } else if (action === 'pause') {
    row.status = 'paused';
  } else {
    // Stop = end the campaign now; it reads as Finished from here on.
    row.status = 'published';
    row.ends_at = nowIso;
  }

  const { error } = await supabase
    .from('journeys')
    .update(row)
    .eq('id', journey.id)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) return { error: error.message };

  if (action === 'stop') {
    // Exit anyone still in flight so the runner stops delivering.
    const { error: exitError } = await supabase
      .from('journey_instances')
      .update({ status: 'exited', completed_at: nowIso })
      .eq('journey_id', journey.id)
      .in('status', ['entered', 'active', 'waiting']);
    if (exitError) return { error: exitError.message };
  }

  const verb = { start: 'Started', pause: 'Paused', resume: 'Resumed', stop: 'Stopped' }[action];
  void logAudit({
    tenantId,
    environment,
    action: action === 'start' || action === 'resume' ? 'publish' : 'update',
    resourceType: 'journey',
    resourceId: journey.id,
    resourceName: journey.name,
    summary: `${verb} campaign "${journey.name}"`,
  });

  return {};
}

/** Copy a journey/campaign and its current canvas into a new draft. */
export async function duplicateJourney(
  source: JourneyRow,
  tenantId: string,
  environment: string,
): Promise<JourneyRow> {
  const created = await createJourney({
    tenantId,
    environment,
    name: `${source.name} (Copy)`,
    description: source.description ?? undefined,
    type: journeyType(source),
    folderPath: source.folder_path ?? '/',
    startsAt: source.starts_at ?? null,
    endsAt: source.ends_at ?? null,
  });

  const sourceVersion = resolveJourneyVersion(source);
  const versionId = created.current_version_id;
  if (sourceVersion?.canvas_json && versionId) {
    const { error } = await supabase
      .from('journey_versions')
      .update({ canvas_json: sourceVersion.canvas_json })
      .eq('id', versionId);
    if (error) throw error;
  }

  const { error: metaError } = await supabase
    .from('journeys')
    .update({ settings: source.settings, entry_trigger_config: source.entry_trigger_config })
    .eq('id', created.id);
  if (metaError) throw metaError;

  return created;
}

export async function moveJourneyToFolder(
  journeyId: string,
  folderPath: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('journeys')
    .update({ folder_path: normalizeFolderPath(folderPath) })
    .eq('id', journeyId);

  if (error) return { error: error.message };
  return {};
}

export async function createJourney(input: {
  tenantId: string;
  environment: string;
  name: string;
  description?: string;
  type: JourneyType;
  folderPath?: string;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<JourneyRow> {
  const isCampaign = normalizeJourneyType(input.type) === 'campaign';
  const initialCanvas = isCampaign ? emptyCampaignCanvas() : nurtureBlastTemplate();

  const canvasJson = { nodes: initialCanvas.nodes, edges: initialCanvas.edges };
  const storedType = isCampaign ? 'campaign' : 'flow';

  const { data: journey, error: journeyError } = await supabase
    .from('journeys')
    .insert({
      tenant_id: input.tenantId,
      environment: input.environment,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      status: 'draft',
      folder_path: normalizeFolderPath(input.folderPath ?? '/'),
      starts_at: input.startsAt || null,
      ends_at: input.endsAt || null,
      settings: { journey_type: storedType },
      entry_trigger_config:
        isCampaign
          ? { type: 'query', audience_slug: 'email-reachable' }
          : { type: 'segment', audience_slug: 'email-reachable' },
    })
    .select('*')
    .single();

  if (journeyError) throw journeyError;

  const { data: version, error: versionError } = await supabase
    .from('journey_versions')
    .insert({
      journey_id: journey.id,
      version_number: 1,
      canvas_json: canvasJson,
    })
    .select('*')
    .single();

  if (versionError) {
    await supabase.from('journeys').delete().eq('id', journey.id);
    throw versionError;
  }

  const { data: updated, error: updateError } = await supabase
    .from('journeys')
    .update({ current_version_id: version.id })
    .eq('id', journey.id)
    .select('*')
    .single();

  if (updateError) throw updateError;

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'create',
    resourceType: 'journey',
    resourceId: journey.id,
    resourceName: input.name.trim(),
    summary: `Created ${isCampaign ? 'campaign' : 'journey'} "${input.name.trim()}"`,
  });

  return {
    ...(updated as JourneyRow),
    current_version_id: version.id,
    journey_versions: [version],
  };
}

export function resolveJourneyVersion(journey: JourneyRow | null | undefined) {
  if (!journey?.journey_versions?.length) return null;
  return (
    journey.journey_versions.find((v) => v.id === journey.current_version_id) ??
    journey.journey_versions[0]
  );
}
