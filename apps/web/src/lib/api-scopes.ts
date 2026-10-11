export type ApiScope =
  | 'events:write'
  | 'events:read'
  | 'customers:read'
  | 'customers:write'
  | 'journeys:read'
  | 'schemas:read'
  | 'custom_api:invoke';

export const API_SCOPE_OPTIONS: { value: ApiScope; label: string; description: string }[] = [
  { value: 'events:write', label: 'Events — write', description: 'Ingest behavioral events' },
  { value: 'events:read', label: 'Events — read', description: 'Read event history' },
  { value: 'customers:read', label: 'Customers — read', description: 'Read customer profiles' },
  { value: 'customers:write', label: 'Customers — write', description: 'Create or update customers' },
  { value: 'journeys:read', label: 'Journeys — read', description: 'Read journey metadata' },
  { value: 'schemas:read', label: 'Schemas — read', description: 'Read published schema definitions' },
  { value: 'custom_api:invoke', label: 'Custom APIs — invoke', description: 'Call your published custom endpoints' },
];

export function isAllowedScope(scope: string): scope is ApiScope {
  return API_SCOPE_OPTIONS.some((o) => o.value === scope);
}

export function normalizeScopes(scopes: string[]): ApiScope[] {
  return scopes.filter(isAllowedScope);
}
