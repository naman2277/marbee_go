/**
 * global-variables.ts — tenant/environment scoped named values.
 *
 * A global variable is referenced everywhere by its name, e.g. `{{vars.FORM_PII_KEY}}`,
 * so workflows, forms, landing pages, imports and exports all point at one definition
 * and a rotation happens in a single place.
 *
 * Three kinds:
 *   - `plain`      — non-sensitive config (a base URL, a region code). Readable.
 *   - `secret`     — sensitive text (a third-party token). Stored AES-encrypted.
 *   - `encryption_key` — an AES-256 key used to encrypt other data (e.g. form PII).
 *
 * `secret` and `encryption_key` values are sealed with the tenant master key before
 * they leave the browser, so the stored row never contains plaintext.
 */

import { supabase } from './supabase';
import {
  decryptValue,
  encryptValue,
  generateAesKey,
  keyFingerprint,
} from './crypto-vault';

export type GlobalVariableKind = 'plain' | 'secret' | 'encryption_key';

export type GlobalVariableScope =
  | 'forms'
  | 'workflows'
  | 'landing_pages'
  | 'imports'
  | 'exports'
  | 'connectors'
  | 'all';

export type GlobalVariable = {
  id: string;
  tenant_id: string;
  environment: string;
  /** Uppercase identifier used in `{{vars.NAME}}` references. */
  name: string;
  description: string | null;
  kind: GlobalVariableKind;
  /** Plaintext for `plain`; AES envelope for `secret` and `encryption_key`. */
  value: string;
  /** Where this variable is allowed to be resolved. */
  scopes: GlobalVariableScope[];
  /** Short SHA-256 fingerprint — shown instead of the key itself. */
  fingerprint: string | null;
  rotated_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export const VARIABLE_SCOPES: Array<{ value: GlobalVariableScope; label: string }> = [
  { value: 'all', label: 'Everywhere' },
  { value: 'forms', label: 'Forms' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'landing_pages', label: 'Landing pages' },
  { value: 'imports', label: 'Imports' },
  { value: 'exports', label: 'Exports' },
  { value: 'connectors', label: 'Connectors' },
];

const STORAGE_KEY = 'marbee_global_variables_v1';
const MASTER_KEY_STORAGE = 'marbee_vault_master_key_v1';

/** Reference syntax: `{{vars.NAME}}` — tolerant of surrounding whitespace. */
const REFERENCE_PATTERN = /\{\{\s*vars\.([A-Z0-9_]+)\s*\}\}/g;

/** Normalize a user-typed name into the canonical `UPPER_SNAKE` identifier. */
export function normalizeVariableName(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/** The reference string to paste elsewhere in the product. */
export function variableReference(name: string): string {
  return `{{vars.${name}}}`;
}

// -----------------------------------------------------------------------------
// Master key — seals secret values at rest
// -----------------------------------------------------------------------------

/**
 * The tenant master key wraps every `secret` / `encryption_key` value.
 * It is created on first use and kept in local storage for this browser; a
 * server-side KMS would replace this in a hardened deployment.
 */
async function getMasterKey(tenantId: string): Promise<string> {
  const storageKey = `${MASTER_KEY_STORAGE}_${tenantId}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = await generateAesKey();
  localStorage.setItem(storageKey, created);
  return created;
}

// -----------------------------------------------------------------------------
// Local fallback storage (used when the Supabase table is unavailable)
// -----------------------------------------------------------------------------

function localKey(tenantId: string, environment: string) {
  return `${STORAGE_KEY}_${tenantId}_${environment}`;
}

function readLocal(tenantId: string, environment: string): GlobalVariable[] {
  try {
    const raw = localStorage.getItem(localKey(tenantId, environment));
    return raw ? (JSON.parse(raw) as GlobalVariable[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(tenantId: string, environment: string, list: GlobalVariable[]) {
  try {
    localStorage.setItem(localKey(tenantId, environment), JSON.stringify(list));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

// -----------------------------------------------------------------------------
// CRUD
// -----------------------------------------------------------------------------

export async function fetchGlobalVariables(
  tenantId: string,
  environment: string,
): Promise<GlobalVariable[]> {
  try {
    const { data, error } = await supabase
      .from('global_variables')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .order('name');
    if (error) throw error;
    if (data) {
      writeLocal(tenantId, environment, data as GlobalVariable[]);
      return data as GlobalVariable[];
    }
  } catch {
    /* fall through to local */
  }
  return readLocal(tenantId, environment);
}

export type CreateVariableInput = {
  tenantId: string;
  environment: string;
  name: string;
  description?: string;
  kind: GlobalVariableKind;
  /** Omit for `encryption_key` to generate a fresh AES-256 key. */
  value?: string;
  scopes?: GlobalVariableScope[];
};

export async function createGlobalVariable(
  input: CreateVariableInput,
): Promise<{ variable?: GlobalVariable; error?: string }> {
  const name = normalizeVariableName(input.name);
  if (!name) return { error: 'A variable name is required' };

  const existing = await fetchGlobalVariables(input.tenantId, input.environment);
  if (existing.some((v) => v.name === name)) {
    return { error: `A variable named ${name} already exists in this environment` };
  }

  const plaintext =
    input.kind === 'encryption_key' ? input.value || (await generateAesKey()) : input.value ?? '';

  if (input.kind !== 'encryption_key' && !plaintext) {
    return { error: 'A value is required' };
  }

  const master = await getMasterKey(input.tenantId);
  const stored = input.kind === 'plain' ? plaintext : await encryptValue(plaintext, master);
  const fingerprint = input.kind === 'encryption_key' ? await keyFingerprint(plaintext) : null;
  const now = new Date().toISOString();

  const row: GlobalVariable = {
    id: crypto.randomUUID(),
    tenant_id: input.tenantId,
    environment: input.environment,
    name,
    description: input.description?.trim() || null,
    kind: input.kind,
    value: stored,
    scopes: input.scopes?.length ? input.scopes : ['all'],
    fingerprint,
    rotated_at: input.kind === 'encryption_key' ? now : null,
    last_used_at: null,
    created_at: now,
    updated_at: now,
  };

  try {
    const { error } = await supabase.from('global_variables').insert(row);
    if (error) throw error;
  } catch {
    /* persisted locally below */
  }
  writeLocal(input.tenantId, input.environment, [...existing, row]);
  return { variable: row };
}

export async function updateGlobalVariable(
  tenantId: string,
  environment: string,
  id: string,
  patch: { description?: string; scopes?: GlobalVariableScope[]; value?: string },
): Promise<{ error?: string }> {
  const list = await fetchGlobalVariables(tenantId, environment);
  const current = list.find((v) => v.id === id);
  if (!current) return { error: 'Variable not found' };

  const update: Partial<GlobalVariable> = { updated_at: new Date().toISOString() };
  if (patch.description !== undefined) update.description = patch.description.trim() || null;
  if (patch.scopes !== undefined) update.scopes = patch.scopes.length ? patch.scopes : ['all'];

  if (patch.value !== undefined && patch.value !== '') {
    const master = await getMasterKey(tenantId);
    update.value = current.kind === 'plain' ? patch.value : await encryptValue(patch.value, master);
    if (current.kind === 'encryption_key') {
      update.fingerprint = await keyFingerprint(patch.value);
      update.rotated_at = update.updated_at;
    }
  }

  try {
    const { error } = await supabase.from('global_variables').update(update).eq('id', id);
    if (error) throw error;
  } catch {
    /* persisted locally below */
  }
  writeLocal(
    tenantId,
    environment,
    list.map((v) => (v.id === id ? { ...v, ...update } : v)),
  );
  return {};
}

/** Replace an encryption key's material with a freshly generated AES-256 key. */
export async function rotateEncryptionKey(
  tenantId: string,
  environment: string,
  id: string,
): Promise<{ error?: string }> {
  const fresh = await generateAesKey();
  return updateGlobalVariable(tenantId, environment, id, { value: fresh });
}

export async function deleteGlobalVariable(
  tenantId: string,
  environment: string,
  id: string,
): Promise<{ error?: string }> {
  const list = await fetchGlobalVariables(tenantId, environment);
  try {
    const { error } = await supabase.from('global_variables').delete().eq('id', id);
    if (error) throw error;
  } catch {
    /* removed locally below */
  }
  writeLocal(
    tenantId,
    environment,
    list.filter((v) => v.id !== id),
  );
  return {};
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

/** Reveal the plaintext of a variable. Secrets are unwrapped with the master key. */
export async function revealVariable(
  tenantId: string,
  variable: GlobalVariable,
): Promise<string> {
  if (variable.kind === 'plain') return variable.value;
  const master = await getMasterKey(tenantId);
  return decryptValue(variable.value, master);
}

/** Look up one variable by name and return its plaintext, or null when absent. */
export async function resolveVariable(
  tenantId: string,
  environment: string,
  name: string,
  scope: GlobalVariableScope = 'all',
): Promise<string | null> {
  const list = await fetchGlobalVariables(tenantId, environment);
  const found = list.find(
    (v) => v.name === name && (scope === 'all' || v.scopes.includes('all') || v.scopes.includes(scope)),
  );
  if (!found) return null;
  try {
    return await revealVariable(tenantId, found);
  } catch {
    return null;
  }
}

/** Every `{{vars.NAME}}` reference found in a string. */
export function extractReferences(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(REFERENCE_PATTERN)) names.add(match[1]);
  return [...names];
}

/**
 * Substitute every `{{vars.NAME}}` reference in a template with its value.
 * Unknown names are left in place so the problem stays visible rather than
 * silently collapsing to an empty string.
 */
export async function interpolateVariables(
  template: string,
  tenantId: string,
  environment: string,
  scope: GlobalVariableScope = 'all',
): Promise<string> {
  const names = extractReferences(template);
  if (names.length === 0) return template;

  const list = await fetchGlobalVariables(tenantId, environment);
  const resolved = new Map<string, string>();
  for (const name of names) {
    const found = list.find(
      (v) =>
        v.name === name && (scope === 'all' || v.scopes.includes('all') || v.scopes.includes(scope)),
    );
    if (!found) continue;
    try {
      resolved.set(name, await revealVariable(tenantId, found));
    } catch {
      /* leave the reference in place */
    }
  }

  return template.replace(REFERENCE_PATTERN, (whole, name: string) => resolved.get(name) ?? whole);
}

/** Encryption keys only — the list offered when picking a key for field encryption. */
export async function listEncryptionKeys(
  tenantId: string,
  environment: string,
): Promise<GlobalVariable[]> {
  const list = await fetchGlobalVariables(tenantId, environment);
  return list.filter((v) => v.kind === 'encryption_key');
}
