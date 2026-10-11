import { Globe, MoreHorizontal, X } from 'lucide-react';
import type { WebPushContent } from '@/lib/content-templates';
import { applyPersonalization } from './channel-studio-utils';
import { BrowserFrame } from './device-frames';

export function WebPushPreview({
  content,
  sample,
  surface = 'desktop',
  siteName = 'yoursite.com',
}: {
  content: WebPushContent;
  sample?: Record<string, unknown>;
  surface?: 'desktop' | 'android';
  siteName?: string;
}) {
  const title = applyPersonalization(content.title || 'Notification title', sample);
  const body = applyPersonalization(content.body || 'Notification body text preview goes here.', sample);
  const actions = (content.actions ?? []).slice(0, 2);

  const Card = (
    <div className="w-full max-w-[380px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      {content.image_url && (
        <div className="h-36 w-full bg-slate-100">
          <img src={content.image_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex gap-3 p-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {content.icon_url ? (
            <img src={content.icon_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <Globe className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-slate-600">{body}</p>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
            <Globe className="h-3 w-3" />
            Chrome · {siteName}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <X className="h-3.5 w-3.5" />
          <MoreHorizontal className="h-3.5 w-3.5" />
        </div>
      </div>
      {actions.length > 0 && (
        <div className="flex border-t border-slate-100">
          {actions.map((a, i) => (
            <div
              key={i}
              className="flex-1 border-r border-slate-100 py-2 text-center text-[12px] font-semibold text-[#1a73e8] last:border-r-0"
            >
              {a.title || `Action ${i + 1}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (surface === 'android') {
    return (
      <div className="mx-auto w-[320px] overflow-hidden rounded-[2rem] border-[10px] border-slate-900 bg-slate-800 shadow-xl">
        <div className="bg-gradient-to-b from-slate-700 to-slate-800 p-3">
          <div className="rounded-xl bg-white/95 p-3 shadow-lg">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
              <Globe className="h-3 w-3" /> Chrome • now
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {content.icon_url && <img src={content.icon_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-slate-900">{title}</p>
                <p className="line-clamp-2 text-[12px] text-slate-600">{body}</p>
              </div>
            </div>
            {content.image_url && (
              <img src={content.image_url} alt="" className="mt-2 h-28 w-full rounded-lg object-cover" />
            )}
            {actions.length > 0 && (
              <div className="mt-2 flex gap-4 pl-11 text-[12px] font-bold uppercase tracking-wide text-[#1a73e8]">
                {actions.map((a, i) => (
                  <span key={i}>{a.title || `Action ${i + 1}`}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <BrowserFrame url={siteName}>{Card}</BrowserFrame>;
}
