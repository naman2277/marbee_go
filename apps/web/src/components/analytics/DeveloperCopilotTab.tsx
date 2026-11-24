import { useState } from 'react';
import {
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Zap,
  Terminal,
  Activity,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import type { TrackingHealthScore, WebAnalyticsSite } from '@/lib/web-analytics-types';
import { calculateTrackingHealth, generateEventSchema } from '@/lib/ai-behavioral-brain';

interface DeveloperCopilotTabProps {
  site: WebAnalyticsSite | null;
  onCopy: (text: string, label: string) => void;
}

export function DeveloperCopilotTab({ site, onCopy }: DeveloperCopilotTabProps) {
  const [businessType, setBusinessType] = useState<'saas' | 'ecommerce' | 'custom'>('saas');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [health] = useState<TrackingHealthScore>(calculateTrackingHealth(site?.siteId));

  const schemas = generateEventSchema(businessType);

  const siteId = site?.siteId || 'site_k6anf9';
  const writeKey = site?.writeKey || `mb_live_${siteId}`;
  const snippetSdkV2 = `<!-- Marbee AI-Native Behavioral Intelligence SDK v2.0 -->
<script>
(function(w,d,s,id,key){
  if(w.__marbee_loaded) return;
  var j=d.createElement(s); j.async=true;
  j.src="${typeof window !== 'undefined' ? window.location.origin : ''}/sdk/v1/marbee-analytics.js";
  j.setAttribute('data-site', id);
  j.setAttribute('data-write-key', key);
  d.head.appendChild(j);
})(window, document, 'script', '${siteId}', '${writeKey}');
</script>`;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ── 1. TRACKING QUALITY HEALTH SCORE (PILLAR #27) ── */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 md:p-8 text-white shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
              AI Tracking Quality & Schema Health Auditor
            </span>
          </div>
          <h3 className="text-xl font-bold text-white">
            Overall Instrumentation Health: {health.overallScore}/100
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Continuously monitors for broken event schemas, missing user IDs, revenue attribution drop-offs, and naming consistency across your web application.
          </p>
        </div>

        {/* Health Score Breakdown Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Identity Coverage</div>
            <div className="text-lg font-black text-emerald-400 mt-0.5">{health.breakdown.identityCoverage}%</div>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Naming Health</div>
            <div className="text-lg font-black text-indigo-400 mt-0.5">{health.breakdown.namingConsistency}%</div>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Web Vitals</div>
            <div className="text-lg font-black text-white mt-0.5">{health.breakdown.vitalCoverage}%</div>
          </div>
        </div>
      </div>

      {/* ── 2. AUDIT ISSUES & AUTOMATED FIX SNIPPETS ── */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Active Instrumentation Warnings & Fix Recommendations
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {health.issues.map((issue, idx) => (
            <Card
              key={idx}
              className={`p-4 rounded-2xl border ${
                issue.severity === 'critical'
                  ? 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20'
                  : issue.severity === 'warning'
                  ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
              } space-y-2`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                  issue.severity === 'critical'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    : issue.severity === 'warning'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                }`}>
                  {issue.severity}
                </span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-snug">
                {issue.message}
              </p>
              {issue.fixSnippet && (
                <div className="relative mt-2">
                  <pre className="p-2.5 rounded-xl bg-slate-900 text-indigo-300 font-mono text-[11px] overflow-x-auto">
                    {issue.fixSnippet}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCopy(issue.fixSnippet!, 'Fix snippet')}
                    className="absolute right-1 top-1 h-6 px-2 text-[10px] text-white hover:bg-white/10"
                  >
                    <Copy className="w-3 h-3 mr-1" /> Copy
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* ── 3. AI EVENT SCHEMA GENERATOR (PILLAR #28) ── */}
      <Card className="p-6 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              AI Event Schema Generator
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select your business model to generate industry-standard, high-fidelity behavioral tracking schemas.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {(['saas', 'ecommerce', 'custom'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setBusinessType(type)}
                className={`px-3 py-1 text-xs font-bold rounded-lg uppercase tracking-wider transition ${
                  businessType === type
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {schemas.map((s, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between font-mono text-xs text-slate-800 dark:text-slate-200"
            >
              <span className="truncate pr-2">{s}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onCopy(s, 'Schema');
                  setCopiedIndex(idx);
                  setTimeout(() => setCopiedIndex(null), 1500);
                }}
                className="h-7 px-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                {copiedIndex === idx ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 4. COPY-PASTE SDK SNIPPET (v2.0) ── */}
      <Card className="p-6 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-500" />
              Marbee SDK v2.0 Installation Snippet
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Zero-config runtime (&lt;8KB) with built-in autocapture, rage click detection, and web vitals.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => onCopy(snippetSdkV2, 'SDK Script')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Code
          </Button>
        </div>

        <pre className="p-4 rounded-2xl bg-slate-950 text-indigo-300 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
          {snippetSdkV2}
        </pre>
      </Card>

      {/* ── 5. INTERACTIVE LIVE SDK EVENT DEBUGGER & SIMULATOR ── */}
      <Card className="p-6 rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Live SDK Event Simulator & Verification Debugger
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Instantly dispatch live behavioral events to verify real-time processing, attention tracking, and AI root cause detection.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Button
            variant="outline"
            onClick={async () => {
              const { ingestWebAnalyticsEvents } = await import('@/lib/web-analytics');
              await ingestWebAnalyticsEvents({
                site_id: siteId,
                origin: window.location.origin,
                events: [
                  {
                    eventName: 'pageview',
                    path: '/pricing',
                    pageTitle: 'Pricing & Plans',
                    clientTimestamp: new Date().toISOString(),
                    properties: { section: 'pricing' },
                  },
                ],
              });
              onCopy('', 'Dispatched Live Pageview Event');
              window.location.reload();
            }}
            className="text-xs font-bold rounded-xl border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-slate-300"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
            Send Pageview
          </Button>

          <Button
            variant="outline"
            onClick={async () => {
              const { ingestWebAnalyticsEvents } = await import('@/lib/web-analytics');
              await ingestWebAnalyticsEvents({
                site_id: siteId,
                origin: window.location.origin,
                events: [
                  {
                    eventName: 'cta_click',
                    path: '/pricing',
                    clientTimestamp: new Date().toISOString(),
                    properties: { element: 'Buy Pro Tier', isCTA: true, value: 4999 },
                  },
                ],
              });
              onCopy('', 'Dispatched Live CTA Click');
              window.location.reload();
            }}
            className="text-xs font-bold rounded-xl border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-300"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
            Send CTA Click
          </Button>

          <Button
            variant="outline"
            onClick={async () => {
              const { ingestWebAnalyticsEvents } = await import('@/lib/web-analytics');
              await ingestWebAnalyticsEvents({
                site_id: siteId,
                origin: window.location.origin,
                events: [
                  {
                    eventName: 'friction_detected',
                    path: '/checkout',
                    clientTimestamp: new Date().toISOString(),
                    properties: { frictionType: 'rage_click', element: '#payment-btn', taps: 4 },
                  },
                ],
              });
              onCopy('', 'Dispatched Rage Click Signal');
              window.location.reload();
            }}
            className="text-xs font-bold rounded-xl border-slate-200 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-slate-700 dark:text-slate-300"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
            Send Rage Click
          </Button>

          <Button
            variant="outline"
            onClick={async () => {
              const { ingestWebAnalyticsEvents } = await import('@/lib/web-analytics');
              await ingestWebAnalyticsEvents({
                site_id: siteId,
                origin: window.location.origin,
                events: [
                  {
                    eventName: 'purchase_completed',
                    path: '/checkout/success',
                    clientTimestamp: new Date().toISOString(),
                    properties: { orderId: `ord_${Date.now()}`, revenue: 2499, currency: 'INR' },
                  },
                ],
              });
              onCopy('', 'Dispatched Purchase Event');
              window.location.reload();
            }}
            className="text-xs font-bold rounded-xl border-slate-200 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-slate-700 dark:text-slate-300"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-purple-500" />
            Send Purchase
          </Button>
        </div>
      </Card>
    </div>
  );
}
