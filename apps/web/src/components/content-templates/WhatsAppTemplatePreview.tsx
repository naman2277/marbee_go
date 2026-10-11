import { ChevronLeft, ExternalLink, ImageIcon, Phone, Copy } from 'lucide-react';
import type { WhatsAppContent } from '@/lib/content-templates';
import { normalizeWhatsAppContent } from '@/lib/whatsapp-template-types';

function renderWhatsAppText(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function ButtonIcon({ type }: { type: string }) {
  const t = type.toUpperCase();
  if (t === 'URL') return <ExternalLink className="h-3.5 w-3.5" />;
  if (t === 'PHONE_NUMBER') return <Phone className="h-3.5 w-3.5" />;
  if (t === 'COPY_CODE') return <Copy className="h-3.5 w-3.5" />;
  return null;
}

function MessageButtons({ buttons }: { buttons: WhatsAppContent['buttons'] }) {
  if (!buttons?.length) return null;
  return (
    <div className="mt-1 divide-y divide-slate-100 border-t border-slate-100">
      {buttons.map((btn, i) => (
        <button
          key={i}
          type="button"
          className="flex w-full items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#008069]"
        >
          <ButtonIcon type={btn.type} />
          {btn.text || 'Button'}
        </button>
      ))}
    </div>
  );
}

function StandardBubble({ content }: { content: WhatsAppContent }) {
  const header = content.header;
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      {header?.format === 'TEXT' && header.text && (
        <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">{header.text}</p>
      )}
      {(header?.format === 'IMAGE' || header?.format === 'VIDEO' || header?.format === 'DOCUMENT') && (
        <div className="flex aspect-[1.91/1] items-center justify-center bg-slate-100">
          {header.media_url ? (
            <img src={header.media_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-8 w-8 text-slate-300" />
          )}
        </div>
      )}
      <div className="px-3 py-2">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {content.body ? renderWhatsAppText(content.body) : 'Enter message body…'}
        </p>
        {content.footer && <p className="mt-2 text-xs text-slate-400">{content.footer}</p>}
      </div>
      <MessageButtons buttons={content.buttons} />
    </div>
  );
}

function CarouselPreview({ content }: { content: WhatsAppContent }) {
  const cards = content.carousel_cards ?? [];
  return (
    <div className="space-y-2">
      {content.body && (
        <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
          {renderWhatsAppText(content.body)}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((card) => (
          <div key={card.id} className="w-44 shrink-0 overflow-hidden rounded-lg bg-white shadow-sm">
            <div className="flex aspect-square items-center justify-center bg-slate-100">
              {card.header_media_url ? (
                <img src={card.header_media_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-slate-300" />
              )}
            </div>
            <div className="px-2 py-2">
              <p className="line-clamp-3 text-xs text-slate-700">{card.body || 'Card body'}</p>
            </div>
            <MessageButtons buttons={card.buttons} />
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  content: WhatsAppContent;
  compact?: boolean;
};

export function WhatsAppTemplatePreview({ content, compact }: Props) {
  const c = normalizeWhatsAppContent(content);

  return (
    <div className={compact ? 'scale-90 origin-top' : ''}>
      <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[2rem] border-[6px] border-slate-800 bg-[#efeae2] shadow-xl">
        <div className="flex items-center gap-2 bg-[#008069] px-3 py-2.5 text-white">
          <ChevronLeft className="h-5 w-5 opacity-80" />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold">MB</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Marbee Business</p>
            <p className="text-[10px] opacity-80">Template preview</p>
          </div>
        </div>
        <div className="min-h-[280px] space-y-2 p-3">
          <div className="flex justify-end">
            <span className="rounded-lg bg-[#d9fdd3] px-2 py-0.5 text-[10px] text-slate-500">Today</span>
          </div>
          <div className="max-w-[92%]">
            {c.template_format === 'carousel' ? (
              <CarouselPreview content={c} />
            ) : (
              <StandardBubble content={c} />
            )}
          </div>
        </div>
        <div className="border-t border-slate-200/60 bg-[#f0f2f5] px-3 py-2 text-center text-[10px] text-slate-400">
          {c.category ?? 'MARKETING'} · {c.language ?? 'en'}
        </div>
      </div>
    </div>
  );
}
