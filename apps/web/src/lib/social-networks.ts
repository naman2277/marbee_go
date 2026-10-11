/**
 * Rich social-network registry for the Social Studio.
 *
 * This is a superset of `social-providers.ts`'s `SOCIAL_PLATFORMS`. The legacy
 * file stays authoritative for the publish/OAuth pipeline (linkedin / instagram
 * / facebook / x); this module adds the extra networks, per-network content
 * specs, capability flags, publishing windows and composer metadata that the
 * revamped studio UI needs. Keep the four legacy ids byte-compatible.
 */
import type { SocialPlatform } from './social-providers';

export type SocialNetworkId =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'threads';

/** Capability flags — drive which composer tools/preview affordances show. */
export type NetworkFeature =
  | 'text'
  | 'media'
  | 'carousel'
  | 'video'
  | 'reel'
  | 'story'
  | 'link'
  | 'linkPreview'
  | 'hashtags'
  | 'mentions'
  | 'firstComment'
  | 'thread'
  | 'poll'
  | 'location'
  | 'altText'
  | 'title'
  | 'cta'
  | 'article'
  | 'schedule'
  | 'boost';

export type AspectRatio = {
  label: string;
  /** width / height */
  ratio: number;
  hint: string;
};

export type PostKind = {
  id: string;
  label: string;
  description: string;
};

export type PublishingWindow = {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  /** local hours, 0–23 */
  hours: number[];
};

export type SocialNetwork = {
  id: SocialNetworkId;
  label: string;
  shortLabel: string;
  /** '@' for handle-style networks, '' otherwise */
  handlePrefix: string;
  brandColor: string;
  /** tailwind gradient utility fragment, e.g. 'from-… via-… to-…' */
  gradient: string;
  /** legacy publish pipeline support */
  publishable: boolean;
  charLimit: number;
  hashtagSweetSpot: [number, number];
  mediaMax: number;
  mediaKinds: Array<'image' | 'video' | 'gif'>;
  videoMaxSeconds: number;
  aspectRatios: AspectRatio[];
  features: NetworkFeature[];
  postKinds: PostKind[];
  /** rule-of-thumb high-engagement windows, brand-neutral defaults */
  bestTimes: PublishingWindow[];
  docsUrl: string;
  connectHint: string;
};

const COMMON_SCHEDULE_HELP =
  'Times are local to your workspace timezone. Tune these per network under Channels → Publishing schedule.';

export const SOCIAL_NETWORKS: Record<SocialNetworkId, SocialNetwork> = {
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    shortLabel: 'LinkedIn',
    handlePrefix: '',
    brandColor: '#0A66C2',
    gradient: 'from-[#0A66C2] via-[#0077B5] to-[#004182]',
    publishable: true,
    charLimit: 3000,
    hashtagSweetSpot: [3, 5],
    mediaMax: 9,
    mediaKinds: ['image', 'video'],
    videoMaxSeconds: 600,
    aspectRatios: [
      { label: 'Square', ratio: 1, hint: '1200×1200 — feed-safe' },
      { label: 'Portrait', ratio: 4 / 5, hint: '1080×1350 — max feed height' },
      { label: 'Landscape', ratio: 1.91, hint: '1200×627 — link cards' },
    ],
    features: [
      'text', 'media', 'carousel', 'video', 'link', 'linkPreview', 'hashtags',
      'mentions', 'poll', 'article', 'cta', 'schedule', 'boost',
    ],
    postKinds: [
      { id: 'standard', label: 'Text & media', description: 'Commentary with optional images or video' },
      { id: 'article', label: 'Article link', description: 'Rich link card pulled from a URL' },
      { id: 'poll', label: 'Poll', description: '2–4 options, 1–14 day duration' },
      { id: 'document', label: 'Document / carousel', description: 'PDF swipe deck' },
    ],
    bestTimes: [
      { day: 2, hours: [8, 10, 12] },
      { day: 3, hours: [8, 10, 12] },
      { day: 4, hours: [8, 10] },
    ],
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api',
    connectHint: 'Register a LinkedIn app with w_member_social / w_organization_social and paste a page access token.',
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    shortLabel: 'Instagram',
    handlePrefix: '@',
    brandColor: '#E4405F',
    gradient: 'from-[#f09433] via-[#dc2743] to-[#bc1888]',
    publishable: true,
    charLimit: 2200,
    hashtagSweetSpot: [8, 15],
    mediaMax: 10,
    mediaKinds: ['image', 'video'],
    videoMaxSeconds: 90,
    aspectRatios: [
      { label: 'Square', ratio: 1, hint: '1080×1080 — feed' },
      { label: 'Portrait', ratio: 4 / 5, hint: '1080×1350 — feed, most real estate' },
      { label: 'Reel / Story', ratio: 9 / 16, hint: '1080×1920 — full screen' },
    ],
    features: [
      'text', 'media', 'carousel', 'video', 'reel', 'story', 'hashtags',
      'mentions', 'firstComment', 'location', 'altText', 'schedule',
    ],
    postKinds: [
      { id: 'IMAGE', label: 'Feed post', description: 'Single photo, square or 4:5' },
      { id: 'CAROUSEL', label: 'Carousel', description: 'Up to 10 photos / videos' },
      { id: 'REELS', label: 'Reel', description: '9:16 vertical video, up to 90s' },
      { id: 'STORIES', label: 'Story', description: '24h vertical photo or clip' },
    ],
    bestTimes: [
      { day: 1, hours: [11, 13, 19] },
      { day: 3, hours: [11, 14, 20] },
      { day: 5, hours: [10, 12] },
    ],
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    connectHint: 'Connect an Instagram Business account through a linked Facebook Page with instagram_content_publish.',
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    shortLabel: 'Facebook',
    handlePrefix: '',
    brandColor: '#1877F2',
    gradient: 'from-[#1877F2] via-[#166FE5] to-[#0D57C6]',
    publishable: true,
    charLimit: 63206,
    hashtagSweetSpot: [1, 3],
    mediaMax: 10,
    mediaKinds: ['image', 'video'],
    videoMaxSeconds: 1200,
    aspectRatios: [
      { label: 'Square', ratio: 1, hint: '1200×1200' },
      { label: 'Landscape', ratio: 1.91, hint: '1200×630 — link posts' },
      { label: 'Portrait', ratio: 4 / 5, hint: '1080×1350' },
    ],
    features: [
      'text', 'media', 'carousel', 'video', 'reel', 'story', 'link',
      'linkPreview', 'hashtags', 'mentions', 'schedule', 'boost',
    ],
    postKinds: [
      { id: 'standard', label: 'Page post', description: 'Text, photos or video to the Page feed' },
      { id: 'link', label: 'Link post', description: 'Shared URL with preview card' },
      { id: 'reel', label: 'Reel', description: 'Short vertical video' },
    ],
    bestTimes: [
      { day: 2, hours: [9, 13, 15] },
      { day: 4, hours: [9, 13] },
      { day: 6, hours: [11, 13] },
    ],
    docsUrl: 'https://developers.facebook.com/docs/pages-api/posts/',
    connectHint: 'Use a long-lived Page access token with pages_manage_posts.',
  },
  x: {
    id: 'x',
    label: 'X (Twitter)',
    shortLabel: 'X',
    handlePrefix: '@',
    brandColor: '#000000',
    gradient: 'from-slate-900 via-black to-slate-950',
    publishable: true,
    charLimit: 280,
    hashtagSweetSpot: [1, 2],
    mediaMax: 4,
    mediaKinds: ['image', 'video', 'gif'],
    videoMaxSeconds: 140,
    aspectRatios: [
      { label: 'Landscape', ratio: 16 / 9, hint: '1600×900' },
      { label: 'Square', ratio: 1, hint: '1200×1200' },
    ],
    features: [
      'text', 'media', 'video', 'gif', 'link', 'hashtags', 'mentions',
      'thread', 'poll', 'schedule',
    ] as NetworkFeature[],
    postKinds: [
      { id: 'standard', label: 'Post', description: 'Up to 280 chars, 4 media' },
      { id: 'thread', label: 'Thread', description: 'Chained posts published in order' },
      { id: 'poll', label: 'Poll', description: '2–4 choices, up to 7 days' },
    ],
    bestTimes: [
      { day: 1, hours: [8, 12, 17] },
      { day: 3, hours: [9, 12, 18] },
      { day: 5, hours: [8, 11] },
    ],
    docsUrl: 'https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/introduction',
    connectHint: 'Create an X app with tweet.write + offline.access and authorize your handle.',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    shortLabel: 'YouTube',
    handlePrefix: '@',
    brandColor: '#FF0000',
    gradient: 'from-[#FF0000] via-[#E60000] to-[#B80000]',
    publishable: false,
    charLimit: 5000,
    hashtagSweetSpot: [3, 5],
    mediaMax: 1,
    mediaKinds: ['video'],
    videoMaxSeconds: 43200,
    aspectRatios: [
      { label: 'Landscape', ratio: 16 / 9, hint: '1920×1080 — standard video' },
      { label: 'Short', ratio: 9 / 16, hint: '1080×1920 — Shorts' },
    ],
    features: ['text', 'video', 'title', 'hashtags', 'link', 'schedule'] as NetworkFeature[],
    postKinds: [
      { id: 'video', label: 'Video', description: 'Long-form upload with title + description' },
      { id: 'short', label: 'Short', description: 'Vertical clip under 60s' },
      { id: 'community', label: 'Community post', description: 'Text / image / poll to the Community tab' },
    ],
    bestTimes: [
      { day: 4, hours: [15, 17] },
      { day: 5, hours: [15, 18] },
      { day: 6, hours: [10, 12] },
    ],
    docsUrl: 'https://developers.google.com/youtube/v3/docs/videos/insert',
    connectHint: 'Authorize a channel via Google OAuth with youtube.upload scope.',
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TikTok',
    handlePrefix: '@',
    brandColor: '#000000',
    gradient: 'from-[#25F4EE] via-black to-[#FE2C55]',
    publishable: false,
    charLimit: 2200,
    hashtagSweetSpot: [3, 6],
    mediaMax: 35,
    mediaKinds: ['video', 'image'],
    videoMaxSeconds: 600,
    aspectRatios: [{ label: 'Vertical', ratio: 9 / 16, hint: '1080×1920 — full screen' }],
    features: ['text', 'video', 'media', 'carousel', 'hashtags', 'mentions', 'schedule'] as NetworkFeature[],
    postKinds: [
      { id: 'video', label: 'Video', description: 'Vertical video with caption' },
      { id: 'photo', label: 'Photo mode', description: 'Swipeable image post' },
    ],
    bestTimes: [
      { day: 2, hours: [9, 12, 19] },
      { day: 4, hours: [12, 15, 21] },
      { day: 6, hours: [10, 11] },
    ],
    docsUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
    connectHint: 'Register a TikTok app with video.publish and authorize the creator account.',
  },
  pinterest: {
    id: 'pinterest',
    label: 'Pinterest',
    shortLabel: 'Pinterest',
    handlePrefix: '',
    brandColor: '#E60023',
    gradient: 'from-[#E60023] via-[#CC001F] to-[#AD001A]',
    publishable: false,
    charLimit: 500,
    hashtagSweetSpot: [2, 4],
    mediaMax: 1,
    mediaKinds: ['image', 'video'],
    videoMaxSeconds: 900,
    aspectRatios: [
      { label: 'Standard pin', ratio: 2 / 3, hint: '1000×1500' },
      { label: 'Square', ratio: 1, hint: '1000×1000' },
    ],
    features: ['text', 'media', 'video', 'title', 'link', 'hashtags', 'schedule'] as NetworkFeature[],
    postKinds: [
      { id: 'pin', label: 'Pin', description: 'Image / video with title, description and destination link' },
    ],
    bestTimes: [
      { day: 5, hours: [14, 16, 20] },
      { day: 6, hours: [8, 11, 20] },
      { day: 0, hours: [13, 15] },
    ],
    docsUrl: 'https://developers.pinterest.com/docs/api/v5/pins-create/',
    connectHint: 'Create a Pinterest app with pins:write and select the destination board.',
  },
  threads: {
    id: 'threads',
    label: 'Threads',
    shortLabel: 'Threads',
    handlePrefix: '@',
    brandColor: '#000000',
    gradient: 'from-slate-800 via-black to-slate-900',
    publishable: false,
    charLimit: 500,
    hashtagSweetSpot: [0, 1],
    mediaMax: 10,
    mediaKinds: ['image', 'video'],
    videoMaxSeconds: 300,
    aspectRatios: [
      { label: 'Square', ratio: 1, hint: '1080×1080' },
      { label: 'Portrait', ratio: 4 / 5, hint: '1080×1350' },
    ],
    features: ['text', 'media', 'carousel', 'video', 'link', 'linkPreview', 'mentions', 'thread', 'schedule'] as NetworkFeature[],
    postKinds: [
      { id: 'standard', label: 'Thread', description: 'Up to 500 chars, 10 media' },
      { id: 'chain', label: 'Chain', description: 'Multiple replies published in order' },
    ],
    bestTimes: [
      { day: 1, hours: [9, 12, 18] },
      { day: 3, hours: [10, 13, 19] },
      { day: 5, hours: [9, 11] },
    ],
    docsUrl: 'https://developers.facebook.com/docs/threads/posts',
    connectHint: 'Threads publishing uses the same Meta app as Instagram with the threads_content_publish scope.',
  },
};

export const SOCIAL_NETWORK_LIST: SocialNetwork[] = Object.values(SOCIAL_NETWORKS);

/** Ids that the current publish pipeline actually supports. */
export const PUBLISHABLE_NETWORK_IDS: SocialNetworkId[] = SOCIAL_NETWORK_LIST
  .filter((n) => n.publishable)
  .map((n) => n.id);

export function getNetwork(id: string): SocialNetwork | undefined {
  return SOCIAL_NETWORKS[id as SocialNetworkId];
}

export function isPublishableNetwork(id: string): id is SocialPlatform {
  return getNetwork(id)?.publishable === true;
}

export function networkHasFeature(id: string, feature: NetworkFeature): boolean {
  return getNetwork(id)?.features.includes(feature) ?? false;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${period}`;
}

export function describeBestTimes(id: string): string {
  const n = getNetwork(id);
  if (!n) return '';
  return n.bestTimes
    .map((w) => `${DAY_LABELS[w.day]} ${w.hours.map(formatHour).join(', ')}`)
    .join('  •  ');
}

/**
 * Next suggested slot at or after `from`, walking the network's best-time
 * windows. Returns a Date in local time.
 */
export function nextBestTime(id: string, from: Date = new Date()): Date {
  const n = getNetwork(id);
  const base = new Date(from.getTime());
  if (!n || n.bestTimes.length === 0) {
    base.setHours(base.getHours() + 1, 0, 0, 0);
    return base;
  }
  for (let addDays = 0; addDays < 14; addDays += 1) {
    const day = new Date(base.getTime());
    day.setDate(day.getDate() + addDays);
    const window = n.bestTimes.find((w) => w.day === day.getDay());
    if (!window) continue;
    for (const hour of window.hours) {
      const candidate = new Date(day.getTime());
      candidate.setHours(hour, 0, 0, 0);
      if (candidate.getTime() > from.getTime() + 5 * 60 * 1000) return candidate;
    }
  }
  base.setHours(base.getHours() + 2, 0, 0, 0);
  return base;
}

export { COMMON_SCHEDULE_HELP, DAY_LABELS };
