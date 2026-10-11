import { useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Flame,
  Globe2,
  Mail,
  MessageSquare,
  Phone,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { TableHealthProfile } from '@/lib/data-health-engine';
import { DATA_QUALITY_DIMENSIONS } from '@/lib/data-health-engine';

type Props = {
  profile: TableHealthProfile;
  allProfiles: TableHealthProfile[];
  onSelectTab: (tab: string) => void;
  onRunScan: () => void;
  isScanning: boolean;
};

export function DataHealthOverviewTab({
  profile,
  allProfiles,
  onSelectTab,
  onRunScan,
  isScanning,
}: Props) {
  const avgHealthScore = useMemo(() => {
    if (!allProfiles.length) return profile.healthScore;
    const sum = allProfiles.reduce((acc, p) => acc + p.healthScore, 0);
    return Math.round(sum / allProfiles.length);
  }, [allProfiles, profile.healthScore]);

  const totalRecords = allProfiles.reduce((acc, p) => acc + p.recordCount, 0);
  const totalDuplicates = allProfiles.reduce((acc, p) => acc + p.marketingReachability.duplicateCount, 0);
  const totalCritical = allProfiles.reduce((acc, p) => acc + p.criticalIssues, 0);
  const totalWarnings = allProfiles.reduce((acc, p) => acc + p.warningIssues, 0);

  const reachability = profile.marketingReachability;

  return (
    <div className="space-y-6">
      {/* Top Executive Health Score Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl lg:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-36 -mb-16 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-300 backdrop-blur-md border border-white/10">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Executive Data Observability
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white lg:text-3xl">
              Enterprise Data Health Center
            </h2>
            <p className="max-w-2xl text-xs text-slate-300 leading-relaxed">
              Real-time data quality, identity connectivity, marketing reachability, and database intelligence across your customer datasets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Score Ring */}
            <div className="flex items-center gap-3.5 rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 shadow-inner">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30">
                <span className="font-mono text-2xl font-black">{avgHealthScore}</span>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Overall Health Score</p>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>+3.4% from last week</span>
                </div>
              </div>
            </div>

            <Button
              onClick={onRunScan}
              disabled={isScanning}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-5 rounded-2xl shadow-lg transition"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Running Deep Profiling…' : 'Run Full Health Scan'}
            </Button>
          </div>
        </div>

        {/* Quick KPI Cards Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Records</p>
            <p className="mt-1 font-mono text-xl font-black text-white">{totalRecords.toLocaleString()}</p>
            <p className="text-[10px] text-emerald-400 font-medium mt-0.5">100% Ingested</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Critical Issues</p>
            <p className="mt-1 font-mono text-xl font-black text-rose-400">{totalCritical}</p>
            <p className="text-[10px] text-rose-300/80 font-medium mt-0.5">Requires Fix</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Warnings</p>
            <p className="mt-1 font-mono text-xl font-black text-amber-400">{totalWarnings}</p>
            <p className="text-[10px] text-amber-300/80 font-medium mt-0.5">Optimization</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duplicates</p>
            <p className="mt-1 font-mono text-xl font-black text-purple-400">{totalDuplicates}</p>
            <p className="text-[10px] text-purple-300/80 font-medium mt-0.5">Auto-mergeable</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Reachable</p>
            <p className="mt-1 font-mono text-xl font-black text-teal-400">{reachability.emailReachablePercent}%</p>
            <p className="text-[10px] text-teal-300/80 font-medium mt-0.5">RFC Verified</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Omnichannel</p>
            <p className="mt-1 font-mono text-xl font-black text-indigo-400">{reachability.omnichannelReachablePercent}%</p>
            <p className="text-[10px] text-indigo-300/80 font-medium mt-0.5">Cross-channel</p>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Top Problems & Business Impact vs Quality Dimensions */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Top Problems & Business Impact */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-900">Top Detected Problems & Business Impact</h3>
              </div>
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                Action Required
              </span>
            </div>

            <div className="space-y-3">
              {/* Problem 1 */}
              <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-950">
                        Duplicate Customer Identities Detected ({profile.duplicateClusters[0]?.duplicateCount ?? 17} records)
                      </h4>
                      <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                        Identical email and mobile addresses exist across multiple customer records with conflicting profile tags.
                      </p>
                    </div>
                  </div>
                  <span className="rounded bg-rose-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shrink-0">
                    Critical
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2.5 text-[11px] text-slate-700 border border-rose-100 font-medium">
                  💼 <strong className="text-slate-900">Business Impact:</strong> 3 active Audiences and 7 Campaigns may suffer from duplicate message fatigue and distorted conversion reporting.
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">Suggested Action: Run 1-Click Identity Deduplication</span>
                  <Button
                    size="sm"
                    onClick={() => onSelectTab('identity')}
                    className="h-7 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Resolve Duplicates →
                  </Button>
                </div>
              </div>

              {/* Problem 2 */}
              <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-950">
                        Missing B-Tree Indexes on Foreign Key Join Columns
                      </h4>
                      <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                        Columns <code className="font-mono text-amber-900">email</code> and <code className="font-mono text-amber-900">customer_id</code> in {profile.tableName} lack indexes for audience queries.
                      </p>
                    </div>
                  </div>
                  <span className="rounded bg-amber-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shrink-0">
                    Performance
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2.5 text-[11px] text-slate-700 border border-amber-100 font-medium">
                  💼 <strong className="text-slate-900">Business Impact:</strong> Real-time journey triggers take 4.8x longer to evaluate audience filters.
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">Suggested Action: Apply Recommended Index DDL</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSelectTab('database')}
                    className="h-7 text-xs font-bold border-amber-200 text-amber-900"
                  >
                    View Query Doctor →
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Data Quality Dimensions */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Quality Dimensions (Weighted)</h3>
              </div>
              <span className="text-xs font-bold text-indigo-600">Enterprise SLA</span>
            </div>

            <div className="space-y-3">
              {DATA_QUALITY_DIMENSIONS.map((dim) => (
                <div
                  key={dim.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-2 hover:border-slate-200 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{dim.name}</h4>
                      <p className="text-[10px] text-slate-500">{dim.description}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm font-black text-slate-900">{dim.score}%</span>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Weight: {dim.weight}%</p>
                    </div>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        dim.score >= 95
                          ? 'bg-emerald-500'
                          : dim.score >= 85
                          ? 'bg-indigo-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                    {dim.metrics.map((m, i) => (
                      <span key={i}>
                        {m.label}: <strong className="text-slate-800">{m.value}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Launchers Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => onSelectTab('marketing')}
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-brand-300 hover:shadow-md transition group"
        >
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-900 group-hover:text-brand-600 transition">Campaign Pre-Flight</h4>
            <p className="text-[11px] text-slate-500">Run 10-point check before launch</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-brand-600 transition" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('database')}
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-indigo-300 hover:shadow-md transition group"
        >
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition">SQL Query Doctor</h4>
            <p className="text-[11px] text-slate-500">Optimize joins & missing indexes</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('identity')}
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-purple-300 hover:shadow-md transition group"
        >
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-600 transition">Identity Graph</h4>
            <p className="text-[11px] text-slate-500">Resolve customer duplicates</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-purple-600 transition" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('copilot')}
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-teal-300 hover:shadow-md transition group"
        >
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-900 group-hover:text-teal-600 transition">AI Data Copilot</h4>
            <p className="text-[11px] text-slate-500">Ask questions & auto-remediate</p>
          </div>
          <Sparkles className="h-4 w-4 text-teal-600 group-hover:scale-110 transition" />
        </button>
      </div>
    </div>
  );
}
