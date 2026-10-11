import { useState, useEffect, useMemo } from 'react';
import {
  evaluateCohort,
  traceMember,
  type CohortDataset,
  type CohortEvaluation,
  type MemberTrace,
} from '@/lib/cohorts/evaluate';
import { isEmptyIR, type CohortIR } from '@/lib/cohorts/ir';
import type { SemanticCatalog } from '@/lib/cohorts/catalog';
import { describeCondition, summarizeCohort } from '@/lib/cohorts/compile';
import { validateCohortIR, type ValidationResult } from '@/lib/cohorts/validate';
import {
  Users, TrendingUp, TrendingDown, Minus,
  Loader2, AlertTriangle, CheckCircle2, XCircle,
  ChevronRight, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CohortPreviewPanelProps = {
  ir: CohortIR;
  catalog: SemanticCatalog;
  dataset: CohortDataset | null;
  className?: string;
};

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 120;
  const h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('text-brand-500', className)} fill="none">
      <polyline points={points} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function CohortPreviewPanel({ ir, catalog, dataset, className }: CohortPreviewPanelProps) {
  const [evaluation, setEvaluation] = useState<CohortEvaluation | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [search, setSearch] = useState('');
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [traces, setTraces] = useState<Map<string, MemberTrace>>(new Map());
  const [showIssues, setShowIssues] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    if (!dataset || isEmptyIR(ir)) {
      setEvaluation(null);
      setValidation(null);
      return;
    }
    setEvaluating(true);
    const t = setTimeout(() => {
      const result = evaluateCohort(ir, dataset);
      setEvaluation(result);
      setValidation(validateCohortIR(ir, catalog));
      setTraces(new Map());
      setEvaluating(false);
    }, 0);
    return () => clearTimeout(t);
  }, [ir, dataset, catalog]);

  const trendValues = useMemo(() =>
    evaluation?.trend.slice(-14).map(t => t.count) ?? [],
    [evaluation],
  );

  const trendDirection = useMemo(() => {
    if (trendValues.length < 4) return 'flat';
    const mid = Math.floor(trendValues.length / 2);
    const first = trendValues.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const second = trendValues.slice(mid).reduce((a, b) => a + b, 0) / (trendValues.length - mid);
    if (second > first * 1.1) return 'up';
    if (second < first * 0.9) return 'down';
    return 'flat';
  }, [trendValues]);

  const handleExpandMember = (memberId: string, row: Record<string, unknown>) => {
    if (expandedMember === memberId) { setExpandedMember(null); return; }
    setExpandedMember(memberId);
    if (!traces.has(memberId) && dataset) {
      const trace = traceMember(ir, row, dataset, (c) => describeCondition(c, catalog));
      setTraces(prev => new Map(prev).set(memberId, trace));
    }
  };

  const filteredMembers = useMemo(() => {
    if (!evaluation) return [];
    const q = search.toLowerCase();
    if (!q) return evaluation.members;
    return evaluation.members.filter(m => {
      const { label, sublabel } = m;
      return label.toLowerCase().includes(q) || sublabel.toLowerCase().includes(q);
    });
  }, [evaluation, search]);

  if (isEmptyIR(ir)) {
    return (
      <div className={cn('flex flex-col items-center justify-center text-center p-8', className)}>
        <Users className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-600">No preview yet</p>
        <p className="text-xs text-slate-400 mt-1">Add conditions or describe your audience to see a preview</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">Preview</h3>
        <div className="flex items-center gap-2">
          {validation && validation.issues.length > 0 && (
            <button onClick={() => setShowIssues(v => !v)} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              {validation.issues.length}
            </button>
          )}
          {evaluating && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>
      </div>

      {/* Validation issues */}
      {showIssues && validation && validation.issues.length > 0 && (
        <div className="border-b border-slate-200 px-4 py-2 bg-amber-50 space-y-1 max-h-32 overflow-y-auto">
          {validation.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              <AlertTriangle className={cn('w-3 h-3 mt-0.5 shrink-0', issue.severity === 'error' ? 'text-red-500' : 'text-amber-500')} />
              <span className="text-slate-700">{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {evaluation ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 p-4">
            <div>
              <p className="text-xs text-slate-500">Members</p>
              <p className="text-2xl font-bold text-slate-900">{evaluation.total.toLocaleString()}</p>
              <p className="text-xs text-slate-400">
                {evaluation.percent.toFixed(1)}% of {evaluation.universe.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Trend</p>
              <div className="flex items-center gap-1.5 mt-1">
                {trendDirection === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
                {trendDirection === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                {trendDirection === 'flat' && <Minus className="w-4 h-4 text-slate-400" />}
                <Sparkline data={trendValues} className="w-[80px] h-6" />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="px-4 pb-3">
            <p className="text-xs text-slate-500 italic">{summarizeCohort(ir, catalog)}</p>
            {evaluation.elapsedMs > 0 && (
              <p className="text-xs text-slate-400 mt-1">{evaluation.elapsedMs}ms{evaluation.sampled ? ' (sampled)' : ''}</p>
            )}
          </div>

          {/* Members */}
          <div className="flex-1 min-h-0 flex flex-col border-t border-slate-200">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search members…"
                className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
              />
              <span className="text-xs text-slate-400">{filteredMembers.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredMembers.slice(0, 50).map(member => {
                const expanded = expandedMember === member.id;
                const trace = traces.get(member.id);
                return (
                  <div key={member.id} className="border-b border-slate-50">
                    <button
                      onClick={() => handleExpandMember(member.id, member.row)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-slate-50"
                    >
                      <ChevronRight className={cn('w-3 h-3 text-slate-400 transition-transform shrink-0', expanded && 'rotate-90')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 truncate">{member.label}</p>
                        <p className="text-xs text-slate-400 truncate">{member.sublabel}</p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    </button>
                    {expanded && trace && (
                      <div className="px-4 pb-3 pl-9 space-y-1">
                        {trace.lines.map((line, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs">
                            {line.matched
                              ? <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                              : <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />}
                            <span className="text-slate-600">{line.text}</span>
                            <span className="text-slate-400 ml-auto shrink-0">{line.observed}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredMembers.length > 50 && (
                <p className="px-4 py-2 text-xs text-slate-400 text-center">
                  Showing 50 of {filteredMembers.length}
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          {evaluating
            ? <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
            : <p className="text-xs text-slate-400">Evaluating…</p>}
        </div>
      )}
    </div>
  );
}
