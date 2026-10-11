import { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Mail,
  MessageSquare,
  Send,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import type { DeliveryPrepData } from '@/lib/delivery-prep';
import { DeliveryContentPreview } from '@/components/journeys/DeliveryContentPreview';
import { channelLabel, type ContentChannel } from '@/lib/content-templates';

type Tab = 'recipients' | 'engagement';

type Props = {
  prep: DeliveryPrepData;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function channelIcon(channel: string) {
  switch (channel) {
    case 'email':
      return Mail;
    case 'sms':
    case 'whatsapp':
      return MessageSquare;
    case 'web_push':
      return Bell;
    default:
      return Smartphone;
  }
}

function recipientLabel(row: Record<string, unknown>): string {
  const email = row.email ? String(row.email) : '';
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
  if (name && email) return `${name} · ${email}`;
  return name || email || String(row.id ?? 'Profile');
}

export function DeliveryPrepModal({ prep, confirming, onConfirm, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('recipients');
  const Icon = channelIcon(prep.channel);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'recipients', label: 'Recipients', count: prep.toSendCount },
    { id: 'engagement', label: 'Engagement', count: prep.engagement.length },
  ];

  const channelName =
    prep.channel in { email: 1, sms: 1, web_push: 1, whatsapp: 1, rcs: 1 }
      ? channelLabel(prep.channel as ContentChannel)
      : prep.channel;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close delivery prep"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50 to-indigo-50 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-600">
                  Delivery ready — confirm to send
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{prep.deliveryName}</h2>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  ID {prep.deliveryId.slice(0, 8)}… · {channelName}
                  {prep.preview.templateName ? ` · ${prep.preview.templateName}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatCard label="Total target" value={prep.totalTarget.toLocaleString()} />
            <StatCard label="Excluded" value={prep.excludedCount.toLocaleString()} tone="amber" />
            <StatCard label="To send" value={prep.toSendCount.toLocaleString()} tone="emerald" highlight />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Message preview</p>
            <div className="mt-3">
              <DeliveryContentPreview
                channel={prep.channel}
                content={prep.deliveryContent}
                compact
                sampleRecipients={prep.sampleRecipients}
              />
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-100 bg-white px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-3 text-xs font-semibold transition ${
                tab === t.id ? 'text-brand-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {t.count != null && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {t.count}
                </span>
              )}
              {tab === t.id && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-600" />
              )}
            </button>
          ))}
        </div>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-6 py-4">
          {tab === 'recipients' && (
            <RecipientsTab prep={prep} label={recipientLabel} />
          )}
          {tab === 'engagement' && <EngagementTab prep={prep} label={recipientLabel} />}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-600">
            {prep.toSendCount === 0
              ? 'No recipients after exclusions — adjust targeting or exclusions before sending.'
              : `Ready to send ${prep.toSendCount.toLocaleString()} message${prep.toSendCount === 1 ? '' : 's'}.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={confirming}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming || prep.toSendCount === 0}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {confirming ? (
                <>Sending…</>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Confirm delivery
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'slate',
  highlight,
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'amber' | 'emerald';
  highlight?: boolean;
}) {
  const toneClass =
    tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        highlight ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function RecipientsTab({
  prep,
  label,
}: {
  prep: DeliveryPrepData;
  label: (row: Record<string, unknown>) => string;
}) {
  if (!prep.sampleRecipients.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">No recipients in the send list.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        Showing {Math.min(prep.sampleRecipients.length, 100)} of {prep.toSendCount.toLocaleString()} profiles
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {prep.sampleRecipients.map((row) => (
          <li key={String(row.id)} className="flex items-center gap-3 px-4 py-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="truncate text-sm text-slate-700">{label(row)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EngagementTab({
  prep,
  label,
}: {
  prep: DeliveryPrepData;
  label: (row: Record<string, unknown>) => string;
}) {
  if (!prep.engagement.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Bell className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">No recent engagement on this channel for this audience.</p>
      </div>
    );
  }

  const sampleMap = new Map(prep.sampleRecipients.map((r) => [String(r.id), r]));

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {prep.engagement.slice(0, 50).map((evt, i) => {
        const profile = sampleMap.get(evt.customer_id);
        return (
          <li key={`${evt.customer_id}-${i}`} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-slate-700">
                {profile ? label(profile) : evt.customer_id.slice(0, 8)}
              </span>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                {evt.event}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {new Date(evt.timestamp).toLocaleString()}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
