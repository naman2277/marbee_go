import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Sparkles, Send, Bot, User, Save, Users, Loader2,
  AlertTriangle, CheckCircle2, Lightbulb, 
  Zap, PlusCircle, Info,
} from 'lucide-react';
import { Button } from '@/components/ui';
import {
  agentMessage, buildCohortFromPrompt, editCohortConversationally,
  discoverCohorts, suggestAdditionalConditions, 
  type AgentMessage, type AgentPlan, 
  type DiscoverySuggestion,
} from '@/lib/cohorts/ai';
import {
  createCohortIR, collectConditions, isEmptyIR, countConditions,
  type CohortIR,
} from '@/lib/cohorts/ir';
import { buildCatalog, EMPTY_CATALOG, type SemanticCatalog } from '@/lib/cohorts/catalog';
import { explainCohort } from '@/lib/cohorts/compile';
import { validateCohortIR } from '@/lib/cohorts/validate';
import {
  createAudience,
  evaluateAudienceMembers,
  filterRootFromRules,
  slugifyAudienceName,
} from '@/lib/audiences';
import type { SimpleAudienceRule } from '@/lib/audiences';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { fetchSchemaRows } from '@/lib/schema-records';
import { cn } from '@/lib/utils';

type Props = {
  tenantId: string;
  environment: string;
  onSaved?: (id: string) => void;
};

/** Convert cohort IR property conditions to SimpleAudienceRule[] for saving. */
function irToAudienceRules(ir: CohortIR): SimpleAudienceRule[] {
  const conditions = collectConditions(ir.root);
  const rules: SimpleAudienceRule[] = [];
  for (const c of conditions) {
    if (c.kind === 'property') {
      rules.push({
        field: c.property,
        operator: c.operator as SimpleAudienceRule['operator'],
        value: String(c.value ?? ''),
        join: rules.length > 0 ? 'and' : undefined,
      });
    } else if (c.kind === 'event') {
      rules.push({
        field: `event:${c.event}`,
        operator: c.performed === 'did_not' ? 'equals' : 'not_equals',
        value: String(c.value ?? 1),
        join: rules.length > 0 ? 'and' : undefined,
      });
    } else if (c.kind === 'metric') {
      rules.push({
        field: c.metric,
        operator: c.operator as SimpleAudienceRule['operator'],
        value: String(c.value ?? 0),
        join: rules.length > 0 ? 'and' : undefined,
      });
    }
  }
  if (!rules.length) {
    rules.push({ field: 'status', operator: 'equals', value: 'active' });
  }
  return rules;
}

export function AudienceAiPanel({ tenantId, environment, onSaved }: Props) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ir, setIr] = useState<CohortIR>(createCohortIR('user', 'customer'));
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [discoveries, setDiscoveries] = useState<DiscoverySuggestion[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: schemas } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const schema = useMemo(
    () => (schemas ?? []).find((s) => s.slug === 'customer') ?? (schemas ?? [])[0],
    [schemas],
  );

  const { data: rows } = useQuery({
    queryKey: ['ai-audience-rows', schema?.table_name, tenantId],
    queryFn: () => fetchSchemaRows(schema!.table_name!, tenantId, environment),
    enabled: Boolean(schema?.table_name),
  });

  const catalog: SemanticCatalog = useMemo(() => {
    if (!schema || !rows?.length) return EMPTY_CATALOG;
    return buildCatalog({ schema, rows, events: [], cohorts: [] });
  }, [schema, rows]);

  // Build discoveries on mount
  useEffect(() => {
    if (catalog !== EMPTY_CATALOG && discoveries.length === 0 && messages.length === 0) {
      setDiscoveries(discoverCohorts(catalog));
    }
  }, [catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll chat
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, loading]);

  // Derive audience rules from IR for preview
  const rules = useMemo(() => (plan ? irToAudienceRules(plan.ir) : []), [plan]);
  const filterRoot = useMemo(() => (rules.length ? filterRootFromRules(rules) : null), [rules]);

  const { data: preview } = useQuery({
    queryKey: ['ai-audience-preview', plan?.ir, tenantId],
    queryFn: () =>
      evaluateAudienceMembers({
        tenantId,
        environment,
        schema: schema!,
        filterRoot: filterRoot!,
        limit: 30,
      }),
    enabled: Boolean(schema && filterRoot && plan),
  });

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, agentMessage('user', text)]);
    setLoading(true);
    try {
      if (isEmptyIR(ir)) {
        const result = await buildCohortFromPrompt(text, catalog);
        setIr(result.ir);
        setPlan(result);
        setMessages((prev) => [...prev, agentMessage('agent', result.understood, result)]);
      } else {
        const outcome = await editCohortConversationally(text, ir, catalog);
        if (outcome.applied) {
          setIr(outcome.ir);
          const newPlan: AgentPlan = {
            ...(plan as AgentPlan),
            ir: outcome.ir,
            understood: outcome.summary,
            explanation: explainCohort(outcome.ir, catalog),
            source: outcome.source,
          };
          setPlan(newPlan);
        }
        setMessages((prev) => [...prev, agentMessage('agent', outcome.summary)]);
      }
    } catch (err) {
      const msg = agentMessage('agent', 'Something went wrong — try rephrasing.');
      msg.error = String(err);
      setMessages((prev) => [...prev, msg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, ir, catalog, plan]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleDiscovery = useCallback(
    async (d: DiscoverySuggestion) => {
      setMessages((prev) => [...prev, agentMessage('user', d.name)]);
      setIr(d.ir);
      const fakePlan: AgentPlan = {
        understood: d.understood,
        ir: d.ir,
        explanation: explainCohort(d.ir, catalog),
        confidence: 0.85,
        assumptions: [`Inferred from signals: ${d.signals.join('; ')}`],
        clarifications: [],
        unresolved: [],
        suggestedName: d.name,
        source: 'local',
        // TD-11: was a hard-coded "valid" result; run the real validator instead.
        validation: validateCohortIR(d.ir, catalog),
      };
      setPlan(fakePlan);
      setMessages((prev) => [...prev, agentMessage('agent', d.understood, fakePlan)]);
      setDiscoveries([]);
    },
    [catalog],
  );

  const resetChat = useCallback(() => {
    setMessages([]);
    setIr(createCohortIR('user', 'customer'));
    setPlan(null);
    setDiscoveries(discoverCohorts(catalog));
  }, [catalog]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!plan || !filterRoot) throw new Error('Generate a cohort first');
      const name = plan.suggestedName || 'AI cohort';
      const audience = await createAudience({
        tenant_id: tenantId,
        environment,
        name,
        slug: slugifyAudienceName(name),
        description: plan.explanation,
        schema_slug: catalog.schemaSlug,
        filter_json: filterRoot,
        creation_mode: 'ai',
        ai_prompt: messages.filter((m) => m.role === 'user').map((m) => m.text).join(' → '),
        member_count: preview?.total ?? 0,
      });
      return audience;
    },
    onSuccess: (a) => onSaved?.(a.id),
  });

  const suggestions = useMemo(
    () => (plan ? suggestAdditionalConditions(plan.ir, catalog, 3) : []),
    [plan, catalog],
  );

  const confidenceColor = (c: number) =>
    c >= 0.7 ? 'text-emerald-600 bg-emerald-50' : c >= 0.4 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  const confidenceLabel = (c: number) =>
    c >= 0.7 ? 'High confidence' : c >= 0.4 ? 'Medium confidence' : 'Low confidence';

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Left — Chat + Controls */}
      <div className="space-y-4 lg:col-span-3">
        <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm flex flex-col" style={{ height: '620px' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-4 text-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold">AI Cohort Agent</h3>
                <p className="text-xs text-indigo-200">
                  {plan
                    ? `${countConditions(plan.ir.root)} rule${countConditions(plan.ir.root) !== 1 ? 's' : ''} · ${plan.source === 'edge' ? 'Edge AI' : plan.source === 'openai' ? 'OpenAI' : 'Grounded NLP'}`
                    : 'Describe your audience in plain English'}
                </p>
              </div>
              {plan && (
                <button
                  type="button"
                  onClick={resetChat}
                  className="text-xs text-indigo-200 hover:text-white underline"
                >
                  Start over
                </button>
              )}
            </div>
          </div>

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Discovery chips when empty */}
            {messages.length === 0 && discoveries.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Quick-start — click to build instantly</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {discoveries.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleDiscovery(d)}
                      className="text-left rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-indigo-300 hover:bg-indigo-50 transition group"
                    >
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-xs font-semibold text-slate-800">{d.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{d.understood}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {d.signals.slice(0, 2).map((s) => (
                          <span key={s} className="text-[9px] bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-slate-500">{s}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 text-center">Or type any description below</p>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                  msg.role === 'agent' ? 'bg-indigo-100' : 'bg-slate-200',
                )}>
                  {msg.role === 'agent' ? <Bot className="w-3.5 h-3.5 text-indigo-600" /> : <User className="w-3.5 h-3.5 text-slate-600" />}
                </div>
                <div className={cn('max-w-[85%] space-y-2')}>
                  <div className={cn(
                    'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                    msg.role === 'agent'
                      ? 'bg-slate-100 text-slate-800 rounded-bl-md'
                      : 'bg-indigo-600 text-white rounded-br-md',
                  )}>
                    {msg.text}
                  </div>

                  {/* Plan details */}
                  {msg.plan && (
                    <div className="space-y-2 pl-1">
                      {/* Confidence badge */}
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', confidenceColor(msg.plan.confidence))}>
                          {confidenceLabel(msg.plan.confidence)} · {Math.round(msg.plan.confidence * 100)}%
                        </span>
                        <span className="text-[10px] text-slate-400">
                          via {msg.plan.source === 'edge' ? 'Edge Function' : msg.plan.source === 'openai' ? 'OpenAI' : 'Grounded NLP'}
                        </span>
                      </div>

                      {/* Explanation */}
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-xs text-indigo-800">
                        {msg.plan.explanation}
                      </div>

                      {/* Rules summary */}
                      <div className="space-y-1">
                        {collectConditions(msg.plan.ir.root).map((c) => (
                          <div key={c.id} className="flex items-center gap-1.5 text-[11px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            <span className="text-slate-700">
                              {c.kind === 'property' && `${c.property} ${c.operator} ${c.value || ''}`}
                              {c.kind === 'event' && `${c.performed === 'did_not' ? 'Did not perform' : 'Performed'} "${c.event}" ${c.operator.replace('count_', '')} ${c.value}`}
                              {c.kind === 'metric' && `${c.metric} ${c.operator} ${c.value}`}
                              {c.kind === 'retention' && `Retention: ${c.pattern}`}
                              {c.kind === 'sequence' && `Sequence: ${c.steps.map((s) => s.event).join(' → ')}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Assumptions */}
                      {msg.plan.assumptions.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-0.5">
                          <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                            <Info className="w-3 h-3" /> Assumptions
                          </p>
                          {msg.plan.assumptions.map((a, i) => (
                            <p key={i} className="text-[10px] text-amber-700">{a}</p>
                          ))}
                        </div>
                      )}

                      {/* Unresolved terms */}
                      {msg.plan.unresolved.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 space-y-1">
                          <p className="text-[10px] font-semibold text-red-700 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Could not resolve
                          </p>
                          {msg.plan.unresolved.map((u) => (
                            <div key={u.term} className="text-[10px] text-red-700">
                              <span className="font-mono">"{u.term}"</span>
                              {u.suggestions.length > 0 && (
                                <span> — did you mean: {u.suggestions.map((s) => s.label).join(', ')}?</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Clarifications */}
                      {msg.plan.clarifications.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-2">
                          {msg.plan.clarifications.map((cl) => (
                            <div key={cl.id}>
                              <p className="text-[10px] font-semibold text-blue-800 mb-1">{cl.question}</p>
                              <div className="flex flex-wrap gap-1">
                                {cl.options.map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      setInput(`Use ${opt.label}`);
                                      inputRef.current?.focus();
                                    }}
                                    className="text-[10px] bg-white border border-blue-200 rounded-full px-2 py-0.5 text-blue-700 hover:bg-blue-100 transition"
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Validation errors */}
                      {msg.plan.validation.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                          {msg.plan.validation.errors.map((e, i) => (
                            <p key={i} className="text-[10px] text-red-700">{e.message}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {msg.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 text-[10px] text-red-600">
                      {msg.error}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Suggestion chips when plan exists */}
          {plan && suggestions.length > 0 && !loading && (
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <PlusCircle className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-400">Suggested additions</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => { setInput(`Also require ${s.label}`); inputRef.current?.focus(); }}
                    className="text-[10px] border border-slate-200 rounded-full px-2.5 py-1 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 transition"
                  >
                    + {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-slate-200 p-3 flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={plan ? 'Refine: "make it broader", "exclude enterprise", "add email consent"…' : 'Describe your audience, e.g. "active customers in India with email consent"'}
                rows={1}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none"
              />
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Preview + Save */}
      <div className="lg:col-span-2 space-y-4">
        {/* Preview */}
        <div className="sticky top-4 space-y-4">
          <div className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-5">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-fuchsia-900">Audience preview</h4>
              {plan && (
                <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-bold text-fuchsia-700 shadow-sm">
                  <Users className="h-4 w-4" />
                  {preview?.total ?? 0}
                </span>
              )}
            </div>
            {!plan ? (
              <p className="mt-8 py-12 text-center text-sm text-fuchsia-700">
                Describe your audience or pick a recipe to see matching members
              </p>
            ) : (
              <>
                <div className="mt-3 rounded-xl bg-white/80 border border-fuchsia-100 p-3">
                  <p className="text-xs font-semibold text-slate-800">{plan.suggestedName}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{plan.explanation}</p>
                </div>
                <ul className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto">
                  {(preview?.members ?? []).map((row) => (
                    <li key={String(row.id)} className="rounded-lg bg-white/80 px-3 py-2 text-xs flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-fuchsia-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 text-fuchsia-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {String(row.first_name ?? row.email ?? row.id)}
                        </p>
                        {Boolean(row.email && row.first_name) && (
                          <p className="text-[10px] text-slate-400 truncate">{String(row.email)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Save */}
          {plan && (
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-500"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {saveMutation.isPending ? 'Saving…' : `Save "${plan.suggestedName}"`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
