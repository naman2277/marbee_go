// Deploy: supabase functions deploy social-publish
// Publishes social posts to LinkedIn, Facebook, Instagram, and X via platform APIs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { AuthError } from '../_shared/auth.ts';
import { requireMemberWithPermission } from '../_shared/tenant-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

async function publishLinkedIn(token: string, authorUrn: string, text: string, link?: string) {
  const body = {
    author: authorUrn.startsWith('urn:') ? authorUrn : `urn:li:person:${authorUrn}`,
    commentary: link ? `${text}\n\n${link}` : text,
    visibility: 'PUBLIC',
    lifecycleState: 'PUBLISHED',
    distribution: { feedDistribution: 'MAIN_FEED' },
  };
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202401',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `LinkedIn error ${res.status}`);
  return (data as { id?: string }).id ?? 'published';
}

async function publishFacebook(token: string, pageId: string, message: string, link?: string) {
  const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const body = new URLSearchParams({ message: link ? `${message}\n\n${link}` : message, access_token: token });
  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: { message?: string } }).error?.message ?? 'Facebook publish failed');
  return String((data as { id?: string }).id ?? 'published');
}

async function publishInstagram(token: string, igUserId: string, caption: string) {
  const createUrl = `https://graph.facebook.com/v19.0/${igUserId}/media`;
  const createBody = new URLSearchParams({ caption, access_token: token });
  const createRes = await fetch(createUrl, { method: 'POST', body: createBody });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error((createData as { error?: { message?: string } }).error?.message ?? 'Instagram media create failed');
  const creationId = (createData as { id?: string }).id;
  const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish`;
  const publishBody = new URLSearchParams({ creation_id: creationId!, access_token: token });
  const publishRes = await fetch(publishUrl, { method: 'POST', body: publishBody });
  const publishData = await publishRes.json();
  if (!publishRes.ok) throw new Error((publishData as { error?: { message?: string } }).error?.message ?? 'Instagram publish failed');
  return String((publishData as { id?: string }).id ?? 'published');
}

async function publishX(token: string, text: string, link?: string) {
  const tweet = link && !text.includes(link) ? `${text.slice(0, 250)}\n${link}` : text.slice(0, 280);
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: tweet }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? 'X publish failed');
  return String((data as { data?: { id?: string } }).data?.id ?? 'published');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = getServiceClient();
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: 'Invalid session' }, 401);

    const { tenant_id, environment, post_id } = await req.json();
    if (!tenant_id || !post_id) return json({ error: 'tenant_id and post_id required' }, 400);

    // Phase 0: signed in was not enough — the caller must be an active member of THIS
    // (active) workspace with content.manage. Previously any user could publish any
    // workspace's posts.
    try {
      await requireMemberWithPermission(supabase, req, String(tenant_id), ['content.manage']);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message }, e.status);
      throw e;
    }

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('id', post_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (postError || !post) return json({ error: 'Post not found' }, 404);

    await supabase.from('social_posts').update({ status: 'publishing' }).eq('id', post_id);

    const { data: accounts } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('environment', environment ?? 'production')
      .eq('status', 'connected');

    const accountMap = new Map((accounts ?? []).map((a) => [a.platform, a]));
    const externalIds: Record<string, string> = {};
    const errors: string[] = [];

    for (const platform of post.platforms as string[]) {
      const account = accountMap.get(platform);
      if (!account?.access_token) {
        errors.push(`${platform}: not connected`);
        continue;
      }
      try {
        const config = (account.config ?? {}) as Record<string, string>;
        const text = String(post.content);
        const link = post.link_url ? String(post.link_url) : undefined;
        let id: string;
        switch (platform) {
          case 'linkedin':
            id = await publishLinkedIn(account.access_token, account.account_id ?? config.author_urn ?? '', text, link);
            break;
          case 'facebook':
            id = await publishFacebook(account.access_token, account.account_id ?? config.page_id ?? '', text, link);
            break;
          case 'instagram':
            id = await publishInstagram(account.access_token, account.account_id ?? config.ig_user_id ?? '', text);
            break;
          case 'x':
            id = await publishX(account.access_token, text, link);
            break;
          default:
            throw new Error('Unknown platform');
        }
        externalIds[platform] = id;
        await supabase.from('social_accounts').update({ last_used_at: new Date().toISOString() }).eq('id', account.id);
      } catch (err) {
        errors.push(`${platform}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    const status = Object.keys(externalIds).length ? (errors.length ? 'failed' : 'published') : 'failed';
    await supabase.from('social_posts').update({
      status,
      external_post_ids: externalIds,
      published_at: status === 'published' ? new Date().toISOString() : null,
      error_message: errors.length ? errors.join('; ') : null,
    }).eq('id', post_id);

    if (!Object.keys(externalIds).length) {
      return json({ error: errors.join('; ') || 'No platforms published' }, 502);
    }

    return json({ success: true, external_post_ids: externalIds, warnings: errors });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
