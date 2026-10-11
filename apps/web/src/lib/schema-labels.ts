export function getSchemaTypeLabel(isSystem: boolean): 'System' | 'Custom' {
  return isSystem ? 'System' : 'Custom';
}

/** OOTB → active; custom → published | draft */
export function getSchemaStatusLabel(isSystem: boolean, status: string): 'active' | 'published' | 'draft' {
  if (isSystem) return 'active';
  if (status === 'published') return 'published';
  return 'draft';
}

export function getSchemaTypeBadgeVariant(isSystem: boolean): 'default' | 'success' {
  return isSystem ? 'default' : 'success';
}

export function getSchemaStatusBadgeVariant(
  isSystem: boolean,
  status: string,
): 'success' | 'warning' | 'default' {
  const label = getSchemaStatusLabel(isSystem, status);
  if (label === 'active' || label === 'published') return 'success';
  return 'warning';
}
