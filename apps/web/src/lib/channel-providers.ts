import { supabase } from './supabase';
import type { ChannelType } from './channel-registry';
import { mergeProviderValues, splitProviderValues } from './channel-registry';
import {
  channelSupportsMessageTraffic,
  messageTrafficFromProviderRow,
  parseTrafficCredentials,
  serializeMessageTraffic,
  type MessageTrafficConfig,
} from './message-traffic';

export type ChannelProviderRow = {
  id: string;
  tenantId: string;
  environment: string;
  channel: ChannelType;
  providerType: string;
  name: string;
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  trafficCredentials?: Record<string, Record<string, string>>;
  status: 'active' | 'disabled';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

function parseCredentials(raw: string | null | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== undefined && v !== null) out[k] = String(v);
    }
    return out;
  } catch {
    return { _legacy: raw };
  }
}

function serializeCredentials(credentials: Record<string, string>): string {
  return JSON.stringify(credentials);
}

function mapRow(row: Record<string, unknown>): ChannelProviderRow {
  const credRaw = row.credentials_encrypted as string | null;
  const channel = row.channel as ChannelType;
  let credentials = parseCredentials(credRaw);

  if (row.provider_type === 'firebase' && credRaw?.trim()) {
    try {
      const parsed = JSON.parse(credRaw) as { type?: string };
      if (parsed?.type === 'service_account') {
        credentials = { ...credentials, service_account_json: credRaw.trim() };
      }
    } catch {
      credentials = { ...credentials, service_account_json: credRaw.trim() };
    }
  }

  if (channelSupportsMessageTraffic(channel)) {
    const trafficCredentials = parseTrafficCredentials(credRaw);
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      environment: row.environment as string,
      channel,
      providerType: row.provider_type as string,
      name: row.name as string,
      config: (row.config as Record<string, unknown>) ?? {},
      credentials: {},
      trafficCredentials,
      status: (row.status as 'active' | 'disabled') ?? 'active',
      isDefault: Boolean(row.is_default),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    environment: row.environment as string,
    channel: row.channel as ChannelType,
    providerType: row.provider_type as string,
    name: row.name as string,
    config: (row.config as Record<string, unknown>) ?? {},
    credentials,
    status: (row.status as 'active' | 'disabled') ?? 'active',
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function fetchChannelProviders(
  tenantId: string,
  environment: string,
  channel?: ChannelType,
): Promise<ChannelProviderRow[]> {
  let query = supabase
    .from('channel_providers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('is_default', { ascending: false })
    .order('name');

  if (channel) query = query.eq('channel', channel);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function saveChannelProvider(input: {
  id?: string;
  tenantId: string;
  environment: string;
  channel: ChannelType;
  providerType: string;
  name: string;
  values: Record<string, string>;
  isDefault?: boolean;
  status?: 'active' | 'disabled';
  extraConfig?: Record<string, unknown>;
  messageTraffic?: MessageTrafficConfig;
}): Promise<ChannelProviderRow> {
  const usesTrafficAccounts = channelSupportsMessageTraffic(input.channel) && input.messageTraffic;

  let config: Record<string, unknown> = {};
  let credentialsEncrypted = '{}';
  let splitCreds: Record<string, string> = {};

  if (usesTrafficAccounts && input.messageTraffic) {
    const serialized = serializeMessageTraffic(input.channel, input.providerType, input.messageTraffic);
    config = { message_traffic: serialized.message_traffic };
    credentialsEncrypted = serialized.credentials_encrypted;
  } else {
    const split = splitProviderValues(input.channel, input.providerType, input.values);
    config = split.config;
    splitCreds = split.credentials;
    credentialsEncrypted = serializeCredentials(split.credentials);

    if (input.providerType === 'firebase') {
      const sa = input.values.service_account_json?.trim();
      if (sa) credentialsEncrypted = sa;
      if (input.values.api_key?.trim()) config.api_key = input.values.api_key.trim();
      if (input.values.sender_id?.trim()) config.sender_id = input.values.sender_id.trim();
      if (input.values.project_id?.trim()) config.project_id = input.values.project_id.trim();
      if (input.values.app_id?.trim()) config.app_id = input.values.app_id.trim();
      if (input.values.vapid_public_key?.trim()) config.vapid_public_key = input.values.vapid_public_key.trim();
      if (input.values.auth_domain?.trim()) config.auth_domain = input.values.auth_domain.trim();
    }
  }

  const payload = {
    tenant_id: input.tenantId,
    environment: input.environment,
    channel: input.channel,
    provider_type: input.providerType,
    name: input.name.trim(),
    credentials_encrypted: credentialsEncrypted,
    config: { ...config, ...(input.extraConfig ?? {}) },
    status: input.status ?? 'active',
    is_default: input.isDefault ?? true,
  };

  if (payload.is_default) {
    await supabase
      .from('channel_providers')
      .update({ is_default: false })
      .eq('tenant_id', input.tenantId)
      .eq('environment', input.environment)
      .eq('channel', input.channel);
  }

  if (input.id) {
    const { data: existing } = await supabase
      .from('channel_providers')
      .select('credentials_encrypted, config')
      .eq('id', input.id)
      .maybeSingle();

    if (existing) {
      const prevCreds = parseCredentials(existing.credentials_encrypted);
      const prevConfig = (existing.config as Record<string, unknown>) ?? {};
      const mergedCreds = { ...prevCreds, ...splitCreds };
      credentialsEncrypted = serializeCredentials(mergedCreds);
      config = { ...prevConfig, ...config };
      payload.credentials_encrypted = credentialsEncrypted;
      payload.config = { ...config, ...(input.extraConfig ?? {}) };
    }

    const { data, error } = await supabase
      .from('channel_providers')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase.from('channel_providers').insert(payload).select('*').single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteChannelProvider(id: string): Promise<void> {
  const { error } = await supabase.from('channel_providers').delete().eq('id', id);
  if (error) throw error;
}

export async function setDefaultChannelProvider(
  id: string,
  tenantId: string,
  environment: string,
  channel: ChannelType,
): Promise<void> {
  await supabase
    .from('channel_providers')
    .update({ is_default: false })
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('channel', channel);

  const { error } = await supabase.from('channel_providers').update({ is_default: true, status: 'active' }).eq('id', id);
  if (error) throw error;
}

export function providerToFormValues(row: ChannelProviderRow): Record<string, string> {
  if (channelSupportsMessageTraffic(row.channel)) {
    return {};
  }
  const values = mergeProviderValues(row.channel, row.providerType, row.config, row.credentials);
  if (row.providerType === 'firebase') {
    const raw = row.credentials.service_account_json;
    if (raw) {
      values.service_account_json = raw;
    } else if (row.credentials._legacy) {
      values.service_account_json = row.credentials._legacy;
    }
  }
  return values;
}

export function channelConfigured(providers: ChannelProviderRow[], channel: ChannelType): boolean {
  return providers.some((p) => p.channel === channel && p.status === 'active');
}

export function getProviderMessageTraffic(row: ChannelProviderRow): MessageTrafficConfig {
  return messageTrafficFromProviderRow(
    row.channel,
    row.providerType,
    row.config,
    row.credentials,
    row.trafficCredentials,
  );
}
