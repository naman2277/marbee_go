import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { catalogEntry, type ConnectorAuthMethod } from '@/lib/connector-catalog';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';

/**
 * State + persistence for the 6-step Add-Connector wizard (Blueprint S-03).
 *
 * Resumability contract: closing the wizard at any step upserts a **draft
 * connector** (`connectors.status = 'draft'`) whose `config.__wizard` holds the
 * full wizard state. Secrets entered in the Authenticate step are never stored
 * here — only `{ connected: true, method }`. On finish, the row is promoted to
 * `status = 'active'` and `config.__wizard` is stripped.
 */

export type WizardStepKey = 'source' | 'auth' | 'discover' | 'map' | 'sync' | 'review';

export const WIZARD_STEPS: { key: WizardStepKey; label: string; hint: string }[] = [
  { key: 'source', label: 'Source', hint: 'pick type' },
  { key: 'auth', label: 'Authenticate', hint: 'connect securely' },
  { key: 'discover', label: 'Discover', hint: 'inspect & propose schema' },
  { key: 'map', label: 'Map', hint: 'source → destination fields' },
  { key: 'sync', label: 'Sync', hint: 'mode & schedule' },
  { key: 'review', label: 'Review', hint: 'test & start' },
];

export type SyncMode = 'one_time' | 'scheduled' | 'continuous' | 'realtime' | 'incremental';
export type SyncFrequency = 'realtime' | '5m' | 'hourly' | 'daily' | 'custom';

export type DiscoveredField = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  sample?: string;
};

export type TestOutcome = {
  status: 'success' | 'failed';
  message: string;
  ranAt: string;
  sampleRows?: number;
};

export type WizardState = {
  /** Zero-based index of the step the user is currently on. */
  step: number;
  /** Highest step index reached — later steps stay locked until reached once. */
  furthest: number;
  name: string;
  source?: { type: string };
  auth?: {
    method: ConnectorAuthMethod;
    connected: boolean;
    connectedAt?: string;
    /** Non-secret connection hints worth showing on resume (host, base URL…). */
    hints?: Record<string, string>;
  };
  discover?: { acceptedAt?: string; fields: DiscoveredField[] };
  targetSchema?: string;
  mapping?: ConnectorMappingRow[];
  sync?: {
    mode: SyncMode;
    frequency: SyncFrequency;
    cron?: string;
    cursorField?: string;
  };
  review?: { testConnection?: TestOutcome; testSync?: TestOutcome };
};

export function emptyWizardState(): WizardState {
  return { step: 0, furthest: 0, name: '' };
}

export type DraftConnector = {
  id: string;
  name: string;
  connector_type: string;
  direction: string;
  updated_at: string;
  wizard: WizardState;
};

const WIZARD_KEY = '__wizard';

type ConfigWithWizard = Record<string, unknown> & { [WIZARD_KEY]?: WizardState };

function readWizard(config: unknown): WizardState {
  const cfg = (config ?? {}) as ConfigWithWizard;
  const w = cfg[WIZARD_KEY];
  if (w && typeof w === 'object') return { ...emptyWizardState(), ...(w as WizardState) };
  return emptyWizardState();
}

export function draftProgressLabel(state: WizardState): string {
  const stepNum = Math.min(state.furthest, WIZARD_STEPS.length - 1) + 1;
  const label = WIZARD_STEPS[Math.min(state.furthest, WIZARD_STEPS.length - 1)].label;
  return `Step ${stepNum} of ${WIZARD_STEPS.length} · ${label}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function fetchDrafts(tenantId: string, environment: string): Promise<DraftConnector[]> {
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, connector_type, direction, config, updated_at')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? 'Untitled connector',
    connector_type: row.connector_type as string,
    direction: row.direction as string,
    updated_at: row.updated_at as string,
    wizard: readWizard(row.config),
  }));
}

export function useConnectorDrafts(tenantId: string | undefined, environment: string) {
  return useQuery({
    queryKey: ['connector-drafts', tenantId, environment],
    enabled: Boolean(tenantId),
    queryFn: () => fetchDrafts(tenantId as string, environment),
  });
}

export async function loadDraft(id: string): Promise<DraftConnector | null> {
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, connector_type, direction, config, updated_at, status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'draft') return null;
  return {
    id: data.id as string,
    name: (data.name as string) ?? 'Untitled connector',
    connector_type: data.connector_type as string,
    direction: data.direction as string,
    updated_at: data.updated_at as string,
    wizard: readWizard(data.config),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type SaveArgs = {
  tenantId: string;
  environment: string;
  draftId: string | null;
  state: WizardState;
};

/** Upsert the draft connector row. Returns the row id (new or existing). */
export async function saveDraft({ tenantId, environment, draftId, state }: SaveArgs): Promise<string> {
  const entry = state.source ? catalogEntry(state.source.type) : undefined;
  const connectorType = state.source?.type ?? 'unconfigured';
  const direction = entry?.direction ?? 'inbound';
  const name = state.name.trim() || (entry ? `${entry.label} connector` : 'Untitled connector');

  const config: ConfigWithWizard = {
    ...(state.auth?.hints ?? {}),
    [WIZARD_KEY]: state,
  };
  const mapping = state.mapping ?? [];

  if (draftId) {
    const { error } = await supabase
      .from('connectors')
      .update({ name, connector_type: connectorType, direction, config, mapping, updated_at: new Date().toISOString() })
      .eq('id', draftId);
    if (error) throw error;
    return draftId;
  }

  const { data, error } = await supabase
    .from('connectors')
    .insert({
      tenant_id: tenantId,
      environment,
      name,
      connector_type: connectorType,
      direction,
      config,
      mapping,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'connector',
    resourceId: data.id as string,
    resourceName: `${name} (draft)`,
  });
  return data.id as string;
}

export async function discardDraft(id: string): Promise<void> {
  const { error } = await supabase.from('connectors').delete().eq('id', id).eq('status', 'draft');
  if (error) throw error;
}

type PromoteArgs = {
  tenantId: string;
  environment: string;
  draftId: string;
  state: WizardState;
};

/**
 * Promote a draft to a live connector and seed a first run so it shows up in
 * the Job Center / Sync Monitor immediately. Returns the connector id.
 */
export async function promoteDraft({ tenantId, environment, draftId, state }: PromoteArgs): Promise<string> {
  const entry = state.source ? catalogEntry(state.source.type) : undefined;
  const connectorType = state.source?.type ?? 'unconfigured';
  const direction = entry?.direction ?? 'inbound';
  const name = state.name.trim() || (entry ? `${entry.label} connector` : 'New connector');

  // Strip the wizard blob; keep the non-secret hints.
  const config: Record<string, unknown> = { ...(state.auth?.hints ?? {}) };
  if (state.sync) {
    config.sync_mode = state.sync.mode;
    config.frequency = state.sync.frequency;
    if (state.sync.cursorField) config.cursor = state.sync.cursorField;
  }
  if (state.targetSchema) config.bridge_schema = state.targetSchema;
  if (state.auth?.method) config.auth_method = state.auth.method;

  const scheduleCron =
    state.sync?.mode === 'scheduled' || state.sync?.mode === 'incremental'
      ? state.sync?.cron || cronForFrequency(state.sync?.frequency)
      : null;

  const cleanMapping = (state.mapping ?? [])
    .filter((r) => r.source_field && r.target_field)
    .map(({ confirmed: _confirmed, ...r }) => r);

  const { error: upErr } = await supabase
    .from('connectors')
    .update({
      name,
      connector_type: connectorType,
      direction,
      config,
      mapping: cleanMapping,
      schedule_cron: scheduleCron,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId);
  if (upErr) throw upErr;

  // Seed a queued run unless the connector is purely event-driven.
  if (state.sync?.mode !== 'realtime') {
    await supabase.from('connector_runs').insert({
      connector_id: draftId,
      status: state.sync?.mode === 'one_time' ? 'queued' : 'queued',
      records_processed: 0,
      records_failed: 0,
    });
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'connector',
    resourceId: draftId,
    resourceName: name,
    metadata: { event: 'wizard_complete', connector_type: connectorType },
  });
  return draftId;
}

function cronForFrequency(freq: SyncFrequency | undefined): string | null {
  switch (freq) {
    case 'hourly':
      return '0 * * * *';
    case 'daily':
      return '0 2 * * *';
    case '5m':
      return '*/5 * * * *';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Simulated engine steps (no real discovery/test backend yet)
// ---------------------------------------------------------------------------

const SAMPLE_SCHEMAS: Record<string, DiscoveredField[]> = {
  default: [
    { name: 'id', type: 'string', nullable: false, primaryKey: true, sample: 'cus_9F2a…' },
    { name: 'email', type: 'string', nullable: false, sample: 'ada@example.com' },
    { name: 'first_name', type: 'string', nullable: true, sample: 'Ada' },
    { name: 'last_name', type: 'string', nullable: true, sample: 'Lovelace' },
    { name: 'phone', type: 'string', nullable: true, sample: '+15551234567' },
    { name: 'country', type: 'string', nullable: true, sample: 'US' },
    { name: 'created_at', type: 'timestamp', nullable: false, sample: '2026-08-27T22:41:03Z' },
    { name: 'updated_at', type: 'timestamp', nullable: false, sample: '2026-08-28T09:12:55Z' },
    { name: 'lifetime_value', type: 'number', nullable: true, sample: '1284.50' },
    { name: 'is_active', type: 'boolean', nullable: false, sample: 'true' },
  ],
};

export function simulateDiscovery(connectorType: string): DiscoveredField[] {
  return SAMPLE_SCHEMAS[connectorType] ?? SAMPLE_SCHEMAS.default;
}

export const DISCOVERY_MESSAGES = [
  'Opening a secure connection…',
  'Listing objects and tables…',
  'Reading column types and constraints…',
  'Detecting primary keys and unique fields…',
  'Sampling 100 rows for preview…',
  'Assembling the proposed schema…',
];

export function candidateCursorFields(fields: DiscoveredField[]): string[] {
  return fields
    .filter((f) => f.type === 'timestamp' || /(_at|_id|sequence|version)$/.test(f.name))
    .map((f) => f.name);
}
