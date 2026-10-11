export type LoyaltyProgramStatus = 'draft' | 'active' | 'paused' | 'archived';

export type LoyaltyProgram = {
  id: string;
  tenantId: string;
  environment: string;
  name: string;
  slug: string;
  description: string | null;
  pointsCurrency: string;
  earnRate: number;
  status: LoyaltyProgramStatus;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LoyaltyTier = {
  id: string;
  programId: string;
  name: string;
  slug: string;
  minPoints: number;
  pointsMultiplier: number;
  color: string;
  benefits: unknown[];
  sortOrder: number;
};

export type LoyaltyMember = {
  id: string;
  programId: string;
  customerId: string;
  tierId: string | null;
  pointsBalance: number;
  lifetimePoints: number;
  status: 'active' | 'suspended' | 'churned';
  enrolledAt: string;
  customer?: { email: string | null; first_name: string | null; last_name: string | null };
  tier?: { name: string; slug: string; color: string };
};

export type OfferType =
  | 'discount_percent'
  | 'discount_fixed'
  | 'cashback'
  | 'bogo'
  | 'free_shipping'
  | 'points_bonus'
  | 'bundle'
  | 'tier_upgrade'
  | 'custom';

export type OfferStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';

export type OfferCtaParam = {
  id: string;
  label: string;
  type: 'link' | 'button' | 'deeplink' | 'coupon_code' | 'custom';
  value: string;
  style?: string;
};

export type LoyaltyOffer = {
  id: string;
  tenantId: string;
  environment: string;
  programId: string | null;
  name: string;
  slug: string;
  description: string | null;
  offerType: OfferType;
  offerValue: number;
  maxDiscount: number | null;
  minPurchase: number | null;
  channel: string;
  placement: string;
  status: OfferStatus;
  priority: number;
  stackingMode: 'exclusive' | 'stackable';
  startsAt: string | null;
  endsAt: string | null;
  budgetTotal: number | null;
  budgetSpent: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  frequencyCapHours: number | null;
  audienceId: string | null;
  requiredTierSlug: string | null;
  eligibilityRules: unknown[];
  personalization: Record<string, unknown>;
  tags: string[];
  expectedLift: number;
  marginImpact: number;
  propensityWeight: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  termsAndConditions: string | null;
  ctaParams: OfferCtaParam[];
  redemptionType: 'auto' | 'code' | 'link' | 'manual';
  redemptionInstructions: string | null;
  targetIndustry: string | null;
  /** stamped when status becomes 'active'; updatedAt > publishedAt ⇒ unpublished edits */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DecisionStrategy =
  | 'highest_value'
  | 'margin_aware'
  | 'balanced'
  | 'explore_exploit'
  | 'personalized';

export type OfferDecisionPolicy = {
  id: string;
  tenantId: string;
  environment: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused';
  strategy: DecisionStrategy;
  channel: string;
  placement: string;
  fallbackOfferId: string | null;
  settings: {
    exploration_rate?: number;
    frequency_cap_hours?: number;
    holdout_percent?: number;
    tie_breaker?: string;
    value_weight?: number;
    margin_weight?: number;
    propensity_weight?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type DecisionResult = {
  policy_id?: string;
  policy_slug?: string;
  strategy?: string;
  winner?: {
    offer_id: string;
    name: string;
    slug: string;
    offer_type: string;
    offer_value: number;
    score: number;
    fallback?: boolean;
  };
  alternatives?: unknown[];
  candidates?: unknown[];
  holdout?: boolean;
  message?: string;
  error?: string;
};

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  discount_percent: '% Discount',
  discount_fixed: 'Fixed discount',
  cashback: 'Cashback',
  bogo: 'Buy one get one',
  free_shipping: 'Free shipping',
  points_bonus: 'Points bonus',
  bundle: 'Bundle deal',
  tier_upgrade: 'Tier upgrade',
  custom: 'Custom',
};

export const STRATEGY_LABELS: Record<DecisionStrategy, string> = {
  highest_value: 'Highest value',
  margin_aware: 'Margin-aware',
  balanced: 'Balanced (recommended)',
  explore_exploit: 'Explore / exploit',
  personalized: 'Personalized',
};

export const CHANNEL_OPTIONS = ['any', 'web', 'app', 'email', 'sms', 'whatsapp', 'pos', 'journey'] as const;
export const PLACEMENT_OPTIONS = ['any', 'homepage', 'checkout', 'cart', 'email', 'journey', 'push', 'in_app'] as const;
export const DISCOUNT_TYPE_OPTIONS = ['discount_percent', 'discount_fixed', 'cashback', 'bogo', 'free_shipping', 'points_bonus', 'bundle', 'tier_upgrade', 'custom'] as const;
