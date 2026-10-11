export type KnowledgeCategory =
  | 'campaigns'
  | 'journeys'
  | 'audiences'
  | 'customers'
  | 'channels'
  | 'schemas'
  | 'loyalty'
  | 'apis'
  | 'troubleshooting'
  | 'analytics'
  | 'templates';

export type KnowledgeArticle = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  tags: string[];
  summary: string;
  steps?: string[];
  codeSample?: string;
  troubleshooting?: {
    symptom: string;
    likelyCause: string;
    fixSteps: string[];
    prevention: string;
  };
  relatedNavigation: { label: string; path: string };
  confidence: 'high' | 'medium' | 'low';
};

export type KnownError = {
  code: string;
  pattern: RegExp;
  category: 'Configuration' | 'Data/SQL' | 'API/Integration' | 'Deliverability' | 'Permissions' | 'Workflow';
  problem: string;
  likelyCause: string;
  severity: 'critical' | 'warning' | 'info';
  confirmedVsLikely: string;
  fixSteps: string[];
  verification: string;
  prevention: string;
  sampleFixQuery?: string;
};

export const KNOWN_ERRORS: KnownError[] = [
  {
    code: 'ERR_DUPLICATE_KEY',
    pattern: /(duplicate key|unique constraint|duplicate customer id|primary key violation)/i,
    category: 'Data/SQL',
    problem: 'Duplicate customer records detected during audience ingestion or campaign blast.',
    likelyCause: 'A SQL table join (e.g. Orders or Events) returned 1-to-many rows per customer without a DISTINCT or GROUP BY deduplication step.',
    severity: 'critical',
    confirmedVsLikely: 'Confirmed in audience targeting query or customer sync payload.',
    fixSteps: [
      'Open the Audience targeting SQL query in Customers > Audiences.',
      'Check all `LEFT JOIN` and `INNER JOIN` conditions on transactional datasets.',
      'Wrap targeting with `SELECT DISTINCT customer_id, ...` or use `ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY last_seen DESC) = 1`.',
      'Re-run query test preview to verify audience count equals unique profiles.',
    ],
    verification: 'Execute preview query: `SELECT customer_id, COUNT(*) FROM audience_preview GROUP BY customer_id HAVING COUNT(*) > 1;` — should return 0 rows.',
    prevention: 'Always enforce customer_id primary key index and deduplicate transactional event tables before joining.',
    sampleFixQuery: `SELECT DISTINCT ON (c.id) 
  c.id AS customer_id, 
  c.email, 
  c.first_name, 
  o.total_amount AS last_order_val
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE c.status = 'active'
ORDER BY c.id, o.created_at DESC;`,
  },
  {
    code: 'ERR_AUDIENCE_ZERO_RECORDS',
    pattern: /(0 records|empty audience|0 recipients|zero eligible|no targets found)/i,
    category: 'Configuration',
    problem: 'Campaign or Journey execution evaluated to 0 eligible target customers.',
    likelyCause: 'Overly restrictive filter conditions, contradictory AND/OR rules, or suppression list excluding all matching users.',
    severity: 'warning',
    confirmedVsLikely: 'Likely caused by Date range in the future, missing consent tags, or inactive segment criteria.',
    fixSteps: [
      'Open Audiences > Target Segment and inspect each filter rule.',
      'Verify that Date Range filters are using relative dates (e.g. `last 30 days`) rather than absolute future dates.',
      'Check Channel Consent: ensure users have `email_opt_in = true` or `push_opt_in = true`.',
      'Inspect Global Frequency Caps / Suppression lists under Settings > Channels.',
    ],
    verification: 'Click "Test Audience Count" in the Audience Builder to preview the live matching user count before blast.',
    prevention: 'Set up an automated audience volume health alert if segment size drops by > 50%.',
  },
  {
    code: 'ERR_WEB_PUSH_FCM_INVALID',
    pattern: /(invalid token|unregistered|fcm 404|not registered|web push failed|410 gone)/i,
    category: 'Deliverability',
    problem: 'Push notification relay failed because device subscription tokens are expired or revoked by browser.',
    likelyCause: 'Browser permissions were reset by user or Service Worker VAPID keys were rotated without token refresh.',
    severity: 'warning',
    confirmedVsLikely: 'Confirmed 410 Gone / 404 Not Registered from FCM/APNs push relay gateways.',
    fixSteps: [
      'Navigate to Subscriptions > Web Push Tokens.',
      'Trigger "Prune Inactive Tokens" job to mark 410 Gone tokens as inactive.',
      'Verify VAPID public/private key pair under Settings > Channels > Web Push.',
      'Ensure Service Worker `marbee-sw.js` is registered with scope `/`.',
    ],
    verification: 'Send a single test push notification to your current browser session in Web Push > Test Relay.',
    prevention: 'Enable automatic token pruning on 410 responses in Real-Time Triggers.',
  },
  {
    code: 'ERR_JOURNEY_STEP_DEADLOCK',
    pattern: /(journey stuck|wait step timeout|step deadlock|workflow paused|journey not advancing)/i,
    category: 'Workflow',
    problem: 'Customer journey nodes are stalled and not executing downstream email/push actions.',
    likelyCause: 'A Wait Condition node has an unreachable event trigger (e.g. "Wait for Purchase within 24h" without a fallback branch) or journey is in Draft mode.',
    severity: 'critical',
    confirmedVsLikely: 'Likely missing default exit condition or Journey runtime worker queue is paused.',
    fixSteps: [
      'Open Journeys > Select Journey > Inspect Canvas.',
      'Check all Decision Nodes and ensure both `Yes` and `No` (or `Timeout Fallback`) branches are connected.',
      'Verify Journey status is `Active` and not `Draft` or `Paused`.',
      'Check Settings > AI Engine & Runtime for any throttled message queues.',
    ],
    verification: 'Publish a test user event into Real-Time Triggers and follow the live journey path in Journey Monitor.',
    prevention: 'Always configure fallback paths on time-based event wait nodes.',
  },
  {
    code: 'ERR_TEMPLATE_SYNTAX_LIQUID',
    pattern: /(liquid error|syntax error in template|undefined tag|missing closing tag|handlebars error)/i,
    category: 'Configuration',
    problem: 'Template compilation failed due to unclosed tags or invalid personalization attribute names.',
    likelyCause: 'A personalization tag like `{{ customer.first_name }}` has missing curly braces or references an attribute that does not exist in Schema.',
    severity: 'critical',
    confirmedVsLikely: 'Confirmed template parser syntax error.',
    fixSteps: [
      'Open Content > Templates > Select Template.',
      'Search for unclosed tags like `{{` without `}}` or `{% if %}` without `{% endif %}`.',
      'Verify attribute names against Data Platform > Schemas (e.g. `customer.profile.first_name`).',
      'Use fallback values: `{{ customer.first_name | default: "there" }}`.',
    ],
    verification: 'Use "Render Preview with Sample Customer" in the Template Studio.',
    prevention: 'Always run Template Linter before attaching templates to active campaigns.',
  },
  {
    code: 'ERR_API_UNAUTHORIZED_401',
    pattern: /(401 unauthorized|invalid api key|bearer token expired|jwt signature invalid)/i,
    category: 'API/Integration',
    problem: 'API integration request rejected with HTTP 401 Unauthorized.',
    likelyCause: 'API Key is revoked, environment header is mismatched, or Bearer token has expired.',
    severity: 'critical',
    confirmedVsLikely: 'Confirmed authentication failure.',
    fixSteps: [
      'Go to Settings > API & Webhooks > API Keys.',
      'Verify that the API Key environment matches your endpoint (`production` vs `development`).',
      'Include header `Authorization: Bearer mb_live_...` or `x-marbee-api-key: ...`.',
      'If using webhooks, verify webhook signature secret in HMAC header.',
    ],
    verification: 'Run `curl -H "x-marbee-api-key: YOUR_KEY" https://api.marbee.io/v1/ping` — should return 200 OK.',
    prevention: 'Set up key rotation reminders 14 days before expiration.',
  },
];

export const KNOWLEDGE_BASE: KnowledgeArticle[] = [
  {
    id: 'kb_camp_create',
    title: 'How to Create and Launch a Multi-Channel Campaign',
    category: 'campaigns',
    tags: ['campaign', 'create', 'email', 'push', 'sms', 'whatsapp', 'blast'],
    summary: 'Step-by-step guide to configure target audience, content templates, delivery channels, and launch marketing blasts.',
    steps: [
      'Go to Campaigns from the sidebar navigation.',
      'Click "+ Create Campaign" in the top-right toolbar.',
      'Select your campaign type: Blast (Instant), Scheduled Sprint, or Recurring.',
      'Choose your Target Audience from saved segments or build a new SQL filter.',
      'Select communication channels (Email, Web Push, SMS, WhatsApp, RCS).',
      'Select or design your personalized content template.',
      'Configure Quiet Hours and Delivery Speed Throttle.',
      'Run "Pre-flight Validation" and click "Launch Campaign".',
    ],
    relatedNavigation: { label: 'Open Campaigns', path: '/campaigns' },
    confidence: 'high',
  },
  {
    id: 'kb_journey_cart',
    title: 'Building an Abandoned Cart Recovery Customer Journey',
    category: 'journeys',
    tags: ['journey', 'abandoned cart', 'trigger', 'automation', 'workflow', 'recovery'],
    summary: 'Automate multi-stage cart recovery with intelligent wait conditions, email discounts, and push reminders.',
    steps: [
      'Navigate to Journeys in the sidebar and click "Create Journey".',
      'Set the Trigger Node to Event: `cart_abandoned` (Value > $0).',
      'Add a Wait Condition Node: "Wait 1 hour".',
      'Add a Decision Check: "Has user completed order in last 1 hour?".',
      'If No: Send Email Step with dynamic cart items and a gentle reminder.',
      'Add second Wait Node: "Wait 24 hours".',
      'If still unpurchased: Trigger Web Push notification with 10% discount coupon.',
      'Connect Exit Node and click "Publish Journey".',
    ],
    relatedNavigation: { label: 'Open Journeys', path: '/journeys' },
    confidence: 'high',
  },
  {
    id: 'kb_audience_sql',
    title: 'Creating Advanced Audiences with SQL & Dynamic Attributes',
    category: 'audiences',
    tags: ['audience', 'segmentation', 'sql', 'query', 'filters', 'rfm'],
    summary: 'How to write high-performance audience queries combining demographic attributes and behavioral event streams.',
    steps: [
      'Navigate to Customers > Audiences.',
      'Click "+ Create Audience" and choose "SQL Advanced Mode".',
      'Select base schema (`customers`) and join with `events` or `orders`.',
      'Apply filtering conditions for recency, frequency, and monetary metrics.',
      'Click "Preview Live Count" to check unique recipient size.',
      'Enable "Auto-Refresh Schedule" (e.g. Hourly / Daily) for dynamic membership.',
      'Save audience and attach to campaigns or journeys.',
    ],
    codeSample: `SELECT 
  c.id, 
  c.email, 
  c.first_name, 
  COUNT(o.id) AS total_orders,
  SUM(o.total_amount) AS ltv
FROM customers c
INNER JOIN orders o ON o.customer_id = c.id
WHERE o.created_at >= NOW() - INTERVAL '60 days'
GROUP BY c.id
HAVING SUM(o.total_amount) > 150;`,
    relatedNavigation: { label: 'Open Audiences', path: '/customers/audiences' },
    confidence: 'high',
  },
  {
    id: 'kb_loyalty_offers',
    title: 'Configuring Loyalty Rewards, Offers & Decision Engine Rules',
    category: 'loyalty',
    tags: ['loyalty', 'offers', 'coupons', 'decision engine', 'points', 'tiers'],
    summary: 'Set up VIP tiers, earn/burn point rules, dynamic coupon codes, and Next-Best-Offer AI decisioning.',
    steps: [
      'Go to Loyalty & Decisioning in the left navigation.',
      'Under "Loyalty", set up Tier thresholds (Bronze, Silver, Gold, Platinum).',
      'Under "Offers", define promotional rewards and eligibility criteria.',
      'Under "Coupons", generate bulk unique codes or dynamic discount rules.',
      'Under "Decision Engine", configure arbitration rules for Next-Best-Action prioritization.',
    ],
    relatedNavigation: { label: 'Open Loyalty Decision Engine', path: '/loyalty/decision-engine' },
    confidence: 'high',
  },
  {
    id: 'kb_schemas_connectors',
    title: 'Data Schemas, Custom Attributes & External Connectors',
    category: 'schemas',
    tags: ['schema', 'connectors', 'etl', 'data jobs', 'attributes', 'json'],
    summary: 'Extend customer profile schemas with custom fields, ingest webhook streams, and connect Postgres/Snowflake sources.',
    steps: [
      'Navigate to Data Platform > Schemas.',
      'Click on `customers` or `events` schema to view field definitions.',
      'Click "+ Add Field" to declare new string, number, timestamp, or JSON attributes.',
      'Go to Data Platform > Connectors to configure third-party database syncs.',
      'Monitor ingestion throughput and run history in the Job Center.',
    ],
    relatedNavigation: { label: 'Open Schemas', path: '/data/schemas' },
    confidence: 'high',
  },
  {
    id: 'kb_channels_webpush',
    title: 'Web Push & Browser Notification Gateway Configuration',
    category: 'channels',
    tags: ['web push', 'vapid', 'service worker', 'fcm', 'notifications', 'channels'],
    summary: 'Set up VAPID credentials, embed the browser subscription prompt, and configure rich push media.',
    steps: [
      'Navigate to Settings > Channels > Web Push.',
      'Generate or import VAPID Public and Private Keys.',
      'Download `marbee-sw.js` and place it in the root of your web domain.',
      'Add the Marbee SDK snippet into your website `<head>` tag.',
      'Test permission prompt opt-in flow and send verification push.',
    ],
    relatedNavigation: { label: 'Open Channels Settings', path: '/settings/channels' },
    confidence: 'high',
  },
];

export type DiagnosticResult = {
  intent: 'troubleshooting' | 'how_to' | 'analytics' | 'campaign_builder' | 'sql_helper' | 'general_qa';
  confidence: 'high' | 'medium' | 'low';
  detectedError?: KnownError;
  matchingArticles: KnowledgeArticle[];
  characterMood: 'thinking' | 'explaining' | 'success' | 'confused' | 'excited' | 'concerned';
  suggestedFollowUps: string[];
};

export function analyzeUserQuery(query: string): DiagnosticResult {
  const q = query.toLowerCase();

  // 1. Check known errors
  for (const err of KNOWN_ERRORS) {
    if (err.pattern.test(query) || q.includes(err.code.toLowerCase())) {
      return {
        intent: 'troubleshooting',
        confidence: 'high',
        detectedError: err,
        matchingArticles: KNOWLEDGE_BASE.filter((k) => k.category === 'troubleshooting' || k.tags.includes('troubleshooting')),
        characterMood: 'concerned',
        suggestedFollowUps: [
          'How do I verify the fix in preview mode?',
          'Can you rewrite the targeting SQL query for me?',
          'How do I prevent duplicate records in the future?',
          'Escalate this issue to Marbee human support',
        ],
      };
    }
  }

  // 2. How-to / Guided Journey / Campaign Building
  if (q.includes('how to') || q.includes('how do i') || q.includes('steps to') || q.includes('create a') || q.includes('build a') || q.includes('setup') || q.includes('set up')) {
    if (q.includes('journey') || q.includes('workflow') || q.includes('cart') || q.includes('abandoned')) {
      return {
        intent: 'how_to',
        confidence: 'high',
        matchingArticles: KNOWLEDGE_BASE.filter((k) => k.id === 'kb_journey_cart'),
        characterMood: 'excited',
        suggestedFollowUps: [
          'How do I add a 24-hour wait condition?',
          'How do I attach a discount coupon to this journey?',
          'How do I test the abandoned cart trigger?',
          'Can you generate the complete journey flow diagram?',
        ],
      };
    }

    if (q.includes('campaign') || q.includes('blast') || q.includes('email') || q.includes('push')) {
      return {
        intent: 'campaign_builder',
        confidence: 'high',
        matchingArticles: KNOWLEDGE_BASE.filter((k) => k.id === 'kb_camp_create'),
        characterMood: 'explaining',
        suggestedFollowUps: [
          'What pre-flight validation checks should I run?',
          'How do I configure quiet hours delivery?',
          'How do I set up A/B testing copy?',
          'Show me best practices for high email deliverability',
        ],
      };
    }

    if (q.includes('audience') || q.includes('segment') || q.includes('sql') || q.includes('filter')) {
      return {
        intent: 'sql_helper',
        confidence: 'high',
        matchingArticles: KNOWLEDGE_BASE.filter((k) => k.id === 'kb_audience_sql'),
        characterMood: 'thinking',
        suggestedFollowUps: [
          'Generate a SQL query for high-value VIP customers',
          'How do I deduplicate customer join queries?',
          'How do dynamic auto-refresh audiences work?',
          'Show me sample RFM segmentation query',
        ],
      };
    }
  }

  // 3. Analytics / Insights Queries
  if (q.includes('performance') || q.includes('open rate') || q.includes('conversion') || q.includes('analytics') || q.includes('metrics') || q.includes('roi') || q.includes('stats')) {
    return {
      intent: 'analytics',
      confidence: 'high',
      matchingArticles: KNOWLEDGE_BASE.filter((k) => k.category === 'analytics' || k.category === 'campaigns'),
      characterMood: 'thinking',
      suggestedFollowUps: [
        'Which journeys generated the highest conversion rate this month?',
        'Compare email delivery vs Web Push engagement',
        'Why did conversion drop on returning customers?',
        'Generate executive weekly performance summary',
      ],
    };
  }

  // 4. Fallback General QA with keyword search
  const matches = KNOWLEDGE_BASE.filter((k) =>
    k.tags.some((t) => q.includes(t)) ||
    k.title.toLowerCase().includes(q) ||
    k.summary.toLowerCase().includes(q)
  );

  return {
    intent: 'general_qa',
    confidence: matches.length > 0 ? 'high' : 'medium',
    matchingArticles: matches.length > 0 ? matches : KNOWLEDGE_BASE.slice(0, 3),
    characterMood: 'explaining',
    suggestedFollowUps: [
      'How do I create an abandoned-cart journey?',
      'Why is my campaign failing with duplicate key error?',
      'How do I set up Web Push browser notifications?',
      'Show me available CRM integrations and APIs',
    ],
  };
}
