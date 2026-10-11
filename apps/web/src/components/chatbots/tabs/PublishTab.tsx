import { useState } from 'react';
import { Copy, Check, ExternalLink, CheckCircle2, XCircle, QrCode } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import type { TabProps } from '../types';
import {
  chatBotPublicUrl, buildIframeSnippet, buildWidgetSnippet, buildQrCodeUrl,
  type PublishReadiness, type ChatBotPublishConfig,
} from '@/lib/chatbots';

const inputClass = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none';

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[10.5px] leading-relaxed text-emerald-300 whitespace-pre-wrap">{value}</pre>
    </div>
  );
}

export function PublishTab({ draft, update, readiness }: TabProps & { readiness: PublishReadiness }) {
  const publish = draft.publish;

  if (!publish) return <p className="text-sm text-slate-400">Publish configuration is provisioned automatically when the bot is created.</p>;

  const set = (patch: Partial<ChatBotPublishConfig>) => update((d) => ({ ...d, publish: d.publish ? { ...d.publish, ...patch } : d.publish }));

  const publicUrl = chatBotPublicUrl(publish.public_slug);
  const isPublished = draft.bot.status === 'published';

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Publish Readiness" />
        <div className="p-6 space-y-2">
          {readiness.ready ? (
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Ready to Publish</p>
          ) : (
            <div className="space-y-1.5">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700"><XCircle className="h-4 w-4" /> Configuration Issues</p>
              <ul className="list-disc pl-6 text-xs text-slate-600 space-y-1">
                {readiness.issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          )}
          {!isPublished && readiness.ready && (
            <p className="text-xs text-slate-500">Use the Publish button in the top bar to go live — this creates a new version snapshot.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Public Chat URL" action={<label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={publish.public_url_enabled} onChange={(e) => set({ public_url_enabled: e.target.checked })} /> Enabled</label>} />
        <div className="p-6 space-y-3">
          <CopyBlock label="Public URL" value={publicUrl} />
          <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
          </a>
        </div>
      </Card>

      <Card>
        <CardHeader title="Iframe Embed" action={<label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={publish.iframe_enabled} onChange={(e) => set({ iframe_enabled: e.target.checked })} /> Enabled</label>} />
        <div className="grid grid-cols-4 gap-3 p-6 pb-3">
          <label className="block"><span className="block text-[11px] font-semibold text-slate-700 mb-1">Width</span><input className={inputClass} value={publish.iframe_width} onChange={(e) => set({ iframe_width: e.target.value })} /></label>
          <label className="block"><span className="block text-[11px] font-semibold text-slate-700 mb-1">Height</span><input className={inputClass} value={publish.iframe_height} onChange={(e) => set({ iframe_height: e.target.value })} /></label>
          <label className="block"><span className="block text-[11px] font-semibold text-slate-700 mb-1">Border Radius</span><input className={inputClass} value={publish.iframe_border_radius} onChange={(e) => set({ iframe_border_radius: e.target.value })} /></label>
          <label className="block"><span className="block text-[11px] font-semibold text-slate-700 mb-1">Theme</span>
            <select className={inputClass} value={publish.iframe_theme} onChange={(e) => set({ iframe_theme: e.target.value as ChatBotPublishConfig['iframe_theme'] })}>
              <option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </label>
        </div>
        <div className="px-6 pb-6"><CopyBlock label="Iframe Snippet" value={buildIframeSnippet(publish)} /></div>
      </Card>

      <Card>
        <CardHeader title="Website Widget" action={<label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={publish.widget_enabled} onChange={(e) => set({ widget_enabled: e.target.checked })} /> Enabled</label>} />
        <div className="grid grid-cols-3 gap-3 p-6 pb-3">
          <label className="block"><span className="block text-[11px] font-semibold text-slate-700 mb-1">Position</span>
            <select className={inputClass} value={publish.widget_position} onChange={(e) => set({ widget_position: e.target.value as ChatBotPublishConfig['widget_position'] })}>
              <option value="bottom-right">Bottom Right</option><option value="bottom-left">Bottom Left</option>
            </select>
          </label>
          <label className="block"><span className="block text-[11px] font-semibold text-slate-700 mb-1">Primary Color</span><input type="color" className="h-8 w-full rounded-lg border border-slate-200" value={publish.widget_primary_color} onChange={(e) => set({ widget_primary_color: e.target.value })} /></label>
          <label className="block"><span className="block text-[11px] font-semibold text-slate-700 mb-1">Greeting</span><input className={inputClass} value={publish.widget_greeting ?? ''} onChange={(e) => set({ widget_greeting: e.target.value })} /></label>
        </div>
        <div className="px-6 pb-6"><CopyBlock label="Widget Script" value={buildWidgetSnippet(publish)} /></div>
      </Card>

      <Card>
        <CardHeader title="QR Code" />
        <div className="flex items-center gap-4 p-6">
          <img src={buildQrCodeUrl(publicUrl)} alt="QR code" className="h-28 w-28 rounded-lg border border-slate-200" />
          <div className="flex items-center gap-2 text-xs text-slate-500"><QrCode className="h-4 w-4" /> Scan to open the public chat URL on a phone.</div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Branding" />
        <div className="p-6">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={draft.bot.show_powered_by} onChange={(e) => update((d) => ({ ...d, bot: { ...d.bot, show_powered_by: e.target.checked } }))} />
            Show "{draft.bot.powered_by_text}" branding
          </label>
        </div>
      </Card>

      <p className="text-[11px] text-slate-400">Changes here are saved with the "Save Draft" button in the top bar, same as every other tab.</p>
    </div>
  );
}
