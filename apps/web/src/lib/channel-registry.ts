export type ChannelType = 'email' | 'sms' | 'whatsapp' | 'web_push' | 'rcs' | 'api' | 'social';

export type ProviderFieldType = 'text' | 'password' | 'textarea' | 'url' | 'select' | 'number' | 'json';

export type ProviderFieldDef = {
  key: string;
  label: string;
  type: ProviderFieldType;
  placeholder?: string;
  help?: string;
  required?: boolean;
  secret?: boolean;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
};

export type ProviderDefinition = {
  id: string;
  label: string;
  description: string;
  docsUrl?: string;
  fields: ProviderFieldDef[];
};

export type ChannelDefinition = {
  id: ChannelType;
  label: string;
  description: string;
  providers: ProviderDefinition[];
};

const HTTP_ADAPTER_FIELDS: ProviderFieldDef[] = [
  { key: 'endpoint_url', label: 'Endpoint URL', type: 'url', required: true, placeholder: 'https://api.provider.com/v1/send' },
  {
    key: 'http_method',
    label: 'HTTP method',
    type: 'select',
    required: true,
    options: [
      { value: 'POST', label: 'POST' },
      { value: 'PUT', label: 'PUT' },
      { value: 'PATCH', label: 'PATCH' },
    ],
  },
  {
    key: 'auth_type',
    label: 'Authentication',
    type: 'select',
    required: true,
    options: [
      { value: 'none', label: 'None' },
      { value: 'bearer', label: 'Bearer token' },
      { value: 'basic', label: 'Basic auth' },
      { value: 'api_key_header', label: 'API key header' },
    ],
  },
  { key: 'auth_header_name', label: 'API key header name', type: 'text', placeholder: 'X-API-Key' },
  { key: 'api_key', label: 'API key / token', type: 'password', secret: true },
  { key: 'username', label: 'Username', type: 'text', secret: true },
  { key: 'password', label: 'Password', type: 'password', secret: true },
  {
    key: 'headers_json',
    label: 'Custom headers (JSON)',
    type: 'json',
    placeholder: '{"Content-Type":"application/json"}',
    rows: 3,
  },
  {
    key: 'body_template',
    label: 'Request body template (JSON)',
    type: 'json',
    required: true,
    help: 'Use {{recipient}}, {{subject}}, {{body}}, {{channel}}, {{tenant_id}}',
    rows: 8,
    placeholder: '{"to":"{{recipient}}","message":"{{body}}"}',
  },
  { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', placeholder: '30000' },
];

export const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
  {
    id: 'email',
    label: 'Email',
    description: 'Transactional and marketing email via your ESP.',
    providers: [
      {
        id: 'sendgrid',
        label: 'SendGrid',
        description: 'SendGrid Web API v3',
        docsUrl: 'https://docs.sendgrid.com/api-reference/mail-send/mail-send',
        fields: [
          { key: 'api_key', label: 'API key', type: 'password', required: true, secret: true },
          { key: 'from_email', label: 'Default from email', type: 'text', required: true, placeholder: 'noreply@yourdomain.com' },
          { key: 'from_name', label: 'Default from name', type: 'text', placeholder: 'Your Brand' },
          { key: 'reply_to', label: 'Reply-to', type: 'text', placeholder: 'support@yourdomain.com' },
          { key: 'ip_pool', label: 'IP pool name', type: 'text' },
          { key: 'list_unsubscribe_url', label: 'List-unsubscribe URL (promotional)', type: 'url', placeholder: 'https://yourdomain.com/unsubscribe' },
          { key: 'sandbox_mode', label: 'Sandbox mode', type: 'select', options: [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }] },
        ],
      },
      {
        id: 'ses',
        label: 'Amazon SES',
        description: 'AWS Simple Email Service',
        docsUrl: 'https://docs.aws.amazon.com/ses/',
        fields: [
          { key: 'access_key_id', label: 'Access key ID', type: 'text', required: true, secret: true },
          { key: 'secret_access_key', label: 'Secret access key', type: 'password', required: true, secret: true },
          { key: 'region', label: 'AWS region', type: 'text', required: true, placeholder: 'us-east-1' },
          { key: 'from_email', label: 'Verified from email', type: 'text', required: true },
          { key: 'configuration_set', label: 'Configuration set', type: 'text' },
        ],
      },
      {
        id: 'smtp',
        label: 'SMTP',
        description: 'Any SMTP-compatible mail server',
        fields: [
          { key: 'host', label: 'SMTP host', type: 'text', required: true, placeholder: 'smtp.example.com' },
          { key: 'port', label: 'Port', type: 'number', required: true, placeholder: '587' },
          { key: 'username', label: 'Username', type: 'text', secret: true },
          { key: 'password', label: 'Password', type: 'password', secret: true },
          {
            key: 'encryption',
            label: 'Encryption',
            type: 'select',
            options: [
              { value: 'tls', label: 'STARTTLS' },
              { value: 'ssl', label: 'SSL/TLS' },
              { value: 'none', label: 'None' },
            ],
          },
          { key: 'from_email', label: 'From email', type: 'text', required: true },
          { key: 'from_name', label: 'From name', type: 'text' },
        ],
      },
      {
        id: 'mailgun',
        label: 'Mailgun',
        description: 'Mailgun HTTP API',
        fields: [
          { key: 'api_key', label: 'API key', type: 'password', required: true, secret: true },
          { key: 'domain', label: 'Sending domain', type: 'text', required: true, placeholder: 'mg.yourdomain.com' },
          { key: 'region', label: 'Region', type: 'select', options: [{ value: 'us', label: 'US' }, { value: 'eu', label: 'EU' }] },
          { key: 'from_email', label: 'Default from', type: 'text' },
        ],
      },
      {
        id: 'mailjet',
        label: 'Mailjet',
        description: 'Mailjet Send API v3.1 for high-deliverability transactional & marketing emails',
        docsUrl: 'https://dev.mailjet.com/email/guides/send-api-v31/',
        fields: [
          { key: 'api_key', label: 'Mailjet API Key (Primary)', type: 'text', required: true, secret: true, placeholder: 'e.g. 3a4f5b...' },
          { key: 'secret_key', label: 'Mailjet Secret Key', type: 'password', required: true, secret: true, placeholder: 'e.g. 8c9d1e...' },
          { key: 'from_email', label: 'Verified Sender Email', type: 'text', required: true, placeholder: 'noreply@yourdomain.com' },
          { key: 'from_name', label: 'Sender Name', type: 'text', placeholder: 'Your Brand' },
          { key: 'reply_to', label: 'Reply-To Email (optional)', type: 'text', placeholder: 'support@yourdomain.com' },
          {
            key: 'sandbox_mode',
            label: 'Sandbox Mode',
            type: 'select',
            options: [
              { value: 'false', label: 'Off (Live Delivery)' },
              { value: 'true', label: 'On (Validate payload without sending)' },
            ],
          },
          { key: 'custom_campaign', label: 'Custom Campaign Tag (optional)', type: 'text', placeholder: 'e.g. Marbee-Campaign' },
        ],
      },
      {
        id: 'resend',
        label: 'Resend',
        description: 'Resend API for modern developers with high-throughput Batch Send endpoint (up to 100 emails/request)',
        docsUrl: 'https://resend.com/docs/api-reference/emails/send-batch-emails',
        fields: [
          { key: 'api_key', label: 'Resend API Key', type: 'password', required: true, secret: true, placeholder: 're_123456789...' },
          { key: 'from_email', label: 'Verified Sender Email', type: 'text', required: true, placeholder: 'onboarding@resend.dev or hello@yourdomain.com' },
          { key: 'from_name', label: 'Sender Display Name', type: 'text', placeholder: 'Acme Team' },
          { key: 'reply_to', label: 'Reply-To Email (optional)', type: 'text', placeholder: 'support@yourdomain.com' },
          { key: 'tags', label: 'Default Campaign Tag (optional)', type: 'text', placeholder: 'e.g. bulk-broadcast' },
        ],
      },
      { id: 'http', label: 'Custom HTTP', description: 'Your own email API endpoint', fields: HTTP_ADAPTER_FIELDS },
    ],
  },
  {
    id: 'sms',
    label: 'SMS',
    description: 'Text messaging via your SMS aggregator.',
    providers: [
      {
        id: 'twilio',
        label: 'Twilio',
        description: 'Twilio Programmable SMS',
        docsUrl: 'https://www.twilio.com/docs/sms',
        fields: [
          { key: 'account_sid', label: 'Account SID', type: 'text', required: true, secret: true },
          { key: 'auth_token', label: 'Auth token', type: 'password', required: true, secret: true },
          { key: 'from_number', label: 'From number / sender ID', type: 'text', required: true, placeholder: '+15551234567' },
          { key: 'messaging_service_sid', label: 'Messaging service SID', type: 'text' },
          { key: 'dlt_entity_id', label: 'DLT entity ID (India)', type: 'text', placeholder: '1701xxxxxx' },
          { key: 'dlt_template_id', label: 'Default DLT template ID (India)', type: 'text' },
        ],
      },
      {
        id: 'gupshup',
        label: 'Gupshup',
        description: 'Gupshup SMS API',
        fields: [
          { key: 'api_key', label: 'API key', type: 'password', required: true, secret: true },
          { key: 'source', label: 'Source / sender ID', type: 'text', required: true },
          { key: 'channel', label: 'Channel type', type: 'select', options: [{ value: 'sms', label: 'SMS' }, { value: 'whatsapp', label: 'WhatsApp' }] },
          { key: 'dlt_entity_id', label: 'DLT entity ID (India)', type: 'text' },
          { key: 'dlt_template_id', label: 'Default DLT template ID (India)', type: 'text' },
        ],
      },
      {
        id: 'infobip',
        label: 'Infobip',
        description: 'Infobip SMS API',
        fields: [
          { key: 'base_url', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.infobip.com' },
          { key: 'api_key', label: 'API key', type: 'password', required: true, secret: true },
          { key: 'from', label: 'From', type: 'text', required: true },
          { key: 'dlt_entity_id', label: 'DLT entity ID (India)', type: 'text' },
          { key: 'dlt_template_id', label: 'Default DLT template ID (India)', type: 'text' },
        ],
      },
      { id: 'http', label: 'Custom HTTP', description: 'Your own SMS API', fields: HTTP_ADAPTER_FIELDS },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'WhatsApp Business messaging.',
    providers: [
      {
        id: 'meta',
        label: 'Meta Cloud API',
        description: 'WhatsApp Business Platform',
        docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
        fields: [
          { key: 'access_token', label: 'Permanent access token', type: 'password', required: true, secret: true },
          { key: 'phone_number_id', label: 'Phone number ID', type: 'text', required: true },
          { key: 'business_account_id', label: 'WhatsApp Business Account ID', type: 'text' },
          { key: 'api_version', label: 'Graph API version', type: 'text', placeholder: 'v21.0' },
          {
            key: 'message_category',
            label: 'Default template category',
            type: 'select',
            options: [
              { value: 'UTILITY', label: 'Utility (transactional)' },
              { value: 'AUTHENTICATION', label: 'Authentication (OTP)' },
              { value: 'MARKETING', label: 'Marketing (promotional)' },
            ],
          },
          { key: 'template_namespace', label: 'Template namespace', type: 'text' },
          { key: 'webhook_verify_token', label: 'Webhook verify token', type: 'password', secret: true },
        ],
      },
      {
        id: 'twilio_whatsapp',
        label: 'Twilio WhatsApp',
        description: 'Twilio WhatsApp sender',
        fields: [
          { key: 'account_sid', label: 'Account SID', type: 'text', required: true, secret: true },
          { key: 'auth_token', label: 'Auth token', type: 'password', required: true, secret: true },
          { key: 'from_whatsapp', label: 'WhatsApp sender', type: 'text', required: true, placeholder: 'whatsapp:+14155238886' },
        ],
      },
      { id: 'http', label: 'Custom HTTP', description: 'Your own WhatsApp API', fields: HTTP_ADAPTER_FIELDS },
    ],
  },
  {
    id: 'web_push',
    label: 'Web Push',
    description: 'Browser push notifications.',
    providers: [
      {
        id: 'firebase',
        label: 'Firebase FCM',
        description: 'Google Firebase Cloud Messaging HTTP v1',
        docsUrl: 'https://firebase.google.com/docs/cloud-messaging',
        fields: [
          { key: 'sender_id', label: 'Sender ID', type: 'text', required: true },
          { key: 'project_id', label: 'Project ID', type: 'text', required: true },
          { key: 'api_key', label: 'Web API key', type: 'text', required: true, help: 'Public browser key from Firebase web app config' },
          { key: 'app_id', label: 'App ID', type: 'text', required: true },
          { key: 'auth_domain', label: 'Auth domain', type: 'text', placeholder: 'project.firebaseapp.com' },
          { key: 'vapid_public_key', label: 'VAPID public key', type: 'text', required: true },
          {
            key: 'service_account_json',
            label: 'Service account JSON',
            type: 'json',
            required: true,
            secret: true,
            rows: 6,
            help: 'Firebase → Project settings → Service accounts → Generate key',
          },
        ],
      },
      {
        id: 'onesignal',
        label: 'OneSignal',
        description: 'OneSignal REST API (BYOP)',
        fields: [
          { key: 'app_id', label: 'App ID', type: 'text', required: true },
          { key: 'rest_api_key', label: 'REST API key', type: 'password', required: true, secret: true },
          { key: 'safari_web_id', label: 'Safari web ID', type: 'text' },
        ],
      },
      { id: 'http', label: 'Custom HTTP', description: 'Your own push API', fields: HTTP_ADAPTER_FIELDS },
    ],
  },
  {
    id: 'rcs',
    label: 'RCS',
    description: 'Rich Communication Services.',
    providers: [
      {
        id: 'google_rcs',
        label: 'Google RCS Business Messaging',
        description: 'Google RCS API',
        fields: [
          { key: 'agent_id', label: 'Agent ID', type: 'text', required: true },
          { key: 'service_account_json', label: 'Service account JSON', type: 'json', required: true, secret: true, rows: 6 },
          { key: 'brand_id', label: 'Brand ID', type: 'text' },
          { key: 'route_id', label: 'Route / campaign ID', type: 'text' },
        ],
      },
      { id: 'http', label: 'Custom HTTP', description: 'Your own RCS API', fields: HTTP_ADAPTER_FIELDS },
    ],
  },
  {
    id: 'api',
    label: 'Custom API',
    description: 'Generic outbound webhook for any channel logic.',
    providers: [
      { id: 'http', label: 'HTTP webhook', description: 'POST payloads to your endpoint', fields: HTTP_ADAPTER_FIELDS },
    ],
  },
  {
    id: 'social',
    label: 'Social Media',
    description: 'Connect LinkedIn, Instagram, Facebook, and X (Twitter) for omni-channel campaigns and post broadcasts.',
    providers: [],
  },
];

export function getChannelDefinition(channel: ChannelType): ChannelDefinition | undefined {
  return CHANNEL_DEFINITIONS.find((c) => c.id === channel);
}

export function getProviderDefinition(channel: ChannelType, providerType: string): ProviderDefinition | undefined {
  return getChannelDefinition(channel)?.providers.find((p) => p.id === providerType);
}

export function splitProviderValues(
  channel: ChannelType,
  providerType: string,
  values: Record<string, string>,
): { config: Record<string, unknown>; credentials: Record<string, string> } {
  const def = getProviderDefinition(channel, providerType);
  const config: Record<string, unknown> = {};
  const credentials: Record<string, string> = {};

  if (!def) return { config: values, credentials: {} };

  for (const field of def.fields) {
    const raw = values[field.key]?.trim() ?? '';
    if (!raw) continue;
    if (field.secret) {
      credentials[field.key] = raw;
    } else if (field.type === 'number') {
      config[field.key] = Number(raw);
    } else if (field.type === 'json') {
      try {
        config[field.key] = JSON.parse(raw);
      } catch {
        config[field.key] = raw;
      }
    } else {
      config[field.key] = raw;
    }
  }

  return { config, credentials };
}

export function mergeProviderValues(
  channel: ChannelType,
  providerType: string,
  config: Record<string, unknown>,
  credentials: Record<string, string>,
): Record<string, string> {
  const def = getProviderDefinition(channel, providerType);
  const values: Record<string, string> = {};
  if (!def) return values;

  for (const field of def.fields) {
    const source = field.secret ? credentials : config;
    const raw = source[field.key];
    if (raw === undefined || raw === null) continue;
    values[field.key] =
      field.type === 'json' && typeof raw === 'object' ? JSON.stringify(raw, null, 2) : String(raw);
  }

  return values;
}

export function validateProviderValues(
  channel: ChannelType,
  providerType: string,
  values: Record<string, string>,
): string[] {
  const def = getProviderDefinition(channel, providerType);
  if (!def) return ['Unknown provider type'];
  const errors: string[] = [];

  for (const field of def.fields) {
    if (field.required && !values[field.key]?.trim()) {
      errors.push(`${field.label} is required`);
    }
    if (field.type === 'json' && values[field.key]?.trim()) {
      try {
        JSON.parse(values[field.key]);
      } catch {
        errors.push(`${field.label} must be valid JSON`);
      }
    }
  }

  if (channel === 'web_push' && providerType === 'firebase') {
    errors.push(...validateFirebaseClientFields(values));
  } else if (providerType === 'firebase' && values.service_account_json?.trim()) {
    try {
      const parsed = JSON.parse(values.service_account_json);
      if (values.project_id?.trim() && parsed.project_id && parsed.project_id !== values.project_id.trim()) {
        errors.push('Project ID must match service account JSON');
      }
    } catch {
      errors.push('Service account JSON is invalid');
    }
  }

  return errors;
}
