import { supabase } from './supabase';
import { logAudit } from './audit';
import type { SocialAccount, SocialPlatform, SocialPost } from './social-providers';

function mapAccount(row: Record<string, unknown>): SocialAccount {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    environment: row.environment as string,
    platform: row.platform as SocialPlatform,
    accountName: row.account_name as string,
    accountId: (row.account_id as string | null) ?? null,
    status: row.status as SocialAccount['status'],
    profileImageUrl: (row.profile_image_url as string | null) ?? null,
    connectedAt: (row.connected_at as string | null) ?? null,
    config: (row.config as Record<string, unknown>) ?? {},
  };
}

function mapPost(row: Record<string, unknown>): SocialPost {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    environment: row.environment as string,
    content: row.content as string,
    mediaUrls: (row.media_urls as string[]) ?? [],
    linkUrl: (row.link_url as string | null) ?? null,
    platforms: (row.platforms as SocialPlatform[]) ?? [],
    linkedinOptions: (row.linkedin_options as SocialPost['linkedinOptions']) ?? undefined,
    instagramOptions: (row.instagram_options as SocialPost['instagramOptions']) ?? undefined,
    scheduledAt: (row.scheduled_at as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    status: row.status as SocialPost['status'],
    externalPostIds: (row.external_post_ids as Record<string, string>) ?? {},
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function fetchSocialAccounts(tenantId: string, environment: string): Promise<SocialAccount[]> {
  const { data, error } = await supabase.rpc('list_social_accounts', {
    p_tenant_id: tenantId,
    p_environment: environment,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => mapAccount(r));
}

export async function connectSocialAccount(input: {
  tenantId: string;
  environment: string;
  platform: SocialPlatform;
  accountName: string;
  accountId?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string | null;
  profileImageUrl?: string;
  config?: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_social_account', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_platform: input.platform,
    p_account_name: input.accountName,
    p_account_id: input.accountId ?? null,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken ?? null,
    p_token_expires_at: input.tokenExpiresAt ?? null,
    p_profile_image_url: input.profileImageUrl ?? null,
    p_config: input.config ?? {},
  });
  if (error) throw error;
  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'create',
    resourceType: 'social_account',
    resourceId: data as string,
    resourceName: `${input.platform}: ${input.accountName}`,
  });
  return data as string;
}

export async function disconnectSocialAccount(tenantId: string, platform: SocialPlatform): Promise<void> {
  const { error } = await supabase.rpc('disconnect_social_account', {
    p_tenant_id: tenantId,
    p_platform: platform,
  });
  if (error) throw error;
}

export async function fetchSocialPosts(tenantId: string, environment: string): Promise<SocialPost[]> {
  const { data, error } = await supabase.rpc('list_social_posts', {
    p_tenant_id: tenantId,
    p_environment: environment,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => mapPost(r));
}

export async function saveSocialPost(input: {
  tenantId: string;
  environment: string;
  id?: string;
  content: string;
  platforms: SocialPlatform[];
  mediaUrls?: string[];
  linkUrl?: string;
  linkedinOptions?: SocialPost['linkedinOptions'];
  instagramOptions?: SocialPost['instagramOptions'];
  scheduledAt?: string | null;
  status?: SocialPost['status'];
}): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_social_post', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_id: input.id ?? null,
    p_content: input.content,
    p_platforms: input.platforms,
    p_media_urls: input.mediaUrls ?? [],
    p_link_url: input.linkUrl ?? null,
    p_scheduled_at: input.scheduledAt ?? null,
    p_status: input.status ?? 'draft',
  });
  if (error) throw error;
  return data as string;
}

export async function deleteSocialPost(tenantId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('social_posts')
    .delete()
    .eq('id', postId)
    .eq('tenant_id', tenantId);
  if (error) throw error;
}

export async function publishSocialPost(
  tenantId: string,
  environment: string,
  postId: string,
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: 'Not authenticated' };

  const res = await fetch(`${base}/functions/v1/social-publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tenant_id: tenantId, environment, post_id: postId }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: (body as { error?: string }).error ?? res.statusText };
  return { ok: true, result: body };
}

export function socialPublishFunctionUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  return `${String(base).replace(/\/$/, '')}/functions/v1/social-publish`;
}
