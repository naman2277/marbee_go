import { useMemo } from 'react';
import { Bot, CheckCircle2, Circle, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { getProviderSetupGuide } from '@/lib/channel-field-guides';
import type { ChannelType } from '@/lib/channel-registry';
import { getProviderDefinition } from '@/lib/channel-registry';
import { ProviderLogo } from '@/components/channels/ProviderLogo';

type ProviderSetupAgentProps = {
  channel: ChannelType;
  providerType: string;
  providerLabel: string;
  formValues: Record<string, string>;
  docsUrl?: string;
  onClose: () => void;
  onFocusField?: (fieldKey: string) => void;
};

export function ProviderSetupAgent({
  channel,
  providerType,
  providerLabel,
  formValues,
  docsUrl,
  onClose,
  onFocusField,
}: ProviderSetupAgentProps) {
  const guide = getProviderSetupGuide(channel, providerType);
  const def = getProviderDefinition(channel, providerType);

  const requiredFields = useMemo(
    () => def?.fields.filter((f) => f.required).map((f) => f.key) ?? [],
    [def],
  );

  const filledRequired = requiredFields.filter((k) => Boolean(formValues[k]?.trim())).length;
  const progress = requiredFields.length ? Math.round((filledRequired / requiredFields.length) * 100) : 0;

  return (
    <div className="fixed inset-y-0 right-0 z-[150] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-violet-50 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Setup agent</p>
          <div className="mt-1 flex items-center gap-2">
            <ProviderLogo providerId={providerType} label={providerLabel} size="sm" />
            <h3 className="truncate font-semibold text-slate-900">{providerLabel}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-600">I&apos;ll walk you through connecting your BYOP account.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-slate-700"
          aria-label="Close setup agent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {requiredFields.length > 0 && (
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>Required fields</span>
              <span>
                {filledRequired}/{requiredFields.length} complete
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <p className="text-sm leading-relaxed text-slate-700">{guide.overview}</p>

        {guide.prerequisites.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Before you start</p>
            <ul className="mt-2 space-y-1">
              {guide.prerequisites.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Setup steps</p>
          {guide.steps.map((step, index) => {
            const stepFields = step.fieldKeys ?? [];
            const stepDone =
              stepFields.length === 0 || stepFields.every((k) => Boolean(formValues[k]?.trim()));

            return (
              <div
                key={step.title}
                className={`rounded-xl border p-4 ${stepDone ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start gap-2">
                  {stepDone ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. {step.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    {stepFields.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {stepFields.map((key) => {
                          const fieldDef = def?.fields.find((f) => f.key === key);
                          const filled = Boolean(formValues[key]?.trim());
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => onFocusField?.(key)}
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                                filled
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-800'
                              }`}
                            >
                              {fieldDef?.label ?? key}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {guide.tips && guide.tips.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Tips</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-900">
              {guide.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Open official provider docs
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="border-t border-slate-100 px-5 py-4">
        <p className="text-xs text-slate-500">
          Stuck on a field? Hover the <strong>(i)</strong> icon next to it for detailed instructions on where to find
          each value.
        </p>
        <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
          Close agent
        </Button>
      </div>
    </div>
  );
}

export function ProviderSetupAgentTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group fixed bottom-6 right-6 z-[140] flex items-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-2.5 shadow-lg transition-all hover:border-brand-300 hover:shadow-xl"
      title="Setup agent — get help connecting your provider"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
        <Bot className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium text-slate-800 group-hover:text-brand-800">Need help? Ask agent</span>
    </button>
  );
}
