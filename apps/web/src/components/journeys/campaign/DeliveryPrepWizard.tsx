import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
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

type Step = 'overview' | 'target' | 'content' | 'confirm';

const STEPS: { id: Step; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'target', label: 'Target population' },
  { id: 'content', label: 'Content' },
  { id: 'confirm', label: 'Confirm & send' },
];

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

export function DeliveryPrepWizard({ prep, confirming, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<Step>('overview');
  const Icon = channelIcon(prep.channel);
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const channelName =
    prep.channel in { email: 1, sms: 1, web_push: 1, whatsapp: 1 }
      ? channelLabel(prep.channel as ContentChannel)
      : prep.channel;

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  };
  const goPrev = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  };

  return (
    <div className="fixed inset-0 z-[200] flex bg-white">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="text-xs font-medium text-slate-500">Delivery preparation</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{prep.deliveryName}</p>
        </div>
        <nav className="flex-1 p-3">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                step === s.id
                  ? 'bg-blue-50 text-blue-700'
                  : i < stepIndex
                    ? 'text-emerald-700 hover:bg-slate-100'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < stepIndex
                    ? 'bg-emerald-100 text-emerald-700'
                    : step === s.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {i < stepIndex ? '✓' : i + 1}
              </span>
              {s.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onCancel}
          className="m-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" />
          Cancel delivery
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{STEPS[stepIndex]?.label}</h2>
              <p className="text-xs text-slate-500">
                {channelName} · ID {prep.deliveryId.slice(0, 8)}
              </p>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <MiniStat label="Target" value={prep.totalTarget} />
            <MiniStat label="Excluded" value={prep.excludedCount} tone="text-amber-600" />
            <MiniStat label="To send" value={prep.toSendCount} tone="text-emerald-600" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {step === 'overview' && <OverviewStep prep={prep} channelName={channelName} />}
          {step === 'target' && <TargetStep prep={prep} label={recipientLabel} />}
          {step === 'content' && <ContentStep prep={prep} />}
          {step === 'confirm' && <ConfirmStep prep={prep} channelName={channelName} />}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={goPrev}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          {step === 'confirm' ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming || prep.toSendCount === 0}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {confirming ? 'Deploying…' : (
                <>
                  <Send className="h-4 w-4" />
                  Deploy delivery
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone ?? 'text-slate-900'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function OverviewStep({ prep, channelName }: { prep: DeliveryPrepData; channelName: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h3 className="text-sm font-semibold text-slate-900">Delivery summary</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Delivery name</dt>
            <dd className="font-medium text-slate-900">{prep.deliveryName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Channel</dt>
            <dd className="font-medium text-slate-900">{channelName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Template</dt>
            <dd className="font-medium text-slate-900">{prep.preview.templateName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Delivery ID</dt>
            <dd className="font-mono text-xs text-slate-500">{prep.deliveryId}</dd>
          </div>
        </dl>
      </div>
      <p className="text-sm text-slate-600">
        Review target population and content before deploying. This delivery will be sent to{' '}
        <strong className="text-emerald-700">{prep.toSendCount.toLocaleString()}</strong> recipients
        after confirmation.
      </p>
    </div>
  );
}

function TargetStep({
  prep,
  label,
}: {
  prep: DeliveryPrepData;
  label: (row: Record<string, unknown>) => string;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4 text-sm text-slate-600">
        {prep.toSendCount.toLocaleString()} profiles will receive this delivery.
      </p>
      <RecipientList prep={prep} label={label} />
    </div>
  );
}

function ContentStep({ prep }: { prep: DeliveryPrepData }) {
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Message preview</p>
      <DeliveryContentPreview
        channel={prep.channel}
        content={prep.deliveryContent}
        compact
        sampleRecipients={prep.sampleRecipients}
      />
    </div>
  );
}

function ConfirmStep({ prep, channelName }: { prep: DeliveryPrepData; channelName: string }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
      <h3 className="mt-4 text-lg font-semibold text-slate-900">Ready to deploy</h3>
      <p className="mt-2 text-sm text-slate-600">
        {prep.toSendCount.toLocaleString()} {channelName} messages will be sent for{' '}
        <strong className="text-slate-900">{prep.deliveryName}</strong>.
      </p>
    </div>
  );
}

function RecipientList({
  prep,
  label,
}: {
  prep: DeliveryPrepData;
  label: (row: Record<string, unknown>) => string;
}) {
  if (!prep.sampleRecipients.length) {
    return (
      <div className="flex flex-col items-center py-12">
        <Users className="h-8 w-8 text-slate-600" />
        <p className="mt-2 text-sm text-slate-500">No recipients</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {prep.sampleRecipients.map((row) => (
        <li key={String(row.id)} className="flex items-center gap-3 px-4 py-2.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-sm text-slate-800">{label(row)}</span>
        </li>
      ))}
    </ul>
  );
}
