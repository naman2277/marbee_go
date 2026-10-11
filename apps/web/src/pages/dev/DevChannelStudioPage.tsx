/**
 * DEV-ONLY harness for the multi-channel message studios (WhatsApp / RCS / SMS /
 * Web Push). Mounted at /dev/channel-studio?channel=whatsapp and only when
 * import.meta.env.DEV is true (see App.tsx).
 */
import { useMemo, useState } from 'react';
import { ChannelStudio } from '@/components/content-templates/channel-studio/ChannelStudio';
import type {
  ContentChannel,
  ContentTemplateSettings,
  MarbeeContentTemplate,
  TemplateContent,
} from '@/lib/content-templates';

const CHANNELS: Array<Exclude<ContentChannel, 'email'>> = ['whatsapp', 'rcs', 'sms', 'web_push'];

const SEED: Record<Exclude<ContentChannel, 'email'>, TemplateContent> = {
  whatsapp: {
    body: 'Hi {{first_name}}, your order *{{order_id}}* has shipped! 🎉\nTrack it any time from your account.',
    footer: 'Reply STOP to opt out',
    buttons: [
      { type: 'URL', text: 'Track order', url: 'https://marbee.io/track' },
      { type: 'QUICK_REPLY', text: 'Talk to support' },
    ],
    variable_map: [],
    template_format: 'standard',
    category: 'UTILITY',
    language: 'en_US',
    header: { format: 'TEXT', text: 'Order update' },
    carousel_cards: [],
  } as any,
  rcs: {
    format: 'rich_card',
    title: 'Weekend flash sale',
    description: 'Hi {{first_name}} — 30% off everything until Sunday midnight.',
    media: { url: 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=800&auto=format&fit=crop&q=80', height: 'MEDIUM' },
    suggestions: [
      { type: 'open_url', text: 'Shop now', url: 'https://marbee.io/sale' },
      { type: 'reply', text: 'Remind me later' },
    ],
    fallback: { channel: 'sms', text: 'Weekend flash sale: 30% off everything. Shop: marbee.io/sale' },
    carousel_cards: [],
  } as any,
  sms: {
    message: 'Hi {{first_name}}! Your code is {{discount_code}} for 20% off this weekend. Shop: marbee.io/s Reply STOP to opt out.',
  } as any,
  web_push: {
    title: 'Your cart misses you 🛒',
    body: 'Hi {{first_name}}, complete your order in the next hour and save 10%.',
    icon_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&auto=format&fit=crop&q=80',
    image_url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80',
    action_url: 'https://marbee.io/cart',
    actions: [
      { action: 'a1', title: 'Checkout', url: 'https://marbee.io/cart' },
      { action: 'a2', title: 'Dismiss' },
    ],
    require_interaction: false,
    ttl_hours: 12,
  } as any,
};

export function DevChannelStudioPage() {
  const params = new URLSearchParams(window.location.search);
  const initial = (params.get('channel') as Exclude<ContentChannel, 'email'>) || 'whatsapp';
  const [channel, setChannel] = useState<Exclude<ContentChannel, 'email'>>(
    CHANNELS.includes(initial) ? initial : 'whatsapp',
  );
  const [content, setContent] = useState<TemplateContent>(() => SEED[channel]);
  const [settings, setSettings] = useState<ContentTemplateSettings>({ from_name: 'Marbee Business', sender_id: 'MARBEE' });

  const template = useMemo<MarbeeContentTemplate>(
    () => ({
      id: 'dev-harness',
      tenant_id: 'dev',
      environment: 'dev',
      name: `Dev ${channel} template`,
      slug: `dev_${channel}`,
      channel,
      content,
      settings,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    [channel, content, settings],
  );

  const switchChannel = (c: Exclude<ContentChannel, 'email'>) => {
    setChannel(c);
    setContent(SEED[c]);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-900 px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Dev harness</span>
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => switchChannel(c)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize transition ${
              channel === c ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {c.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ChannelStudio
          key={channel}
          template={template}
          content={content}
          settings={settings}
          onChangeContent={setContent}
          onChangeSettings={setSettings}
          onSave={() => {}}
          onBack={() => {
            window.location.href = '/';
          }}
          personalizationSample={{ first_name: 'Alex', last_name: 'Morgan', name: 'Alex Morgan', city: 'Austin' }}
        />
      </div>
    </div>
  );
}
