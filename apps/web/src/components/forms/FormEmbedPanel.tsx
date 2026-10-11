import { useState } from 'react';
import {
  Check,
  Copy,
  Code2,
  Link2,
  Globe,
  ExternalLink,
  QrCode,
  Layers,
  Sparkles,
  Smartphone,
  Maximize2,
} from 'lucide-react';
import { Button, Card, CardHeader, Badge } from '@/components/ui';
import { getFormEmbedCode, getFormPublicUrl, type MarbeeForm } from '@/lib/forms';
import { copyText } from '@/lib/schema-export';

type Props = {
  form?: MarbeeForm;
  slug?: string;
  tenantId: string;
  environment: string;
  isPublished?: boolean;
};

export function FormEmbedPanel({ form, slug: propSlug, tenantId, environment, isPublished: propIsPublished }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [activeSnippet, setActiveSnippet] = useState<'iframe' | 'popup' | 'drawer'>('iframe');

  const slug = form?.slug ?? propSlug ?? '';
  const isPublished = form ? form.status === 'published' : (propIsPublished ?? false);
  const publicUrl = getFormPublicUrl(slug, tenantId, environment);
  const iframeEmbedCode = getFormEmbedCode(publicUrl);

  const popupEmbedCode = `<!-- Marbee Lead Capture Popup Button -->
<button onclick="window.open('${publicUrl}', 'MarbeeForm', 'width=600,height=750,scrollbars=yes');" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:10px;font-weight:bold;border:none;cursor:pointer;">
  ${form?.settings?.submit_label ?? 'Open Form'}
</button>`;

  const drawerEmbedCode = `<!-- Marbee Floating Lead Trigger -->
<div style="position:fixed;bottom:24px;right:24px;z-index:9999;">
  <a href="${publicUrl}" target="_blank" style="display:flex;align-items:center;gap:8px;background:#0f172a;color:#fff;padding:12px 20px;border-radius:999px;font-family:sans-serif;font-size:14px;font-weight:bold;text-decoration:none;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
    <span>🚀 Contact Us</span>
  </a>
</div>`;

  const handleCopy = async (id: string, text: string) => {
    await copyText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {!isPublished && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <div className="space-y-0.5">
            <p className="font-bold">Form is currently in Draft</p>
            <p className="text-amber-700">
              You can test the preview links below. Once published live, this form will capture and sync leads directly to your database.
            </p>
          </div>
          <Badge variant="warning">Draft Mode</Badge>
        </div>
      )}

      {/* 1. PUBLIC HOSTED URL CARD */}
      <Card className="border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-bold text-slate-900">Direct Public Link & QR Code</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Share this link directly in email campaigns, social media posts, SMS, or QR print flyers.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              readOnly
              value={publicUrl}
              className="w-full bg-transparent font-mono text-xs text-slate-800 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleCopy('public-url', publicUrl)}
              className="rounded-xl shadow-2xs"
            >
              {copied === 'public-url' ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </Button>

            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              <span>Open in New Tab</span>
            </a>
          </div>
        </div>
      </Card>

      {/* 2. EMBED WIDGETS & CODE GENERATOR */}
      <Card className="border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">Website Embed Snippets</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Embed this form seamlessly onto any CMS or webpage (Webflow, WordPress, Shopify, Next.js).
            </p>
          </div>

          {/* Snippet type switcher */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setActiveSnippet('iframe')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                activeSnippet === 'iframe' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Inline Iframe
            </button>
            <button
              type="button"
              onClick={() => setActiveSnippet('popup')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                activeSnippet === 'popup' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Popup Modal Button
            </button>
            <button
              type="button"
              onClick={() => setActiveSnippet('drawer')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                activeSnippet === 'drawer' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Floating Badge
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <textarea
              readOnly
              value={
                activeSnippet === 'iframe'
                  ? iframeEmbedCode
                  : activeSnippet === 'popup'
                  ? popupEmbedCode
                  : drawerEmbedCode
              }
              rows={6}
              className="w-full rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-emerald-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  'embed-code',
                  activeSnippet === 'iframe'
                    ? iframeEmbedCode
                    : activeSnippet === 'popup'
                    ? popupEmbedCode
                    : drawerEmbedCode
                )
              }
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 transition"
            >
              {copied === 'embed-code' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[11px] text-slate-400">
            Paste this snippet into your page HTML or CMS embed block where you want the form to appear.
          </p>
        </div>
      </Card>
    </div>
  );
}
