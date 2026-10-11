/**
 * Composer draft model for the Social Studio.
 *
 * A draft carries one "master" caption plus optional per-network overrides
 * (write once, tweak per network). It compiles down to the legacy `SocialPost`
 * shape that `saveSocialPost` / `publishSocialPost` understand, keeping the
 * extra networks and per-network text client-side where the pipeline can't
 * store them yet.
 */
import type {
  SocialPost,
  LinkedInPostOptions,
  InstagramPostOptions,
  SocialPlatform,
} from './social-providers';
import type { SocialNetworkId } from './social-networks';
import { getNetwork, isPublishableNetwork } from './social-networks';
import {
  applyNetworkDefaults,
  buildUtmUrl,
  type SocialConfig,
} from './social-config';

export type MediaItem = {
  url: string;
  kind: 'image' | 'video' | 'gif';
  altText?: string;
};

export type NetworkOverride = {
  /** null = inherit master caption */
  caption: string | null;
  /** replace master media for this network */
  media: MediaItem[] | null;
  firstComment: string;
  /** X / Threads only — extra chained posts */
  threadParts: string[];
  /** poll (LinkedIn / X) */
  poll: { question: string; options: string[]; durationDays: number } | null;
  /** Instagram */
  location: string;
  igMediaType: 'IMAGE' | 'CAROUSEL' | 'REELS' | 'STORIES';
  /** LinkedIn */
  linkedinVisibility: 'PUBLIC' | 'CONNECTIONS';
  cta: { label: string; url: string } | null;
  /** YouTube / Pinterest */
  title: string;
};

export type StudioDraft = {
  id?: string;
  masterCaption: string;
  media: MediaItem[];
  link: string;
  networks: SocialNetworkId[];
  overrides: Partial<Record<SocialNetworkId, NetworkOverride>>;
  scheduledAt: string | null; // ISO
  status: SocialPost['status'] | 'in_review';
};

export function emptyOverride(): NetworkOverride {
  return {
    caption: null,
    media: null,
    firstComment: '',
    threadParts: [],
    poll: null,
    location: '',
    igMediaType: 'IMAGE',
    linkedinVisibility: 'PUBLIC',
    cta: null,
    title: '',
  };
}

export function newDraft(networks: SocialNetworkId[] = ['linkedin']): StudioDraft {
  return {
    masterCaption: '',
    media: [],
    link: '',
    networks,
    overrides: {},
    scheduledAt: null,
    status: 'draft',
  };
}

export function getOverride(draft: StudioDraft, id: SocialNetworkId): NetworkOverride {
  return draft.overrides[id] ?? emptyOverride();
}

export function captionFor(draft: StudioDraft, id: SocialNetworkId): string {
  const o = draft.overrides[id];
  return o && o.caption !== null ? o.caption : draft.masterCaption;
}

export function mediaFor(draft: StudioDraft, id: SocialNetworkId): MediaItem[] {
  const o = draft.overrides[id];
  return o && o.media !== null ? o.media : draft.media;
}

export function isCustomised(draft: StudioDraft, id: SocialNetworkId): boolean {
  const o = draft.overrides[id];
  if (!o) return false;
  return (
    o.caption !== null ||
    o.media !== null ||
    o.firstComment.trim() !== '' ||
    o.threadParts.length > 0 ||
    o.poll !== null ||
    o.location.trim() !== '' ||
    o.cta !== null ||
    o.title.trim() !== ''
  );
}

/** True if every selected network's caption fits its limit. */
export function draftFits(draft: StudioDraft): boolean {
  return draft.networks.every((id) => {
    const n = getNetwork(id);
    if (!n) return true;
    return captionFor(draft, id).length <= n.charLimit;
  });
}

export type CompiledPost = {
  content: string;
  platforms: SocialPlatform[];
  mediaUrls: string[];
  linkUrl?: string;
  linkedinOptions?: LinkedInPostOptions;
  instagramOptions?: InstagramPostOptions;
  scheduledAt: string | null;
  /** networks the pipeline can't publish yet — surfaced to the user */
  unsupportedNetworks: SocialNetworkId[];
  /** per-network resolved text, kept for preview / future storage */
  resolved: Record<string, { caption: string; firstComment: string; media: string[] }>;
};

/**
 * Compile a draft to the payload `saveSocialPost` accepts, applying each
 * network's configured defaults (signature / hashtags / UTM).
 */
export function compileDraft(draft: StudioDraft, config: SocialConfig): CompiledPost {
  const publishable = draft.networks.filter((id) => isPublishableNetwork(id));
  const unsupported = draft.networks.filter((id) => !isPublishableNetwork(id));

  const resolved: CompiledPost['resolved'] = {};
  for (const id of draft.networks) {
    const raw = captionFor(draft, id);
    const withDefaults = applyNetworkDefaults(config, id, raw);
    const nc = config.networks[id];
    let caption = withDefaults.caption;
    if (draft.link && nc?.utm.enabled) {
      caption = caption.replace(draft.link, buildUtmUrl(draft.link, nc.utm));
    }
    const ov = draft.overrides[id];
    const firstComment = [withDefaults.firstComment, ov?.firstComment].filter(Boolean).join('\n').trim();
    resolved[id] = {
      caption,
      firstComment,
      media: mediaFor(draft, id).map((m) => m.url),
    };
  }

  // The pipeline sends one `content` string; use the first publishable network's
  // resolved caption (or the master) as the representative body.
  const primary = publishable[0];
  const content = primary ? resolved[primary].caption : draft.masterCaption;

  const li = draft.overrides.linkedin;
  const linkedinOptions: LinkedInPostOptions | undefined = publishable.includes('linkedin')
    ? {
        postType: li?.poll ? 'poll' : 'standard',
        visibility: li?.linkedinVisibility ?? 'PUBLIC',
        feedDistribution: 'MAIN_FEED',
        ...(li?.cta?.url
          ? { cta: { label: li.cta.label as NonNullable<LinkedInPostOptions['cta']>['label'], landingPageUrl: li.cta.url } }
          : {}),
        ...(li?.poll
          ? {
              poll: {
                question: li.poll.question,
                options: li.poll.options.filter((o) => o.trim()),
                duration:
                  li.poll.durationDays >= 14
                    ? 'FOURTEEN_DAYS'
                    : li.poll.durationDays >= 7
                      ? 'SEVEN_DAYS'
                      : li.poll.durationDays >= 3
                        ? 'THREE_DAYS'
                        : 'ONE_DAY',
              },
            }
          : {}),
      }
    : undefined;

  const ig = draft.overrides.instagram;
  const igMedia = mediaFor(draft, 'instagram');
  const instagramOptions: InstagramPostOptions | undefined = publishable.includes('instagram')
    ? {
        mediaType: igMedia.length > 1 ? 'CAROUSEL' : ig?.igMediaType ?? 'IMAGE',
        locationName: ig?.location?.trim() || undefined,
        firstComment: resolved.instagram?.firstComment || undefined,
        shareToFeed: true,
      }
    : undefined;

  return {
    content,
    platforms: publishable as SocialPlatform[],
    mediaUrls: (primary ? resolved[primary].media : draft.media.map((m) => m.url)),
    linkUrl: draft.link.trim() || undefined,
    linkedinOptions,
    instagramOptions,
    scheduledAt: draft.scheduledAt,
    unsupportedNetworks: unsupported,
    resolved,
  };
}

/** Rehydrate a draft from a saved `SocialPost` for editing. */
export function draftFromPost(post: SocialPost): StudioDraft {
  const media: MediaItem[] = (post.mediaUrls ?? []).map((url) => ({
    url,
    kind: /\.(mp4|mov|webm)$/i.test(url) ? 'video' : 'image',
  }));
  const overrides: StudioDraft['overrides'] = {};
  if (post.linkedinOptions) {
    overrides.linkedin = {
      ...emptyOverride(),
      linkedinVisibility: post.linkedinOptions.visibility ?? 'PUBLIC',
      cta: post.linkedinOptions.cta
        ? { label: post.linkedinOptions.cta.label, url: post.linkedinOptions.cta.landingPageUrl }
        : null,
      poll: post.linkedinOptions.poll
        ? {
            question: post.linkedinOptions.poll.question,
            options: post.linkedinOptions.poll.options,
            durationDays:
              post.linkedinOptions.poll.duration === 'FOURTEEN_DAYS'
                ? 14
                : post.linkedinOptions.poll.duration === 'SEVEN_DAYS'
                  ? 7
                  : post.linkedinOptions.poll.duration === 'THREE_DAYS'
                    ? 3
                    : 1,
          }
        : null,
    };
  }
  if (post.instagramOptions) {
    overrides.instagram = {
      ...emptyOverride(),
      igMediaType: (post.instagramOptions.mediaType as NetworkOverride['igMediaType']) ?? 'IMAGE',
      location: post.instagramOptions.locationName ?? '',
      firstComment: post.instagramOptions.firstComment ?? '',
    };
  }
  return {
    id: post.id,
    masterCaption: post.content ?? '',
    media,
    link: post.linkUrl ?? '',
    networks: (post.platforms ?? ['linkedin']) as SocialNetworkId[],
    overrides,
    scheduledAt: post.scheduledAt,
    status: post.status,
  };
}
