import { useState } from 'react';
import { Sparkles, Wand2, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  AI_FORM_EXAMPLES,
  generateAndUploadBanner,
  generateFormWithAi,
  type AiFormDraft,
} from '@/lib/form-ai';

type Props = {
  onGenerated: (draft: AiFormDraft) => void;
  tenantId: string;
  environment: string;
};

const STEPS = [
  'Understanding your use case…',
  'Designing field layout…',
  'Applying brand theme…',
  'Generating banner artwork…',
];

export function StudioAiPanel({ onGenerated, tenantId, environment }: Props) {
  const [prompt, setPrompt] = useState('');
  const [generateBanner, setGenerateBanner] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');

  const run = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setStepIdx(0);

    const interval = window.setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }, 700);

    try {
      let draft = await generateFormWithAi(prompt.trim(), { generateBanner, tenantId, environment });

      if (generateBanner) {
        const banner = await generateAndUploadBanner(draft, tenantId, environment);
        draft = { ...draft, banner, settings: { ...draft.settings, banner, theme: draft.theme } };
      }

      onGenerated(draft);
      setPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">AI Form Generator</h3>
          <p className="text-[11px] text-slate-500">Describe your form and AI picks fields, layout, theme, and banner.</p>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        placeholder="e.g. Create a webinar registration form with company and job title fields, teal theme, and a hero banner"
        className="w-full rounded-xl border border-violet-100 bg-white/80 px-3 py-2.5 text-xs shadow-inner focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-200"
      />

      <div className="flex flex-wrap gap-1.5">
        {AI_FORM_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            className="rounded-full border border-violet-100 bg-white px-2.5 py-1 text-[10px] text-violet-700 hover:bg-violet-50"
          >
            {ex.length > 42 ? `${ex.slice(0, 42)}…` : ex}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={generateBanner}
          onChange={(e) => setGenerateBanner(e.target.checked)}
          className="rounded border-violet-300 text-violet-600"
        />
        <ImageIcon className="h-3.5 w-3.5 text-violet-500" />
        Generate AI banner image
      </label>

      {loading && (
        <div className="rounded-lg border border-violet-100 bg-white/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-violet-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {STEPS[stepIdx]}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-violet-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Button
        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-xs"
        onClick={run}
        disabled={loading || !prompt.trim()}
      >
        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
        {loading ? 'Generating…' : 'Generate with AI'}
      </Button>
    </div>
  );
}
