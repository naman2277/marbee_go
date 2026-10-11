const CUSTOM_TABLE_NAME_RE = /^cs_[a-z0-9_]+$/;

export function tenantTablePrefix(tenantId: string): string {
  return tenantId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

export function defaultCustomTableName(tenantId: string, slug: string): string {
  const suffix = slug.replace(/[^a-z0-9_]/g, '').replace(/^_|_$/g, '');
  return `cs_${tenantTablePrefix(tenantId)}_${suffix || 'schema'}`;
}

export function normalizeCustomTableName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function isValidCustomTableName(value: string): boolean {
  return CUSTOM_TABLE_NAME_RE.test(value) && value.length > 3;
}

export function validateCustomTableName(value: string): string | null {
  const normalized = normalizeCustomTableName(value);
  if (!normalized) return 'Table name is required';
  if (!normalized.startsWith('cs_')) return 'Table name must start with cs_';
  if (!isValidCustomTableName(normalized)) {
    return 'Use lowercase letters, numbers, and underscores (e.g. cs_00000000_training)';
  }
  return null;
}
