import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Rocket, Loader2, CheckCircle2, AlertTriangle, Sliders, Cpu,
  BookOpen, Library, ClipboardList, Database, MousePointerClick, FlaskConical,
  MessagesSquare, BarChart3, Share2, Bot, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ChatBotFullConfig, type ChatBotStatus, updateChatBot, saveChatBotFields,
  saveChatBotMappings, saveChatBotCtas, saveChatBotKnowledgeSources, saveChatBotPublishConfig,
  publishChatBot, checkPublishReadiness,
} from '@/lib/chatbots';
import { draftFromFull, TAB_KEYS, TAB_LABELS, type AiProviderOption, type ChatBotDraft, type TabKey } from './types';

// Supabase throws plain objects ({message, details, hint, code}), not Error
// instances — extract a useful message from whatever is thrown.
function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    return e.message || e.details || e.hint || (e.code ? `Error ${e.code}` : fallback);
  }
  return fallback;
}
import type { SchemaWithFields } from '@/lib/fetch-schemas';
import { ChatBotPreview } from './ChatBotPreview';
import { ConfigurationTab } from './tabs/ConfigurationTab';
import { LlmConfigTab } from './tabs/LlmConfigTab';
import { ContextTab } from './tabs/ContextTab';
import { KnowledgeTab } from './tabs/KnowledgeTab';
import { DataCaptureTab } from './tabs/DataCaptureTab';
import { SchemaMappingTab } from './tabs/SchemaMappingTab';
import { CtaTab } from './tabs/CtaTab';
import { TestTab } from './tabs/TestTab';
import { ConversationsTab } from './tabs/ConversationsTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';
import { PublishTab } from './tabs/PublishTab';

const STATUS_STYLE: Record<ChatBotStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  testing: 'bg-amber-50 text-amber-700 ring-amber-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  archived: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const TAB_ICONS: Record<TabKey, React.ComponentType<{ className?: string }>> = {
  configuration: Sliders, llm: Cpu, context: BookOpen, knowledge: Library,
  'data-capture': ClipboardList, 'schema-mapping': Database, cta: MousePointerClick,
  test: FlaskConical, conversations: MessagesSquare, analytics: BarChart3, publish: Share2,
};

const NAV_GROUPS: Array<{ label: string; tabs: TabKey[] }> = [
  { label: 'Setup', tabs: ['configuration', 'llm', 'context', 'knowledge'] },
  { label: 'Collect', tabs: ['data-capture', 'schema-mapping'] },
  { label: 'Engage', tabs: ['cta'] },
  { label: 'Operate', tabs: ['test', 'conversations', 'analytics'] },
  { label: 'Launch', tabs: ['publish'] },
];

const PREVIEW_TABS = new Set<TabKey>(['configuration', 'llm', 'context', 'cta']);

type Completion = 'complete' | 'attention' | 'neutral';

function computeCompletion(draft: ChatBotDraft, readinessReady: boolean): Record<TabKey, Completion> {
  const bot = draft.bot;
  return {
    configuration: bot.name.trim() && bot.welcome_message.trim() ? 'complete' : 'attention',
    llm: bot.llm_provider_id ? 'complete' : 'attention',
    context: bot.context.business_context.trim() ? 'complete' : 'attention',
    knowledge: draft.knowledgeSources.length > 0 ? 'complete' : 'neutral',
    'data-capture': draft.fields.length > 0 ? 'complete' : 'neutral',
    'schema-mapping':
      bot.enable_data_capture && bot.target_schema_id
        ? draft.mappings.length > 0 ? 'complete' : 'attention'
        : 'neutral',
    cta: draft.ctas.length > 0 ? 'complete' : 'neutral',
    test: 'neutral',
    conversations: 'neutral',
    analytics: 'neutral',
    publish: readinessReady ? 'complete' : 'attention',
  };
}

export function ChatBotStudio({
  full, schemas, providers, onReload,
}: {
  full: ChatBotFullConfig;
  schemas: SchemaWithFields[];
  providers: AiProviderOption[];
  onReload: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get('tab') as TabKey) || 'configuration';
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_KEYS.includes(initialTab) ? initialTab : 'configuration');
  const [draft, setDraft] = useState(() => draftFromFull(full));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const update = (updater: (d: ChatBotDraft) => ChatBotDraft) => {
    setDraft((prev) => updater(prev));
    setDirty(true);
  };

  const readiness = useMemo(() => checkPublishReadiness({
    bot: draft.bot, fields: draft.fields, mappings: draft.mappings, ctas: draft.ctas, knowledgeSources: draft.knowledgeSources, publishConfig: draft.publish,
  }), [draft]);

  const completion = useMemo(() => computeCompletion(draft, readiness.ready), [draft, readiness.ready]);

  const goTab = (tab: TabKey) => {
    setActiveTab(tab);
    setParams((p) => { p.set('tab', tab); return p; }, { replace: true });
  };

  const persistDraft = async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      const { bot } = draft;
      await updateChatBot(bot.id, {
        name: bot.name, description: bot.description, avatar_url: bot.avatar_url,
        welcome_message: bot.welcome_message, placeholder_text: bot.placeholder_text,
        primary_language: bot.primary_language, supported_languages: bot.supported_languages,
        business_name: bot.business_name, powered_by_text: bot.powered_by_text, show_powered_by: bot.show_powered_by,
        conversation_timeout_minutes: bot.conversation_timeout_minutes, max_conversation_length: bot.max_conversation_length,
        enable_conversation_history: bot.enable_conversation_history, enable_sentiment_analysis: bot.enable_sentiment_analysis,
        enable_data_capture: bot.enable_data_capture,
        llm_provider_id: bot.llm_provider_id, llm_temperature: bot.llm_temperature, llm_max_output_tokens: bot.llm_max_output_tokens,
        llm_system_instruction: bot.llm_system_instruction, llm_response_style: bot.llm_response_style,
        llm_streaming: bot.llm_streaming, llm_timeout_seconds: bot.llm_timeout_seconds, llm_retry_count: bot.llm_retry_count,
        context: bot.context, target_schema_id: bot.target_schema_id, insert_mode: bot.insert_mode,
        upsert_key: bot.upsert_key, duplicate_handling: bot.duplicate_handling, validation_behaviour: bot.validation_behaviour,
        conversation_retention_days: bot.conversation_retention_days, message_retention_days: bot.message_retention_days,
        captured_data_retention_days: bot.captured_data_retention_days, anonymous_session_retention_days: bot.anonymous_session_retention_days,
      });
      await Promise.all([
        saveChatBotFields(bot.id, bot.tenant_id, bot.environment, draft.fields),
        saveChatBotMappings(bot.id, bot.tenant_id, bot.environment, draft.mappings),
        saveChatBotCtas(bot.id, bot.tenant_id, bot.environment, draft.ctas),
        saveChatBotKnowledgeSources(bot.id, bot.tenant_id, bot.environment, draft.knowledgeSources),
        ...(draft.publish
          ? [saveChatBotPublishConfig(bot.id, {
              public_url_enabled: draft.publish.public_url_enabled,
              iframe_enabled: draft.publish.iframe_enabled,
              iframe_width: draft.publish.iframe_width,
              iframe_height: draft.publish.iframe_height,
              iframe_border_radius: draft.publish.iframe_border_radius,
              iframe_theme: draft.publish.iframe_theme,
              iframe_position: draft.publish.iframe_position,
              widget_enabled: draft.publish.widget_enabled,
              widget_position: draft.publish.widget_position,
              widget_greeting: draft.publish.widget_greeting,
              widget_primary_color: draft.publish.widget_primary_color,
              api_enabled: draft.publish.api_enabled,
            })]
          : []),
      ]);
      setDirty(false);
      setSavedAt(Date.now());
      onReload();
      return true;
    } catch (err) {
      setSaveError(errText(err, 'Could not save changes.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    // Instead of leaving the button inertly disabled, surface exactly why the
    // bot can't publish: jump to the Publish tab where the checklist lives.
    if (!readiness.ready) {
      goTab('publish');
      setSaveError(`${readiness.issues.length} item${readiness.issues.length === 1 ? '' : 's'} to resolve before publishing.`);
      return;
    }
    setPublishing(true);
    setSaveError(null);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const publishedBot = await publishChatBot(draft.bot.id);
      // Reflect the new status/version in the live draft immediately — onReload
      // refetches but the draft state won't re-derive from it on its own.
      setDraft((d) => ({ ...d, bot: { ...d.bot, ...publishedBot } }));
      setDirty(false);
      setSavedAt(Date.now());
      setBanner({ kind: 'success', text: `Published — this bot is now live. Its public link is on the Publish tab.` });
      onReload();
    } catch (err) {
      const msg = errText(err, 'Could not publish this chat bot.');
      setSaveError(msg);
      setBanner({ kind: 'error', text: `Publish failed: ${msg}` });
    } finally {
      setPublishing(false);
    }
  };

  const showPreview = PREVIEW_TABS.has(activeTab);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="relative shrink-0 overflow-hidden border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-brand-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/content/chatbots" className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/15 ring-1 ring-white/20">
            {draft.bot.avatar_url ? <img src={draft.bot.avatar_url} alt="" className="h-10 w-10 object-cover" /> : <Bot className="h-5 w-5 text-white" />}
          </div>
          <div className="min-w-0">
            <input
              value={draft.bot.name}
              onChange={(e) => update((d) => ({ ...d, bot: { ...d.bot, name: e.target.value } }))}
              className="w-full max-w-xs rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-white placeholder:text-white/50 hover:bg-white/10 focus:bg-white/10 focus:outline-none"
              placeholder="Untitled bot"
            />
            <div className="flex items-center gap-2 px-1">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset', STATUS_STYLE[draft.bot.status])}>
                {draft.bot.status}
              </span>
              {draft.bot.published_version_id && draft.bot.status === 'published' && (
                <span className="text-[11px] text-white/60">live</span>
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {saveError && <span className="max-w-xs truncate text-[11px] text-rose-300">{saveError}</span>}
            {!saveError && dirty && <span className="text-[11px] text-white/60">Unsaved changes</span>}
            {!saveError && savedAt && !dirty && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>
            )}
            <button
              type="button"
              onClick={persistDraft}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Draft
            </button>
            {!readiness.ready && (
              <button
                type="button"
                onClick={() => goTab('publish')}
                title={readiness.issues.join('\n')}
                className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-300/30 hover:bg-amber-400/30"
              >
                <AlertTriangle className="h-3 w-3" /> {readiness.issues.length} to fix
              </button>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              title={!readiness.ready ? 'See what needs fixing before publishing' : 'Publish this chat bot'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                readiness.ready ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-white/80 text-slate-500 hover:bg-white',
              )}
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Publish
            </button>
          </div>
        </div>
      </header>

      {banner && (
        <div
          className={cn(
            'flex items-center justify-between gap-3 px-5 py-2.5 text-xs font-medium',
            banner.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800',
          )}
        >
          <span className="flex items-center gap-2">
            {banner.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {banner.text}
          </span>
          <button type="button" onClick={() => setBanner(null)} className="rounded px-2 py-0.5 hover:bg-black/5">Dismiss</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Nav */}
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
              <ul className="space-y-0.5">
                {group.tabs.map((key) => {
                  const Icon = TAB_ICONS[key];
                  const status = completion[key];
                  const active = activeTab === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => goTab(key)}
                        className={cn(
                          'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                          active ? 'bg-brand-50 text-brand-700 shadow-2xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} />
                        <span className="flex-1 text-left">{TAB_LABELS[key]}</span>
                        {status === 'complete' && (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        )}
                        {status === 'attention' && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className={cn('mx-auto p-6', showPreview ? 'flex max-w-6xl gap-6' : 'max-w-6xl')}>
            <div className="min-w-0 flex-1">
              {activeTab === 'configuration' && <ConfigurationTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'llm' && <LlmConfigTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'context' && <ContextTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'knowledge' && <KnowledgeTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'data-capture' && <DataCaptureTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'schema-mapping' && <SchemaMappingTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'cta' && <CtaTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'test' && <TestTab draft={draft} update={update} schemas={schemas} providers={providers} dirty={dirty} onSaveFirst={persistDraft} />}
              {activeTab === 'conversations' && <ConversationsTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'analytics' && <AnalyticsTab draft={draft} update={update} schemas={schemas} providers={providers} />}
              {activeTab === 'publish' && <PublishTab draft={draft} update={update} schemas={schemas} providers={providers} readiness={readiness} />}
            </div>

            {showPreview && (
              <aside className="hidden w-[320px] shrink-0 lg:block">
                <div className="sticky top-0">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live Preview
                  </p>
                  <ChatBotPreview draft={draft} />
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <AlertTriangle className="h-3 w-3" /> Preview reflects unsaved edits.
                  </p>
                </div>
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
