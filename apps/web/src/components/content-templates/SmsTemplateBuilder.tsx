import { Sparkles } from 'lucide-react';
import { TemplateBuilderSection } from '@/components/content-templates/TemplateBuilderSection';
import { PersonalizedTextarea } from '@/components/content-templates/PersonalizedField';
import type { SmsContent } from '@/lib/content-templates';

type Props = {
  content: SmsContent;
  onChange: (content: SmsContent) => void;
};

const SMS_AI_PROMPTS = [
  {
    label: '⚡ Flash Sale (Urgent)',
    message: 'Hi {{first_name}}! ⚡ Flash Sale: Get 20% off with code {{discount_code}} for the next 24h only. Shop now: https://marbee.io/shop Opt-out reply STOP',
  },
  {
    label: '📦 Order Confirmation',
    message: 'Hi {{first_name}}, order #{{order_id}} for {{order_total}} is confirmed and processing. Track here: https://marbee.io/track/{{order_id}}',
  },
  {
    label: '🎁 VIP Points Reward',
    message: 'Hi {{first_name}}! You have {{loyalty_points}} {{loyalty_tier}} points expiring soon. Redeem them for discounts at: https://marbee.io/rewards',
  },
];

function segmentInfo(message: string) {
  const len = message.length;
  const isUnicode = /[^\x00-\x7F]/.test(message);
  const maxPerSegment = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;
  const segments = len === 0 ? 0 : len <= maxPerSegment ? 1 : Math.ceil(len / multiLimit);
  const encoding = isUnicode ? 'Unicode (70 chars/segment)' : 'GSM-7 (160 chars/segment)';
  const percentOfSingle = Math.min(100, Math.round((len / maxPerSegment) * 100));

  return { len, segments, encoding, maxPerSegment, percentOfSingle, isUnicode };
}

export function SmsTemplateBuilder({ content, onChange }: Props) {
  const { len, segments, encoding, maxPerSegment } = segmentInfo(content.message);

  return (
    <div className="space-y-5 text-xs">
      {/* AI Inspiration Bar */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          <span className="font-bold text-emerald-950 text-xs">AI SMS Copy Inspirations</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SMS_AI_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ message: p.message })}
              className="rounded-xl border border-emerald-200/80 bg-white px-3 py-1.5 font-bold text-emerald-800 shadow-2xs hover:bg-emerald-50 hover:border-emerald-300 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <TemplateBuilderSection
        title="SMS Message Body"
        description="Insert Customer 360 attributes to tailor messages per contact."
        required
      >
        <PersonalizedTextarea
          value={content.message}
          onChange={(message) => onChange({ message })}
          rows={5}
          inputClassName="w-full rounded-xl border border-slate-200 p-3 pr-10 text-xs focus:border-brand-500 focus:outline-none"
          placeholder="e.g. Hi {{first_name}}, your order #{{order_id}} has been shipped! 🚚"
        />

        {/* Live Segment Calculator Card */}
        <div className="mt-3.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">
              {len} / {maxPerSegment} characters
            </span>
            <span className="font-semibold text-slate-500">
              {segments} Segment{segments !== 1 ? 's' : ''} · {encoding}
            </span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all duration-300 ${
                segments > 1 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (len / 160) * 100)}%` }}
            />
          </div>

          <p className="text-[11px] text-slate-400">
            Messages under 160 characters send as 1 billing segment. Emojis switch encoding to Unicode (70 chars).
          </p>
        </div>
      </TemplateBuilderSection>
    </div>
  );
}

export function SmsTemplatePreview({ content }: { content: SmsContent }) {
  return (
    <div className="mx-auto w-full max-w-[290px]">
      <div className="overflow-hidden rounded-[2.5rem] border-[6px] border-slate-900 bg-slate-900 shadow-xl">
        <div className="bg-slate-900 px-4 pt-3 pb-2 text-center text-[10px] text-slate-400 font-semibold">
          Messages · Today
        </div>
        <div className="min-h-[220px] p-4 bg-slate-950 flex flex-col justify-end">
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl rounded-bl-xs bg-slate-800 border border-slate-700/60 p-3 text-xs text-white leading-relaxed shadow-sm">
              {content.message || 'SMS body preview will appear here'}
            </div>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 ml-1 font-mono">Delivered</span>
        </div>
        <div className="border-t border-slate-800 bg-slate-900 px-4 py-2.5 text-center text-[10px] text-slate-500 font-medium">
          SMS / Text Message
        </div>
      </div>
    </div>
  );
}
