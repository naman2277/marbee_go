import React from 'react';
import { GitBranch, Activity, CheckCircle2 } from 'lucide-react';

export function AiAgentUpdatesTab() {
  const updates = [
    {
      version: 'v3.2.0 (Active Release)',
      date: 'Current Live Build',
      badge: 'Major Platform Update',
      title: 'Voice & Avatar AI Engines + Live LLM Integration',
      points: [
        'Integrated RunwayML GWM-1, ElevenLabs Conversational Voice, HeyGen, and Tavus streaming adapters.',
        'Real-time Google Gemini 2.0 Flash & OpenAI GPT-4o inference evaluation in AI Sandbox and AI Copilot.',
        'Live Marbee CRM database telemetry & schema RAG injection into all reasoning requests.',
        'Instant response regeneration, copy-to-clipboard, and multi-model switching.',
      ],
    },
    {
      version: 'v3.1.0',
      date: 'Recent Update',
      badge: 'Channels & Delivery',
      title: 'Web Push VAPID & WhatsApp Meta Business Dispatch',
      points: [
        'Native Web Push VAPID subscription management & Firebase FCM delivery relay.',
        'Interactive WhatsApp buttons and catalog carousels with two-way webhook ingestion.',
        'Automated 410 Gone push token hygiene worker.',
      ],
    },
    {
      version: 'v3.0.0',
      date: 'Core Foundation',
      badge: 'Architecture',
      title: 'Visual Automation Journeys & Dynamic SQL Audiences',
      points: [
        'Node-based visual canvas for multi-channel trigger delays and conditional branches.',
        'PostgreSQL RFM customer cohort segmentation engine.',
        'Multi-tenant RBAC permissions and audit logging.',
      ],
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/90 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 font-extrabold text-sm border border-purple-200 shadow-xs">
              <GitBranch className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-black text-slate-900">Platform Releases &amp; System Pulse</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Real platform changelog, module enhancements, and gateway operational status.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 shadow-xs">
          <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
          <span>All Gateways Operational</span>
        </div>
      </div>

      {/* Release Cards */}
      <div className="space-y-4">
        {updates.map((upd, idx) => (
          <div
            key={idx}
            className="rounded-3xl bg-white p-6 border border-slate-200/90 space-y-4 shadow-2xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="rounded-full bg-purple-50 px-3 py-0.5 text-xs font-bold text-purple-700 border border-purple-200">
                  {upd.badge}
                </span>
                <h3 className="text-sm font-black text-slate-900">{upd.title}</h3>
              </div>

              <span className="text-xs font-mono text-slate-400">{upd.version} &bull; {upd.date}</span>
            </div>

            <ul className="space-y-2">
              {upd.points.map((pt, pIdx) => (
                <li key={pIdx} className="flex items-start gap-2.5 text-xs text-slate-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
