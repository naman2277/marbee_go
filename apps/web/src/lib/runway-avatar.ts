/**
 * RunwayML Characters & GWM1 Voice Agent Configuration & Tool Registry
 * Based on Runway Characters React SDK & Realtime Sessions API
 */

export type RunwayAvatarConfig = {
  avatarId: string;
  name: string;
  role: string;
  voice: string;
  avatarIcon: string;
  startScript: string;
  personality: string;
  model: 'gwm1-avatars' | 'gwm1-custom-clone';
};

export const DEFAULT_AVATARS: Record<string, RunwayAvatarConfig> = {
  nova: {
    avatarId: 'char_nova_support_01',
    name: 'Nova',
    role: 'CRM Support & Insights Specialist',
    voice: 'US Female (Friendly Support)',
    avatarIcon: '👩‍💼',
    startScript: "Hi, I'm Nova. I can explore the dashboard, explain insights, and help with tickets. Share your screen if you want help diagnosing what you see.",
    personality: `You are Nova, an intelligent AI CRM Support Specialist. You have access to client tools and server tools.
You can explore the revenue dashboard, explain metrics, diagnose the July 10 refund dip, filter and close support tickets (like ticket #489), and navigate across Marbee CRM.
Always be concise, friendly, and execute tools immediately when requested.`,
    model: 'gwm1-avatars',
  },
  alex: {
    avatarId: 'char_alex_crm_02',
    name: 'Alex',
    role: 'Enterprise CRM Implementation Consultant',
    voice: 'US Male (Consultative)',
    avatarIcon: '👨‍💼',
    startScript: "Hey! I'm Alex. I can trace campaign delivery errors, optimize SQL queries, and diagnose journey bottlenecks.",
    personality: `You are Alex, a senior SaaS CRM implementation consultant. You analyze campaign execution logs, diagnose SMTP/FCM gateway errors, and optimize SQL targeting queries.`,
    model: 'gwm1-avatars',
  },
  sunny: {
    avatarId: 'char_sunny_clone_03',
    name: 'Sunny',
    role: 'AI Tech Lead (Digital Clone)',
    voice: 'US Male (Casual & Upbeat)',
    avatarIcon: '🧑‍💻',
    startScript: "What's up! Let's explore your revenue trends, compare time periods, and triage your open tickets.",
    personality: `You are Sunny's digital clone. You demonstrate Runway GWM1 real-time conversational video, live tool calling, and screen diagnostics.`,
    model: 'gwm1-custom-clone',
  },
};

export type CrmTicket = {
  id: string;
  title: string;
  team: 'Product' | 'Engineering' | 'Support' | 'Marketing';
  status: 'open' | 'closed' | 'in_progress';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  description: string;
};

export const INITIAL_TICKETS: CrmTicket[] = [
  {
    id: '#489',
    title: 'Welcome Campaign SMTP Relay Delivery Timeout (535 Auth)',
    team: 'Product',
    status: 'open',
    priority: 'high',
    createdAt: 'Today, 10:15 AM',
    description: 'Worker pool halted on SMTP 535 authentication credentials invalid on smtp.mailgun.org.',
  },
  {
    id: '#482',
    title: 'Audience Deduplication on Cart Recovery Segment',
    team: 'Support',
    status: 'open',
    priority: 'medium',
    createdAt: 'Yesterday',
    description: 'Targeting query returned 1-to-many joined records for customer profiles.',
  },
  {
    id: '#476',
    title: 'Web Push VAPID Token Pruning on 410 Gone Responses',
    team: 'Engineering',
    status: 'closed',
    priority: 'low',
    createdAt: '3 days ago',
    description: 'Automated pruning cron job successfully removed 1,420 inactive browser tokens.',
  },
  {
    id: '#470',
    title: 'Next-Best-Action Decision Engine Rule Arbitration',
    team: 'Marketing',
    status: 'closed',
    priority: 'medium',
    createdAt: '5 days ago',
    description: 'Configured VIP tier discount rule prioritization over seasonal coupons.',
  },
];

export type RevenueDataPoint = {
  date: string;
  revenue: number;
  isDip?: boolean;
  dipReason?: string;
};

export const REVENUE_METRICS = {
  last7Days: 31656,
  last30Days: 123000,
  last90Days: 349783,
  difference90vs30: 226783,
  difference90vs7: 318127,
  dailyChart: [
    { date: 'Jul 01', revenue: 14200 },
    { date: 'Jul 05', revenue: 18500 },
    { date: 'Jul 10', revenue: 4100, isDip: true, dipReason: 'Refund transaction for $2,850 on order #ORD-9821' },
    { date: 'Jul 15', revenue: 16800 },
    { date: 'Jul 20', revenue: 21400 },
    { date: 'Jul 25', revenue: 19800 },
    { date: 'Jul 30', revenue: 28200 },
  ],
};
