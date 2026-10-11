import { Plus, Trash2, FileText, CheckCircle2, Clock, Library } from 'lucide-react';
import { SectionCard, Field, fieldInput, TabHeading } from '../studio-ui';
import type { TabProps } from '../types';
import { newId } from '../types';
import type { ChatBotKnowledgeSource } from '@/lib/chatbots';

const SOURCE_TYPES: ChatBotKnowledgeSource['source_type'][] = [
  'manual_text', 'faq', 'content_block', 'document', 'knowledge_article', 'url', 'product_catalog', 'schema_data',
];

export function KnowledgeTab({ draft, update }: TabProps) {
  const sources = draft.knowledgeSources;
  const setSources = (next: ChatBotKnowledgeSource[]) => update((d) => ({ ...d, knowledgeSources: next }));

  const addSource = () => {
    setSources([
      ...sources,
      {
        id: newId(), chatbot_id: draft.bot.id, source_type: 'manual_text', source_name: 'New source',
        source_ref: null, content: '', status: 'active', indexing_status: 'pending', last_indexed_at: null,
        sort_order: sources.length,
      },
    ]);
  };

  const patchSource = (id: string, patch: Partial<ChatBotKnowledgeSource>) => setSources(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-5">
      <TabHeading title="Knowledge Sources" description="The bot retrieves relevant snippets from these per turn — never the whole base at once." />

      <div className="flex justify-end">
        <button type="button" onClick={addSource} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-brand-700">
          <Plus className="h-3.5 w-3.5" /> Add Source
        </button>
      </div>

      {sources.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Library className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No knowledge sources yet. The bot will rely only on the Chat Context configuration.</p>
        </div>
      )}

      {sources.map((source) => (
        <SectionCard
          key={source.id}
          icon={FileText}
          title={source.source_name || 'Untitled source'}
          description={source.source_type.replace('_', ' ')}
          action={
            <div className="flex items-center gap-2">
              {source.indexing_status === 'indexed' ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Indexed</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Clock className="h-3.5 w-3.5" /> Pending</span>
              )}
              <button type="button" onClick={() => setSources(sources.filter((s) => s.id !== source.id))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Source Name">
              <input className={fieldInput} value={source.source_name} onChange={(e) => patchSource(source.id, { source_name: e.target.value })} />
            </Field>
            <Field label="Source Type">
              <select className={fieldInput} value={source.source_type} onChange={(e) => patchSource(source.id, { source_type: e.target.value as ChatBotKnowledgeSource['source_type'] })}>
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </Field>
            {source.source_type === 'url' && (
              <Field label="URL" className="col-span-2">
                <input className={fieldInput} value={source.source_ref ?? ''} onChange={(e) => patchSource(source.id, { source_ref: e.target.value })} placeholder="https://…" />
              </Field>
            )}
            <Field label="Content" className="col-span-2">
              <textarea className={fieldInput} rows={5} value={source.content ?? ''} onChange={(e) => patchSource(source.id, { content: e.target.value })} placeholder="Paste FAQ text, policy copy, product details…" />
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-brand-600" checked={source.status === 'active'} onChange={(e) => patchSource(source.id, { status: e.target.checked ? 'active' : 'inactive' })} />
              <span className="text-xs font-semibold text-slate-700">Active</span>
            </label>
          </div>
        </SectionCard>
      ))}

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        Sources are marked "Indexed" on save. At runtime the assistant keyword-matches the visitor's message and injects only the top matches.
      </div>
    </div>
  );
}
