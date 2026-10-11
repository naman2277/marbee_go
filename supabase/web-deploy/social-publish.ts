// Deploy: supabase functions deploy social-publish
// Publishes social posts to LinkedIn (Posts API 2026-08), Instagram (Content Publishing API), Facebook, and X

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

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

/**
 * Publishes a post to LinkedIn using the official LinkedIn Community Management Posts API (Version 2026-08)
 */
async function publishLinkedIn(
  token: string,
  authorIdOrUrn: string,
  text: string,
  link?: string,
  mediaUrls?: string[],
  options?: {
    postType?: 'standard' | 'article' | 'media' | 'poll' | 'reshare';
    visibility?: 'PUBLIC' | 'CONNECTIONS';
    feedDistribution?: 'MAIN_FEED' | 'NONE';
    isReshareDisabledByAuthor?: boolean;
    cta?: { label: string; landingPageUrl: string };
    article?: { source: string; title: string; description?: string; thumbnail?: string };
    poll?: { question: string; options: string[]; duration: string; isMultipleSelection?: boolean };
    reshareParentUrn?: string;
    targeting?: {
      geoLocations?: string[];
      seniorities?: string[];
      industries?: string[];
      jobFunctions?: string[];
    };
  },
) {
  let author = authorIdOrUrn.trim();
  if (!author.startsWith('urn:li:')) {
    author = `urn:li:organization:${author}`;
  }

  const payload: Record<string, unknown> = {
    author,
    commentary: text,
    visibility: options?.visibility ?? 'PUBLIC',
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: Boolean(options?.isReshareDisabledByAuthor),
    distribution: {
      feedDistribution: options?.feedDistribution ?? 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
  };

  if (options?.cta?.label && options?.cta?.landingPageUrl) {
    payload.contentCallToActionLabel = options.cta.label;
    payload.contentLandingPage = options.cta.landingPageUrl;
  }

  if (options?.targeting) {
    const targetEntity: Record<string, string[]> = {};
    if (options.targeting.geoLocations?.length) targetEntity.geoLocations = options.targeting.geoLocations;
    if (options.targeting.seniorities?.length) targetEntity.seniorities = options.targeting.seniorities;
    if (options.targeting.industries?.length) targetEntity.industries = options.targeting.industries;
    if (options.targeting.jobFunctions?.length) targetEntity.jobFunctions = options.targeting.jobFunctions;

    if (Object.keys(targetEntity).length > 0) {
      (payload.distribution as Record<string, unknown>).targetEntities = [targetEntity];
    }
  }

  if (options?.reshareParentUrn) {
    payload.reshareContext = { parent: options.reshareParentUrn };
  } else if (options?.poll?.question && options.poll.options?.length >= 2) {
    payload.content = {
      poll: {
        question: options.poll.question,
        options: options.poll.options.map((opt) => ({ text: opt })),
        settings: {
          duration: options.poll.duration || 'THREE_DAYS',
          isMultipleSelection: Boolean(options.poll.isMultipleSelection),
        },
      },
    };
  } else if (options?.article?.source || link) {
    const sourceUrl = options?.article?.source || link || '';
    payload.content = {
      article: {
        source: sourceUrl,
        title: options?.article?.title || sourceUrl,
        description: options?.article?.description || '',
        thumbnail: options?.article?.thumbnail || undefined,
      },
    };
  } else if (mediaUrls && mediaUrls.length > 0) {
    const firstMedia = mediaUrls[0];
    if (firstMedia.startsWith('urn:li:')) {
      payload.content = {
        media: {
          id: firstMedia,
          title: text.slice(0, 50),
        },
      };
    }
  }

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202608',
    },
    body: JSON.stringify(payload),
  });

  const restliId = res.headers.get('x-restli-id');
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg =
      (data as { message?: string }).message ??
      (data as { error?: string }).error ??
      `LinkedIn API error ${res.status}: ${res.statusText}`;
    throw new Error(errorMsg);
  }

  return restliId || (data as { id?: string }).id || 'urn:li:share:published';
}

/**
 * Publishes content to Instagram via Meta Graph API Instagram Content Publishing specification
 * Reference: https://developers.facebook.com/documentation/instagram-platform/content-publishing
 */
async function publishInstagram(
  token: string,
  igUserId: string,
  caption: string,
  mediaUrls: string[] = [],
  options?: {
    mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'REELS' | 'STORIES';
    shareToFeed?: boolean;
    coverUrl?: string;
    locationName?: string;
    userTags?: string[];
    firstComment?: string;
  },
) {
  if (!igUserId) throw new Error('Instagram User/Business Account ID is required');

  const mediaType = options?.mediaType || (mediaUrls.length > 1 ? 'CAROUSEL' : 'IMAGE');
  let creationId: string | null = null;

  // 1. CAROUSEL POST (Multi-Image / Multi-Video)
  if (mediaType === 'CAROUSEL' && mediaUrls.length > 1) {
    const childContainerIds: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      const isVideo = url.endsWith('.mp4') || url.endsWith('.mov');
      const itemParams = new URLSearchParams({
        is_carousel_item: 'true',
        access_token: token,
        ...(isVideo ? { media_type: 'VIDEO', video_url: url } : { image_url: url }),
      });

      const itemRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
        method: 'POST',
        body: itemParams,
      });
      const itemData = await itemRes.json();
      if (!itemRes.ok) throw new Error(itemData?.error?.message ?? 'Instagram carousel item creation failed');
      childContainerIds.push(itemData.id);
    }

    const carouselParams = new URLSearchParams({
      media_type: 'CAROUSEL',
      children: childContainerIds.join(','),
      caption,
      access_token: token,
    });

    const carouselRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: 'POST',
      body: carouselParams,
    });
    const carouselData = await carouselRes.json();
    if (!carouselRes.ok) throw new Error(carouselData?.error?.message ?? 'Instagram carousel container creation failed');
    creationId = carouselData.id;
  }
  // 2. REELS / VIDEO
  else if (mediaType === 'REELS' || (mediaUrls[0] && (mediaUrls[0].endsWith('.mp4') || mediaUrls[0].endsWith('.mov')))) {
    const videoUrl = mediaUrls[0];
    const reelsParams = new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: options?.shareToFeed !== false ? 'true' : 'false',
      access_token: token,
      ...(options?.coverUrl ? { cover_url: options.coverUrl } : {}),
    });

    const reelsRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: 'POST',
      body: reelsParams,
    });
    const reelsData = await reelsRes.json();
    if (!reelsRes.ok) throw new Error(reelsData?.error?.message ?? 'Instagram Reels container creation failed');
    creationId = reelsData.id;
  }
  // 3. STORIES
  else if (mediaType === 'STORIES') {
    const mediaUrl = mediaUrls[0];
    const isVideo = mediaUrl?.endsWith('.mp4') || mediaUrl?.endsWith('.mov');
    const storiesParams = new URLSearchParams({
      media_type: 'STORIES',
      access_token: token,
      ...(isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }),
    });

    const storiesRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: 'POST',
      body: storiesParams,
    });
    const storiesData = await storiesRes.json();
    if (!storiesRes.ok) throw new Error(storiesData?.error?.message ?? 'Instagram Stories container creation failed');
    creationId = storiesData.id;
  }
  // 4. STANDARD FEED IMAGE
  else {
    const imageUrl = mediaUrls[0] || '';
    if (!imageUrl) throw new Error('Instagram post requires at least one image URL');

    const singleParams = new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: token,
    });

    const singleRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: 'POST',
      body: singleParams,
    });
    const singleData = await singleRes.json();
    if (!singleRes.ok) throw new Error(singleData?.error?.message ?? 'Instagram media container creation failed');
    creationId = singleData.id;
  }

  // STEP 2: Publish Media Container
  const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish`;
  const publishParams = new URLSearchParams({
    creation_id: creationId!,
    access_token: token,
  });

  const publishRes = await fetch(publishUrl, { method: 'POST', body: publishParams });
  const publishData = await publishRes.json();
  if (!publishRes.ok) throw new Error(publishData?.error?.message ?? 'Instagram media publish failed');

  const publishedMediaId = String(publishData.id ?? 'published');

  // STEP 3: Post First Comment (if specified)
  if (options?.firstComment && options.firstComment.trim()) {
    try {
      const commentParams = new URLSearchParams({
        message: options.firstComment.trim(),
        access_token: token,
      });
      await fetch(`https://graph.facebook.com/v19.0/${publishedMediaId}/comments`, {
        method: 'POST',
        body: commentParams,
      });
    } catch {
      // Non-blocking first comment failure
    }
  }

  return publishedMediaId;
}

async function publishFacebook(token: string, pageId: string, message: string, link?: string) {
  const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const body = new URLSearchParams({ message: link ? `${message}\n\n${link}` : message, access_token: token });
  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: { message?: string } }).error?.message ?? 'Facebook publish failed');
  return String((data as { id?: string }).id ?? 'published');
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
        const mediaUrls = (post.media_urls as string[]) ?? [];
        const linkedinOptions = post.linkedin_options ?? undefined;
        const instagramOptions = post.instagram_options ?? undefined;

        let id: string;
        switch (platform) {
          case 'linkedin':
            id = await publishLinkedIn(
              account.access_token,
              account.account_id ?? config.author_urn ?? '',
              text,
              link,
              mediaUrls,
              linkedinOptions,
            );
            break;
          case 'instagram':
            id = await publishInstagram(
              account.access_token,
              account.account_id ?? config.ig_user_id ?? '',
              text,
              mediaUrls,
              instagramOptions,
            );
            break;
          case 'facebook':
            id = await publishFacebook(account.access_token, account.account_id ?? config.page_id ?? '', text, link);
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
