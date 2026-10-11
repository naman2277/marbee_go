import React from 'react';
import { BUDDY_AGENTS, type BuddyAgent } from './AiAgentSidebar';
import {
  Sparkles,
  Bot,
  Zap,
  Activity,
  MessageSquare,
  Video,
  Database,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Cpu,
  Clock,
  Layers,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiMeetBuddyDashboardTabProps {
  activeSpecialist: BuddyAgent;
  onStartDiscussion: () => void;
  onOpenAgentPicker: () => void;
}

export function AiMeetBuddyDashboardTab({
  activeSpecialist,
  onStartDiscussion,
  onOpenAgentPicker,
}: AiMeetBuddyDashboardTabProps) {
  const stats = [
    {
      label: 'Queries Answered',
      value: '284',
      change: '+18% today',
      icon: MessageSquare,
      color: 'text-purple-600 bg-purple-50 border-purple-200',
    },
    {
      label: 'Avg Response Latency',
      value: '186ms',
      change: 'Sub-second real-time',
      icon: Zap,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      label: 'Live Schema Telemetry',
      value: '100% Synced',
      change: 'Supabase PostgreSQL',
      icon: Database,
      color: 'text-sky-600 bg-sky-50 border-sky-200',
    },
    {
      label: 'Active Specialist Squad',
      value: '3 Online / 1 Offline',
      change: '4 Indian Personas',
      icon: Users,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
  ];

  const capabilities = [
    {
      title: 'Context-Augmented Reasoning (RAG)',
      desc: 'Injects live customer counts, campaign states, and schema definitions into every prompt.',
      icon: Cpu,
    },
    {
      title: 'Real-Time Voice & Video Portal',
      desc: 'Interactive WebRTC speech synthesis with distinct female/male pitch profiles.',
      icon: Video,
    },
    {
      title: 'Visual Automation Blueprint Generator',
      desc: 'Instantly plans multi-stage journey triggers, wait nodes, and web push fallbacks.',
      icon: Layers,
    },
    {
      title: 'PostgreSQL RFM Cohort Segmentation',
      desc: 'Generates deduplicated, partition-indexed SQL queries for customer cohorts.',
      icon: Database,
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-8 space-y-6 max-w-5xl mx-auto font-sans">
      {/* 1. HERO CARD: ACTIVE SPECIALIST ABOUT */}
      <div className="rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white relative overflow-hidden shadow-xl border border-purple-800/40">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 relative z-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="relative shrink-0">
              <img
                src={activeSpecialist.imageUrl}
                alt={activeSpecialist.name}
                className="h-20 w-20 rounded-3xl object-cover border-2 border-purple-400/60 shadow-lg"
              />
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-slate-900 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-xs font-bold text-purple-300 bg-purple-500/20 px-2.5 py-0.5 rounded-full border border-purple-400/30 uppercase tracking-wider">
                  Active Specialist
                </span>
                <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Online
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>{activeSpecialist.name}</span>
                <span className="text-sm font-bold text-purple-300 bg-purple-500/30 px-2 py-0.5 rounded-lg border border-purple-400/30">
                  {activeSpecialist.indicName}
                </span>
              </h1>

              <p className="text-xs text-purple-200 font-medium">{activeSpecialist.role}</p>
              <p className="text-xs text-slate-300 italic pt-1 max-w-xl">"{activeSpecialist.greeting}"</p>
            </div>
          </div>

          <div className="flex flex-row md:flex-col gap-2.5 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={onStartDiscussion}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-5 py-2.5 rounded-2xl shadow-lg shadow-purple-600/30 transition cursor-pointer active:scale-95"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Let's Discuss</span>
            </button>

            <button
              type="button"
              onClick={onOpenAgentPicker}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-4 py-2.5 rounded-2xl border border-white/15 transition cursor-pointer"
            >
              <Users className="h-4 w-4" />
              <span>Switch Agent</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. REAL-TIME AI TELEMETRY & STATS */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Live Intelligence Telemetry</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {stats.map((st, i) => {
            const Icon = st.icon;
            return (
              <div key={i} className="rounded-3xl bg-white p-4.5 border border-slate-200/90 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">{st.label}</span>
                  <span className={cn('p-1.5 rounded-xl border', st.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div>
                  <span className="text-lg font-black text-slate-900 block">{st.value}</span>
                  <span className="text-[10px] text-purple-700 font-medium">{st.change}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. CORE PLATFORM CAPABILITIES */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Enterprise AI Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <div key={idx} className="rounded-3xl bg-white p-5 border border-slate-200/90 shadow-2xs flex items-start gap-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 shrink-0 shadow-xs">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-slate-900">{cap.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{cap.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
