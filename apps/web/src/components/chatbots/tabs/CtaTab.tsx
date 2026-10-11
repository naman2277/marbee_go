import { Plus, Trash2, MousePointerClick } from 'lucide-react';
import { SectionCard, Field, Toggle, fieldInput, fieldInputSm, TabHeading } from '../studio-ui';
import type { TabProps } from '../types';
import { newId } from '../types';
import type { ChatBotCta, ChatBotCtaActionType } from '@/lib/chatbots';

const ACTION_TYPES: ChatBotCtaActionType[] = ['book_now', 'contact_us', 'request_callback', 'submit_lead', 'visit_website', 'whatsapp', 'call', 'open_form', 'custom_url'];
const OPERATORS = ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'];

export function CtaTab({ draft, update }: TabProps) {
  const ctas = draft.ctas;
  const setCtas = (next: ChatBotCta[]) => update((d) => ({ ...d, ctas: next }));

  const nextCtaKey = () => {
    const used = new Set(ctas.map((c) => c.cta_key));
    let n = ctas.length + 1;
    while (used.has(`cta_${n}`)) n += 1;
    return `cta_${n}`;
  };

  const addCta = () => {
    setCtas([
      ...ctas,
      {
        id: newId(), chatbot_id: draft.bot.id, cta_key: nextCtaKey(), name: 'New CTA', button_label: 'Learn More',
        description: null, action_type: 'visit_website', destination: '', conditions: {}, visibility_rule: 'always',
        tracking_params: {}, conversion_event: null, is_active: true, sort_order: ctas.length,
      },
    ]);
  };

  const patch = (id: string, p: Partial<ChatBotCta>) => setCtas(ctas.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const sourceFields = [...draft.fields.map((f) => f.field_key), 'lead_status', 'sentiment', 'intent'];

  return (
    <div className="space-y-5">
      <TabHeading title="Calls to Action" description="Buttons the bot surfaces mid-conversation, optionally gated by a condition." />

      <div className="flex justify-end">
        <button type="button" onClick={addCta} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-brand-700">
          <Plus className="h-3.5 w-3.5" /> Add CTA
        </button>
      </div>

      {ctas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <MousePointerClick className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No CTAs configured yet.</p>
        </div>
      )}

      {ctas.map((cta) => (
        <SectionCard
          key={cta.id}
          icon={MousePointerClick}
          title={cta.name}
          description={cta.action_type.replace('_', ' ')}
          action={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" className="accent-brand-600" checked={cta.is_active} onChange={(e) => patch(cta.id, { is_active: e.target.checked })} /> Active
              </label>
              <button type="button" onClick={() => setCtas(ctas.filter((c) => c.id !== cta.id))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="CTA Name"><input className={fieldInput} value={cta.name} onChange={(e) => patch(cta.id, { name: e.target.value })} /></Field>
            <Field label="Button Label"><input className={fieldInput} value={cta.button_label} onChange={(e) => patch(cta.id, { button_label: e.target.value })} /></Field>
            <Field label="Action Type">
              <select className={fieldInput} value={cta.action_type} onChange={(e) => patch(cta.id, { action_type: e.target.value as ChatBotCtaActionType })}>
                {ACTION_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Destination"><input className={fieldInput} value={cta.destination ?? ''} onChange={(e) => patch(cta.id, { destination: e.target.value })} placeholder="https:// · mailto: · tel:" /></Field>
            <Field label="Description" className="col-span-2"><input className={fieldInput} value={cta.description ?? ''} onChange={(e) => patch(cta.id, { description: e.target.value })} /></Field>
            <Field label="Conversion Event"><input className={fieldInput} value={cta.conversion_event ?? ''} onChange={(e) => patch(cta.id, { conversion_event: e.target.value })} placeholder="lead_converted" /></Field>
            <div className="flex items-end">
              <Toggle checked={cta.visibility_rule === 'conditional'} onChange={(v) => patch(cta.id, { visibility_rule: v ? 'conditional' : 'always' })} label="Conditional visibility" />
            </div>

            {cta.visibility_rule === 'conditional' && (
              <div className="col-span-2 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                <span className="text-[11px] font-semibold text-slate-500">If</span>
                <select className={fieldInputSm} value={cta.conditions.field ?? ''} onChange={(e) => patch(cta.id, { conditions: { ...cta.conditions, field: e.target.value } })}>
                  <option value="">field…</option>
                  {sourceFields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select className={fieldInputSm} value={cta.conditions.operator ?? 'equals'} onChange={(e) => patch(cta.id, { conditions: { ...cta.conditions, operator: e.target.value } })}>
                  {OPERATORS.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                </select>
                <input className={fieldInputSm} placeholder="value" value={cta.conditions.value ?? ''} onChange={(e) => patch(cta.id, { conditions: { ...cta.conditions, value: e.target.value } })} />
              </div>
            )}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
