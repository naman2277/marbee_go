import { Sparkles, ScrollText, ShieldAlert, Braces, Plus, X, Globe, Trash2, ChevronDown, ChevronUp, Zap, Timer, MessageSquareHeart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionCard, Field, Toggle, fieldInput, fieldInputSm, TabHeading } from '../studio-ui';
import type { TabProps } from '../types';
import type { ChatBotContext, ExternalApiLookup, ExternalApiParam, SessionLifecycle } from '@/lib/chatbots';
import { DEFAULT_SESSION_LIFECYCLE } from '@/lib/chatbots';

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input className={fieldInput} value={item} placeholder={placeholder} onChange={(e) => { const next = [...items]; next[i] = e.target.value; onChange(next); }} />
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add rule
      </button>
    </div>
  );
}

const PRESET_LOOKUPS: Array<{ name: string; lookup_key: string; description: string; params: ExternalApiParam[] }> = [
  { name: 'Order Status', lookup_key: 'order_status', description: 'Look up order status by order/booking ID', params: [{ param_key: 'order_id', display_label: 'Order ID', ask_question: "Could you share your order or booking ID?", data_type: 'string' }] },
  { name: 'Flight Status', lookup_key: 'flight_status', description: 'Check flight status using PNR', params: [{ param_key: 'pnr', display_label: 'PNR Number', ask_question: "What's your PNR or booking reference?", data_type: 'string' }] },
  { name: 'Shipment Tracking', lookup_key: 'shipment_tracking', description: 'Track a shipment by tracking number', params: [{ param_key: 'tracking_number', display_label: 'Tracking Number', ask_question: "Please share your shipment tracking number.", data_type: 'string' }] },
  { name: 'Account Balance', lookup_key: 'account_balance', description: 'Check account balance by account number', params: [{ param_key: 'account_number', display_label: 'Account Number', ask_question: "What's your account number?", data_type: 'string' }] },
];

function ApiLookupCard({
  lookup,
  index,
  total,
  onPatch,
  onMove,
  onRemove,
}: {
  lookup: ExternalApiLookup;
  index: number;
  total: number;
  onPatch: (p: Partial<ExternalApiLookup>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const params = lookup.params;
  const setParams = (next: ExternalApiParam[]) => onPatch({ params: next });
  const patchParam = (i: number, p: Partial<ExternalApiParam>) => setParams(params.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const headerEntries = Object.entries(lookup.headers);

  return (
    <div className={cn('rounded-2xl border bg-white shadow-2xs transition', lookup.enabled ? 'border-emerald-200' : 'border-slate-200 opacity-75')}>
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{lookup.name || 'Untitled Lookup'}</p>
            <p className="text-[11px] text-slate-400 truncate">{lookup.lookup_key} &middot; {lookup.http_method} &middot; {lookup.params.length} param{lookup.params.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
          <label className="ml-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <input type="checkbox" className="accent-emerald-600" checked={lookup.enabled} onChange={(e) => onPatch({ enabled: e.target.checked })} /> Active
          </label>
          <button type="button" onClick={onRemove} className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Identity row */}
        <div className="grid grid-cols-6 gap-3">
          <Field label="Name" required className="col-span-2">
            <input className={fieldInput} value={lookup.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="Check Order Status" />
          </Field>
          <Field label="Lookup Key" className="col-span-2" hint="Unique key the LLM uses.">
            <input className={`${fieldInput} font-mono text-xs`} value={lookup.lookup_key} onChange={(e) => onPatch({ lookup_key: e.target.value.replace(/\s+/g, '_').toLowerCase() })} placeholder="order_status" />
          </Field>
          <Field label="Description" className="col-span-2">
            <input className={fieldInput} value={lookup.description} onChange={(e) => onPatch({ description: e.target.value })} placeholder="Looks up order details by ID" />
          </Field>
        </div>

        {/* Endpoint section */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Zap className="h-3 w-3 text-amber-500" /> API Endpoint</p>

          {/* Method + URL on one row */}
          <div className="flex gap-2">
            <div className="shrink-0 pt-6">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {(['GET', 'POST'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onPatch({ http_method: m })}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-bold transition',
                      lookup.http_method === m ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <Field label="URL Template" className="flex-1" hint="Use {{param_key}} placeholders, e.g. https://api.example.com/orders/{{order_id}}">
              <input className={`${fieldInput} font-mono text-xs`} value={lookup.url_template} onChange={(e) => onPatch({ url_template: e.target.value })} placeholder="https://api.example.com/orders/{{order_id}}" />
            </Field>
          </div>

          {/* Headers */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Request Headers</span>
            <div className="space-y-1.5">
              {headerEntries.map(([key, value], i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={`${fieldInputSm} flex-1`} placeholder="Header name" value={key} onChange={(e) => { const next = [...headerEntries] as Array<[string, string]>; next[i] = [e.target.value, value]; onPatch({ headers: Object.fromEntries(next) }); }} />
                  <input className={`${fieldInputSm} flex-1`} placeholder="Value" value={value} onChange={(e) => { const next = [...headerEntries] as Array<[string, string]>; next[i] = [key, e.target.value]; onPatch({ headers: Object.fromEntries(next) }); }} />
                  <button type="button" onClick={() => { const next = headerEntries.filter((_, idx) => idx !== i); onPatch({ headers: Object.fromEntries(next) }); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-3 w-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => onPatch({ headers: { ...lookup.headers, '': '' } })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline">
                <Plus className="h-3 w-3" /> Add header
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Auth tokens, API keys, etc. — resolved server-side, never sent to the browser.</p>
          </div>

          {/* POST body */}
          {lookup.http_method === 'POST' && (
            <Field label="Request Body (JSON)" hint='Use {{param_key}} placeholders. e.g. {"order_id": "{{order_id}}"}'>
              <textarea className={`${fieldInput} font-mono text-xs`} rows={2} value={lookup.body_template} onChange={(e) => onPatch({ body_template: e.target.value })} placeholder='{"order_id": "{{order_id}}"}' />
            </Field>
          )}

          {/* Response config */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Response JSON Path" hint='e.g. "data.order" — leave empty for full response.'>
              <input className={`${fieldInput} font-mono text-xs`} value={lookup.response_path} onChange={(e) => onPatch({ response_path: e.target.value })} placeholder="data.order" />
            </Field>
            <Field label="Error Message" hint="Shown when the API call fails.">
              <input className={fieldInput} value={lookup.error_message} onChange={(e) => onPatch({ error_message: e.target.value })} placeholder="Sorry, I couldn't retrieve that right now." />
            </Field>
          </div>
        </div>

        {/* Parameters section */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Required Parameters</p>
            <button
              type="button"
              onClick={() => setParams([...params, { param_key: `param_${params.length + 1}`, display_label: '', ask_question: '', data_type: 'string' }])}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
            >
              <Plus className="h-3 w-3" /> Add Parameter
            </button>
          </div>

          {params.length === 0 && (
            <p className="py-3 text-center text-[11px] text-slate-400 italic">No parameters — add at least one so the bot knows what to collect.</p>
          )}

          {params.map((p, pi) => (
            <div key={pi} className="rounded-xl border border-white bg-white p-3 shadow-2xs space-y-2">
              {/* Row 1: Key, Label, Type, Delete */}
              <div className="flex items-end gap-2">
                <Field label="Param Key" className="w-36">
                  <input className={`${fieldInputSm} font-mono`} value={p.param_key} onChange={(e) => patchParam(pi, { param_key: e.target.value.replace(/\s+/g, '_').toLowerCase() })} placeholder="order_id" />
                </Field>
                <Field label="Display Label" className="flex-1">
                  <input className={fieldInputSm} value={p.display_label} onChange={(e) => patchParam(pi, { display_label: e.target.value })} placeholder="Order ID" />
                </Field>
                <Field label="Type" className="w-24">
                  <select className={fieldInputSm} value={p.data_type} onChange={(e) => patchParam(pi, { data_type: e.target.value as ExternalApiParam['data_type'] })}>
                    <option value="string">Text</option>
                    <option value="number">Number</option>
                    <option value="email">Email</option>
                  </select>
                </Field>
                <button type="button" onClick={() => setParams(params.filter((_, idx) => idx !== pi))} className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {/* Row 2: Ask Question — full width */}
              <Field label="Ask Question" hint="How the bot naturally asks for this value.">
                <input className={fieldInputSm} value={p.ask_question} onChange={(e) => patchParam(pi, { ask_question: e.target.value })} placeholder={`What's your ${p.display_label || 'value'}?`} />
              </Field>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ContextTab({ draft, update }: TabProps) {
  const ctx = draft.bot.context;
  const set = (patch: Partial<ChatBotContext>) => update((d) => ({
    ...d,
    bot: { ...d.bot, context: { ...d.bot.context, ...patch }, context_version: d.bot.context_version + 1 },
  }));

  const lookups: ExternalApiLookup[] = ctx.api_lookups || [];
  const setLookups = (next: ExternalApiLookup[]) => set({ api_lookups: next });

  const addLookup = (preset?: Partial<ExternalApiLookup>) => {
    const usedKeys = new Set(lookups.map((l) => l.lookup_key));
    let key = preset?.lookup_key || `lookup_${lookups.length + 1}`;
    while (usedKeys.has(key)) key = `${key}_${Date.now().toString(36).slice(-3)}`;
    setLookups([
      ...lookups,
      {
        name: preset?.name || 'New API Lookup',
        description: preset?.description || '',
        http_method: 'GET',
        url_template: '',
        headers: {},
        body_template: '',
        params: preset?.params || [],
        response_path: '',
        error_message: "Sorry, I couldn't retrieve that information right now. Please try again.",
        enabled: true,
        ...preset,
        lookup_key: key,
      },
    ]);
  };

  const patchLookup = (i: number, p: Partial<ExternalApiLookup>) => setLookups(lookups.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  const moveLookup = (i: number, dir: -1 | 1) => {
    const swapWith = i + dir;
    if (swapWith < 0 || swapWith >= lookups.length) return;
    const next = [...lookups];
    [next[i], next[swapWith]] = [next[swapWith], next[i]];
    setLookups(next);
  };

  const usedLookupKeys = new Set(lookups.map((l) => l.lookup_key));

  return (
    <div className="space-y-5">
      <TabHeading title="Chat Context" description="What the bot knows, how it behaves, and external APIs it can call during conversations." />

      <SectionCard icon={Sparkles} title="Personality & Business Context" description="Who the bot is and what it represents.">
        <div className="space-y-4">
          <Field label="Bot Personality" hint='e.g. "Friendly, concise, and helpful. Never pushy."'>
            <textarea className={fieldInput} rows={2} value={ctx.personality} onChange={(e) => set({ personality: e.target.value })} />
          </Field>
          <Field label="Business Context" required hint='e.g. "You are a customer support assistant for an airline."'>
            <textarea className={fieldInput} rows={3} value={ctx.business_context} onChange={(e) => set({ business_context: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Product / Service Information">
              <textarea className={fieldInput} rows={3} value={ctx.product_info} onChange={(e) => set({ product_info: e.target.value })} />
            </Field>
            <Field label="Policies">
              <textarea className={fieldInput} rows={3} value={ctx.policies} onChange={(e) => set({ policies: e.target.value })} />
            </Field>
          </div>
          <Field label="FAQs">
            <textarea className={fieldInput} rows={4} value={ctx.faqs} onChange={(e) => set({ faqs: e.target.value })} placeholder={'Q: Is there a free trial?\nA: Yes, 14 days.'} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard icon={ScrollText} title="Conversation Rules" description="Guardrails the model must follow on every turn.">
        <div className="space-y-4">
          <Field label="General Conversation Rules">
            <textarea className={fieldInput} rows={2} value={ctx.conversation_rules} onChange={(e) => set({ conversation_rules: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Do Rules"><ListEditor items={ctx.do_rules} onChange={(v) => set({ do_rules: v })} placeholder="Ask for booking ID when required" /></Field>
            <Field label="Don't Rules"><ListEditor items={ctx.dont_rules} onChange={(v) => set({ dont_rules: v })} placeholder="Never invent booking information" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Escalation Rules" hint="When and how to hand off to a human.">
              <textarea className={fieldInput} rows={2} value={ctx.escalation_rules} onChange={(e) => set({ escalation_rules: e.target.value })} />
            </Field>
            <Field label="Fallback Response" hint="Shown when the bot genuinely doesn't know.">
              <textarea className={fieldInput} rows={2} value={ctx.fallback_response} onChange={(e) => set({ fallback_response: e.target.value })} />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Timer} title="Session Lifecycle" description="Idle follow-up, auto-close, feedback collection, and data persistence when a chat ends.">
        {(() => {
          const lc = ctx.session_lifecycle ?? DEFAULT_SESSION_LIFECYCLE;
          const setLc = (p: Partial<SessionLifecycle>) => set({ session_lifecycle: { ...lc, ...p } });
          return (
            <div className="space-y-5">
              {/* Idle follow-up */}
              <div className="space-y-3">
                <Toggle checked={lc.idle_followup_enabled} onChange={(v) => setLc({ idle_followup_enabled: v })} label="Idle Follow-up" description="If the visitor goes silent after a bot reply, send a nudge message." />
                {lc.idle_followup_enabled && (
                  <div className="ml-9 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Wait (seconds)" hint="Time after the last bot reply before sending the nudge.">
                        <input type="number" min={30} max={600} step={10} className={fieldInput} value={lc.idle_followup_seconds} onChange={(e) => setLc({ idle_followup_seconds: Number(e.target.value) })} />
                      </Field>
                      <Field label="Follow-up Message" className="col-span-2">
                        <input className={fieldInput} value={lc.idle_followup_message} onChange={(e) => setLc({ idle_followup_message: e.target.value })} placeholder="Hey, are we still connected?" />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-close */}
              <div className="space-y-3">
                <Toggle checked={lc.idle_close_enabled} onChange={(v) => setLc({ idle_close_enabled: v })} label="Auto-Close on Inactivity" description="If still no response after the follow-up, close the chat automatically." />
                {lc.idle_close_enabled && (
                  <div className="ml-9 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Close after (seconds)" hint="Additional wait after the follow-up message.">
                        <input type="number" min={30} max={600} step={10} className={fieldInput} value={lc.idle_close_seconds} onChange={(e) => setLc({ idle_close_seconds: Number(e.target.value) })} />
                      </Field>
                      <Field label="Send Summary" className="col-span-2" hint="LLM generates a brief recap of the conversation before closing.">
                        <div className="pt-1">
                          <Toggle checked={lc.send_summary_on_close} onChange={(v) => setLc({ send_summary_on_close: v })} label="Send conversation summary before closing" />
                        </div>
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <Toggle checked={lc.feedback_enabled} onChange={(v) => setLc({ feedback_enabled: v })} label="Feedback Rating" description="Show a 1–5 emoji rating when the chat is completed or closed." />
                <Toggle checked={lc.persist_on_complete} onChange={(v) => setLc({ persist_on_complete: v })} label="Persist Data on Completion" description="Execute schema mapping to insert/upsert all captured data when the chat is marked completed." />
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-500">
                <MessageSquareHeart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>
                  Flow: Bot replies → visitor idle for {lc.idle_followup_seconds}s → nudge sent → still idle for {lc.idle_close_seconds}s → summary + close → feedback prompt → data persisted to schema.
                </span>
              </div>
            </div>
          );
        })()}
      </SectionCard>

      <SectionCard icon={ShieldAlert} title="Restricted Topics" description="Subjects the bot should politely decline and redirect.">
        <ListEditor items={ctx.restricted_topics} onChange={(v) => set({ restricted_topics: v })} placeholder="competitor pricing" />
      </SectionCard>

      {/* External API Lookups */}
      <SectionCard
        icon={Globe}
        title="External API Lookups"
        description="Let the bot call external systems mid-conversation — order status, flight tracking, account balance, etc."
        action={
          <div className="flex items-center gap-2">
            <select
              className={`${fieldInputSm} w-40`}
              value=""
              onChange={(e) => { const preset = PRESET_LOOKUPS.find((p) => p.lookup_key === e.target.value); if (preset) addLookup(preset); }}
            >
              <option value="">+ Quick add…</option>
              {PRESET_LOOKUPS.filter((p) => !usedLookupKeys.has(p.lookup_key)).map((p) => <option key={p.lookup_key} value={p.lookup_key}>{p.name}</option>)}
            </select>
            <button type="button" onClick={() => addLookup()} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-700">
              <Plus className="h-3.5 w-3.5" /> Custom
            </button>
          </div>
        }
      >
        {lookups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <Globe className="mx-auto mb-2 h-7 w-7 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No API lookups configured</p>
            <p className="mt-1 text-xs text-slate-400">Add a lookup so the bot can fetch live data during conversations.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lookups.map((lookup, i) => (
              <ApiLookupCard
                key={`${lookup.lookup_key}_${i}`}
                lookup={lookup}
                index={i}
                total={lookups.length}
                onPatch={(p) => patchLookup(i, p)}
                onMove={(dir) => moveLookup(i, dir)}
                onRemove={() => setLookups(lookups.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-500">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            The bot collects parameters from the visitor, then calls your API server-side.
            The response is fed back to the LLM for a natural reply. Secrets in headers stay server-side.
          </span>
        </div>
      </SectionCard>

      <SectionCard icon={Braces} title="Dynamic Context Variables" description="Key/value pairs interpolated into the system prompt at runtime.">
        <div className="space-y-2">
          {(() => {
            const entries = Object.entries(ctx.dynamic_variables);
            const commit = (next: Array<[string, string]>) => set({ dynamic_variables: Object.fromEntries(next) });
            return entries.map(([key, value], i) => (
              <div key={i} className="flex gap-2">
                <input className={fieldInput} placeholder="variable_name" value={key} onChange={(e) => { const next = [...entries]; next[i] = [e.target.value, value]; commit(next); }} />
                <input className={fieldInput} placeholder="value" value={value} onChange={(e) => { const next = [...entries]; next[i] = [key, e.target.value]; commit(next); }} />
                <button type="button" onClick={() => commit(entries.filter((_, idx) => idx !== i))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
              </div>
            ));
          })()}
          <button
            type="button"
            onClick={() => set({ dynamic_variables: { ...ctx.dynamic_variables, [`var_${Object.keys(ctx.dynamic_variables).length + 1}`]: '' } })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add variable
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Context version {draft.bot.context_version} — a new snapshot is captured every time you publish.</p>
      </SectionCard>
    </div>
  );
}
