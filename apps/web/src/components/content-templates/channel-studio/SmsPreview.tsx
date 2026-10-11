import type { SmsContent } from '@/lib/content-templates';
import { applyPersonalization, nowLabel, smsSegmentInfo } from './channel-studio-utils';
import { PhoneFrame } from './device-frames';

export function SmsPreview({
  content,
  sample,
  senderId = 'MARBEE',
}: {
  content: SmsContent;
  sample?: Record<string, unknown>;
  senderId?: string;
}) {
  const text = applyPersonalization(content.message || 'Your SMS copy preview appears here…', sample);
  const seg = smsSegmentInfo(content.message || '');

  return (
    <PhoneFrame variant="ios" statusColor="#f2f2f7">
      {/* iMessage-style header */}
      <div className="flex flex-col items-center gap-1 border-b border-slate-200 bg-[#f7f7f8] px-4 py-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-sm font-bold text-white">
          {senderId.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-[11px] font-semibold text-slate-700">{senderId}</span>
        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">Text Message · SMS</span>
      </div>

      <div className="min-h-[430px] space-y-1.5 bg-white px-3 py-4">
        <div className="flex justify-center">
          <span className="text-[10px] font-semibold text-slate-400">
            Today {nowLabel()}
          </span>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[#e9e9eb] px-3 py-2 text-[13.5px] leading-snug text-slate-900">
            {text}
          </div>
        </div>
        <div className="pl-1 pt-1 text-[9px] font-medium text-slate-400">
          {seg.encoding} · {seg.segments} segment{seg.segments === 1 ? '' : 's'} · {seg.chars} chars
        </div>
      </div>
    </PhoneFrame>
  );
}
