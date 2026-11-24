import { useState } from 'react';
import {
  Sparkles,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Send,
  Zap,
  CheckCircle2,
  Users,
  Target,
  DollarSign,
  ChevronRight,
  BarChart2,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import type {
  AIBrainAnalysis,
  ExecutiveBriefing,
  RevenueOpportunity,
  BehavioralSession,
  WebAnalyticsMetrics,
} from '@/lib/web-analytics-types';

interface AIBrainTabProps {
  analysis: AIBrainAnalysis;
  briefing: ExecutiveBriefing;
  opportunities: RevenueOpportunity[];
  sessions: BehavioralSession[];
  metrics: WebAnalyticsMetrics | null;
  onExecuteAction: (actionType: string, payload?: any) => void;
}

export function AIBrainTab({
  analysis,
  briefing,
  opportunities,
  sessions,
  onExecuteAction,
}: AIBrainTabProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executedSuccess, setExecutedSuccess] = useState(false);

  const handleLaunchExecutiveAction = () => {
    setIsExecuting(true);
    setTimeout(() => {
      setIsExecuting(false);
      setExecutedSuccess(true);
      onExecuteAction(analysis.recommendedAction.actionType, analysis.executablePayload);
    }, 1000);
  };

  // Dynamic intent score distribution
  const totalVisitors = sessions.length;
  const ultraIntentCount = sessions.filter((s) => s.intentScore >= 85).length;
  const highIntentCount = sessions.filter((s) => s.intentScore >= 70 && s.intentScore < 85).length;
  const moderateIntentCount = sessions.filter((s) => s.intentScore >= 40 && s.intentScore < 70).length;
  const exploratoryIntentCount = sessions.filter((s) => s.intentScore < 40).length;

  const ultraPct = totalVisitors > 0 ? Math.round((ultraIntentCount / totalVisitors) * 100) : 0;
  const highPct = totalVisitors > 0 ? Math.round((highIntentCount / totalVisitors) * 100) : 0;
  const modPct = totalVisitors > 0 ? Math.round((moderateIntentCount / totalVisitors) * 100) : 0;
  const expPct = totalVisitors > 0 ? Math.round((exploratoryIntentCount / totalVisitors) * 100) : 0;

  // Dynamic personas
  const personaHighIntent = sessions.filter((s) => s.persona === 'High-Intent Buyer').length;
  const personaResearcher = sessions.filter((s) => s.persona === 'In-Depth Researcher').length;
  const personaDealSeeker = sessions.filter((s) => s.persona === 'Deal Seeker').length;
  const personaFrustrated = sessions.filter((s) => s.persona === 'Frustrated User' || s.frictionSignals.length > 0).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ── 1. DAILY EXECUTIVE BRIEFING BANNER ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 text-white shadow-xl border border-indigo-900/50">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                AI Daily Executive Briefing • {briefing.date}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Health Score: {briefing.aiHealthScore}/100
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {briefing.greeting}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {briefing.revenueSummary.keyDriver}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Tracked Pipeline</div>
              <div className="text-xl font-black text-white mt-1">{briefing.revenueSummary.amount}</div>
              <div className="flex items-center justify-center gap-1 text-xs font-bold text-emerald-400 mt-0.5">
                <TrendingUp className="w-3 h-3" />
                Live Stream
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Recoverable Gap</div>
              <div className="text-xl font-black text-emerald-400 mt-1">{briefing.biggestOpportunity.value.split(' ')[0]}</div>
              <div className="text-xs font-semibold text-emerald-200 mt-0.5">{ultraIntentCount + highIntentCount} High-Intent Sessions</div>
            </div>
            <div className="p-4 rounded-2xl bg-indigo-500/10 backdrop-blur-md border border-indigo-500/20 text-center col-span-2 sm:col-span-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">UX Friction Risk</div>
              <div className="text-sm font-bold text-amber-300 mt-2">{briefing.topFrictionRisk.severity}</div>
              <div className="text-[10px] text-slate-400">{briefing.topFrictionRisk.description}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. FLAGSHIP: 5-STEP AI BEHAVIORAL BRAIN INVESTIGATION & ACTION LOOP ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/30 text-white">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Flagship AI Behavioral Brain
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                  Continuous Loop
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                What Happened → Why (RCA) → Who is Affected → What Should I Do → 1-Click Action Execution
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* STEP 1: WHAT HAPPENED */}
          <Card className="p-5 rounded-2xl border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm relative flex flex-col justify-between hover:border-indigo-300 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                  1. What Happened?
                </span>
                <span className="p-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <BarChart2 className="h-4 w-4" />
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {analysis.whatHappened}
              </h4>
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                <span>{analysis.metricImpact.metric}</span>
                <strong>{analysis.metricImpact.changePct > 0 ? `+${analysis.metricImpact.changePct}%` : `${analysis.metricImpact.changePct}%`}</strong>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center text-[11px] text-slate-500 font-medium">
              <span>Automated Anomaly Detector</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-400" />
            </div>
          </Card>

          {/* STEP 2: WHY ROOT CAUSE (RCA) */}
          <Card className="p-5 rounded-2xl border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm relative flex flex-col justify-between hover:border-indigo-300 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                  2. Why? (RCA)
                </span>
                <span className="p-1 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {analysis.whyRootCause.summary}
              </p>
              <div className="space-y-1.5 pt-1">
                {analysis.whyRootCause.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="truncate pr-2">• {f.label}</span>
                    <strong className="text-slate-900 dark:text-white shrink-0">{f.contributionPct}%</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center text-[11px] text-slate-500 font-medium">
              <span>Diagnostic Tree Evaluated</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-400" />
            </div>
          </Card>

          {/* STEP 3: WHO IS AFFECTED */}
          <Card className="p-5 rounded-2xl border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm relative flex flex-col justify-between hover:border-indigo-300 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                  3. Who is Affected?
                </span>
                <span className="p-1 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {analysis.whoAffected.totalUsers.toLocaleString()}
                <span className="text-xs font-medium text-slate-500 ml-1">users</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                {analysis.whoAffected.segmentDescription}
              </p>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg truncate">
                Device: {analysis.whoAffected.topDevice}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center text-[11px] text-slate-500 font-medium">
              <span>Dynamic Cohort Clustered</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-400" />
            </div>
          </Card>

          {/* STEP 4: WHAT SHOULD I DO */}
          <Card className="p-5 rounded-2xl border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm relative flex flex-col justify-between hover:border-indigo-300 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                  4. What Should I Do?
                </span>
                <span className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <Target className="h-4 w-4" />
                </span>
              </div>
              <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                {analysis.recommendedAction.title}
              </h5>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-3">
                {analysis.recommendedAction.description}
              </p>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {analysis.recommendedAction.expectedGain}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center text-[11px] text-slate-500 font-medium">
              <span>Prescriptive Action Synthesis</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-400" />
            </div>
          </Card>

          {/* STEP 5: EXECUTE ACTION */}
          <Card className="p-5 rounded-2xl border-2 border-indigo-500/50 bg-gradient-to-b from-indigo-50/50 to-white dark:from-indigo-950/30 dark:to-slate-900 shadow-md relative flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold tracking-wider uppercase text-indigo-700 dark:text-indigo-300">
                  5. Execute Action
                </span>
                <span className="p-1 rounded-lg bg-indigo-600 text-white animate-bounce">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  1-Click Marketing Journey
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  Deploy automated omni-channel engagement targeting affected users.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 font-mono">
                {analysis.executablePayload.templateTitle}
              </div>
            </div>

            <div className="mt-4">
              <Button
                onClick={handleLaunchExecutiveAction}
                disabled={isExecuting || executedSuccess}
                className={`w-full text-xs font-bold py-2.5 rounded-xl transition-all shadow-md ${
                  executedSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/25'
                }`}
              >
                {isExecuting ? (
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 animate-spin" />
                    Deploying Journey...
                  </span>
                ) : executedSuccess ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Journey Activated!
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    Deploy Journey (1-Click)
                  </span>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── 3. REVENUE OPPORTUNITY FINDER ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              AI Revenue Opportunity Finder
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Forward-looking pipeline recovery & active expansion opportunities quantified by AI.
            </p>
          </div>
        </div>

        {opportunities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-8 text-center space-y-2">
            <DollarSign className="w-8 h-8 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Unconverted Revenue Leaks Detected</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All active sessions have either converted or are exploratory. Opportunities will dynamically appear when unconverted high-intent sessions are recorded.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {opportunities.map((opp) => (
              <Card
                key={opp.id}
                className="p-5 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {opp.frictionType}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                      {opp.channel.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {opp.estimatedRevenue}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {opp.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {opp.description}
                  </p>
                  <div className="text-xs text-slate-500">
                    Audience Size: <strong className="text-slate-800 dark:text-slate-200">{opp.affectedUsersCount.toLocaleString()} Session(s)</strong>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => onExecuteAction('launch_campaign', { opportunity: opp })}
                  className="w-full text-xs font-bold rounded-xl border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-800 dark:text-slate-200"
                >
                  {opp.actionLabel}
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── 4. PREDICTIVE INTENT & PERSONA CLUSTERS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-500" />
              AI Behavioral Intent Score Distribution (0–100)
            </h4>
            <span className="text-xs font-semibold text-slate-400">{totalVisitors} Total Session(s)</span>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Ultra-High Purchase Intent (Score 85–100)', count: ultraIntentCount, pct: ultraPct, color: 'bg-emerald-500', desc: 'Pricing comparison, cart additions, checkout step' },
              { label: 'High Intent Buyers (Score 70–84)', count: highIntentCount, pct: highPct, color: 'bg-indigo-500', desc: 'Deep active reading time & repeated CTA clicks' },
              { label: 'Moderate Consideration (Score 40–69)', count: moderateIntentCount, pct: modPct, color: 'bg-amber-500', desc: 'Multi-page feature exploration' },
              { label: 'Exploratory & Casual (Score 0–39)', count: exploratoryIntentCount, pct: expPct, color: 'bg-slate-400', desc: 'Landing glance or brief navigation' },
            ].map((tier, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>{tier.label}</span>
                  <span className="font-mono text-slate-900 dark:text-white">{tier.count} ({tier.pct}%)</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${tier.color}`} style={{ width: `${tier.pct}%` }} />
                </div>
                <div className="text-[10px] text-slate-400">{tier.desc}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-500" />
              Auto-Discovered Behavioral Personas
            </h4>
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">AI Clustering</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { title: 'High-Intent Buyer', count: personaHighIntent, tag: 'High Velocity', desc: 'Direct checkout focus with high conversion readiness.', color: 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20' },
              { title: 'In-Depth Researcher', count: personaResearcher, tag: 'High Dwell', desc: 'Multi-page exploration across docs and comparisons.', color: 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20' },
              { title: 'Deal Seeker', count: personaDealSeeker, tag: 'Promo Driven', desc: 'Clicks pricing toggles and discounts.', color: 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' },
              { title: 'Frustrated User', count: personaFrustrated, tag: 'UX Friction', desc: 'Encountered client-side friction or validation hurdles.', color: 'border-red-300 bg-red-50/50 dark:bg-red-950/20' },
            ].map((p, i) => (
              <div key={i} className={`p-3.5 rounded-xl border ${p.color} space-y-1.5`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{p.title}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-2xs">
                    {p.tag}
                  </span>
                </div>
                <div className="text-lg font-black text-slate-800 dark:text-slate-100">{p.count}</div>
                <p className="text-[11px] text-slate-500 leading-snug">{p.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
