import type { Environment } from './environment';
import {
  hasAnyPermission,
  PERMISSIONS,
  type PermissionSlug,
} from './permissions';
import type { InstanceAccessMap } from './member-settings';
import { DEFAULT_INSTANCE_ACCESS } from './member-settings';

/** Modules that support bulk delete in list UIs. */
export type DeletableModule =
  | 'content.templates'
  | 'content.forms'
  | 'content.landing_pages'
  | 'content.assets'
  | 'customers.audiences'
  | 'data.schemas'
  | 'data.quality'
  | 'subscriptions'
  | 'settings.channels'
  | 'settings.api_keys'
  | 'access.invites';

const MODULE_PERMISSIONS: Record<DeletableModule, PermissionSlug[]> = {
  'content.templates': [PERMISSIONS.CONTENT_MANAGE],
  'content.forms': [PERMISSIONS.CONTENT_MANAGE],
  'content.landing_pages': [PERMISSIONS.CONTENT_MANAGE],
  'content.assets': [PERMISSIONS.CONTENT_MANAGE],
  'customers.audiences': [PERMISSIONS.CUSTOMERS_WRITE],
  'data.schemas': [PERMISSIONS.SCHEMAS_WRITE],
  'data.quality': [PERMISSIONS.SCHEMAS_WRITE],
  subscriptions: [PERMISSIONS.CUSTOMERS_WRITE],
  'settings.channels': [PERMISSIONS.SETTINGS_CHANNELS_MANAGE],
  'settings.api_keys': [PERMISSIONS.API_KEYS_MANAGE],
  'access.invites': [PERMISSIONS.ACCESS_INVITE, PERMISSIONS.ACCESS_MANAGE],
};

export const MODULE_RESOURCE_LABELS: Record<DeletableModule, string> = {
  'content.templates': 'template',
  'content.forms': 'form',
  'content.landing_pages': 'landing page',
  'content.assets': 'asset',
  'customers.audiences': 'audience',
  'data.schemas': 'schema',
  'data.quality': 'quality record',
  subscriptions: 'subscription service',
  'settings.channels': 'channel account',
  'settings.api_keys': 'API key',
  'access.invites': 'invitation',
};

export function canDeleteInModule(
  module: DeletableModule,
  options: {
    permissions: string[];
    isAdmin?: boolean;
    environment: Environment;
    instanceAccess?: InstanceAccessMap | null;
  },
): { allowed: boolean; reason?: string } {
  const required = MODULE_PERMISSIONS[module];
  if (!hasAnyPermission(options.permissions, required, options.isAdmin)) {
    return {
      allowed: false,
      reason: 'Your role does not include permission to delete items in this module.',
    };
  }

  if (options.isAdmin) {
    return { allowed: true };
  }

  const access = options.instanceAccess ?? DEFAULT_INSTANCE_ACCESS;
  const envFlags = access[options.environment] ?? DEFAULT_INSTANCE_ACCESS[options.environment];
  if (!envFlags.enabled) {
    return {
      allowed: false,
      reason: `You do not have access to the ${options.environment} environment.`,
    };
  }
  if (!envFlags.delete) {
    return {
      allowed: false,
      reason: `Delete is disabled for your account in ${options.environment}. Contact an administrator.`,
    };
  }

  return { allowed: true };
}
