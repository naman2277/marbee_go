import type { ChannelType } from './channel-registry';
import {
  getProviderDefinition,
  mergeProviderValues,
  splitProviderValues,
  validateProviderValues,
} from './channel-registry';

export type MessageTrafficType = 'transactional' | 'promotional';

/** Full independent provider account + optional routing/compliance per traffic type. */
export type MessageTrafficProfile = {
  enabled: boolean;
  values: Record<string, string>;
  routing: Record<string, string>;
};

export type MessageTrafficConfig = Record<MessageTrafficType, MessageTrafficProfile>;

type StoredTrafficProfile = {
  enabled: boolean;
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  routing?: Record<string, string>;
};

export type TrafficRoutingFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
};

const TRAFFIC_ROUTING_FIELDS: Partial<Record<ChannelType, TrafficRoutingFieldDef[]>> = {
  email: [
    { key: 'route_id', label: 'Route / stream ID', placeholder: 'outbound-transactional' },
    { key: 'bounce_webhook', label: 'Bounce / event webhook URL', placeholder: 'https://yourdomain.com/webhooks/email' },
    { key: 'notes', label: 'Internal notes', placeholder: 'Which ESP sub-account this maps to' },
  ],
  sms: [
    { key: 'route_id', label: 'Fallback route ID', placeholder: 'Provider route reference' },
    { key: 'notes', label: 'Internal notes', placeholder: 'Promo route vs OTP route' },
  ],
  whatsapp: [
    { key: 'route_id', label: 'Route / conversation ID', placeholder: 'Optional provider route' },
    { key: 'notes', label: 'Internal notes', placeholder: 'WABA line for this traffic type' },
  ],
  rcs: [
    { key: 'route_id', label: 'Campaign / route ID', placeholder: 'RCS campaign reference' },
    { key: 'notes', label: 'Internal notes' },
  ],
};

export function getTrafficRoutingFields(channel: ChannelType): TrafficRoutingFieldDef[] {
  return TRAFFIC_ROUTING_FIELDS[channel] ?? [];
}

export const MESSAGE_TRAFFIC_CHANNELS: ChannelType[] = ['email', 'sms', 'whatsapp', 'rcs'];

export function channelSupportsMessageTraffic(channel: ChannelType): boolean {
  return MESSAGE_TRAFFIC_CHANNELS.includes(channel);
}

export function emptyMessageTrafficConfig(): MessageTrafficConfig {
  return {
    transactional: { enabled: true, values: {}, routing: {} },
    promotional: { enabled: true, values: {}, routing: {} },
  };
}

export const DEFAULT_MESSAGE_TRAFFIC = emptyMessageTrafficConfig();

const TRAFFIC_LABELS: Record<MessageTrafficType, { title: string; description: string }> = {
  transactional: {
    title: 'Transactional',
    description: 'Separate provider account for OTP, order updates, alerts, and service messages.',
  },
  promotional: {
    title: 'Promotional',
    description: 'Separate provider account for campaigns, offers, and marketing messages.',
  },
};

export function getMessageTrafficLabel(type: MessageTrafficType) {
  return TRAFFIC_LABELS[type];
}

export function parseTrafficCredentials(raw: string | null | undefined): Record<string, Record<string, string>> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.type === 'service_account') return {};

    const out: Record<string, Record<string, string>> = {};
    for (const type of ['transactional', 'promotional'] as const) {
      const block = parsed[type];
      if (block && typeof block === 'object' && !Array.isArray(block)) {
        const creds: Record<string, string> = {};
        for (const [k, v] of Object.entries(block as Record<string, unknown>)) {
          if (v !== undefined && v !== null) creds[k] = String(v);
        }
        if (Object.keys(creds).length) out[type] = creds;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function parseMessageTrafficConfig(
  raw: unknown,
  trafficCredentials?: Record<string, Record<string, string>>,
  channel?: ChannelType,
  providerType?: string,
): MessageTrafficConfig {
  const empty = emptyMessageTrafficConfig();
  if (!raw || typeof raw !== 'object') return empty;

  const src = raw as Record<string, unknown>;
  const routingKeys = new Set(getTrafficRoutingFields(channel ?? 'email').map((f) => f.key));

  const parseProfile = (type: MessageTrafficType): MessageTrafficProfile => {
    const p = src[type];
    if (!p || typeof p !== 'object') return empty[type];
    const row = p as Record<string, unknown>;

    if (row.config && typeof row.config === 'object') {
      const config = row.config as Record<string, unknown>;
      const creds = (row.credentials as Record<string, string> | undefined) ?? trafficCredentials?.[type] ?? {};
      const values =
        channel && providerType
          ? mergeProviderValues(channel, providerType, config, creds)
          : mergeProviderValuesFromParts(config, creds);
      return {
        enabled: row.enabled !== false,
        values,
        routing: (row.routing as Record<string, string>) ?? {},
      };
    }

    if (row.values && typeof row.values === 'object') {
      return {
        enabled: row.enabled !== false,
        values: Object.fromEntries(
          Object.entries(row.values as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
        ),
        routing: (row.routing as Record<string, string>) ?? {},
      };
    }

    const values: Record<string, string> = {};
    const routing: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === 'enabled' || k === 'routing' || v === undefined || v === null) continue;
      if (routingKeys.has(k) || k === 'notes') {
        routing[k] = String(v);
      } else {
        values[k] = String(v);
      }
    }
    return { enabled: row.enabled !== false, values, routing };
  };

  return {
    transactional: parseProfile('transactional'),
    promotional: parseProfile('promotional'),
  };
}

function mergeProviderValuesFromParts(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (v === undefined || v === null) continue;
    values[k] = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
  }
  for (const [k, v] of Object.entries(credentials)) {
    if (v) values[k] = v;
  }
  return values;
}

export function messageTrafficFromProviderRow(
  channel: ChannelType,
  providerType: string,
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  trafficCredentials?: Record<string, Record<string, string>>,
): MessageTrafficConfig {
  const parsed = parseMessageTrafficConfig(config.message_traffic, trafficCredentials, channel, providerType);
  const legacyValues = mergeProviderValues(channel, providerType, config, credentials);
  const hasLegacy = Object.keys(legacyValues).length > 0;

  if (hasLegacy && Object.keys(parsed.transactional.values).length === 0) {
    parsed.transactional.values = { ...legacyValues };
  }

  return parsed;
}

export function serializeMessageTraffic(
  channel: ChannelType,
  providerType: string,
  messageTraffic: MessageTrafficConfig,
): {
  message_traffic: Record<MessageTrafficType, StoredTrafficProfile>;
  credentials_encrypted: string;
} {
  const message_traffic = {} as Record<MessageTrafficType, StoredTrafficProfile>;
  const allCredentials: Record<MessageTrafficType, Record<string, string>> = {
    transactional: {},
    promotional: {},
  };

  for (const type of ['transactional', 'promotional'] as const) {
    const profile = messageTraffic[type];
    const { config, credentials } = splitProviderValues(channel, providerType, profile.values);
    message_traffic[type] = {
      enabled: profile.enabled,
      config,
      credentials,
      routing: profile.routing,
    };
    allCredentials[type] = credentials;
  }

  return { message_traffic, credentials_encrypted: JSON.stringify(allCredentials) };
}

export function validateMessageTrafficConfig(
  channel: ChannelType,
  providerType: string,
  config: MessageTrafficConfig,
): string[] {
  if (!channelSupportsMessageTraffic(channel)) return [];

  const errors: string[] = [];
  const enabledTypes = (['transactional', 'promotional'] as const).filter((t) => config[t].enabled);

  if (enabledTypes.length === 0) {
    errors.push('Enable at least one message type: Transactional or Promotional.');
  }

  if (!getProviderDefinition(channel, providerType)) return errors;

  for (const type of enabledTypes) {
    const fieldErrors = validateProviderValues(channel, providerType, config[type].values);
    for (const err of fieldErrors) {
      errors.push(`${TRAFFIC_LABELS[type].title}: ${err}`);
    }
  }

  return errors;
}

export function messageTrafficSummary(config: MessageTrafficConfig): string[] {
  const out: string[] = [];
  if (config.transactional.enabled) out.push('Transactional');
  if (config.promotional.enabled) out.push('Promotional');
  return out;
}

export function getStoredTrafficProfile(
  rowConfig: Record<string, unknown>,
  trafficCredentials: Record<string, Record<string, string>> | undefined,
  messageType: MessageTrafficType,
): StoredTrafficProfile | null {
  const raw = rowConfig.message_traffic;
  if (!raw || typeof raw !== 'object') return null;
  const block = (raw as Record<string, unknown>)[messageType];
  if (!block || typeof block !== 'object') return null;
  const stored = block as StoredTrafficProfile;
  if (!stored.enabled) return null;
  return {
    enabled: true,
    config: stored.config ?? {},
    credentials: stored.credentials ?? trafficCredentials?.[messageType] ?? {},
  };
}
