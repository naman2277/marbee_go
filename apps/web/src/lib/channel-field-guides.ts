import type { ChannelType } from './channel-registry';
import { getProviderDefinition } from './channel-registry';

export type FieldGuide = {
  title: string;
  summary: string;
  steps?: string[];
  example?: string;
  link?: { label: string; url: string };
};

export type ProviderSetupGuide = {
  overview: string;
  prerequisites: string[];
  steps: Array<{ title: string; body: string; fieldKeys?: string[] }>;
  tips?: string[];
};

const SHARED_HTTP_GUIDES: Record<string, FieldGuide> = {
  endpoint_url: {
    title: 'Endpoint URL',
    summary: 'The HTTPS URL Marbee calls when sending a message through your custom API.',
    steps: [
      'Use a production-ready URL from your provider or middleware.',
      'Must accept JSON unless you override headers below.',
      'Example: https://api.yourcompany.com/v1/messages/send',
    ],
  },
  http_method: {
    title: 'HTTP method',
    summary: 'How Marbee calls your endpoint. Most providers use POST.',
    steps: ['POST — create/send a message (most common)', 'PUT/PATCH — only if your API requires it'],
  },
  auth_type: {
    title: 'Authentication',
    summary: 'How Marbee authenticates to your API.',
    steps: [
      'None — public endpoint (not recommended for production)',
      'Bearer — Authorization: Bearer <token>',
      'Basic — username + password encoded in Authorization header',
      'API key header — custom header name + key value',
    ],
  },
  auth_header_name: {
    title: 'API key header name',
    summary: 'Header name your API expects for the key (when using API key header auth).',
    example: 'X-API-Key',
    steps: ['Check your provider docs for the exact header name.', 'Common values: X-API-Key, api-key, Authorization'],
  },
  api_key: {
    title: 'API key / token',
    summary: 'Secret credential Marbee sends with each request.',
    steps: ['Generate from your provider dashboard.', 'Never share or commit this value.', 'Rotate if exposed.'],
  },
  body_template: {
    title: 'Request body template',
    summary: 'JSON body Marbee sends. Use placeholders for dynamic values.',
    steps: [
      '{{recipient}} — email address or phone number',
      '{{subject}} — email subject line',
      '{{body}} — message content',
      '{{channel}} — email, sms, whatsapp, etc.',
      '{{tenant_id}} — your Marbee tenant ID',
    ],
    example: '{"to":"{{recipient}}","text":"{{body}}"}',
  },
  headers_json: {
    title: 'Custom headers',
    summary: 'Optional JSON object of extra HTTP headers.',
    example: '{"Content-Type":"application/json","X-Custom":"value"}',
  },
};

function g(
  title: string,
  summary: string,
  steps?: string[],
  example?: string,
  link?: { label: string; url: string },
): FieldGuide {
  return { title, summary, steps, example, link };
}

const GUIDES: Partial<Record<ChannelType, Partial<Record<string, Record<string, FieldGuide>>>>> = {
  email: {
    sendgrid: {
      api_key: g(
        'SendGrid API key',
        'Full-access or restricted key with Mail Send permission.',
        [
          'Log in to SendGrid → Settings → API Keys.',
          'Create API Key → choose Restricted Access.',
          'Enable Mail Send → Full Access (or minimum required).',
          'Copy the key immediately — it is shown only once.',
        ],
        'SG.xxxxxxxxxxxx',
        { label: 'SendGrid API keys', url: 'https://app.sendgrid.com/settings/api_keys' },
      ),
      from_email: g(
        'Default from email',
        'Sender address shown to recipients. Must be verified in SendGrid.',
        [
          'SendGrid → Settings → Sender Authentication.',
          'Verify a single sender or authenticate your domain.',
          'Use that verified address here (e.g. noreply@yourdomain.com).',
        ],
      ),
      from_name: g('From name', 'Display name recipients see alongside the email address.', undefined, 'Your Brand'),
    },
    ses: {
      access_key_id: g(
        'AWS access key ID',
        'IAM user access key with SES send permissions.',
        [
          'AWS Console → IAM → Users → Create user.',
          'Attach AmazonSESFullAccess or a custom SES send policy.',
          'Security credentials → Create access key.',
        ],
      ),
      secret_access_key: g(
        'Secret access key',
        'Paired secret for the access key above. Shown once at creation.',
        ['Copy when AWS displays it.', 'Store securely — cannot be retrieved later.'],
      ),
      region: g(
        'AWS region',
        'Region where SES is enabled for your account.',
        ['Common: us-east-1, eu-west-1', 'Must match where you verified identities.'],
        'us-east-1',
      ),
      from_email: g(
        'Verified from email',
        'Email address or domain verified in Amazon SES.',
        ['SES Console → Verified identities → Create identity.', 'Complete DNS/email verification before sending.'],
      ),
    },
    smtp: {
      host: g('SMTP host', 'Hostname of your mail server.', undefined, 'smtp.gmail.com'),
      port: g(
        'SMTP port',
        'Port for SMTP connection.',
        ['587 — STARTTLS (most common)', '465 — SSL/TLS', '25 — often blocked by cloud providers'],
        '587',
      ),
      username: g('SMTP username', 'Login username, often your full email address.'),
      password: g('SMTP password', 'SMTP password or app-specific password (e.g. Gmail app password).'),
      from_email: g('From email', 'Address used in the From header. Must be allowed by your SMTP server.'),
    },
    mailgun: {
      api_key: g(
        'Mailgun API key',
        'Private API key from Mailgun dashboard.',
        ['Mailgun → Settings → API Keys → Private API key.'],
        'key-xxxxxxxx',
        { label: 'Mailgun API keys', url: 'https://app.mailgun.com/settings/api_security' },
      ),
      domain: g(
        'Sending domain',
        'Verified Mailgun domain for outbound mail.',
        ['Mailgun → Sending → Domains → Add domain.', 'Complete DNS records, then use domain here.'],
        'mg.yourdomain.com',
      ),
    },
    mailjet: {
      api_key: g(
        'Mailjet API key',
        'Primary API key from your Mailjet account.',
        [
          'Log in to Mailjet → Account Settings → REST API.',
          'Open API Key Management (Master key).',
          'Copy the Primary API Key.',
        ],
        '3a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c',
        { label: 'Mailjet API Keys', url: 'https://app.mailjet.com/account/apikeys' },
      ),
      secret_key: g(
        'Mailjet Secret key',
        'Secret key paired with your primary API key for authentication.',
        [
          'In Mailjet API Key Management, reveal your Secret Key.',
          'Copy and paste it securely into this field.',
        ],
        '8c9d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
        { label: 'Mailjet API Keys', url: 'https://app.mailjet.com/account/apikeys' },
      ),
      from_email: g(
        'Verified Sender Email',
        'Email address or domain verified in your Mailjet account.',
        [
          'In Mailjet, navigate to Senders & Domains.',
          'Add and verify your sender address or domain with SPF & DKIM DNS records.',
          'Use that verified address here (e.g. noreply@yourdomain.com).',
        ],
        'noreply@yourdomain.com',
        { label: 'Mailjet Senders & Domains', url: 'https://app.mailjet.com/account/sender' },
      ),
      from_name: g(
        'Sender Name',
        'Friendly display name recipients see in their inbox.',
        undefined,
        'Your Brand',
      ),
      reply_to: g(
        'Reply-To Email',
        'Optional reply-to address where customer replies will be sent.',
        undefined,
        'support@yourdomain.com',
      ),
      sandbox_mode: g(
        'Sandbox Mode',
        'Validate API calls without actually delivering emails to real recipients.',
        ['Off — Live sending (production)', 'On — Mailjet validates payload without delivery (testing)'],
      ),
      custom_campaign: g(
        'Custom Campaign Tag',
        'Optional campaign name or tag for Mailjet delivery tracking & stats.',
        undefined,
        'Marbee-Outbound',
      ),
    },
    resend: {
      api_key: g(
        'Resend API Key',
        'Secret API Key starting with re_ from your Resend dashboard.',
        ['Go to resend.com/api-keys.', 'Click "Create API Key" with "Full access" or "Sending access".', 'Copy key (re_...)'],
        're_123456789_abcdefg',
        { label: 'Resend API Keys', url: 'https://resend.com/api-keys' },
      ),
      from_email: g(
        'Verified Sender Email',
        'Verified domain email or onboarding@resend.dev for testing.',
        ['resend.com/domains → Add Domain & verify DNS records.', 'For immediate test sends without domain, you can use onboarding@resend.dev.'],
        'onboarding@resend.dev',
        { label: 'Resend Domains', url: 'https://resend.com/domains' },
      ),
      from_name: g(
        'Sender Display Name',
        'Friendly display name shown in customer email clients.',
        undefined,
        'Acme Team',
      ),
      reply_to: g(
        'Reply-To Email',
        'Optional reply-to inbox for inbound responses.',
        undefined,
        'support@yourdomain.com',
      ),
      tags: g(
        'Default Campaign Tag',
        'Optional categorization tag for batch analytics in Resend.',
        undefined,
        'newsletter',
      ),
    },
    http: SHARED_HTTP_GUIDES,
  },
  sms: {
    twilio: {
      account_sid: g(
        'Account SID',
        'Unique identifier for your Twilio account.',
        ['Twilio Console → Account Info on dashboard.', 'Starts with AC…'],
        'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        { label: 'Twilio Console', url: 'https://console.twilio.com/' },
      ),
      auth_token: g(
        'Auth token',
        'Secret used with Account SID to authenticate API calls.',
        ['Twilio Console → Account Info → Auth Token.', 'Click to reveal and copy.'],
      ),
      from_number: g(
        'From number',
        'Twilio phone number or approved sender ID.',
        ['Phone Numbers → Manage → Buy a number.', 'Use E.164 format: +15551234567'],
        '+15551234567',
      ),
    },
    gupshup: {
      api_key: g('Gupshup API key', 'API key from Gupshup developer dashboard.', ['Gupshup.io → API → copy your key.']),
      source: g('Source / sender ID', 'Approved sender ID or short code for your region.'),
    },
    infobip: {
      base_url: g('Base URL', 'Infobip API base URL for your account region.', undefined, 'https://api.infobip.com'),
      api_key: g('Infobip API key', 'API key from Infobip portal → Developers → API keys.'),
      from: g('From', 'Sender name or number approved in Infobip.'),
    },
    http: SHARED_HTTP_GUIDES,
  },
  whatsapp: {
    meta: {
      access_token: g(
        'Permanent access token',
        'Long-lived token for WhatsApp Cloud API.',
        [
          'Meta Business Suite → WhatsApp → API Setup.',
          'Or Meta for Developers → your app → WhatsApp → API Setup.',
          'Generate permanent token with whatsapp_business_messaging permission.',
        ],
        undefined,
        { label: 'Meta Developers', url: 'https://developers.facebook.com/apps/' },
      ),
      phone_number_id: g(
        'Phone number ID',
        'ID of your WhatsApp Business phone number (not the phone number itself).',
        ['WhatsApp → API Setup → Phone number ID.', 'Numeric ID shown in the dashboard.'],
      ),
      business_account_id: g(
        'WhatsApp Business Account ID',
        'WABA ID linking your business to WhatsApp.',
        ['Found in Business Settings → WhatsApp Accounts.'],
      ),
    },
    twilio_whatsapp: {
      account_sid: g('Account SID', 'Same as Twilio SMS — from Twilio Console dashboard.', undefined, 'ACxxxxxxxx'),
      auth_token: g('Auth token', 'Twilio Auth Token from Account Info.'),
      from_whatsapp: g(
        'WhatsApp sender',
        'Twilio WhatsApp-enabled sender address.',
        ['Format: whatsapp:+14155238886', 'Use Twilio Sandbox number for testing.'],
        'whatsapp:+14155238886',
      ),
    },
    http: SHARED_HTTP_GUIDES,
  },
  web_push: {
    firebase: {
      sender_id: g(
        'Sender ID',
        'Firebase Cloud Messaging sender ID (numeric).',
        [
          'Firebase Console → Project Settings → Cloud Messaging.',
          'Under Project credentials → Sender ID.',
          'NOT the legacy server key.',
        ],
        '489262580102',
      ),
      project_id: g(
        'Project ID',
        'Firebase project identifier.',
        ['Firebase Console → Project Settings → General → Project ID.'],
        'your-project-id',
      ),
      api_key: g(
        'Web API key',
        'Browser API key for Firebase web app config.',
        ['Project Settings → General → Your apps → Web app → apiKey.'],
        'AIzaSy...',
      ),
      app_id: g(
        'App ID',
        'Firebase web app ID.',
        ['Project Settings → General → Your apps → App ID.'],
        '1:489262580102:web:abc123',
      ),
      vapid_public_key: g(
        'VAPID public key',
        'Web push key pair public key for browser subscriptions.',
        [
          'Project Settings → Cloud Messaging → Web configuration.',
          'Key pair → copy Public key.',
          'Do not use the legacy server key here.',
        ],
      ),
      service_account_json: g(
        'Service account JSON',
        'Private key file for FCM HTTP v1 API (server-side sending).',
        [
          'Project Settings → Service accounts.',
          'Generate new private key → download JSON.',
          'Paste entire JSON contents here.',
          'Project ID inside JSON must match Project ID field above.',
        ],
        '{"type":"service_account","project_id":"..."}',
        { label: 'Firebase Console', url: 'https://console.firebase.google.com/' },
      ),
    },
    onesignal: {
      app_id: g('OneSignal App ID', 'From OneSignal dashboard → Settings → Keys & IDs.'),
      rest_api_key: g('REST API key', 'OneSignal REST API Key — used for server sends.'),
    },
    http: SHARED_HTTP_GUIDES,
  },
  rcs: {
    google_rcs: {
      agent_id: g('Agent ID', 'RCS Business Messaging agent ID from Google Business Communications.'),
      service_account_json: g(
        'Service account JSON',
        'Google Cloud service account with RCS API access.',
        ['Google Cloud Console → IAM → Service Accounts → Create key (JSON).'],
      ),
    },
    http: SHARED_HTTP_GUIDES,
  },
  api: {
    http: SHARED_HTTP_GUIDES,
  },
};

export function getFieldGuide(
  channel: ChannelType,
  providerType: string,
  fieldKey: string,
): FieldGuide {
  const specific = GUIDES[channel]?.[providerType]?.[fieldKey];
  if (specific) return specific;

  const shared = SHARED_HTTP_GUIDES[fieldKey];
  if (shared) return shared;

  const fieldDef = getProviderDefinition(channel, providerType)?.fields.find((f) => f.key === fieldKey);
  return {
    title: fieldDef?.label ?? fieldKey,
    summary: fieldDef?.help ?? `Enter your ${fieldDef?.label?.toLowerCase() ?? fieldKey} from your provider dashboard.`,
    steps: fieldDef?.required
      ? ['This field is required to connect your account.', 'Check your provider documentation if unsure where to find it.']
      : undefined,
  };
}

export const PROVIDER_SETUP_GUIDES: Partial<Record<ChannelType, Partial<Record<string, ProviderSetupGuide>>>> = {
  email: {
    sendgrid: {
      overview: 'Connect SendGrid so Marbee sends email through your verified domain and API key.',
      prerequisites: ['SendGrid account', 'Verified sender or domain', 'API key with Mail Send permission'],
      steps: [
        {
          title: 'Verify your sender',
          body: 'In SendGrid, go to Settings → Sender Authentication and verify a single sender or authenticate your domain with DNS records.',
          fieldKeys: ['from_email'],
        },
        {
          title: 'Create an API key',
          body: 'Settings → API Keys → Create API Key. Use Restricted Access and enable Mail Send. Copy the key when shown.',
          fieldKeys: ['api_key'],
        },
        {
          title: 'Enter defaults',
          body: 'Set your default from email and optional from name. These are used when journeys do not override them.',
          fieldKeys: ['from_email', 'from_name'],
        },
      ],
      tips: ['Use domain authentication for better deliverability.', 'Enable sandbox mode while testing.'],
    },
    ses: {
      overview: 'Use Amazon SES with IAM credentials for scalable transactional email.',
      prerequisites: ['AWS account', 'SES identity verified', 'IAM user with SES send access'],
      steps: [
        { title: 'Verify identity', body: 'In SES, verify your sending email or domain.', fieldKeys: ['from_email'] },
        {
          title: 'Create IAM credentials',
          body: 'Create an IAM user with SES permissions and generate access keys.',
          fieldKeys: ['access_key_id', 'secret_access_key'],
        },
        { title: 'Set region', body: 'Use the AWS region where SES is configured.', fieldKeys: ['region'] },
      ],
    },
    mailjet: {
      overview:
        'Connect Mailjet Send API v3.1 for high-deliverability transactional and marketing emails.',
      prerequisites: [
        'A Mailjet account (Free or Premium)',
        'Primary API Key and Secret Key from Mailjet dashboard',
        'At least one verified sender email or domain in Mailjet',
      ],
      steps: [
        {
          title: '1. Obtain API & Secret Keys',
          body: 'Go to Mailjet Dashboard → Account Settings → REST API → API Key Management. Copy your Primary API Key and Secret Key.',
          fieldKeys: ['api_key', 'secret_key'],
        },
        {
          title: '2. Verify Sender Email or Domain',
          body: 'Go to Senders & Domains in Mailjet. Add your sending domain or email address and complete SPF/DKIM DNS verification.',
          fieldKeys: ['from_email', 'from_name'],
        },
        {
          title: '3. Save & Set as Default Provider',
          body: 'Save the configuration and enable as default email provider in this environment to send campaigns and journey automations.',
        },
      ],
      tips: [
        'Use Sandbox mode while testing to verify API payloads without delivering real emails.',
        'Ensure SPF and DKIM DNS records are configured in Mailjet for optimal deliverability.',
      ],
    },
    resend: {
      overview:
        'Connect Resend for high-speed developer email delivery with native Batch Send API (up to 100 emails/request).',
      prerequisites: [
        'A Resend account at resend.com',
        'API Key with Full Access or Sending Access',
        'Verified sending domain (or onboarding@resend.dev for test sends)',
      ],
      steps: [
        {
          title: '1. Create a Resend API Key',
          body: 'Go to resend.com/api-keys. Click "Create API Key" with Sending permissions. Copy your key starting with re_.',
          fieldKeys: ['api_key'],
        },
        {
          title: '2. Configure Sender Address',
          body: 'Add your domain under resend.com/domains and configure DNS records. For testing, you can use onboarding@resend.dev.',
          fieldKeys: ['from_email', 'from_name'],
        },
        {
          title: '3. Set as Default & Dispatch Bulk Campaigns',
          body: 'Save the provider and test live dispatches with Marbee automated batching.',
        },
      ],
      tips: [
        'Resend supports sending up to 100 emails in a single batch request via the Batch API.',
        'Deliverability is best when sending from an authenticated custom domain with DKIM/SPF configured.',
      ],
    },
  },
  web_push: {
    firebase: {
      overview: 'Set up Firebase Cloud Messaging for browser push — client config plus server credentials.',
      prerequisites: ['Firebase project', 'Web app registered in Firebase', 'FCM API enabled in Google Cloud'],
      steps: [
        {
          title: 'Register a web app',
          body: 'Firebase Console → Project Settings → General → Add app → Web. Copy Sender ID, Project ID, API key, and App ID.',
          fieldKeys: ['sender_id', 'project_id', 'api_key', 'app_id'],
        },
        {
          title: 'Get VAPID key',
          body: 'Project Settings → Cloud Messaging → Web configuration → Key pair. Copy the public key.',
          fieldKeys: ['vapid_public_key'],
        },
        {
          title: 'Download service account',
          body: 'Project Settings → Service accounts → Generate new private key. Paste the full JSON for server sends.',
          fieldKeys: ['service_account_json'],
        },
      ],
      tips: [
        'Enable Firebase Cloud Messaging API in Google Cloud Console.',
        'Project ID in JSON must match the Project ID field.',
      ],
    },
  },
  sms: {
    twilio: {
      overview: 'Connect Twilio Programmable SMS with your account credentials and sending number.',
      prerequisites: ['Twilio account', 'Purchased phone number or messaging service'],
      steps: [
        {
          title: 'Copy account credentials',
          body: 'From Twilio Console dashboard → Account Info.',
          fieldKeys: ['account_sid', 'auth_token'],
        },
        {
          title: 'Configure sender',
          body: 'Buy a phone number or use a Messaging Service SID.',
          fieldKeys: ['from_number', 'messaging_service_sid'],
        },
      ],
    },
  },
  whatsapp: {
    meta: {
      overview: 'Connect Meta WhatsApp Cloud API for business messaging.',
      prerequisites: ['Meta Business account', 'WhatsApp Business Account', 'Verified phone number'],
      steps: [
        { title: 'Create Meta app', body: 'developers.facebook.com → Create app → Add WhatsApp product.', fieldKeys: [] },
        {
          title: 'Get tokens and IDs',
          body: 'API Setup page shows Phone number ID and token generation.',
          fieldKeys: ['access_token', 'phone_number_id', 'business_account_id'],
        },
      ],
    },
  },
};

export function getProviderSetupGuide(channel: ChannelType, providerType: string): ProviderSetupGuide {
  const specific = PROVIDER_SETUP_GUIDES[channel]?.[providerType];
  if (specific) return specific;

  const def = getProviderDefinition(channel, providerType);
  const requiredFields = def?.fields.filter((f) => f.required).map((f) => f.key) ?? [];

  return {
    overview: `Configure your ${providerType.replace(/_/g, ' ')} credentials. Required fields are marked with * — hover the (i) icon on each field for step-by-step help.`,
    prerequisites: ['Active account with your provider', 'API credentials from provider dashboard'],
    steps: [
      {
        title: 'Gather credentials',
        body: 'Open your provider dashboard and locate the API keys, tokens, or SMTP settings needed for this channel.',
        fieldKeys: requiredFields.slice(0, 4),
      },
      {
        title: 'Fill required fields',
        body: 'Enter each required value below. Use the (i) icon next to any field if you are unsure where to find it.',
        fieldKeys: requiredFields,
      },
      {
        title: 'Save and test',
        body: 'Click Save provider. For web push, use Test push on this browser after saving.',
      },
    ],
    tips: ['Keep credentials secret.', 'Use separate accounts for dev/stage/prod when possible.'],
  };
}
