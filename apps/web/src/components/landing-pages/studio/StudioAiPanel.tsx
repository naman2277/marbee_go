/** Landing Studio — AI panel: generate, improve copy, suggest blocks, audit, SEO. */
import { useState } from 'react';
import {
  Sparkles,
  Wand2,
  ListChecks,
  Search,
  Plus,
  AlertTriangle,
  Info,
  CircleAlert,
  Loader2,
} from 'lucide-react';
import type { LandingContent, LandingSection, LandingSectionType } from '@/lib/landing-pages';
import { getBlockMeta } from '@/lib/landing-blocks';
import {
  AI_PAGE_EXAMPLES,
  COPY_ASSIST_LABELS,
  applyCopyAssist,
  auditPage,
  editableTextFields,
  generateLandingPageWithAi,
  generateSeoFromContent,
  suggestNextBlocks,
  type CopyAssistAction,
  type GeneratedPage,
  type PageIssue,
} from '@/lib/landing-ai';

type Props = {
  content: LandingContent;
  pageName: string;
  selected: LandingSection | null;
  tenantId: string;
  environment: string;
  onReplacePage: (content: LandingContent) => void;
  onApplyBlockProps: (id: string, props: LandingSection['props']) => void;
  onAddBlock: (type: LandingSectionType) => void;
  onSelect: (id: string) => void;
  onApplySeo?: (title: string, description: string) => void;
};

type Tool = 'generate' | 'improve' | 'suggest' | 'audit' | 'seo';

export function StudioAiPanel(props: Props) {
  const [tool, setTool] = useState<Tool>('generate');
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-5 border-b border-slate-100">
        {(
          [
            ['generate', Sparkles, 'Generate'],
            ['improve', Wand2, 'Improve'],
            ['suggest', Plus, 'Suggest'],
            ['audit', ListChecks, 'Audit'],
            ['seo', Search, 'SEO'],
          ] as Array<[Tool, typeof Sparkles, string]>
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
              tool === id ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tool === 'generate' && <GenerateTool {...props} />}
        {tool === 'improve' && <ImproveTool {...props} />}
        {tool === 'suggest' && <SuggestTool {...props} />}
        {tool === 'audit' && <AuditTool {...props} />}
        {tool === 'seo' && <SeoTool {...props} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function GenerateTool({ content, tenantId, environment, onReplacePage }: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeneratedPage | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const gen = await generateLandingPageWithAi(prompt, { tenantId, environment });
      setResult(gen);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Describe the page. AI drafts a full block layout — you can edit everything afterwards.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        placeholder="e.g. A SaaS landing page for an AI meeting-notes app…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {AI_PAGE_EXAMPLES.slice(0, 3).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-50"
          >
            {ex.length > 42 ? `${ex.slice(0, 42)}…` : ex}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || !prompt.trim()}
        onClick={run}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? 'Generating…' : content.sections.length ? 'Generate & replace page' : 'Generate page'}
      </button>
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {result && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-700">
            Draft ready — {result.content.sections.length} blocks
            <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] uppercase text-slate-400">
              {result.source}
            </span>
          </p>
          <div className="flex flex-wrap gap-1">
            {result.content.sections.map((s) => (
              <span key={s.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {getBlockMeta(s.type).label}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onReplacePage(result.content);
              setResult(null);
              setPrompt('');
            }}
            className="w-full rounded-lg bg-slate-900 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Apply to canvas
          </button>
          {result.source === 'local' && (
            <p className="text-[10px] text-slate-400">
              Offline draft from a template blueprint. Add an OpenAI key / deploy the landing-ai function for tailored copy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ImproveTool({ selected, onApplyBlockProps }: Props) {
  if (!selected) {
    return <p className="text-xs text-slate-400">Select a block on the canvas to improve its copy.</p>;
  }
  const fields = editableTextFields(selected);
  if (fields.length === 0) {
    return <p className="text-xs text-slate-400">This block has no text to rewrite.</p>;
  }
  const actions = Object.keys(COPY_ASSIST_LABELS) as CopyAssistAction[];
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Rewrite text on <span className="font-medium text-slate-700">{getBlockMeta(selected.type).label}</span>. Changes
        apply instantly and are undoable.
      </p>
      {fields.map((f) => (
        <div key={f.key} className="rounded-lg border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-700">{f.label}</p>
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{f.value}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onApplyBlockProps(selected.id, applyCopyAssist(selected, f.key, a))}
                className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {COPY_ASSIST_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SuggestTool({ content, onAddBlock }: Props) {
  const suggestions = suggestNextBlocks(content);
  if (suggestions.length === 0) {
    return <p className="text-xs text-slate-400">Your page already covers the essential sections. Nice.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Sections a high-converting page usually has that yours is missing:</p>
      {suggestions.map((t) => {
        const meta = getBlockMeta(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onAddBlock(t)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 p-2.5 text-left hover:border-brand-300 hover:bg-brand-50"
          >
            <meta.icon className="h-4 w-4 text-slate-400" />
            <span className="flex-1">
              <span className="block text-xs font-semibold text-slate-700">{meta.label}</span>
              <span className="block text-[10px] text-slate-400">{meta.description}</span>
            </span>
            <Plus className="h-3.5 w-3.5 text-slate-400" />
          </button>
        );
      })}
    </div>
  );
}

const ISSUE_ICON = { error: CircleAlert, warning: AlertTriangle, info: Info } as const;
const ISSUE_COLOR = {
  error: 'text-red-600 bg-red-50',
  warning: 'text-amber-600 bg-amber-50',
  info: 'text-slate-500 bg-slate-50',
} as const;

function AuditTool({ content, onSelect }: Props) {
  const issues: PageIssue[] = auditPage(content);
  const score = Math.max(0, 100 - issues.reduce((n, i) => n + (i.severity === 'error' ? 20 : i.severity === 'warning' ? 8 : 3), 0));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
        <div className="text-2xl font-bold text-slate-900">{score}</div>
        <div className="text-xs text-slate-500">
          Page health score
          <div className="text-[10px] text-slate-400">{issues.length} issue{issues.length === 1 ? '' : 's'} found</div>
        </div>
      </div>
      {issues.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">No issues found. Ship it. 🚀</p>
      ) : (
        issues.map((iss, i) => {
          const Icon = ISSUE_ICON[iss.severity];
          return (
            <button
              key={i}
              type="button"
              disabled={!iss.blockId}
              onClick={() => iss.blockId && onSelect(iss.blockId)}
              className={`flex w-full items-start gap-2 rounded-lg p-2.5 text-left text-xs ${ISSUE_COLOR[iss.severity]} ${
                iss.blockId ? 'hover:brightness-95' : 'cursor-default'
              }`}
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{iss.message}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function SeoTool({ content, pageName, onApplySeo }: Props) {
  const seo = generateSeoFromContent(content, pageName);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Generated from your hero and page content:</p>
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-[11px] font-semibold text-slate-700">Title ({seo.title.length}/60)</p>
        <p className="mt-1 text-xs text-slate-600">{seo.title}</p>
      </div>
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-[11px] font-semibold text-slate-700">Meta description ({seo.description.length}/155)</p>
        <p className="mt-1 text-xs text-slate-600">{seo.description}</p>
      </div>
      {onApplySeo && (
        <button
          type="button"
          onClick={() => onApplySeo(seo.title, seo.description)}
          className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Apply to SEO settings
        </button>
      )}
    </div>
  );
}
