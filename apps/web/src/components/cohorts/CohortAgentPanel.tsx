import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Sparkles, ChevronRight,
  Loader2, AlertCircle, Zap, PlusCircle, ArrowRight, Lightbulb,
} from 'lucide-react';
import {
  agentMessage, buildCohortFromPrompt,
  editCohortConversationally, discoverCohorts,
  suggestAdditionalConditions,
  type AgentMessage,
  type AgentPlan,
  type Clarification,
  type ClarificationOption,
  type DiscoverySuggestion,
} from '@/lib/cohorts/ai';
import { isEmptyIR, countConditions, type CohortIR, type CohortNode } from '@/lib/cohorts/ir';
import type { SemanticCatalog } from '@/lib/cohorts/catalog';
import { summarizeCohort } from '@/lib/cohorts/compile';
import { validateCohortIR } from '@/lib/cohorts/validate';
import { cn } from '@/lib/utils';

type CohortAgentPanelProps = {
  ir: CohortIR;
  catalog: SemanticCatalog;
  onUpdateIR: (ir: CohortIR) => void;
  onAddNode: (node: CohortNode) => void;
  className?: string;
};

export function CohortAgentPanel({
  ir, catalog, onUpdateIR, onAddNode, className,
}: CohortAgentPanelProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [discoveries, setDiscoveries] = useState<DiscoverySuggestion[]>([]);
  const [expandedAssumptions, setExpandedAssumptions] = useState<Set<number>>(new Set());
  const [selectedClarifications, setSelectedClarifications] = useState<Record<string, string[]>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, loading]);

  useEffect(() => {
    if (isEmptyIR(ir) && discoveries.length === 0 && messages.length === 0) {
      setDiscoveries(discoverCohorts(catalog));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, agentMessage('user', text)]);
    setLoading(true);
    try {
      if (isEmptyIR(ir)) {
        const plan = await buildCohortFromPrompt(text, catalog);
        setMessages(prev => [...prev, agentMessage('agent', plan.understood, plan)]);
      } else {
        const outcome = await editCohortConversationally(text, ir, catalog);
        if (outcome.applied) onUpdateIR(outcome.ir);
        setMessages(prev => [...prev, agentMessage('agent', outcome.summary)]);
      }
    } catch (err) {
      const msg = agentMessage('agent', 'Something went wrong.');
      msg.error = String(err);
      setMessages(prev => [...prev, msg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, ir, catalog, onUpdateIR]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
  }, [handleSubmit]);

  const handleDiscoveryClick = useCallback((d: DiscoverySuggestion) => {
    setDiscoveries([]);
    onUpdateIR(d.ir);
    setMessages(prev => [...prev,
      agentMessage('user', d.name),
      agentMessage('agent', d.understood),
    ]);
  }, [onUpdateIR]);

  const handleApplyPlan = useCallback((plan: AgentPlan) => {
    onUpdateIR(plan.ir);
    setMessages(prev => [...prev, agentMessage('agent', 'Applied to your cohort definition.')]);
  }, [onUpdateIR]);

  const handleClarificationSelect = useCallback((
    c: Clarification, opt: ClarificationOption, multi: boolean,
  ) => {
    setSelectedClarifications(prev => {
      const current = prev[c.id] || [];
      if (multi) {
        const has = current.includes(opt.id);
        return { ...prev, [c.id]: has ? current.filter(v => v !== opt.id) : [...current, opt.id] };
      }
      return { ...prev, [c.id]: [opt.id] };
    });
    onAddNode(opt.node);
  }, [onAddNode]);

  const toggleAssumptions = useCallback((idx: number) => {
    setExpandedAssumptions(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const additionalSuggestions = !isEmptyIR(ir) ? suggestAdditionalConditions(ir, catalog) : [];

  function confidenceBadge(confidence: number) {
    const color = confidence >= 0.7 ? 'bg-green-100 text-green-700' :
      confidence >= 0.4 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    const label = confidence >= 0.7 ? 'High' : confidence >= 0.4 ? 'Medium' : 'Low';
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', color)}>
        <Zap className="w-3 h-3" /> {label} ({Math.round(confidence * 100)}%)
      </span>
    );
  }

  function renderAgentMessage(msg: AgentMessage, idx: number) {
    const plan = msg.plan;
    const validation = plan?.ir ? validateCohortIR(plan.ir, catalog) : null;
    const issueCount = validation?.issues?.length ?? 0;

    return (
      <div key={msg.id} className="flex gap-2 items-start max-w-[90%]">
        <div className="shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
          <Bot className="w-4 h-4 text-slate-600" />
        </div>
        <div className="space-y-2 min-w-0">
          <div className="rounded-xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800">
            {msg.text}
          </div>

          {msg.error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 px-1">
              <AlertCircle className="w-3.5 h-3.5" /> {msg.error}
            </div>
          )}

          {plan && (
            <div className="space-y-2 px-1">
              {plan.confidence != null && confidenceBadge(plan.confidence)}

              {plan.assumptions.length > 0 && (
                <div>
                  <button onClick={() => toggleAssumptions(idx)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                    <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', expandedAssumptions.has(idx) && 'rotate-90')} />
                    {plan.assumptions.length} assumption{plan.assumptions.length > 1 ? 's' : ''}
                  </button>
                  {expandedAssumptions.has(idx) && (
                    <ul className="mt-1 ml-4 space-y-0.5 text-xs text-slate-500">
                      {plan.assumptions.map((a, i) => <li key={i}>- {a}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {plan.clarifications.length > 0 && (
                <div className="space-y-2">
                  {plan.clarifications.map(c => (
                    <div key={c.id} className="space-y-1">
                      <p className="text-xs font-medium text-slate-600">{c.question}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.options.map(opt => {
                          const selected = (selectedClarifications[c.id] || []).includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              onClick={() => handleClarificationSelect(c, opt, c.multi)}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs border transition-colors',
                                selected ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300',
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {plan.unresolved.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5" /> Could not resolve
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.unresolved.map((u, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
                        {u.term} ({u.kind})
                        {u.suggestions.length > 0 && ` → ${u.suggestions[0].label}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {issueCount > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {issueCount} validation issue{issueCount > 1 ? 's' : ''}
                </p>
              )}

              {plan.ir && (
                <button
                  onClick={() => handleApplyPlan(plan)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" /> Apply to cohort
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
          <Bot className="w-4 h-4 text-brand-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">AI Agent</h3>
          <p className="text-xs text-slate-500">Describe who you're looking for</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isEmptyIR(ir) && discoveries.length > 0 && messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Suggested cohorts</p>
            <div className="grid grid-cols-2 gap-2">
              {discoveries.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleDiscoveryClick(d)}
                  className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-brand-200 text-left transition-colors group"
                >
                  <Sparkles className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 group-hover:text-brand-700">{d.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{d.understood}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="flex gap-2 items-start justify-end max-w-[90%] ml-auto">
              <div className="rounded-xl rounded-tr-sm bg-brand-600 px-3.5 py-2.5 text-sm text-white">{msg.text}</div>
              <div className="shrink-0 w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                <User className="w-4 h-4 text-brand-600" />
              </div>
            </div>
          ) : renderAgentMessage(msg, idx)
        )}

        {loading && (
          <div className="flex gap-2 items-start max-w-[90%]">
            <div className="shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
              <Bot className="w-4 h-4 text-slate-600" />
            </div>
            <div className="rounded-xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        {!isEmptyIR(ir) && (
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full">
                {countConditions(ir.root)} rule{countConditions(ir.root) !== 1 ? 's' : ''}
              </span>
              <span className="truncate">{summarizeCohort(ir, catalog)}</span>
            </div>
            {additionalSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {additionalSuggestions.map(s => (
                  <button
                    key={s.label}
                    onClick={() => onAddNode(s.node)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                    title={s.reason}
                  >
                    <PlusCircle className="w-3 h-3" /> {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isEmptyIR(ir) ? 'e.g. "Users who purchased in the last 30 days"' : 'Refine your cohort…'}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            style={{ maxHeight: 120 }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={!input.trim() || loading}
            className={cn(
              'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
              input.trim() && !loading ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
