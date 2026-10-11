import { Link2, ShieldAlert } from 'lucide-react';
import type { SmsContent } from '@/lib/content-templates';
import { smsSegmentInfo } from './channel-studio-utils';
import { StudioSection, VariableTextArea } from './studio-ui';

type Props = {
  content: SmsContent;
  onChange: (next: SmsContent) => void;
};

const OPT_OUT = ' Reply STOP to opt out.';

export function SmsComposer({ content, onChange }: Props) {
  const message = content.message ?? '';
  const seg = smsSegmentInfo(message);
  const hasOptOut = /\bstop\b/i.test(message);
  const hasLink = /https?:\/\//i.test(message);

  return (
    <div className="space-y-4">
      <StudioSection
        title="Message"
        description="Keep it under 160 GSM-7 characters to stay a single billed segment."
      >
        <VariableTextArea
          value={message}
          onChange={(v) => onChange({ message: v })}
          placeholder="Hi {{first_name}}, your order {{order_id}} has shipped…"
          rows={6}
        />

        {/* segmentation dashboard */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Characters', value: String(seg.chars) },
            { label: 'Encoding', value: seg.encoding },
            { label: 'Segments', value: String(seg.segments) },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-center">
              <div className="text-sm font-extrabold text-slate-900 tabular-nums">{m.value}</div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${seg.segments > 1 ? 'bg-amber-500' : 'bg-violet-500'}`}
            style={{ width: `${Math.min(100, (seg.chars / (seg.segments <= 1 ? seg.perSegment : seg.segments * seg.perSegment)) * 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400">
          {seg.remaining} characters left in this {seg.segments <= 1 ? 'segment' : `${seg.segments}-part message`}.
          {seg.encoding === 'UCS-2' && ' Emoji / accents forced Unicode encoding (70 chars/segment).'}
        </p>
      </StudioSection>

      <StudioSection title="Compliance helpers">
        <button
          type="button"
          disabled={hasOptOut}
          onClick={() => onChange({ message: message.replace(/\s*$/, '') + OPT_OUT })}
          className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold text-slate-700 transition hover:border-violet-300 disabled:opacity-40"
        >
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          {hasOptOut ? 'Opt-out language detected ✓' : 'Append “Reply STOP to opt out.”'}
        </button>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
          <Link2 className="h-4 w-4 text-slate-400" />
          {hasLink ? 'Link found — it will be auto-shortened & click-tracked at send.' : 'No links in this message.'}
        </div>
      </StudioSection>
    </div>
  );
}
