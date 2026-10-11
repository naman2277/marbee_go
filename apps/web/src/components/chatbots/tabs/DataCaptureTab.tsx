import { Plus, Trash2, ChevronUp, ChevronDown, ShieldAlert, ClipboardList, Shield, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, fieldInput, fieldInputSm, TabHeading } from '../studio-ui';
import type { TabProps } from '../types';
import { newId } from '../types';
import type { ChatBotField, ChatBotFieldDataType } from '@/lib/chatbots';

const DATA_TYPES: ChatBotFieldDataType[] = ['string', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'email', 'phone', 'json'];

const COMMON_FIELDS: Array<{ field_key: string; display_label: string; data_type: ChatBotFieldDataType }> = [
  { field_key: 'first_name', display_label: 'First Name', data_type: 'string' },
  { field_key: 'last_name', display_label: 'Last Name', data_type: 'string' },
  { field_key: 'email', display_label: 'Email', data_type: 'email' },
  { field_key: 'mobile', display_label: 'Mobile', data_type: 'phone' },
  { field_key: 'company', display_label: 'Company', data_type: 'string' },
  { field_key: 'requirement', display_label: 'Requirement', data_type: 'string' },
  { field_key: 'budget', display_label: 'Budget', data_type: 'decimal' },
  { field_key: 'preferred_date', display_label: 'Preferred Date', data_type: 'date' },
];

function PillToggle({ active, onClick, icon: Icon, label, activeClass }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; activeClass: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
        active ? activeClass : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600',
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

export function DataCaptureTab({ draft, update }: TabProps) {
  const fields = draft.fields;
  const setFields = (next: ChatBotField[]) => update((d) => ({ ...d, fields: next }));

  const nextFieldKey = () => {
    const used = new Set(fields.map((f) => f.field_key));
    let n = fields.length + 1;
    while (used.has(`field_${n}`)) n += 1;
    return `field_${n}`;
  };

  const addField = (preset?: Partial<ChatBotField>) => {
    setFields([
      ...fields,
      {
        id: newId(), chatbot_id: draft.bot.id, field_key: preset?.field_key || nextFieldKey(),
        display_label: preset?.display_label || 'New Field', description: null,
        data_type: preset?.data_type || 'string', required: false, validation: {},
        collection_order: fields.length, ask_question: null, retry_count: 2, default_value: null, pii_flag: false,
      },
    ]);
  };

  const patch = (id: string, p: Partial<ChatBotField>) => setFields(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= fields.length) return;
    const next = [...fields];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setFields(next.map((f, i) => ({ ...f, collection_order: i })));
  };

  const usedKeys = new Set(fields.map((f) => f.field_key));
  const requiredCount = fields.filter((f) => f.required).length;

  return (
    <div className="space-y-5">
      <TabHeading title="Data Capture" description="Fields the bot collects during conversation, one at a time. Required fields qualify the lead." />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{fields.length} field{fields.length === 1 ? '' : 's'}</span>
          {requiredCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700"><Star className="h-3 w-3" /> {requiredCount} required</span>}
        </div>
        <div className="flex items-center gap-2">
          <select
            className={`${fieldInputSm} w-48`}
            value=""
            onChange={(e) => { const preset = COMMON_FIELDS.find((f) => f.field_key === e.target.value); if (preset && !usedKeys.has(preset.field_key)) addField(preset); }}
          >
            <option value="">+ Add common field…</option>
            {COMMON_FIELDS.filter((f) => !usedKeys.has(f.field_key)).map((f) => <option key={f.field_key} value={f.field_key}>{f.display_label}</option>)}
          </select>
          <button type="button" onClick={() => addField()} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-brand-700">
            <Plus className="h-3.5 w-3.5" /> Custom Field
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No fields yet</p>
          <p className="mt-1 text-xs text-slate-400">Add a common field or a custom one — the bot will collect these during the chat.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={f.id} className={cn('rounded-2xl border bg-white p-4 shadow-2xs transition', f.required ? 'border-amber-200' : 'border-slate-200')}>
              <div className="flex items-start gap-3">
                {/* Order */}
                <div className="flex flex-col items-center pt-6 text-slate-300">
                  <button type="button" onClick={() => move(f.id, -1)} disabled={i === 0} className="hover:text-slate-600 disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /></button>
                  <span className="text-[10px] font-bold text-slate-400">{i + 1}</span>
                  <button type="button" onClick={() => move(f.id, 1)} disabled={i === fields.length - 1} className="hover:text-slate-600 disabled:opacity-30" title="Move down"><ChevronDown className="h-4 w-4" /></button>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="grid grid-cols-12 gap-3">
                    <Field label="Display Label" className="col-span-5">
                      <input className={fieldInput} value={f.display_label} onChange={(e) => patch(f.id, { display_label: e.target.value })} placeholder="First Name" />
                    </Field>
                    <Field label="Field Key" className="col-span-4" hint="Column key used in mapping.">
                      <input className={`${fieldInput} font-mono text-xs`} value={f.field_key} onChange={(e) => patch(f.id, { field_key: e.target.value.replace(/\s+/g, '_') })} placeholder="first_name" />
                    </Field>
                    <Field label="Type" className="col-span-3">
                      <select className={fieldInput} value={f.data_type} onChange={(e) => patch(f.id, { data_type: e.target.value as ChatBotFieldDataType })}>
                        {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                  </div>

                  <Field label="Ask Question" hint="How the bot naturally asks for this field.">
                    <input className={fieldInput} value={f.ask_question ?? ''} placeholder={`What's your ${f.display_label.toLowerCase()}?`} onChange={(e) => patch(f.id, { ask_question: e.target.value })} />
                  </Field>

                  <div className="flex flex-wrap items-center gap-2">
                    <PillToggle active={f.required} onClick={() => patch(f.id, { required: !f.required })} icon={Star} label="Required" activeClass="border-amber-200 bg-amber-50 text-amber-700" />
                    <PillToggle active={f.pii_flag} onClick={() => patch(f.id, { pii_flag: !f.pii_flag })} icon={Shield} label="PII" activeClass="border-purple-200 bg-purple-50 text-purple-700" />
                    <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      Retry
                      <input type="number" min={0} max={5} className={`${fieldInputSm} w-14`} value={f.retry_count} onChange={(e) => patch(f.id, { retry_count: Number(e.target.value) })} />
                    </label>
                  </div>
                </div>

                {/* Delete */}
                <button type="button" onClick={() => setFields(fields.filter((x) => x.id !== f.id))} className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove field">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        Fields flagged <b className="mx-1 font-semibold text-purple-600">PII</b> are masked in the Conversations view (e.g. <code className="mx-1">n***@example.com</code>) and follow the captured-data retention window.
      </div>
    </div>
  );
}
