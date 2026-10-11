import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Code,
  Copy,
  Cpu,
  Database,
  KeyRound,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Terminal,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { TableHealthProfile } from '@/lib/data-health-engine';
import { runQueryDoctor } from '@/lib/data-health-engine';

type Props = {
  profile: TableHealthProfile;
};

const SAMPLE_QUERY = `SELECT * 
FROM customers 
JOIN events 
WHERE email LIKE '%@gmail.com'
ORDER BY created_at DESC;`;

export function DatabaseQueryDoctorTab({ profile }: Props) {
  const [sqlInput, setSqlInput] = useState(SAMPLE_QUERY);
  const [copiedSql, setCopiedSql] = useState(false);

  const analysis = runQueryDoctor(sqlInput);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Primary Key & Foreign Key Intelligence */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* PK Intelligence */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-600" />
              <h4 className="text-xs font-bold text-slate-900">Primary Key Health Intelligence</h4>
            </div>
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              100% Unique
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
              <span className="text-slate-500 font-medium">Identifier Column:</span>
              <span className="font-mono font-bold text-indigo-700">{profile.primaryKeyHealth.keyColumn}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
              <span className="text-slate-500 font-medium">Uniqueness & Stability:</span>
              <span className="font-bold text-emerald-700">{profile.primaryKeyHealth.confidence}% Confidence</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
              <span className="text-slate-500 font-medium">Underlying B-Tree Index:</span>
              <span className="font-bold text-slate-800">Present (Active)</span>
            </div>
          </div>
        </div>

        {/* Join Intelligence */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">Foreign Key & Join Integrity</h4>
            </div>
            <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
              1:N Relational Link
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {profile.foreignKeys.map((fk, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-1.5">
                <div className="flex items-center justify-between font-mono font-bold text-indigo-950 text-[11px]">
                  <span>{fk.parentTable}.{fk.parentColumn}</span>
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                  <span>{fk.childTable}.{fk.childColumn}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span>Match Rate: <strong className="text-emerald-700">{fk.matchPercent}%</strong></span>
                  <span>Orphan Rate: <strong className="text-slate-700">{fk.orphanPercent}%</strong></span>
                  <span>Confidence: <strong className="text-indigo-700">{fk.confidence}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive SQL Query Doctor */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-rose-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Interactive SQL Query Doctor</h3>
              <p className="text-xs text-slate-500">Detect Cartesian explosions, missing indexes, and unindexed table scans.</p>
            </div>
          </div>
          <span className="rounded-full bg-rose-50 px-3 py-1 font-mono text-xs font-black text-rose-700">
            Score: {analysis.performanceScore}/100
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* SQL Input Editor */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Input SQL Query
            </label>
            <textarea
              value={sqlInput}
              onChange={(e) => setSqlInput(e.target.value)}
              rows={8}
              className="w-full rounded-xl border border-slate-300 bg-slate-900 p-3 font-mono text-xs text-emerald-300 shadow-inner focus:border-brand-400 focus:outline-hidden"
            />
          </div>

          {/* Diagnosis & Recommendations */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Diagnosis & Detected Bottlenecks ({analysis.issues.length})
            </label>

            <div className="max-h-[190px] space-y-2 overflow-y-auto pr-1">
              {analysis.issues.length === 0 ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs font-medium text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  Query follows optimal index execution paths. Zero slow operations detected.
                </div>
              ) : (
                analysis.issues.map((iss, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 space-y-0.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-rose-950">{iss.title}</h5>
                      <span className="rounded bg-rose-600 px-1.5 py-0.2 text-[8px] font-black uppercase text-white">
                        {iss.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">{iss.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Suggested Optimized Query */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <h4 className="text-xs font-bold text-emerald-950">Query Doctor Suggested Rewrite ({analysis.estimatedSpeedup})</h4>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleCopy(analysis.improvedQuery)}
              className="h-7 text-xs font-bold"
            >
              {copiedSql ? <Check className="mr-1 h-3 w-3 text-emerald-600" /> : <Copy className="mr-1 h-3 w-3" />}
              {copiedSql ? 'Copied' : 'Copy SQL'}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-300">
            {analysis.improvedQuery}
          </pre>
        </div>
      </div>
    </div>
  );
}
