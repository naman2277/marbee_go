import { supabase } from './supabase';
import { CDN_BUCKET } from './assets';

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
};

export async function fetchMyProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) {
    if (error.message.includes('get_my_profile')) return null;
    throw error;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
  };
}

export async function updateMyProfile(input: {
  name?: string;
  avatarUrl?: string | null;
}): Promise<UserProfile> {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_name: input.name?.trim() ?? null,
    p_avatar_url: input.avatarUrl ?? null,
  });
  if (error) throw error;

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
  };
}

export async function uploadAvatarImage(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const path = `avatars/${userId}/${Date.now()}.${safeExt}`;

  const { error: uploadError } = await supabase.storage.from(CDN_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    if (uploadError.message.includes('Bucket not found')) {
      throw new Error('Avatar storage is not configured. Run supabase/sql/16_assets_private_and_gate.sql');
    }
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(CDN_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
