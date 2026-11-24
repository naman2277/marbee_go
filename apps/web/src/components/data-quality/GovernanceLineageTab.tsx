import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileCode2,
  GitBranch,
  GitCommit,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { TableHealthProfile } from '@/lib/data-health-engine';

type Props = {
  profile: TableHealthProfile;
};

export function GovernanceLineageTab({ profile }: Props) {
  const [fixedNames, setFixedNames] = useState<string[]>([]);

  const handleFixName = (col: string) => {
    setFixedNames([...fixedNames, col]);
  };

  return (
    <div className="space-y-6">
      {/* End-to-End Visual Data Lineage */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">End-to-End Data Lineage & Downstream Impact</h3>
              <p className="text-xs text-slate-500">Track how upstream schema modifications ripple to audiences, campaigns, and delivery channels.</p>
            </div>
          </div>
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
            Impact Observability
          </span>
        </div>

        {/* Visual Lineage Flow Pipeline */}
        <div className="overflow-x-auto py-3">
          <div className="flex items-center justify-between min-w-[760px] gap-2">
            {/* Step 1: Data Ingestion Source */}
            <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1 text-center shadow-2xs">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">1. Data Source</span>
              <p className="font-bold text-xs text-slate-800">REST API Ingest</p>
              <p className="text-[10px] text-emerald-600 font-medium">Synced 14m ago</p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />

            {/* Step 2: Table */}
            <div className="flex-1 rounded-2xl border-2 border-indigo-500 bg-indigo-50/40 p-3.5 space-y-1 text-center shadow-xs">
              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700">2. Schema Table</span>
              <p className="font-mono font-black text-xs text-indigo-950">{profile.tableName}</p>
              <p className="text-[10px] text-indigo-700 font-medium">{profile.recordCount.toLocaleString()} Records</p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />

            {/* Step 3: Column */}
            <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1 text-center shadow-2xs">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">3. Filter Column</span>
              <p className="font-mono font-bold text-xs text-slate-800">email, status</p>
              <p className="text-[10px] text-slate-500">RFC format check</p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />

            {/* Step 4: Audience */}
            <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1 text-center shadow-2xs">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">4. Audience Cohort</span>
              <p className="font-bold text-xs text-slate-800">VIP Active (90d)</p>
              <p className="text-[10px] text-indigo-600 font-medium">1,240 Members</p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />

            {/* Step 5: Campaign & Channel */}
            <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1 text-center shadow-2xs">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">5. Campaign Dispatch</span>
              <p className="font-bold text-xs text-slate-800">Black Friday Early</p>
              <p className="text-[10px] text-emerald-600 font-medium">Email / WhatsApp</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column: Naming Standardization & Schema Drift */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Schema Naming Governance */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-amber-600" />
              <h4 className="text-xs font-bold text-slate-900">Schema Naming Governance</h4>
            </div>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {profile.namingIssues.length} Inconsistencies
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {profile.namingIssues.length === 0 ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-emerald-900 font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                All schema fields strictly adhere to standard snake_case naming conventions.
              </div>
            ) : (
              profile.namingIssues.map((iss, i) => {
                const isFixed = fixedNames.includes(iss.column);
                return (
                  <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="line-through text-rose-700 font-bold">{iss.column}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="text-emerald-700 font-bold">{iss.recommendedName}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleFixName(iss.column)}
                        disabled={isFixed}
                        className="h-6 text-[10px] font-bold px-2"
                      >
                        {isFixed ? <Check className="h-3 w-3 text-emerald-600" /> : 'Standardize'}
                      </Button>
                    </div>
                    <p className="text-[10px] text-slate-500">{iss.reason}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Schema Drift Tracker (Before vs After) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <GitCommit className="h-4 w-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">Schema Drift Tracker (Before vs After)</h4>
            </div>
            <span className="text-[10px] font-bold text-slate-400">Snapshot 7d Ago</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Column Added:</span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-800">
                  + loyalty_tier (string)
                </span>
              </div>
              <p className="text-[10px] text-slate-500">Added on Aug 14 via schema migration v1.2</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Index Created:</span>
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-800">
                  idx_customers_email (B-Tree)
                </span>
              </div>
              <p className="text-[10px] text-slate-500">Query optimization applied successfully</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
