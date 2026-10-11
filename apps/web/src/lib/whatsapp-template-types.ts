import type { WhatsAppContent } from './content-templates';

export type WhatsAppTemplateFormat = 'standard' | 'carousel' | 'authentication';
export type WhatsAppCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WhatsAppHeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type WhatsAppButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';

export type WhatsAppButton = {
  type: WhatsAppButtonType | string;
  text: string;
  url?: string;
  phone_number?: string;
};

export type WhatsAppHeader = {
  format: WhatsAppHeaderFormat;
  text?: string;
  media_url?: string;
};

export type WhatsAppCarouselCard = {
  id: string;
  header_format?: 'IMAGE' | 'VIDEO';
  header_media_url?: string;
  body: string;
  buttons?: WhatsAppButton[];
};

export const WHATSAPP_FORMAT_OPTIONS: Array<{ id: WhatsAppTemplateFormat; label: string; description: string }> = [
  { id: 'standard', label: 'Standard', description: 'Header, body, footer, and CTA or quick reply buttons' },
  { id: 'carousel', label: 'Carousel', description: 'Up to 10 scrollable cards with media and buttons' },
  { id: 'authentication', label: 'Authentication', description: 'OTP / verification with copy-code button' },
];

export const WHATSAPP_CATEGORY_OPTIONS: Array<{ id: WhatsAppCategory; label: string }> = [
  { id: 'MARKETING', label: 'Marketing' },
  { id: 'UTILITY', label: 'Utility' },
  { id: 'AUTHENTICATION', label: 'Authentication' },
];

export const WHATSAPP_HEADER_OPTIONS: Array<{ id: WhatsAppHeaderFormat; label: string }> = [
  { id: 'NONE', label: 'None' },
  { id: 'TEXT', label: 'Text' },
  { id: 'IMAGE', label: 'Image' },
  { id: 'VIDEO', label: 'Video' },
  { id: 'DOCUMENT', label: 'Document' },
];

export const WHATSAPP_BUTTON_TYPE_OPTIONS: Array<{ id: WhatsAppButtonType; label: string; max?: number }> = [
  { id: 'URL', label: 'Visit website (URL)', max: 2 },
  { id: 'PHONE_NUMBER', label: 'Call phone number', max: 1 },
  { id: 'QUICK_REPLY', label: 'Quick reply', max: 3 },
  { id: 'COPY_CODE', label: 'Copy offer code', max: 1 },
];

function normalizeButtonType(type: string): WhatsAppButtonType {
  const u = type.toUpperCase();
  if (u === 'URL' || u === 'PHONE_NUMBER' || u === 'QUICK_REPLY' || u === 'COPY_CODE') return u;
  if (type === 'url') return 'URL';
  if (type === 'phone') return 'PHONE_NUMBER';
  return 'QUICK_REPLY';
}

export function normalizeWhatsAppContent(raw: WhatsAppContent): WhatsAppContent {
  const buttons = (raw.buttons ?? []).map((b) => ({
    ...b,
    type: normalizeButtonType(String(b.type)),
  }));

  let template_format: WhatsAppTemplateFormat = raw.template_format ?? 'standard';
  if (raw.carousel_cards?.length) template_format = 'carousel';
  else if (raw.category === 'AUTHENTICATION' || buttons.some((b) => b.type === 'COPY_CODE')) {
    template_format = 'authentication';
  }

  return {
    body: raw.body ?? '',
    buttons,
    variable_map: raw.variable_map ?? [],
    template_format,
    category: (raw.category as WhatsAppCategory) ?? 'MARKETING',
    language: raw.language ?? 'en',
    header: raw.header ?? { format: 'NONE' },
    footer: raw.footer ?? '',
    carousel_cards:
      raw.carousel_cards ??
      (template_format === 'carousel'
        ? [{ id: crypto.randomUUID(), body: raw.body || '', buttons: [] }]
        : []),
  };
}

export function emptyWhatsAppContent(format: WhatsAppTemplateFormat = 'standard'): WhatsAppContent {
  const base: WhatsAppContent = {
    body: '',
    buttons: [],
    variable_map: [],
    template_format: format,
    category: format === 'authentication' ? 'AUTHENTICATION' : 'MARKETING',
    language: 'en',
    header: { format: 'NONE' },
    footer: '',
    carousel_cards: [],
  };
  if (format === 'carousel') {
    base.carousel_cards = [
      { id: crypto.randomUUID(), header_format: 'IMAGE', body: '', buttons: [] },
      { id: crypto.randomUUID(), header_format: 'IMAGE', body: '', buttons: [] },
    ];
  }
  if (format === 'authentication') {
    base.body = 'Your verification code is {{1}}';
    base.buttons = [{ type: 'COPY_CODE', text: 'Copy code' }];
  }
  return base;
}

export function insertVariable(text: string, variable: string): string {
  const token = variable.startsWith('{{') ? variable : `{{${variable}}}`;
  return text ? `${text}${text.endsWith(' ') ? '' : ' '}${token}` : token;
}
