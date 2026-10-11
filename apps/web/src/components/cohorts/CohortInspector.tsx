import { useState, useMemo, useEffect } from 'react';
import {
  Code2, FileText, Users, BarChart3, History,
  Copy, Check, Database, Clock, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  compileToSql, explainLines, dataSources, describeCondition,
} from '@/lib/cohorts/compile';
import {
  propertyBreakdown, topEvents, conditionImpact,
  type CohortDataset, type CohortEvaluation,
} from '@/lib/cohorts/evaluate';
import { isEmptyIR, collectConditions, type CohortIR } from '@/lib/cohorts/ir';
import type { SemanticCatalog } from '@/lib/cohorts/catalog';
import { fetchCohortVersions, type CohortVersion } from '@/lib/cohorts/store';

type Tab = 'query' | 'explanation' | 'members' | 'analytics' | 'history';

type CohortInspectorProps = {
  ir: CohortIR;
  catalog: SemanticCatalog;
  evaluation: CohortEvaluation | null;
  dataset: CohortDataset | null;
  cohortId?: string;
  onRestoreVersion?: (ir: CohortIR) => void;
  className?: string;
};

const TABS: { id: Tab; label: string; icon: typeof Code2 }[] = [
  { id: 'query', label: 'Query', icon: Code2 },
  { id: 'explanation', label: 'Explanation', icon: FileText },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'history', label: 'History', icon: History },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 rounded border border-slate-200 hover:bg-slate-50"
    >
      {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
    </button>
  );
}

function QueryTab({ ir, catalog }: { ir: CohortIR; catalog: SemanticCatalog }) {
  const [subTab, setSubTab] = useState<'sql' | 'json'>('sql');
  const compiled = useMemo(() => compileToSql(ir, catalog), [ir, catalog]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
        <button onClick={() => setSubTab('sql')} className={cn('text-xs font-medium px-2 py-0.5 rounded', subTab === 'sql' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700')}>SQL</button>
        <button onClick={() => setSubTab('json')} className={cn('text-xs font-medium px-2 py-0.5 rounded', subTab === 'json' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700')}>JSON</button>
        <div className="flex-1" />
        {compiled.advisory && <span className="text-xs text-amber-500">Advisory — preview runs client-side</span>}
        <CopyButton text={subTab === 'sql' ? compiled.sql : compiled.json} />
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs text-slate-700 font-mono whitespace-pre-wrap">
        {subTab === 'sql' ? compiled.sql : compiled.json}
      </pre>
    </div>
  );
}

function ExplanationTab({ ir, catalog }: { ir: CohortIR; catalog: SemanticCatalog }) {
  const lines = useMemo(() => explainLines(ir, catalog), [ir, catalog]);
  const sources = useMemo(() => dataSources(ir, catalog), [ir, catalog]);

  return (
    <div className="overflow-auto p-4 space-y-4">
      <div className="space-y-1">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2 text-sm" style={{ paddingLeft: `${line.depth * 16}px` }}>
            {line.connector && (
              <span className={cn('text-xs font-medium uppercase shrink-0 mt-0.5',
                line.connector === 'AND' ? 'text-blue-500' : line.connector === 'OR' ? 'text-amber-500' : 'text-red-500'
              )}>
                {line.connector}
              </span>
            )}
            <span className="text-slate-700">{line.text}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
          <Database className="w-3.5 h-3.5" /> Data sources
        </p>
        <div className="flex flex-wrap gap-1.5">
          {sources.events.map(e => <span key={e} className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">{e}</span>)}
          {sources.properties.map(p => <span key={p} className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700">{p}</span>)}
          {sources.metrics.map(m => <span key={m} className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-700">{m}</span>)}
          {sources.cohorts.map(c => <span key={c} className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">{c}</span>)}
        </div>
      </div>
    </div>
  );
}

function MembersTab({ evaluation, search, setSearch }: { evaluation: CohortEvaluation | null; search: string; setSearch: (v: string) => void }) {
  const filtered = useMemo(() => {
    if (!evaluation) return [];
    const q = search.toLowerCase();
    if (!q) return evaluation.members;
    return evaluation.members.filter(m => m.label.toLowerCase().includes(q) || m.sublabel.toLowerCase().includes(q));
  }, [evaluation, search]);

  if (!evaluation) return <p className="p-4 text-xs text-slate-400">Run a preview to see members</p>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter members…"
          className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
        />
        <span className="text-xs text-slate-400">
          {filtered.length} of {evaluation.total.toLocaleString()}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 sticky top-0">
            <tr>
              <th className="text-left px-4 py-1.5 font-medium">Name</th>
              <th className="text-left px-4 py-1.5 font-medium">Email</th>
              <th className="text-left px-4 py-1.5 font-medium">Created</th>
              <th className="text-left px-4 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map(m => (
              <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-1.5 text-slate-800">{m.label}</td>
                <td className="px-4 py-1.5 text-slate-500">{String(m.row.email ?? '')}</td>
                <td className="px-4 py-1.5 text-slate-500">
                  {m.row.created_at ? new Date(String(m.row.created_at)).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-1.5">
                  <span className={cn('px-1.5 py-0.5 rounded text-xs',
                    m.row.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                  )}>
                    {String(m.row.status ?? '—')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsTab({ ir, dataset, catalog }: { ir: CohortIR; dataset: CohortDataset | null; catalog: SemanticCatalog }) {
  if (!dataset) return <p className="p-4 text-xs text-slate-400">Load data to see analytics</p>;

  const impact = useMemo(() => conditionImpact(ir, dataset), [ir, dataset]);
  const conditions = useMemo(() => collectConditions(ir.root), [ir]);
  const breakdown = useMemo(() => {
    const prop = catalog.properties[0]?.key;
    return prop ? propertyBreakdown(ir, dataset, prop) : [];
  }, [ir, dataset, catalog]);
  const events = useMemo(() => topEvents(ir, dataset), [ir, dataset]);

  return (
    <div className="overflow-auto p-4 space-y-4">
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Condition impact</p>
        <div className="space-y-1.5">
          {impact.map((item, i) => {
            const cond = conditions.find(c => c.id === item.nodeId);
            const label = cond ? describeCondition(cond, catalog) : item.nodeId;
            return (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 truncate">{label}</span>
                  <span className="text-slate-500 shrink-0 ml-2">{item.matches} ({item.percent.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(item.percent, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {breakdown.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">
            Property breakdown ({catalog.properties[0]?.label ?? catalog.properties[0]?.key})
          </p>
          <div className="space-y-1">
            {breakdown.map(b => (
              <div key={b.value} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{b.value}</span>
                <span className="text-slate-500">{b.count} ({b.percent.toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Top events</p>
          <div className="space-y-1">
            {events.map(e => (
              <div key={e.name} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{e.name}</span>
                <span className="text-slate-500">{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ cohortId, onRestore }: { cohortId?: string; onRestore?: (ir: CohortIR) => void }) {
  const [versions, setVersions] = useState<CohortVersion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cohortId) return;
    setLoading(true);
    fetchCohortVersions(cohortId).then(setVersions).finally(() => setLoading(false));
  }, [cohortId]);

  if (!cohortId) return <p className="p-4 text-xs text-slate-400">Save the cohort to enable version history</p>;
  if (loading) return <p className="p-4 text-xs text-slate-400">Loading versions…</p>;

  return (
    <div className="overflow-auto">
      {versions.map(v => (
        <div key={v.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50">
          <div className="shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
            <Clock className="w-3 h-3 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-700">v{v.version_number}</span>
              <span className="text-xs text-slate-400">{new Date(v.created_at).toLocaleString()}</span>
            </div>
            {v.summary && <p className="text-xs text-slate-500 mt-0.5">{v.summary}</p>}
            {v.changed_by_name && <p className="text-xs text-slate-400">{v.changed_by_name}</p>}
          </div>
          {onRestore && (
            <button
              onClick={() => onRestore(v.ir_json)}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-brand-600 rounded border border-slate-200 hover:bg-slate-50"
            >
              <RotateCcw className="w-3 h-3" /> Restore
            </button>
          )}
        </div>
      ))}
      {versions.length === 0 && <p className="p-4 text-xs text-slate-400">No versions yet</p>}
    </div>
  );
}

export function CohortInspector({
  ir, catalog, evaluation, dataset, cohortId, onRestoreVersion, className,
}: CohortInspectorProps) {
  const [tab, setTab] = useState<Tab>('query');
  const [memberSearch, setMemberSearch] = useState('');

  if (isEmptyIR(ir)) {
    return (
      <div className={cn('flex items-center justify-center text-xs text-slate-400', className)}>
        Add conditions to inspect the cohort query
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center border-b border-slate-200 px-2 shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'query' && <QueryTab ir={ir} catalog={catalog} />}
        {tab === 'explanation' && <ExplanationTab ir={ir} catalog={catalog} />}
        {tab === 'members' && <MembersTab evaluation={evaluation} search={memberSearch} setSearch={setMemberSearch} />}
        {tab === 'analytics' && <AnalyticsTab ir={ir} dataset={dataset} catalog={catalog} />}
        {tab === 'history' && <HistoryTab cohortId={cohortId} onRestore={onRestoreVersion} />}
      </div>
    </div>
  );
}
