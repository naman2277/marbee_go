import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../apps/web/src/lib/template-library-source/saas_template_library_advanced');
const OUT = path.join(__dirname, '../apps/web/src/lib/content-template-library.generated.ts');

const FOLDER_CHANNEL = {
  Email: 'email',
  SMS: 'sms',
  Web_Push: 'web_push',
  WhatsApp: 'whatsapp',
  RCS: 'rcs',
};

const CHANNEL_ICON = {
  email: '📧',
  sms: '💬',
  web_push: '🔔',
  whatsapp: '📱',
  rcs: '✨',
};

function titleCase(slug) {
  return slug
    .replace(/^\d+_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function inferCategory(templateId, channel) {
  const id = templateId.toLowerCase();
  if (id.includes('welcome') || id.includes('trial') || id.includes('activation')) return 'Onboarding';
  if (id.includes('digest') || id.includes('newsletter')) return 'Newsletter';
  if (id.includes('campaign')) return 'Campaign';
  if (id.includes('alert') || id.includes('anomaly') || id.includes('security')) return 'Alerts';
  if (id.includes('invoice') || id.includes('order') || id.includes('otp') || id.includes('payment')) return 'Transactional';
  if (id.includes('feature') || id.includes('release')) return 'Product';
  if (id.includes('reengagement') || id.includes('reengagement')) return 'Re-engagement';
  if (id.includes('feedback') || id.includes('nps')) return 'Feedback';
  if (id.includes('offer') || id.includes('price')) return 'Promotional';
  if (id.includes('cart') || id.includes('abandoned') || id.includes('stock')) return 'Commerce';
  if (id.includes('event') || id.includes('booking') || id.includes('reminder')) return 'Events';
  if (id.includes('support')) return 'Support';
  if (id.includes('personalized')) return 'Personalization';
  if (channel === 'web_push') return 'Push notifications';
  if (channel === 'sms') return 'SMS alerts';
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'rcs') return 'RCS';
  return 'Marketing';
}

function inferDescription(name, category, channel) {
  return `Production-style ${channel.replace('_', ' ')} template — ${category.toLowerCase()} use case. Personalize with {{variables}}.`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildEmailItem(folder, baseName, meta) {
  const htmlPath = path.join(folder, `${baseName}.html`);
  const html_body = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '<p>{{content}}</p>';
  const templateId = meta.template_id ?? baseName;
  const name = titleCase(templateId);
  const category = inferCategory(templateId, 'email');
  return {
    id: `saas-email-${templateId}`,
    name,
    category,
    description: inferDescription(name, category, 'email'),
    channel: 'email',
    icon: CHANNEL_ICON.email,
    content: {
      subject: meta.subject ?? name,
      preheader: meta.preheader ?? '',
      html_body,
      text_body: meta.text_body ?? '',
    },
    settings: {
      from_name: '{{brand_name}}',
      description: meta.design_system ? `${meta.design_system} design system` : 'SaaS marketing email',
      cta_label: meta.cta?.label,
      cta_url: meta.cta?.url,
      personalization: meta.personalization ?? [],
      responsive: meta.responsive ?? true,
    },
  };
}

function buildSmsItem(meta) {
  const templateId = meta.template_id;
  const name = titleCase(templateId);
  const category = inferCategory(templateId, 'sms');
  const message = meta.body ?? meta.text ?? '';
  return {
    id: `saas-sms-${templateId}`,
    name,
    category,
    description: inferDescription(name, category, 'sms'),
    channel: 'sms',
    icon: CHANNEL_ICON.sms,
    content: { message },
    settings: {
      sender_id: '{{brand_name}}',
      description: 'SMS with compliance controls',
      controls: meta.controls ?? {},
    },
  };
}

function buildWebPushItem(meta) {
  const templateId = meta.template_id;
  const name = titleCase(templateId);
  const category = inferCategory(templateId, 'web_push');
  return {
    id: `saas-push-${templateId}`,
    name,
    category,
    description: inferDescription(name, category, 'web push'),
    channel: 'web_push',
    icon: CHANNEL_ICON.web_push,
    content: {
      title: meta.title ?? name,
      body: meta.body ?? '',
      icon_url: meta.icon ?? '{{icon_url}}',
      action_url: meta.url ?? meta.actions?.[0]?.url ?? '{{action_url}}',
    },
    settings: {
      description: 'Web push with actions and personalization',
      tag: meta.tag,
      actions: meta.actions ?? [],
      badge: meta.badge,
    },
  };
}

function buildWhatsAppItem(meta) {
  const templateId = meta.template_id;
  const name = titleCase(templateId);
  const category = meta.category ? titleCase(meta.category) : inferCategory(templateId, 'whatsapp');
  return {
    id: `saas-wa-${templateId}`,
    name,
    category,
    description: inferDescription(name, category, 'whatsapp'),
    channel: 'whatsapp',
    icon: CHANNEL_ICON.whatsapp,
    content: {
      body: meta.body ?? '',
      buttons: meta.buttons ?? [],
      variable_map: meta.variable_map ?? [],
    },
    settings: {
      description: 'WhatsApp Business template structure',
      provider_category: meta.category ?? 'marketing',
    },
  };
}

function buildRcsItem(meta) {
  const templateId = meta.template_id;
  const name = titleCase(templateId);
  const category = inferCategory(templateId, 'rcs');
  return {
    id: `saas-rcs-${templateId}`,
    name,
    category,
    description: inferDescription(name, category, 'rcs'),
    channel: 'rcs',
    icon: CHANNEL_ICON.rcs,
    content: {
      format: meta.format ?? 'rich_card',
      title: meta.title ?? name,
      description: meta.description ?? '',
      orientation: meta.orientation,
      media: meta.media,
      suggestions: meta.suggestions ?? [],
      fallback: meta.fallback,
    },
    settings: {
      description: 'RCS rich card with SMS fallback',
    },
  };
}

const items = [];

for (const [folderName, channel] of Object.entries(FOLDER_CHANNEL)) {
  const folder = path.join(ROOT, folderName);
  if (!fs.existsSync(folder)) continue;
  const files = fs.readdirSync(folder).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const baseName = file.replace(/\.json$/, '');
    const meta = readJson(path.join(folder, file));
    switch (channel) {
      case 'email':
        items.push(buildEmailItem(folder, baseName, meta));
        break;
      case 'sms':
        items.push(buildSmsItem(meta));
        break;
      case 'web_push':
        items.push(buildWebPushItem(meta));
        break;
      case 'whatsapp':
        items.push(buildWhatsAppItem(meta));
        break;
      case 'rcs':
        items.push(buildRcsItem(meta));
        break;
      default:
        break;
    }
  }
}

items.sort((a, b) => a.channel.localeCompare(b.channel) || a.name.localeCompare(b.name));

const categories = ['All', ...new Set(items.map((i) => i.category))].sort((a, b) =>
  a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b),
);

const header = `/* eslint-disable */
// AUTO-GENERATED by scripts/generate-content-template-library.mjs — do not edit manually.
// Source: template-library-source/saas_template_library_advanced (Advanced SaaS Marketing Template Library v2.0)

import type { ContentTemplateLibraryItem } from './content-templates';

export const LIBRARY_VERSION = '2.0';
export const LIBRARY_NAME = 'Advanced SaaS Marketing Template Library';
export const LIBRARY_TEMPLATE_COUNT = ${items.length};

export const CONTENT_TEMPLATE_LIBRARY_CATEGORIES = ${JSON.stringify(categories)} as const;

export const CONTENT_TEMPLATE_LIBRARY: ContentTemplateLibraryItem[] = `;

const body = JSON.stringify(items, null, 2)
  .replace(/"html_body": "([^"]*(?:\\.[^"]*)*)"/g, (_, html) => {
    // Re-stringify won't work for multiline - use template literal approach in output
    return `"html_body": "__HTML_PLACEHOLDER__"`;
  });

// Better approach: write items with separate html as template literals
function serializeItem(item) {
  const { content, ...rest } = item;
  if (item.channel === 'email') {
    const html = content.html_body.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return `{
    id: ${JSON.stringify(item.id)},
    name: ${JSON.stringify(item.name)},
    category: ${JSON.stringify(item.category)},
    description: ${JSON.stringify(item.description)},
    channel: 'email',
    icon: ${JSON.stringify(item.icon)},
    content: {
      subject: ${JSON.stringify(content.subject)},
      preheader: ${JSON.stringify(content.preheader ?? '')},
      html_body: \`${html}\`,
      text_body: ${JSON.stringify(content.text_body ?? '')},
    },
    settings: ${JSON.stringify(item.settings, null, 2).replace(/\n/g, '\n    ')},
  }`;
  }
  return JSON.stringify(item, null, 2)
    .replace(/^/gm, '  ')
    .replace(/^  /, '');
}

const serializedItems = items.map(serializeItem).join(',\n');

const output = `${header}[
${serializedItems}
];
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, output, 'utf8');
console.log(`Generated ${items.length} templates -> ${OUT}`);
