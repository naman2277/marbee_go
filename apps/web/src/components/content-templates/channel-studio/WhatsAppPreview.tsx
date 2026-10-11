import { Copy, ExternalLink, FileText, Phone, Play } from 'lucide-react';
import type { WhatsAppContent } from '@/lib/content-templates';
import { normalizeWhatsAppContent } from '@/lib/whatsapp-template-types';
import { applyPersonalization, nowLabel, waMarkdownToHtml } from './channel-studio-utils';
import { AppHeader, PhoneFrame } from './device-frames';

function Buttons({ buttons }: { buttons: WhatsAppContent['buttons'] }) {
  if (!buttons?.length) return null;
  return (
    <div className="mt-1 border-t border-slate-100">
      {buttons.map((b, i) => {
        const t = String(b.type).toUpperCase();
        const Icon = t === 'URL' ? ExternalLink : t === 'PHONE_NUMBER' ? Phone : t === 'COPY_CODE' ? Copy : null;
        return (
          <div
            key={i}
            className="flex items-center justify-center gap-2 border-b border-slate-100 py-2 text-[13px] font-medium text-[#00a5f4] last:border-b-0"
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {b.text || 'Button'}
          </div>
        );
      })}
    </div>
  );
}

function Bubble({ c, sample }: { c: WhatsAppContent; sample?: Record<string, unknown> }) {
  const header = c.header;
  const body = applyPersonalization(c.body || 'Your message body preview appears here…', sample);
  return (
    <div className="relative max-w-[85%] rounded-lg rounded-tl-none bg-white px-2 pb-1.5 pt-2 shadow-sm">
      {header?.format === 'TEXT' && header.text && (
        <p className="mb-1 text-[13px] font-bold text-slate-900">{applyPersonalization(header.text, sample)}</p>
      )}
      {header?.format === 'IMAGE' && (
        <div className="mb-1.5 flex aspect-[1.91/1] items-center justify-center overflow-hidden rounded-md bg-slate-100">
          {header.media_url ? (
            <img src={header.media_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] font-semibold text-slate-400">Image header</span>
          )}
        </div>
      )}
      {header?.format === 'VIDEO' && (
        <div className="relative mb-1.5 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-slate-900">
          {header.media_url && <img src={header.media_url} alt="" className="h-full w-full object-cover opacity-70" />}
          <Play className="absolute h-8 w-8 text-white" fill="white" />
        </div>
      )}
      {header?.format === 'DOCUMENT' && (
        <div className="mb-1.5 flex items-center gap-2 rounded-md bg-slate-100 px-2 py-2">
          <FileText className="h-5 w-5 text-slate-500" />
          <span className="text-[11px] font-medium text-slate-600">Document.pdf</span>
        </div>
      )}
      <p
        className="whitespace-pre-wrap text-[13.5px] leading-[1.35] text-slate-800"
        dangerouslySetInnerHTML={{ __html: waMarkdownToHtml(body) }}
      />
      {c.footer && <p className="mt-1 text-[11px] text-slate-400">{applyPersonalization(c.footer, sample)}</p>}
      <span className="float-right ml-2 mt-0.5 text-[10px] text-slate-400">{nowLabel()}</span>
      <div className="clear-both" />
      <Buttons buttons={c.buttons} />
    </div>
  );
}

export function WhatsAppPreview({
  content,
  sample,
  businessName = 'Marbee Business',
}: {
  content: WhatsAppContent;
  sample?: Record<string, unknown>;
  businessName?: string;
}) {
  const c = normalizeWhatsAppContent(content);
  const isCarousel = c.template_format === 'carousel' && (c.carousel_cards?.length ?? 0) > 0;

  return (
    <PhoneFrame variant="android" statusColor="#075e54">
      <AppHeader color="#075e54" title={businessName} subtitle="business account" />
      <div
        className="min-h-[430px] space-y-2 px-2.5 py-3"
        style={{
          backgroundColor: '#e5ddd5',
          backgroundImage:
            'linear-gradient(rgba(229,221,213,0.94), rgba(229,221,213,0.94)), url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'%3E%3Cpath d=\'M0 20h40M20 0v40\' stroke=\'%23d5cbc0\' stroke-width=\'0.5\'/%3E%3C/svg%3E")',
        }}
      >
        <div className="flex justify-center">
          <span className="rounded-md bg-[#d4e9f7] px-2 py-0.5 text-[10px] font-medium text-slate-500 shadow-2xs">Today</span>
        </div>
        {isCarousel ? (
          <div className="space-y-2">
            {c.body && (
              <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 py-2 text-[13px] text-slate-800 shadow-sm">
                <span dangerouslySetInnerHTML={{ __html: waMarkdownToHtml(applyPersonalization(c.body, sample)) }} />
              </div>
            )}
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {c.carousel_cards!.map((card) => (
                <div key={card.id} className="w-[172px] shrink-0 snap-start overflow-hidden rounded-lg bg-white shadow-sm">
                  <div className="flex aspect-square items-center justify-center bg-slate-100">
                    {card.header_media_url ? (
                      <img src={card.header_media_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">
                        {card.header_format === 'VIDEO' ? 'Video' : 'Image'}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="line-clamp-3 text-[11.5px] leading-snug text-slate-700">
                      {applyPersonalization(card.body || 'Card body', sample)}
                    </p>
                  </div>
                  <Buttons buttons={card.buttons} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Bubble c={c} sample={sample} />
        )}
      </div>
      <div className="border-t border-black/5 bg-[#f0f2f5] px-3 py-1.5 text-center text-[9px] font-medium uppercase tracking-wide text-slate-400">
        {c.category ?? 'MARKETING'} · {c.language ?? 'en'} · {c.template_format}
      </div>
    </PhoneFrame>
  );
}
