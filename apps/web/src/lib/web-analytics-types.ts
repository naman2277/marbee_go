export type WebAnalyticsSite = {
  id: string;
  tenantId: string;
  environment: string;
  siteId: string; // e.g. site_9f2a8c14
  name: string;
  domain: string;
  allowedOrigins: string[];
  writeKey: string;
  verificationToken: string;
  status: 'pending_verification' | 'active' | 'paused' | 'archived';
  lastEventAt: string | null;
  totalPageviews: number;
  totalEvents: number;
  totalSessions: number;
  settings: {
    autoPageviews: boolean;
    autoClicks: boolean;
    autoScroll: boolean;
    respectDoNotTrack: boolean;
    anonymizeIp: boolean;
    consentMode: 'opt_in' | 'opt_out' | 'essential_only';
    webPushEnabled?: boolean;
    webPushVapidKey?: string;
    webPushWelcomeTitle?: string;
    webPushWelcomeBody?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type WebPushSubscriber = {
  id: string;
  tenantId: string;
  environment: string;
  siteId?: string;
  websiteDomain?: string;
  optinPage?: string; // which specific page the user was on when opting in
  optinStatus: 'yes' | 'granted' | 'pending' | 'denied';
  fcmToken: string;
  customerId?: string | null;
  browser: string;
  os: string;
  device: string;
  permissionStatus: string;
  subscriptionStatus: 'active' | 'inactive' | 'unsubscribed' | 'expired';
  isTestToken?: boolean; // indicates if token is a test/simulated token
  deliveryFailures?: number;
  lastDeliveryStatus?: 'delivered' | 'failed' | 'untested';
  lastFailureReason?: string | null;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  lastSeen: string;
  createdAt: string;
};

export type WebAnalyticsEvent = {
  id: string;
  tenantId: string;
  environment: string;
  siteId: string;
  eventId: string;
  sessionId: string;
  anonymousId: string;
  customerId?: string | null;
  eventName: string;
  url: string;
  path: string;
  hostname: string;
  referrer?: string | null;
  referrerDomain?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  pageTitle?: string | null;
  screenResolution?: string | null;
  viewportSize?: string | null;
  language?: string | null;
  timezone?: string | null;
  userAgent?: string | null;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  browser: string;
  os: string;
  countryCode: string | null;
  countryName: string | null;
  city?: string | null;
  ipHash: string | null;
  isBot: boolean;
  properties: Record<string, unknown>;
  clientTimestamp: string;
  serverTimestamp: string;
};

export type ActionableInsight = {
  id: string;
  type: 'positive' | 'warning' | 'opportunity';
  title: string;
  description: string;
  action: string;
  impactMetric: string;
};

export type UtmCampaignMetric = {
  campaign: string;
  source: string;
  medium: string;
  sessions: number;
  bounceRate: number;
  avgDurationSec: number;
};

export type WebAnalyticsMetrics = {
  activeVisitorsNow: number;
  totalPageviews: number;
  totalSessions: number;
  uniqueVisitors: number;
  avgSessionDurationSec: number;
  bounceRatePercent: number;
  pagesPerSession: number;
  newVsReturning: {
    newPercent: number;
    returningPercent: number;
    newCount: number;
    returningCount: number;
  };
  pageviewsDelta: number;
  sessionsDelta: number;
  visitorsDelta: number;
  timeSeries: {
    time: string;
    pageviews: number;
    visitors: number;
    sessions: number;
  }[];
  topPages: {
    path: string;
    pageviews: number;
    uniqueVisitors: number;
    avgTimeOnPageSec: number;
    bounceRate: number;
  }[];
  trafficSources: {
    source: string;
    medium: string;
    campaign: string;
    sessions: number;
    conversionRate: number;
  }[];
  utmBreakdown: UtmCampaignMetric[];
  actionableInsights: ActionableInsight[];
  devices: {
    name: string;
    count: number;
    percentage: number;
  }[];
  browsers: {
    name: string;
    count: number;
    percentage: number;
  }[];
  countries: {
    code: string;
    name: string;
    visitors: number;
    percentage: number;
  }[];
  cities: {
    city: string;
    country: string;
    visitors: number;
    percentage: number;
  }[];
  regions: {
    region: string;
    country: string;
    visitors: number;
    percentage: number;
  }[];
  customEvents: {
    eventName: string;
    count: number;
    uniqueUsers: number;
    lastFiredAt: string;
  }[];
};

// ==========================================
// BEHAVIORAL INTELLIGENCE & AI BRAIN TYPES
// ==========================================

export type AttentionMetrics = {
  maxScrollDepth: number; // 0-100%
  scrollVelocity: number; // px/sec
  dwellTimeSec: number; // total page open time
  activeReadingTimeSec: number; // engaged active time
  timeOnSections: Record<string, number>; // sectionId -> seconds
  elementsExposed: string[]; // selector or element id
  ctaExposureDurationSec: number;
};

export type FrictionSignal = {
  id: string;
  type:
    | 'rage_click'
    | 'dead_click'
    | 'rapid_navigation'
    | 'form_error'
    | 'form_abandonment'
    | 'js_error'
    | 'api_failure'
    | 'checkout_failure'
    | 'zero_results'
    | 'slow_page';
  severity: 'low' | 'medium' | 'high' | 'critical';
  elementTarget?: string;
  pagePath: string;
  details: string;
  timestamp: string;
  repeatCount?: number;
};

export type CoreWebVitals = {
  lcp?: number; // Largest Contentful Paint in ms
  fid?: number; // First Input Delay in ms
  cls?: number; // Cumulative Layout Shift
  ttfb?: number; // Time to First Byte in ms
  domLoad?: number; // DOM Content Loaded in ms
};

export type BehavioralSession = {
  id: string;
  siteId: string;
  tenantId: string;
  anonymousId: string;
  userId?: string | null;
  startTime: string;
  endTime: string;
  durationSec: number;
  activeTimeSec: number;
  device: {
    type: string;
    os: string;
    browser: string;
    screen: string | null;
  };
  geo: {
    country: string | null;
    city: string | null;
  };
  attribution: {
    source: string;
    medium: string;
    campaign?: string;
    landingPage: string;
    exitPage: string;
  };
  pageviews: number;
  eventsCount: number;
  pagesVisited: string[];
  attention: AttentionMetrics;
  frictionSignals: FrictionSignal[];
  intentScore: number; // 0-100
  intentCategory: 'low' | 'medium' | 'high' | 'ultra_high';
  persona: string; // e.g. 'High Intent Buyer', 'Researcher', 'Frustrated Buyer', 'Deal Seeker'
  converted: boolean;
  conversionGoal?: string;
  revenue: number;
  errorsCount: number;
  aiSummary: string; // AI generated synthesis of session intent & friction
  replaysAvailable?: boolean;
  activities?: Array<{
    eventName: string;
    path: string;
    url?: string;
    pageTitle?: string;
    timestamp: string;
    properties?: Record<string, any>;
  }>;
};

export type AIBrainAnalysis = {
  whatHappened: string;
  metricImpact: {
    metric: string;
    changePct: number;
    direction: 'up' | 'down';
  };
  whyRootCause: {
    summary: string;
    factors: { label: string; contributionPct: number; detail: string }[];
  };
  whoAffected: {
    totalUsers: number;
    segmentDescription: string;
    topDevice: string;
    topSource: string;
  };
  recommendedAction: {
    title: string;
    description: string;
    expectedGain: string;
    actionType: 'campaign' | 'ab_test' | 'code_fix' | 'journey';
  };
  executablePayload: {
    targetCohort: string;
    channel: 'whatsapp' | 'web_push' | 'email' | 'ab_test';
    templateTitle: string;
    suggestedMessage: string;
  };
};

export type AIAgentProfile = {
  id: string;
  name: string;
  role: string;
  icon: string;
  badge: string;
  status: 'active' | 'analyzing' | 'idle';
  lastFinding: string;
  confidenceScore: number;
  topRecommendation: string;
  actionButtonLabel: string;
  actionType: 'launch_campaign' | 'create_experiment' | 'view_funnel' | 'fix_schema' | 'inspect_friction';
};

export type RevenueOpportunity = {
  id: string;
  title: string;
  estimatedRevenue: string;
  affectedUsersCount: number;
  frictionType: string;
  description: string;
  actionLabel: string;
  channel: 'whatsapp' | 'push' | 'email' | 'retargeting';
};

export type ExecutiveBriefing = {
  date: string;
  greeting: string;
  revenueSummary: {
    amount: string;
    deltaPct: number;
    direction: 'up' | 'down' | 'neutral';
    keyDriver: string;
  };
  biggestOpportunity: {
    value: string;
    description: string;
    action: string;
  };
  topFrictionRisk: {
    severity: string;
    description: string;
    fixProposal: string;
  };
  aiHealthScore: number; // 0-100
};

export type TrackingHealthScore = {
  overallScore: number; // 0-100
  breakdown: {
    identityCoverage: number;
    namingConsistency: number;
    schemaValidity: number;
    revenueAttribution: number;
    vitalCoverage: number;
  };
  issues: {
    severity: 'warning' | 'critical' | 'info';
    message: string;
    fixSnippet?: string;
  }[];
};

export type AIAgentAnalyticsMetrics = {
  totalAgentSessions: number;
  totalTokensConsumed: number;
  estimatedCostUsd: number;
  avgLatencyMs: number;
  taskCompletionRatePct: number;
  userSatisfactionPct: number;
  toolCallsCount: number;
  hallucinationRatePct: number;
};
