import { useState } from 'react';
import { Eye, Sparkles, Type } from 'lucide-react';
import { TemplateBuilderSection } from '@/components/content-templates/TemplateBuilderSection';
import { PersonalizedInput, PersonalizedTextarea } from '@/components/content-templates/PersonalizedField';
import type { EmailContent } from '@/lib/content-templates';

type Props = {
  content: EmailContent;
  onChange: (content: EmailContent) => void;
};

type Tab = 'design' | 'html' | 'plain';

const AI_STARTERS: Array<{
  label: string;
  subject: string;
  preheader: string;
  html: string;
}> = [
  {
    label: '🎉 Welcome Onboarding',
    subject: 'Welcome to Marbee, {{first_name}}! Let’s get you started 🚀',
    preheader: 'Your account is ready. Explore your personalized perks.',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;line-height:1.6;">
  <div style="text-align:center;padding-bottom:20px;">
    <h1 style="color:#0f172a;font-size:24px;margin-bottom:8px;">Welcome to the family, {{first_name}}! 👋</h1>
    <p style="color:#64748b;font-size:14px;">We're thrilled to have you on board with Marbee.</p>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
    <h3 style="margin-top:0;font-size:16px;color:#0f172a;">Your Member Overview</h3>
    <p style="margin:4px 0;font-size:14px;">Tier: <strong>{{loyalty_tier}}</strong></p>
    <p style="margin:4px 0;font-size:14px;">Current Balance: <strong>{{loyalty_points}} points</strong></p>
  </div>
  <div style="text-align:center;margin-top:30px;">
    <a href="https://marbee.io/dashboard" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block;font-size:14px;">Get Started Now</a>
  </div>
</div>`,
  },
  {
    label: '🏷️ 20% Off Promo',
    subject: 'Special offer just for you, {{first_name}}! 🎁 Enjoy 20% off',
    preheader: 'Use promo code {{discount_code}} at checkout today.',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;line-height:1.6;">
  <div style="background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);color:#fff;border-radius:16px;padding:32px;text-align:center;">
    <h1 style="font-size:26px;margin:0 0 8px 0;color:#ffffff;">Exclusive 20% Off! 🎉</h1>
    <p style="margin:0;font-size:15px;opacity:0.9;">Hi {{first_name}}, as a valued customer, here is an exclusive reward for your next order.</p>
    <div style="background:#ffffff;color:#4f46e5;font-weight:bold;font-size:18px;display:inline-block;padding:10px 24px;border-radius:8px;margin-top:20px;letter-spacing:1px;">
      {{discount_code}}
    </div>
  </div>
  <div style="text-align:center;margin-top:28px;">
    <a href="https://marbee.io/shop" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block;font-size:14px;">Claim Your Discount</a>
  </div>
</div>`,
  },
  {
    label: '🚚 Order Shipped',
    subject: 'Good news! Your order #{{order_id}} has shipped 📦',
    preheader: 'Track your delivery with real-time updates.',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;line-height:1.6;">
  <h2 style="color:#0f172a;margin-top:0;">Your order is on the way! 🚚</h2>
  <p>Hi {{first_name}}, we've packed and dispatched order <strong>#{{order_id}}</strong>.</p>
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0;">
    <p style="margin:4px 0;">Total Amount: <strong>{{order_total}}</strong></p>
  </div>
  <a href="https://marbee.io/track" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:8px;font-weight:bold;display:inline-block;font-size:14px;">Track Package</a>
</div>`,
  },
];

export function EmailTemplateBuilder({ content, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('design');
  const patch = (next: Partial<EmailContent>) => onChange({ ...content, ...next });

  const tabs: Array<{ id: Tab; label: string; icon: typeof Eye }> = [
    { id: 'design', label: 'HTML Body', icon: Eye },
    { id: 'plain', label: 'Plain text', icon: Type },
  ];

  return (
    <div className="space-y-5 text-xs">
      {/* AI Inspiration Bar */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <span className="font-bold text-indigo-950 text-xs">AI Template Inspirations</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {AI_STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() =>
                onChange({
                  subject: s.subject,
                  preheader: s.preheader,
                  html_body: s.html,
                })
              }
              className="rounded-xl border border-indigo-200/80 bg-white px-3 py-1.5 font-bold text-indigo-800 shadow-2xs hover:bg-indigo-50 hover:border-indigo-300 transition"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <TemplateBuilderSection title="Inbox Envelope" description="What recipients see before opening the email">
        <div className="space-y-3">
          <PersonalizedInput
            label="Subject line"
            value={content.subject}
            onChange={(subject) => patch({ subject })}
            placeholder="e.g. Special perk for {{first_name}} ✨"
          />
          <PersonalizedInput
            label="Preheader text (Inbox snippet preview)"
            value={content.preheader ?? ''}
            onChange={(preheader) => patch({ preheader })}
            placeholder="e.g. Open to view your custom loyalty rewards"
          />
        </div>
      </TemplateBuilderSection>

      <TemplateBuilderSection
        title="Message Content & HTML Body"
        description="Responsive HTML with automatic Customer 360 personalization tokens"
        action={
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  tab === id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'design' && (
          <PersonalizedTextarea
            value={content.html_body}
            onChange={(html_body) => patch({ html_body })}
            rows={14}
            placeholder="<div style='font-family:sans-serif;'>...</div>"
            inputClassName="w-full rounded-xl border border-slate-200 p-3 pr-10 font-mono text-xs leading-relaxed focus:border-brand-500 focus:outline-none"
            spellCheck={false}
          />
        )}
        {tab === 'plain' && (
          <PersonalizedTextarea
            value={content.text_body ?? ''}
            onChange={(text_body) => patch({ text_body })}
            rows={10}
            placeholder="Plain text fallback version for non-HTML email clients"
            inputClassName="w-full rounded-xl border border-slate-200 p-3 pr-10 text-xs focus:border-brand-500 focus:outline-none"
          />
        )}
      </TemplateBuilderSection>
    </div>
  );
}
