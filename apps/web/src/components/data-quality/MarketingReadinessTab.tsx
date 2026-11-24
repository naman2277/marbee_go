import { useState } from 'react';
import {
  CheckCircle2,
  Globe2,
  Mail,
  MessageCircle,
  MessageSquare,
  Radio,
  Send,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type { TableHealthProfile } from '@/lib/data-health-engine';
import { runCampaignPreflight } from '@/lib/data-health-engine';

type Props = {
  profile: TableHealthProfile;
};

export function MarketingReadinessTab({ profile }: Props) {
  const [selectedCampaign, setSelectedCampaign] = useState('Black Friday VIP Early Access');
  const [selectedAudience] = useState('High-Value Active Buyers (90d)');

  const reachability = profile.marketingReachability;
  const preflight = runCampaignPreflight(selectedCampaign, selectedAudience, reachability);

  return (
    <div className="space-y-6">
      {/* Marketing Reachability Matrix Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Cross-Channel Marketing Reachability Breakdown
            </h3>
          </div>
          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700">
            Activation Readiness
          </span>
        </div>

        {/* 6 Channel Tiles Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {/* Email */}
          <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Email Reachable</span>
              <Mail className="h-4 w-4 text-teal-600" />
            </div>
            <p className="font-mono text-2xl font-black text-teal-950">{reachability.emailReachablePercent}%</p>
            <p className="text-[11px] text-teal-700 font-medium">{reachability.emailValidCount.toLocaleString()} Valid Inboxes</p>
          </div>

          {/* SMS */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">SMS Reachable</span>
              <Smartphone className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="font-mono text-2xl font-black text-emerald-950">{reachability.smsReachablePercent}%</p>
            <p className="text-[11px] text-emerald-700 font-medium">{reachability.smsValidCount.toLocaleString()} E.164 Phones</p>
          </div>

          {/* WhatsApp */}
          <div className="rounded-2xl border border-green-100 bg-green-50/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-green-800">WhatsApp</span>
              <MessageCircle className="h-4 w-4 text-green-600" />
            </div>
            <p className="font-mono text-2xl font-black text-green-950">{reachability.whatsAppReachablePercent}%</p>
            <p className="text-[11px] text-green-700 font-medium">Opt-in Verified</p>
          </div>

          {/* RCS */}
          <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">RCS Messaging</span>
              <MessageSquare className="h-4 w-4 text-sky-600" />
            </div>
            <p className="font-mono text-2xl font-black text-sky-950">{reachability.rcsReachablePercent}%</p>
            <p className="text-[11px] text-sky-700 font-medium">Rich Media Capable</p>
          </div>

          {/* Web Push */}
          <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Web Push</span>
              <Globe2 className="h-4 w-4 text-purple-600" />
            </div>
            <p className="font-mono text-2xl font-black text-purple-950">{reachability.webPushReachablePercent}%</p>
            <p className="text-[11px] text-purple-700 font-medium">Active FCM Tokens</p>
          </div>

          {/* Omnichannel */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">Omnichannel</span>
              <Sparkles className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="font-mono text-2xl font-black text-indigo-950">{reachability.omnichannelReachablePercent}%</p>
            <p className="text-[11px] text-indigo-700 font-medium">3+ Channels Active</p>
          </div>
        </div>
      </div>

      {/* Campaign Pre-Flight Simulator */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Campaign Pre-Flight Verification</h3>
            </div>
            <p className="text-xs text-slate-500">
              Simulate dispatch readiness before executing blast campaigns or journey triggers.
            </p>
          </div>

          {/* Campaign Selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800"
            >
              <option value="Black Friday VIP Early Access">Campaign: Black Friday VIP Early Access</option>
              <option value="Post-Purchase Onboarding Journey">Campaign: Post-Purchase Onboarding Journey</option>
              <option value="Winback 60-Day Dormant Campaign">Campaign: Winback 60-Day Dormant Campaign</option>
            </select>
          </div>
        </div>

        {/* Pre-Flight Score Banner */}
        <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-slate-50 p-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl font-mono text-xl font-black shadow-xs ${
                preflight.status === 'READY'
                  ? 'bg-emerald-600 text-white'
                  : preflight.status === 'WARNING'
                  ? 'bg-amber-500 text-white'
                  : 'bg-rose-600 text-white'
              }`}
            >
              {preflight.readinessScore}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">Pre-Flight Dispatch Status:</h4>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-black uppercase tracking-wider ${
                    preflight.status === 'READY'
                      ? 'bg-emerald-100 text-emerald-800'
                      : preflight.status === 'WARNING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {preflight.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Audience: <strong className="text-slate-700">{selectedAudience}</strong> · Estimated Reachable: <strong className="text-indigo-700">{preflight.estimatedReachableAudience.toLocaleString()}</strong> profiles
              </p>
            </div>
          </div>
        </div>

        {/* 10-Point Pre-Flight Verification List */}
        <div className="grid gap-3 sm:grid-cols-2">
          {preflight.checks.map((chk, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5"
            >
              {chk.status === 'pass' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : chk.status === 'warn' ? (
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h5 className="text-xs font-bold text-slate-800">{chk.name}</h5>
                  <span className="rounded bg-slate-200/60 px-1.5 py-0.2 text-[9px] font-bold uppercase text-slate-600">
                    {chk.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">{chk.message}</p>
                <p className="text-[10px] text-slate-400">{chk.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
