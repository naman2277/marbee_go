import { useState } from 'react';
import { X, FileText, LayoutTemplate, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import type { LandingContent } from '@/lib/landing-pages';
import { OOTB_LANDING_PAGE_TEMPLATES, OOTB_TEMPLATE_CATEGORIES } from '@/lib/landing-page-templates';
import { AI_PAGE_EXAMPLES, generateLandingPageWithAi } from '@/lib/landing-ai';

type Props = {
  onClose: () => void;
  onCreate: (name: string, content?: LandingContent) => void;
  loading?: boolean;
  error?: string;
  tenantId: string;
  environment: string;
};

type Mode = 'blank' | 'template' | 'ai';

export function NewLandingPageModal({ onClose, onCreate, loading, error, tenantId, environment }: Props) {
  const [mode, setMode] = useState<Mode>('blank');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const template = OOTB_LANDING_PAGE_TEMPLATES.find((t) => t.id === templateId);

  const submit = async () => {
    if (mode === 'blank') {
      if (name.trim()) onCreate(name.trim());
      return;
    }
    if (mode === 'template') {
      if (template) onCreate((name.trim() || template.name), template.content);
      return;
    }
    // ai
    if (!prompt.trim()) return;
    setAiBusy(true);
    setAiError('');
    try {
      const gen = await generateLandingPageWithAi(prompt, { tenantId, environment });
      onCreate(name.trim() || gen.name || deriveName(prompt), gen.content);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const canSubmit =
    mode === 'blank' ? Boolean(name.trim()) : mode === 'template' ? Boolean(template) : Boolean(prompt.trim());
  const busy = Boolean(loading) || aiBusy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-900">New landing page</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-100 p-4">
          {(
            [
              ['blank', FileText, 'Blank', 'Start from scratch'],
              ['template', LayoutTemplate, 'Template', 'Pick a starting point'],
              ['ai', Sparkles, 'AI', 'Describe your page'],
            ] as Array<[Mode, typeof FileText, string, string]>
          ).map(([m, Icon, label, hint]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                mode === m ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className={`h-4 w-4 ${mode === m ? 'text-brand-600' : 'text-slate-400'}`} />
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{label}</p>
              <p className="text-[11px] text-slate-500">{hint}</p>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <label className="mb-4 block text-sm font-medium text-slate-700">
            Page name {mode !== 'blank' && <span className="text-slate-400">(optional)</span>}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'blank' ? 'e.g. Summer campaign' : 'Leave blank to auto-name'}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && canSubmit && !busy && submit()}
            />
          </label>

          {mode === 'blank' && (
            <p className="text-xs text-slate-400">Opens the studio with an empty canvas. Add blocks from the library.</p>
          )}

          {mode === 'template' && (
            <div className="space-y-5">
              {OOTB_TEMPLATE_CATEGORIES.map((cat) => {
                const items = OOTB_LANDING_PAGE_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{cat}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTemplateId(t.id)}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            templateId === t.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.description}</p>
                          <p className="mt-1.5 text-[10px] text-slate-400">{t.content.sections.length} blocks</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mode === 'ai' && (
            <div className="space-y-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="e.g. A SaaS landing page for an AI meeting-notes app with pricing and testimonials"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <div className="flex flex-wrap gap-1.5">
                {AI_PAGE_EXAMPLES.slice(0, 3).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] text-slate-500 hover:bg-slate-50"
                  >
                    {ex.length > 46 ? `${ex.slice(0, 46)}…` : ex}
                  </button>
                ))}
              </div>
              {aiError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{aiError}</p>}
              <p className="text-[11px] text-slate-400">
                Uses the landing-ai function when available, otherwise a template blueprint. You can edit everything after.
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || busy} onClick={submit}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {mode === 'ai' ? (aiBusy ? 'Generating…' : 'Generate & create') : loading ? 'Creating…' : 'Create page'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function deriveName(prompt: string): string {
  return (
    prompt
      .replace(/^(a|an|the)\s+/i, '')
      .split(/[.,\n]/)[0]
      .slice(0, 48)
      .trim() || 'Untitled page'
  );
}
