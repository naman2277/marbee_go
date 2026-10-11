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

const GENERATION_STEPS = [
  'Understanding your use case…',
  'Designing field layout…',
  'Applying brand theme…',
  'Generating banner artwork…',
];

export function FormAiAssistant({ onGenerated, tenantId, environment }: Props) {
  const [prompt, setPrompt] = useState('');
  const [generateBanner, setGenerateBanner] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');

  const runGeneration = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setStepIdx(0);

    const interval = window.setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, GENERATION_STEPS.length - 1));
    }, 700);

    try {
      let draft = await generateFormWithAi(prompt.trim(), {
        generateBanner,
        tenantId,
        environment,
      });

      if (generateBanner) {
        const banner = await generateAndUploadBanner(draft, tenantId, environment);
        draft = {
          ...draft,
          banner,
          settings: { ...draft.settings, banner, theme: draft.theme },
        };
      }

      onGenerated(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">AI Form Assistant</h3>
          <p className="text-sm text-slate-600">
            Describe the form you need — AI picks fields, layout, theme, and optional banner art.
          </p>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        placeholder="e.g. Create a webinar registration form for a fintech event with company and job title fields, modern teal theme, and a hero banner"
        className="w-full rounded-xl border border-violet-100 bg-white/80 px-4 py-3 text-sm shadow-inner focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {AI_FORM_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            className="rounded-full border border-violet-100 bg-white px-3 py-1 text-xs text-violet-700 hover:bg-violet-50"
          >
            {ex.length > 52 ? `${ex.slice(0, 52)}…` : ex}
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={generateBanner}
          onChange={(e) => setGenerateBanner(e.target.checked)}
          className="rounded border-violet-300 text-violet-600"
        />
        <ImageIcon className="h-4 w-4 text-violet-500" />
        Generate AI banner image for form header
      </label>

      {loading && (
        <div className="mt-4 rounded-xl border border-violet-100 bg-white/70 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-violet-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            {GENERATION_STEPS[stepIdx]}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${((stepIdx + 1) / GENERATION_STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <Button
        className="mt-4 w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
        onClick={runGeneration}
        disabled={loading || !prompt.trim()}
      >
        <Wand2 className="mr-2 h-4 w-4" />
        {loading ? 'Generating form…' : 'Generate with AI'}
      </Button>
    </div>
  );
}
