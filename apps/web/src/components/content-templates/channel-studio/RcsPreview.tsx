import { BadgeCheck, Calendar, ExternalLink, MapPin, Phone, Reply } from 'lucide-react';
import type { RcsContent, RcsSuggestion } from '@/lib/content-templates';
import { normalizeRcsContent } from '@/lib/rcs-template-types';
import { applyPersonalization, nowLabel } from './channel-studio-utils';
import { AppHeader, PhoneFrame } from './device-frames';

function SuggestionChip({ s }: { s: RcsSuggestion }) {
  const t = (s.type || '').toLowerCase();
  const Icon =
    t.includes('url') || t.includes('open')
      ? ExternalLink
      : t.includes('dial') || t.includes('phone')
        ? Phone
        : t.includes('location') || t.includes('map')
          ? MapPin
          : t.includes('calendar') || t.includes('event')
            ? Calendar
            : Reply;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#1a73e8]/40 bg-white px-3 py-1 text-[11px] font-semibold text-[#1a73e8]">
      <Icon className="h-3 w-3" />
      {s.text || 'Suggestion'}
    </span>
  );
}

function mediaHeight(h?: string) {
  if (h === 'SHORT') return 'h-24';
  if (h === 'TALL') return 'h-56';
  return 'h-40';
}

export function RcsPreview({
  content,
  sample,
  agentName = 'Marbee',
}: {
  content: RcsContent;
  sample?: Record<string, unknown>;
  agentName?: string;
}) {
  const c = normalizeRcsContent(content);
  const suggestions = c.suggestions ?? [];

  return (
    <PhoneFrame variant="android" statusColor="#1b1b1b">
      <AppHeader color="#1f1f1f" title={agentName} subtitle="Verified business · RCS" />
      <div className="min-h-[430px] space-y-2 bg-[#f5f5f5] px-3 py-3">
        <div className="flex justify-center">
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-400 shadow-2xs">
            Today {nowLabel()}
          </span>
        </div>

        {c.format === 'text' && (
          <div className="max-w-[85%] space-y-1.5">
            <div className="rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-sm">
              {applyPersonalization(c.description || c.title || 'Message text…', sample)}
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <SuggestionChip key={i} s={s} />
                ))}
              </div>
            )}
          </div>
        )}

        {c.format === 'rich_card' && (
          <div className="max-w-[86%] space-y-1.5">
            <div className="overflow-hidden rounded-2xl rounded-tl-md bg-white shadow-sm">
              <div className={`flex ${mediaHeight(c.media?.height)} items-center justify-center bg-slate-100`}>
                {c.media?.url ? (
                  <img src={c.media.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400">Card media</span>
                )}
              </div>
              <div className="space-y-0.5 px-3 py-2.5">
                <p className="text-[13.5px] font-bold text-slate-900">
                  {applyPersonalization(c.title || 'Card title', sample)}
                </p>
                <p className="text-[12px] leading-snug text-slate-500">
                  {applyPersonalization(c.description || 'Supporting description text for the rich card.', sample)}
                </p>
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-col border-t border-slate-100">
                  {suggestions.map((s, i) => (
                    <div key={i} className="border-b border-slate-100 py-2 text-center text-[12px] font-semibold text-[#1a73e8] last:border-b-0">
                      {s.text || 'Suggestion'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {c.format === 'carousel' && (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {(c.carousel_cards ?? []).map((card) => (
              <div key={card.id} className="w-[180px] shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex h-28 items-center justify-center bg-slate-100">
                  {card.media?.url ? (
                    <img src={card.media.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400">Media</span>
                  )}
                </div>
                <div className="space-y-0.5 px-2.5 py-2">
                  <p className="text-[12px] font-bold text-slate-900">{applyPersonalization(card.title || 'Title', sample)}</p>
                  <p className="line-clamp-2 text-[11px] text-slate-500">
                    {applyPersonalization(card.description || 'Description', sample)}
                  </p>
                </div>
                {(card.suggestions ?? []).length > 0 && (
                  <div className="border-t border-slate-100">
                    {(card.suggestions ?? []).map((s, i) => (
                      <div key={i} className="border-b border-slate-100 py-1.5 text-center text-[11px] font-semibold text-[#1a73e8] last:border-b-0">
                        {s.text || 'Suggestion'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-1 pt-1 text-[9px] font-medium text-slate-400">
          <BadgeCheck className="h-3 w-3 text-[#1a73e8]" />
          Verified sender · falls back to {c.fallback?.channel?.toUpperCase() || 'SMS'}
        </div>
      </div>
    </PhoneFrame>
  );
}
