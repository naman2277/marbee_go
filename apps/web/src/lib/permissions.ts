/** Permission slugs — must match supabase/sql/37_access_management_rbac.sql seed */
export const PERMISSIONS = {
  ACCESS_MANAGE: 'access.manage',
  ACCESS_ROLES_MANAGE: 'access.roles.manage',
  ACCESS_INVITE: 'access.invite',
  API_KEYS_MANAGE: 'api_keys.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
  SETTINGS_CHANNELS_MANAGE: 'settings.channels.manage',
  JOURNEYS_READ: 'journeys.read',
  JOURNEYS_WRITE: 'journeys.write',
  JOURNEYS_PUBLISH: 'journeys.publish',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_WRITE: 'customers.write',
  SCHEMAS_READ: 'schemas.read',
  SCHEMAS_WRITE: 'schemas.write',
  SCHEMAS_PUBLISH: 'schemas.publish',
  CONNECTORS_MANAGE: 'connectors.manage',
  CONTENT_MANAGE: 'content.manage',
  DATA_JOBS_MANAGE: 'data_jobs.manage',
  REPORTING_READ: 'reporting.read',
  LOYALTY_READ: 'loyalty.read',
  LOYALTY_WRITE: 'loyalty.write',
  LOYALTY_PUBLISH: 'loyalty.publish',
  OFFERS_DECIDE: 'offers.decide',
  SOCIAL_MANAGE: 'social.manage',
} as const;

export type PermissionSlug = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionMeta = {
  slug: PermissionSlug;
  name: string;
  description: string;
  category: string;
};

export const PERMISSION_CATALOG: PermissionMeta[] = [
  { slug: PERMISSIONS.ACCESS_MANAGE, name: 'Manage access', description: 'Invite, remove, and assign roles', category: 'access' },
  { slug: PERMISSIONS.ACCESS_ROLES_MANAGE, name: 'Manage roles', description: 'Create and edit custom roles', category: 'access' },
  { slug: PERMISSIONS.ACCESS_INVITE, name: 'Invite members', description: 'Send workspace invitations', category: 'access' },
  { slug: PERMISSIONS.API_KEYS_MANAGE, name: 'Manage API keys', description: 'Create and revoke API keys', category: 'access' },
  { slug: PERMISSIONS.AUDIT_READ, name: 'View audit log', description: 'Read audit trail entries', category: 'access' },
  { slug: PERMISSIONS.SETTINGS_MANAGE, name: 'Manage settings', description: 'Edit organization settings', category: 'settings' },
  { slug: PERMISSIONS.SETTINGS_CHANNELS_MANAGE, name: 'Manage channels', description: 'Configure delivery channels', category: 'settings' },
  { slug: PERMISSIONS.JOURNEYS_READ, name: 'View journeys', description: 'Read campaigns and journeys', category: 'journeys' },
  { slug: PERMISSIONS.JOURNEYS_WRITE, name: 'Edit journeys', description: 'Create and edit journey canvases', category: 'journeys' },
  { slug: PERMISSIONS.JOURNEYS_PUBLISH, name: 'Publish journeys', description: 'Deploy and publish journeys', category: 'journeys' },
  { slug: PERMISSIONS.CUSTOMERS_READ, name: 'View customers', description: 'Read customer profiles', category: 'customers' },
  { slug: PERMISSIONS.CUSTOMERS_WRITE, name: 'Edit customers', description: 'Create and update customers', category: 'customers' },
  { slug: PERMISSIONS.SCHEMAS_READ, name: 'View schemas', description: 'Read data schemas', category: 'data' },
  { slug: PERMISSIONS.SCHEMAS_WRITE, name: 'Edit schemas', description: 'Create and edit schemas', category: 'data' },
  { slug: PERMISSIONS.SCHEMAS_PUBLISH, name: 'Publish schemas', description: 'Publish schema changes', category: 'data' },
  { slug: PERMISSIONS.CONNECTORS_MANAGE, name: 'Manage connectors', description: 'Configure data connectors', category: 'data' },
  { slug: PERMISSIONS.CONTENT_MANAGE, name: 'Manage content', description: 'Assets, templates, forms', category: 'content' },
  { slug: PERMISSIONS.DATA_JOBS_MANAGE, name: 'Manage data jobs', description: 'Create and run data jobs', category: 'data' },
  { slug: PERMISSIONS.REPORTING_READ, name: 'View reporting', description: 'Read analytics and reports', category: 'reporting' },
  { slug: PERMISSIONS.LOYALTY_READ, name: 'View loyalty', description: 'Read programs, offers, and members', category: 'loyalty' },
  { slug: PERMISSIONS.LOYALTY_WRITE, name: 'Manage loyalty', description: 'Create and edit loyalty programs and offers', category: 'loyalty' },
  { slug: PERMISSIONS.LOYALTY_PUBLISH, name: 'Publish loyalty', description: 'Activate offers and decisioning policies', category: 'loyalty' },
  { slug: PERMISSIONS.OFFERS_DECIDE, name: 'Run offer decisioning', description: 'Execute best-offer decisioning', category: 'loyalty' },
  { slug: PERMISSIONS.SOCIAL_MANAGE, name: 'Manage social media', description: 'Connect accounts and publish posts', category: 'social' },
];

export const PERMISSION_CATEGORY_LABELS: Record<string, string> = {
  access: 'Access & security',
  settings: 'Settings',
  journeys: 'Journeys & campaigns',
  customers: 'Customers',
  data: 'Data platform',
  content: 'Content',
  reporting: 'Reporting',
  loyalty: 'Loyalty & offers',
  social: 'Social media',
};

export function hasPermission(
  granted: string[] | undefined | null,
  permission: PermissionSlug | string,
  isAdmin?: boolean,
): boolean {
  if (isAdmin) return true;
  if (!granted?.length) return false;
  return granted.includes(permission);
}

export function hasAnyPermission(
  granted: string[] | undefined | null,
  permissions: string[],
  isAdmin?: boolean,
): boolean {
  if (isAdmin) return true;
  return permissions.some((p) => granted?.includes(p));
}
