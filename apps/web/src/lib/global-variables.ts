/**
 * global-variables.ts — tenant/environment scoped named values.
 *
 * A global variable is referenced everywhere by its name, e.g. `{{vars.FORM_PII_KEY}}`,
 * so workflows, forms, landing pages, imports and exports all point at one definition
 * and a rotation happens in a single place.
 *
 * Three kinds:
 *   - `plain`          — non-sensitive config (a base URL, a region code). Readable.
 *   - `secret`         — sensitive text (a third-party token). Sealed on the server.
 *   - `encryption_key` — an AES-256 key used to encrypt other data (e.g. form PII).
 *                        Generated on the server; NEVER sent to the browser.
 *
 * Phase 0 · SEC-05 (D-019): everything goes through the `global-variables` edge function.
 * The browser no longer holds a master key, never sees secret values unless an authorised
 * user explicitly reveals one (audited), and never sees encryption keys at all.
 */

import { invokeFunction } from './functions';

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
  /** The value for `plain` variables; always '' for `secret` and `encryption_key`. */
  value: string;
  /** True when a value is stored (secrets show "set" without revealing it). */
  has_value?: boolean;
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

// Older versions kept a master key and a cache of variables in localStorage. Remove both.
function scrubLegacyStorage(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('marbee_vault_master_key_v1') || k.startsWith('marbee_global_variables_v1'))) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}

type Fn<T> = { data?: T };

async function call<T>(op: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const r = await invokeFunction<Fn<T>>('global-variables', { op, ...body });
  if (!r.ok) return { error: r.error ?? 'Request failed' };
  return { data: r.data?.data };
}

// -----------------------------------------------------------------------------
// CRUD
// -----------------------------------------------------------------------------

export async function fetchGlobalVariables(tenantId: string, environment: string): Promise<GlobalVariable[]> {
  scrubLegacyStorage();
  const r = await call<{ variables: GlobalVariable[] }>('list', { tenant_id: tenantId, environment });
  if (r.error) throw new Error(r.error);
  return r.data?.variables ?? [];
}

export type CreateVariableInput = {
  tenantId: string;
  environment: string;
  name: string;
  description?: string;
  kind: GlobalVariableKind;
  /** Required for `plain` / `secret`. Ignored for `encryption_key` (generated on the server). */
  value?: string;
  scopes?: GlobalVariableScope[];
};

export async function createGlobalVariable(
  input: CreateVariableInput,
): Promise<{ variable?: GlobalVariable; error?: string }> {
  const name = normalizeVariableName(input.name);
  if (!name) return { error: 'A variable name is required' };
  if (input.kind !== 'encryption_key' && !input.value) return { error: 'A value is required' };
  const r = await call<{ variable: GlobalVariable }>('create', {
    tenant_id: input.tenantId,
    environment: input.environment,
    name,
    kind: input.kind,
    value: input.kind === 'encryption_key' ? undefined : input.value,
    description: input.description,
    scopes: input.scopes,
  });
  return r.error ? { error: r.error } : { variable: r.data?.variable };
}

export async function updateGlobalVariable(
  _tenantId: string,
  _environment: string,
  id: string,
  patch: { description?: string; scopes?: GlobalVariableScope[]; value?: string },
): Promise<{ error?: string }> {
  const r = await call<{ updated: boolean }>('update', { id, ...patch });
  return r.error ? { error: r.error } : {};
}

/** Replace an encryption key with a freshly generated one (on the server). */
export async function rotateEncryptionKey(
  _tenantId: string,
  _environment: string,
  id: string,
): Promise<{ error?: string }> {
  const r = await call<{ rotated: boolean }>('rotate', { id });
  return r.error ? { error: r.error } : {};
}

export async function deleteGlobalVariable(
  _tenantId: string,
  _environment: string,
  id: string,
): Promise<{ error?: string }> {
  const r = await call<{ deleted: boolean }>('delete', { id });
  return r.error ? { error: r.error } : {};
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

/**
 * Reveal a variable's value. Plain values are already loaded; secrets are fetched from the
 * server (needs "Manage API keys & variables", audited). Encryption keys are never revealed.
 */
export async function revealVariable(_tenantId: string, variable: GlobalVariable): Promise<string> {
  if (variable.kind === 'plain') return variable.value;
  if (variable.kind === 'encryption_key') throw new Error('Encryption keys are never revealed — they stay on the server');
  const r = await call<{ value: string }>('reveal', { id: variable.id });
  if (r.error) throw new Error(r.error);
  return r.data?.value ?? '';
}

/**
 * Value of a PLAIN variable by name, or null. Secrets and keys are resolved only on the
 * server (edge functions) — they are never handed to browser code.
 */
export async function resolveVariable(
  tenantId: string,
  environment: string,
  name: string,
  scope: GlobalVariableScope = 'all',
): Promise<string | null> {
  const list = await fetchGlobalVariables(tenantId, environment).catch(() => []);
  const found = list.find(
    (v) => v.name === name && (scope === 'all' || v.scopes.includes('all') || v.scopes.includes(scope)),
  );
  return found && found.kind === 'plain' ? found.value : null;
}

/** Every `{{vars.NAME}}` reference found in a string. */
export function extractReferences(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(REFERENCE_PATTERN)) names.add(match[1]);
  return [...names];
}

/**
 * Substitute `{{vars.NAME}}` references with PLAIN variable values. Secret references are
 * left in place (servers substitute those); unknown names stay visible too.
 */
export async function interpolateVariables(
  template: string,
  tenantId: string,
  environment: string,
  scope: GlobalVariableScope = 'all',
): Promise<string> {
  const names = extractReferences(template);
  if (names.length === 0) return template;
  const list = await fetchGlobalVariables(tenantId, environment).catch(() => []);
  const resolved = new Map<string, string>();
  for (const name of names) {
    const found = list.find(
      (v) => v.name === name && v.kind === 'plain' && (scope === 'all' || v.scopes.includes('all') || v.scopes.includes(scope)),
    );
    if (found) resolved.set(name, found.value);
  }
  return template.replace(REFERENCE_PATTERN, (whole, name: string) => resolved.get(name) ?? whole);
}

/** Encryption keys only — the list offered when picking a key for field encryption. */
export async function listEncryptionKeys(tenantId: string, environment: string): Promise<GlobalVariable[]> {
  const list = await fetchGlobalVariables(tenantId, environment);
  return list.filter((v) => v.kind === 'encryption_key');
}

// -----------------------------------------------------------------------------
// Field encryption — done on the server with the named key (key never in the browser)
// -----------------------------------------------------------------------------

export async function encryptFormFields(
  tenantId: string,
  environment: string,
  keyVariable: string,
  fields: string[],
  data: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; error?: string }> {
  const r = await call<{ data: Record<string, unknown> }>('encrypt_fields', {
    tenant_id: tenantId, environment, key_variable: keyVariable, fields, data,
  });
  return r.error ? { error: r.error } : { data: r.data?.data };
}

/** Decrypt stored submissions (needs "View customer data"). Pass fields=[] to decrypt every envelope. */
export async function decryptFormRecords(
  tenantId: string,
  environment: string,
  keyVariable: string,
  fields: string[],
  records: Array<{ id?: string | null; data: Record<string, unknown> }>,
): Promise<{ records?: Array<{ id: string | null; data: Record<string, unknown> }>; error?: string }> {
  const r = await call<{ records: Array<{ id: string | null; data: Record<string, unknown> }> }>('decrypt_fields', {
    tenant_id: tenantId, environment, key_variable: keyVariable, fields, records,
  });
  return r.error ? { error: r.error } : { records: r.data?.records };
}
