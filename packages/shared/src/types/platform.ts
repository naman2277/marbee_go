export type Environment = 'development' | 'staging' | 'production';

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'growth' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  last_login_at: string | null;
};

export type Role = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type AppMetadata = {
  tenant_id: string;
  environment: Environment;
  role: string;
};

export const NAV_SECTIONS = [
  {
    title: 'Home',
    items: [
      { label: 'Pulse', path: '/dashboard', icon: 'Activity' },
      { label: 'Insights', path: '/insights', icon: 'LineChart' },
    ],
  },
  {
    title: 'Customer',
    items: [
      { label: 'Customer Profiles', path: '/customers', icon: 'Users' },
      { label: 'Audience', path: '/customers/audiences', icon: 'Target' },
      { label: 'Subscriptions', path: '/subscriptions', icon: 'Bell' },
    ],
  },
  {
    title: 'Loyalty & Decisioning',
    items: [
      { label: 'Loyalty', path: '/loyalty', icon: 'Award' },
      { label: 'Offers', path: '/loyalty/offers', icon: 'Gift' },
      { label: 'Coupons', path: '/loyalty/coupons', icon: 'Tag' },
      { label: 'Decision Engine', path: '/loyalty/decision-engine', icon: 'Brain' },
    ],
  },
  {
    title: 'Campaigns',
    items: [
      { label: 'Campaigns', path: '/campaigns', icon: 'Megaphone' },
      { label: 'Web Push Campaigns', path: '/campaigns/web-push', icon: 'BellRing' },
      { subheader: 'Real-Time Messaging' },
      { label: 'Overview', path: '/real-time', icon: 'Zap' },
      { label: 'Message Templates', path: '/real-time/templates', icon: 'LayoutTemplate' },
      { label: 'Real-Time Events', path: '/real-time/events', icon: 'Activity' },
      { label: 'Deliveries', path: '/real-time/deliveries', icon: 'Radio' },
      { label: 'Triggers', path: '/real-time/triggers', icon: 'Target' },
      { label: 'Settings', path: '/real-time/settings', icon: 'Settings' },
    ],
  },
  {
    title: 'Journeys',
    items: [
      { label: 'Journeys', path: '/journeys', icon: 'GitBranch' },
      { label: 'Journey Analytics', path: '/journey-analytics', icon: 'BarChart3' },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Asset Library', path: '/content/assets', icon: 'Image' },
      { label: 'Files', path: '/content/files', icon: 'FileUp' },
      { label: 'Templates', path: '/content/templates', icon: 'LayoutTemplate' },
      { label: 'Forms', path: '/content/forms', icon: 'FileInput' },
      { label: 'Landing Pages', path: '/content/landing-pages', icon: 'Globe' },
      { label: 'Social Studio', path: '/content/social', icon: 'Share2' },
      { label: 'Chat Bots', path: '/content/chatbots', icon: 'Bot' },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Overview', path: '/data/overview', icon: 'Gauge' },
      { subheader: 'Model' },
      { label: 'Schemas', path: '/data/schemas', icon: 'Database' },
      { label: 'Connectors', path: '/data/connectors', icon: 'Plug' },
      { label: 'Marketplace', path: '/data/connectors/marketplace', icon: 'LayoutGrid' },
      { label: 'Pipelines', path: '/data/jobs', icon: 'Workflow' },
      { label: 'Automations', path: '/data/automations', icon: 'Cpu' },
      { subheader: 'Execute' },
      { label: 'Job Center', path: '/data/runs', icon: 'Activity' },
      { label: 'Schedules', path: '/data/schedules', icon: 'Clock' },
    ],
  },
  {
    title: 'Reporting',
    items: [
      { label: 'Web Analytics (SDK)', path: '/reporting/web-analytics', icon: 'Globe' },
      { label: 'Journey Performance', path: '/reporting/journeys', icon: 'Route' },
      { label: 'Channel Performance', path: '/reporting/channels', icon: 'Megaphone' },
      { label: 'Customer Analytics', path: '/reporting/customers', icon: 'PieChart' },
      { label: 'Revenue Attribution', path: '/reporting/revenue', icon: 'IndianRupee' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'General', path: '/settings/general', icon: 'Settings' },
      { label: 'AI Engine', path: '/settings/ai-engine', icon: 'Cpu' },
      { label: 'Channels', path: '/settings/channels', icon: 'Share2' },
      { label: 'API', path: '/settings/api', icon: 'Key' },
      { label: 'Access Management', path: '/settings/access', icon: 'Lock' },
      { label: 'Audit log', path: '/settings/audit-log', icon: 'Shield' },
      { label: 'License & Usage', path: '/settings/usage', icon: 'Gauge' },
      { label: 'Documentation', path: '/settings/docs', icon: 'BookOpen' },
    ],
  },
] as const;
