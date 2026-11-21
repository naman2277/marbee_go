import { useState } from 'react';
import {
  Code,
  FileText,
  Laptop,
  Smartphone,
  Tablet,
  Zap,
} from 'lucide-react';
import type { EmailContent } from '@/lib/content-templates';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';
type FormatMode = 'html' | 'amp' | 'plain';

type Props = {
  content: EmailContent;
  fromName?: string;
  fromEmail?: string;
};

export function EmailTemplatePreview({
  content,
  fromName = 'Marbee Brand',
  fromEmail = 'hello@yourdomain.com',
}: Props) {
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [format, setFormat] = useState<FormatMode>('html');

  const maxDeviceWidth = device === 'mobile' ? '375px' : device === 'tablet' ? '520px' : '640px';

  return (
    <div className="space-y-4">
      {/* Top Preview Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
        {/* Device Switcher */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Device:
          </span>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                device === 'desktop'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>Desktop (Web)</span>
            </button>
            <button
              type="button"
              onClick={() => setDevice('tablet')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                device === 'tablet'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tablet className="h-3.5 w-3.5" />
              <span>Tablet</span>
            </button>
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                device === 'mobile'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Mobile</span>
            </button>
          </div>
        </div>

        {/* Format Switcher */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Format:
          </span>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setFormat('html')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                format === 'html'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              <span>HTML Email</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat('amp')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                format === 'amp'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              <span>AMP ⚡</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat('plain')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                format === 'plain'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Plain Text</span>
            </button>
          </div>
        </div>
      </div>

      {/* Rendered Frame */}
      <div className="flex justify-center p-4 bg-slate-100/80 rounded-3xl min-h-[480px] overflow-x-auto">
        <div
          className={`w-full transition-all duration-300 shadow-2xl overflow-hidden ${
            device === 'mobile'
              ? 'rounded-[36px] border-[8px] border-slate-900'
              : device === 'tablet'
              ? 'rounded-[28px] border-[6px] border-slate-800'
              : 'rounded-2xl border border-slate-200/90'
          }`}
          style={{ maxWidth: maxDeviceWidth }}
        >
          {/* Mobile Camera Notch */}
          {device === 'mobile' && (
            <div className="h-5 w-full bg-slate-900 flex items-center justify-center">
              <div className="h-3 w-20 bg-slate-950 rounded-b-lg" />
            </div>
          )}

          {/* Email Client Header */}
          <div className="border-b border-slate-200/80 bg-white px-5 py-3.5">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <div className="flex items-center gap-2 truncate">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white shadow-2xs">
                  {fromName.charAt(0).toUpperCase()}
                </span>
                <span className="font-bold text-slate-900 truncate">{fromName}</span>
                <span className="text-[11px] text-slate-400 font-mono truncate">&lt;{fromEmail}&gt;</span>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">Just now</span>
            </div>

            <h3 className="font-black text-slate-900 text-sm">{content.subject || 'No Subject Defined'}</h3>
            {content.preheader && (
              <p className="mt-0.5 text-xs text-slate-500 truncate">{content.preheader}</p>
            )}
          </div>

          {/* Body Content by Format */}
          <div className="bg-white min-h-[350px] max-h-[520px] overflow-y-auto p-5">
            {format === 'html' && (
              <div
                className="email-html-preview prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html:
                    content.html_body ||
                    '<div style="text-align:center;padding:40px;color:#94a3b8;"><p style="font-size:14px;font-weight:600;">No HTML body designed yet</p><p style="font-size:12px;">Use Step 1 (Message & Content) to add blocks or write HTML.</p></div>',
                }}
              />
            )}

            {format === 'amp' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200/80 px-3 py-1.5 text-amber-900 text-xs font-semibold">
                  <Zap className="h-3.5 w-3.5 text-amber-600" />
                  <span>AMP for Email (Interactive Dynamic Rendering)</span>
                </div>
                <div
                  className="email-amp-preview prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html:
                      content.amp_html ||
                      content.html_body ||
                      '<div style="text-align:center;padding:40px;color:#94a3b8;"><p style="font-size:14px;font-weight:600;">AMP content will compile from your visual blocks</p></div>',
                  }}
                />
              </div>
            )}

            {format === 'plain' && (
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/80 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                {content.plain_text ||
                  content.text_body ||
                  'No plain text alternative body configured.'}
              </div>
            )}
          </div>

          {/* Mobile Home Bar */}
          {device === 'mobile' && (
            <div className="h-5 w-full bg-slate-900 flex items-center justify-center">
              <div className="h-1 w-20 bg-slate-700 rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
