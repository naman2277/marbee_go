export type SocialPlatform = 'linkedin' | 'facebook' | 'instagram' | 'x';

export type LinkedInCtaLabel =
  | 'APPLY'
  | 'DOWNLOAD'
  | 'LEARN_MORE'
  | 'SIGN_UP'
  | 'SUBSCRIBE'
  | 'REGISTER'
  | 'JOIN'
  | 'ATTEND'
  | 'REQUEST_DEMO';

export type LinkedInPollDuration = 'ONE_DAY' | 'THREE_DAYS' | 'SEVEN_DAYS' | 'FOURTEEN_DAYS';

export type LinkedInPostOptions = {
  postType?: 'standard' | 'article' | 'media' | 'poll' | 'reshare';
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  feedDistribution?: 'MAIN_FEED' | 'NONE';
  isReshareDisabledByAuthor?: boolean;
  cta?: {
    label: LinkedInCtaLabel;
    landingPageUrl: string;
  };
  article?: {
    source: string;
    title: string;
    description?: string;
    thumbnail?: string;
  };
  poll?: {
    question: string;
    options: string[];
    duration: LinkedInPollDuration;
    isMultipleSelection?: boolean;
  };
  reshareParentUrn?: string;
  targeting?: {
    geoLocations?: string[];
    seniorities?: string[];
    industries?: string[];
    jobFunctions?: string[];
  };
};

export type InstagramMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'REELS' | 'STORIES';

export type InstagramPostOptions = {
  mediaType?: InstagramMediaType;
  shareToFeed?: boolean;
  coverUrl?: string;
  locationName?: string;
  userTags?: string[];
  firstComment?: string;
  audioName?: string;
};

export type SocialAccount = {
  id: string;
  tenantId: string;
  environment: string;
  platform: SocialPlatform;
  accountName: string;
  accountId: string | null;
  status: 'connected' | 'expired' | 'disconnected' | 'error';
  profileImageUrl: string | null;
  connectedAt: string | null;
  config: Record<string, unknown>;
};

export type SocialPost = {
  id: string;
  tenantId: string;
  environment: string;
  content: string;
  mediaUrls: string[];
  linkUrl: string | null;
  platforms: SocialPlatform[];
  linkedinOptions?: LinkedInPostOptions;
  instagramOptions?: InstagramPostOptions;
  scheduledAt: string | null;
  publishedAt: string | null;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  externalPostIds: Record<string, string>;
  errorMessage: string | null;
  createdAt: string;
};

export const LINKEDIN_CTA_OPTIONS: { id: LinkedInCtaLabel; label: string }[] = [
  { id: 'LEARN_MORE', label: 'Learn More' },
  { id: 'SIGN_UP', label: 'Sign Up' },
  { id: 'REGISTER', label: 'Register' },
  { id: 'REQUEST_DEMO', label: 'Request Demo' },
  { id: 'DOWNLOAD', label: 'Download' },
  { id: 'APPLY', label: 'Apply' },
  { id: 'SUBSCRIBE', label: 'Subscribe' },
  { id: 'JOIN', label: 'Join' },
  { id: 'ATTEND', label: 'Attend' },
];

export const INSTAGRAM_MEDIA_TYPES: { id: InstagramMediaType; label: string; description: string }[] = [
  { id: 'IMAGE', label: 'Feed Post', description: 'Standard single photo post in square or 4:5 ratio' },
  { id: 'CAROUSEL', label: 'Carousel', description: 'Multi-image or video swipeable album (up to 10 items)' },
  { id: 'REELS', label: 'Reel', description: 'Full-screen vertical video (9:16) with feed broadcast' },
  { id: 'STORIES', label: 'Story', description: '24-hour disappearing vertical photo or short video' },
];

export const SOCIAL_PLATFORMS: {
  id: SocialPlatform;
  label: string;
  color: string;
  charLimit: number;
  docsUrl: string;
}[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    charLimit: 3000,
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-08&tabs=http',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: '#E4405F',
    charLimit: 2200,
    docsUrl: 'https://developers.facebook.com/documentation/instagram-platform/content-publishing',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    charLimit: 63206,
    docsUrl: 'https://developers.facebook.com/docs/pages-api/posts/',
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    color: '#000000',
    charLimit: 280,
    docsUrl: 'https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/introduction',
  },
];

export function getOAuthUrl(platform: SocialPlatform, redirectUri: string, clientId: string): string {
  const state = encodeURIComponent(JSON.stringify({ platform }));
  switch (platform) {
    case 'linkedin':
      return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('openid profile email w_member_social w_organization_social r_organization_social')}&state=${state}`;
    case 'instagram':
      // Meta Graph API Content Publishing permissions
      return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts,business_management')}&state=${state}`;
    case 'facebook':
      return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('pages_manage_posts,pages_read_engagement,pages_show_list,business_management')}&state=${state}`;
    case 'x':
      return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('tweet.read tweet.write users.read offline.access')}&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
    default:
      return '#';
  }
}
