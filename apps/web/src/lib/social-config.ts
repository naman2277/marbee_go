/**
 * Social Studio workspace + per-channel configuration.
 *
 * This is the "set everything up from one tool" layer: brand identity, per-network
 * posting defaults, hashtag sets, signatures / first-comment templates, UTM & link
 * rules, publishing-schedule slots (Buffer-style queue), approval workflow and
 * automation toggles.
 *
 * Persistence is local (per browser) keyed by tenant + environment. It is written
 * behind a small async-looking API so it can be swapped for a Supabase-backed
 * store later without touching the UI.
 */
import type { SocialNetworkId } from './social-networks';
import { SOCIAL_NETWORK_LIST } from './social-networks';

export type QueueSlot = {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  /** "HH:MM" 24h */
  time: string;
};

export type HashtagSet = {
  id: string;
  name: string;
  tags: string[];
};

export type UtmConfig = {
  enabled: boolean;
  source: string;
  medium: string;
  campaign: string;
  /** shorten links via a domain, purely cosmetic in this build */
  shortenDomain: string;
};

export type NetworkConfig = {
  enabled: boolean;
  /** appended to the caption on publish */
  signature: string;
  /** auto-posted as the first comment (great for hashtag dumps) */
  firstCommentTemplate: string;
  /** hashtag set id applied by default */
  defaultHashtagSetId: string | null;
  /** where default hashtags land */
  hashtagPlacement: 'caption' | 'firstComment' | 'none';
  /** require review before this network can publish */
  approvalRequired: boolean;
  /** publishing-schedule slots used by the queue */
  queue: QueueSlot[];
  /** auto-add link UTM params for this network */
  utm: UtmConfig;
  /** watermark media before upload (cosmetic flag) */
  watermark: boolean;
};

export type AiVoice = {
  tone: 'professional' | 'friendly' | 'bold' | 'playful' | 'informative';
  emoji: 'none' | 'light' | 'expressive';
  perspective: 'brand' | 'founder' | 'team';
  bannedWords: string[];
};

export type ApprovalWorkflow = {
  enabled: boolean;
  reviewers: string[];
  /** minimum approvals before a post can leave "In review" */
  minApprovals: number;
  notifyChannel: string;
};

export type Automation = {
  autoQueue: boolean;
  recycleEvergreen: boolean;
  pauseOnFailure: boolean;
  linkInBioSync: boolean;
  utmEverywhere: boolean;
};

export type SocialConfig = {
  version: 2;
  brand: {
    name: string;
    handle: string;
    avatarUrl: string;
    timezone: string;
    website: string;
  };
  hashtagSets: HashtagSet[];
  networks: Record<SocialNetworkId, NetworkConfig>;
  ai: AiVoice;
  approval: ApprovalWorkflow;
  automation: Automation;
};

const DEFAULT_QUEUE: QueueSlot[] = [
  { day: 1, time: '09:00' },
  { day: 2, time: '12:30' },
  { day: 3, time: '09:00' },
  { day: 4, time: '17:00' },
  { day: 5, time: '11:00' },
];

function defaultNetworkConfig(id: SocialNetworkId): NetworkConfig {
  return {
    enabled: ['linkedin', 'instagram', 'facebook', 'x'].includes(id),
    signature: '',
    firstCommentTemplate: '',
    defaultHashtagSetId: null,
    hashtagPlacement: id === 'instagram' ? 'firstComment' : 'caption',
    approvalRequired: false,
    queue: DEFAULT_QUEUE.map((s) => ({ ...s })),
    utm: {
      enabled: false,
      source: id,
      medium: 'social',
      campaign: '',
      shortenDomain: '',
    },
    watermark: false,
  };
}

export function defaultSocialConfig(): SocialConfig {
  const networks = {} as Record<SocialNetworkId, NetworkConfig>;
  for (const n of SOCIAL_NETWORK_LIST) networks[n.id] = defaultNetworkConfig(n.id);
  return {
    version: 2,
    brand: {
      name: 'Marbee Marketing',
      handle: 'marbee',
      avatarUrl: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      website: 'https://marbee.io',
    },
    hashtagSets: [
      { id: 'growth', name: 'Growth', tags: ['#marketing', '#growth', '#saas', '#startups'] },
      { id: 'product', name: 'Product', tags: ['#product', '#design', '#ux', '#buildinpublic'] },
    ],
    networks,
    ai: {
      tone: 'friendly',
      emoji: 'light',
      perspective: 'brand',
      bannedWords: [],
    },
    approval: {
      enabled: false,
      reviewers: [],
      minApprovals: 1,
      notifyChannel: '',
    },
    automation: {
      autoQueue: true,
      recycleEvergreen: false,
      pauseOnFailure: true,
      linkInBioSync: false,
      utmEverywhere: false,
    },
  };
}

/** Deep-ish merge that keeps new default keys when loading older saved blobs. */
function hydrate(raw: Partial<SocialConfig> | null | undefined): SocialConfig {
  const base = defaultSocialConfig();
  if (!raw || typeof raw !== 'object') return base;
  const merged: SocialConfig = {
    ...base,
    ...raw,
    brand: { ...base.brand, ...(raw.brand ?? {}) },
    ai: { ...base.ai, ...(raw.ai ?? {}) },
    approval: { ...base.approval, ...(raw.approval ?? {}) },
    automation: { ...base.automation, ...(raw.automation ?? {}) },
    hashtagSets: Array.isArray(raw.hashtagSets) && raw.hashtagSets.length ? raw.hashtagSets : base.hashtagSets,
    networks: { ...base.networks },
  };
  if (raw.networks) {
    for (const n of SOCIAL_NETWORK_LIST) {
      merged.networks[n.id] = {
        ...base.networks[n.id],
        ...(raw.networks[n.id] ?? {}),
        utm: { ...base.networks[n.id].utm, ...((raw.networks[n.id] ?? {}).utm ?? {}) },
        queue:
          Array.isArray(raw.networks[n.id]?.queue) && raw.networks[n.id]!.queue.length
            ? raw.networks[n.id]!.queue
            : base.networks[n.id].queue,
      };
    }
  }
  merged.version = 2;
  return merged;
}

function storageKey(tenantId: string, environment: string): string {
  return `marbee.social.config.${tenantId || 'anon'}.${environment || 'default'}`;
}

export function loadSocialConfig(tenantId: string, environment: string): SocialConfig {
  if (typeof window === 'undefined') return defaultSocialConfig();
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId, environment));
    if (!raw) return defaultSocialConfig();
    return hydrate(JSON.parse(raw) as Partial<SocialConfig>);
  } catch {
    return defaultSocialConfig();
  }
}

export function saveSocialConfig(tenantId: string, environment: string, config: SocialConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(tenantId, environment), JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('marbee:social-config', { detail: { tenantId, environment } }));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

// ---------------------------------------------------------------------------
// Derived helpers used across the studio
// ---------------------------------------------------------------------------

export function resolveHashtagSet(config: SocialConfig, id: string | null): HashtagSet | undefined {
  if (!id) return undefined;
  return config.hashtagSets.find((s) => s.id === id);
}

export function buildUtmUrl(url: string, utm: UtmConfig, extraCampaign?: string): string {
  if (!utm.enabled || !url.trim()) return url;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (utm.source) u.searchParams.set('utm_source', utm.source);
    if (utm.medium) u.searchParams.set('utm_medium', utm.medium);
    const campaign = extraCampaign || utm.campaign;
    if (campaign) u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Apply a network's configured defaults (signature, hashtags) to a caption.
 * Pure — returns the transformed caption plus the resolved first comment.
 */
export function applyNetworkDefaults(
  config: SocialConfig,
  networkId: SocialNetworkId,
  caption: string,
): { caption: string; firstComment: string } {
  const nc = config.networks[networkId];
  if (!nc) return { caption, firstComment: '' };
  const set = resolveHashtagSet(config, nc.defaultHashtagSetId);
  const tagLine = set ? set.tags.join(' ') : '';
  let out = caption.trimEnd();
  let firstComment = nc.firstCommentTemplate.trim();

  if (nc.signature.trim()) out = `${out}\n\n${nc.signature.trim()}`;
  if (tagLine) {
    if (nc.hashtagPlacement === 'caption') out = `${out}\n\n${tagLine}`;
    else if (nc.hashtagPlacement === 'firstComment') {
      firstComment = firstComment ? `${firstComment}\n${tagLine}` : tagLine;
    }
  }
  return { caption: out, firstComment };
}

export const TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];
