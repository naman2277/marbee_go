import type { Environment } from './environment';

export type InstancePermissionFlags = {
  enabled: boolean;
  read: boolean;
  write: boolean;
  delete: boolean;
};

export type InstanceAccessMap = Record<Environment, InstancePermissionFlags>;

export type MemberAccountSettings = {
  company: string;
  job_title: string;
  department: string;
  phone: string;
  notes: string;
  allowed_ips: string[];
  restrict_journey_folders: boolean;
  journey_folder_paths: string[];
  restrict_asset_folders: boolean;
  asset_folder_paths: string[];
  instance_access: InstanceAccessMap;
};

export type TenantMemberDetail = {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  roleId: string;
  roleName: string;
  roleSlug: string;
  status: 'active' | 'disabled' | 'invited';
  memberSince: string;
  settings: MemberAccountSettings;
};

export const DEFAULT_INSTANCE_ACCESS: InstanceAccessMap = {
  development: { enabled: true, read: true, write: true, delete: false },
  staging: { enabled: true, read: true, write: true, delete: false },
  production: { enabled: true, read: true, write: true, delete: false },
};

export const EMPTY_MEMBER_SETTINGS: MemberAccountSettings = {
  company: '',
  job_title: '',
  department: '',
  phone: '',
  notes: '',
  allowed_ips: [],
  restrict_journey_folders: false,
  journey_folder_paths: [],
  restrict_asset_folders: false,
  asset_folder_paths: [],
  instance_access: { ...DEFAULT_INSTANCE_ACCESS },
};

const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[1-2][0-9]|3[0-2]))?$/;
const IPV6_REGEX = /^[0-9a-f:]+(?:\/(?:[0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/i;

export function isValidIpOrCidr(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false;
  if (trimmed.includes(':')) return IPV6_REGEX.test(trimmed);
  return IPV4_REGEX.test(trimmed);
}

export function parseIpList(raw: string): { ips: string[]; invalid: string[] } {
  const ips: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/[\n,;]+/)) {
    const item = line.trim();
    if (!item) continue;
    if (!isValidIpOrCidr(item)) {
      invalid.push(item);
      continue;
    }
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      ips.push(item);
    }
  }

  return { ips, invalid };
}

export function formatIpList(ips: string[]): string {
  return ips.join('\n');
}

function parseInstanceAccess(raw: unknown): InstanceAccessMap {
  const result: InstanceAccessMap = {
    development: { ...DEFAULT_INSTANCE_ACCESS.development },
    staging: { ...DEFAULT_INSTANCE_ACCESS.staging },
    production: { ...DEFAULT_INSTANCE_ACCESS.production },
  };

  if (!raw || typeof raw !== 'object') return result;
  const obj = raw as Record<string, unknown>;

  for (const env of ['development', 'staging', 'production'] as const) {
    const row = obj[env];
    if (!row || typeof row !== 'object') continue;
    const flags = row as Record<string, unknown>;
    result[env] = {
      enabled: flags.enabled !== false,
      read: flags.read !== false,
      write: flags.write !== false,
      delete: Boolean(flags.delete),
    };
  }

  return result;
}

export function formatLastLogin(value: string | null | undefined): {
  label: string;
  relative: string;
  never: boolean;
} {
  if (!value) {
    return { label: 'Never signed in', relative: 'No recorded login', never: true };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: 'Unknown', relative: 'Invalid date', never: true };
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  let relative = 'Just now';
  if (diffMins >= 1 && diffMins < 60) relative = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  else if (diffHours >= 1 && diffHours < 24) relative = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  else if (diffDays >= 1 && diffDays < 30) relative = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  else relative = date.toLocaleDateString();

  return {
    label: date.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
    relative,
    never: false,
  };
}

export function parseMemberSettings(raw: unknown): MemberAccountSettings {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_MEMBER_SETTINGS };
  const obj = raw as Record<string, unknown>;

  const asStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  };

  return {
    company: typeof obj.company === 'string' ? obj.company : '',
    job_title: typeof obj.job_title === 'string' ? obj.job_title : '',
    department: typeof obj.department === 'string' ? obj.department : '',
    phone: typeof obj.phone === 'string' ? obj.phone : '',
    notes: typeof obj.notes === 'string' ? obj.notes : '',
    allowed_ips: asStringArray(obj.allowed_ips),
    restrict_journey_folders: Boolean(obj.restrict_journey_folders),
    journey_folder_paths: asStringArray(obj.journey_folder_paths),
    restrict_asset_folders: Boolean(obj.restrict_asset_folders),
    asset_folder_paths: asStringArray(obj.asset_folder_paths),
    instance_access: parseInstanceAccess(obj.instance_access),
  };
}

export function memberSettingsToPayload(settings: MemberAccountSettings): Record<string, unknown> {
  return {
    company: settings.company.trim(),
    job_title: settings.job_title.trim(),
    department: settings.department.trim(),
    phone: settings.phone.trim(),
    notes: settings.notes.trim(),
    allowed_ips: settings.allowed_ips,
    restrict_journey_folders: settings.restrict_journey_folders,
    journey_folder_paths: settings.restrict_journey_folders ? settings.journey_folder_paths : [],
    restrict_asset_folders: settings.restrict_asset_folders,
    asset_folder_paths: settings.restrict_asset_folders ? settings.asset_folder_paths : [],
    instance_access: settings.instance_access,
  };
}

export function updateInstanceAccess(
  current: InstanceAccessMap,
  env: Environment,
  field: keyof InstancePermissionFlags,
  value: boolean,
): InstanceAccessMap {
  const next = { ...current[env], [field]: value };

  if (field === 'enabled' && !value) {
    next.read = false;
    next.write = false;
    next.delete = false;
  }

  if (field === 'enabled' && value) {
    next.read = true;
    next.write = true;
  }

  if ((field === 'read' || field === 'write' || field === 'delete') && value) {
    next.enabled = true;
  }

  if (field === 'read' && !value) {
    next.write = false;
    next.delete = false;
  }

  if (field === 'write' && !value) {
    next.delete = false;
  }

  return { ...current, [env]: next };
}

export function toggleFolderPath(paths: string[], path: string, selected: boolean): string[] {
  const normalized = path === '/' ? '/' : path.replace(/\/+$/, '') || '/';
  if (selected) {
    if (paths.includes(normalized)) return paths;
    return [...paths, normalized].sort();
  }
  return paths.filter((p) => p !== normalized);
}
