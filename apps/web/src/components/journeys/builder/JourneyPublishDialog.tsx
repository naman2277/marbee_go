import { AlertTriangle, CheckCircle2, Loader2, Rocket, XCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import type { RunResult } from '@/lib/journey-runner';
import type { JourneyValidationResult } from '@/lib/journey-builder';

export type PublishPhase = 'validate' | 'test' | 'publish';

type Props = {
  open: boolean;
  journeyName: string;
  validation: JourneyValidationResult;
  phase: PublishPhase;
  testResult?: RunResult | null;
  busy?: boolean;
  error?: string;
  onSetPhase: (phase: PublishPhase) => void;
  onRunTest: () => void;
  onPublish: () => void;
  onClose: () => void;
};

const STEPS: { id: PublishPhase; label: string }[] = [
  { id: 'validate', label: 'Validate' },
  { id: 'test', label: 'Test' },
  { id: 'publish', label: 'Publish' },
];

export function JourneyPublishDialog({
  open,
  journeyName,
  validation,
  phase,
  testResult,
  busy,
  error,
  onSetPhase,
  onRunTest,
  onPublish,
  onClose,
}: Props) {
  if (!open) return null;
  const phaseIdx = STEPS.findIndex((s) => s.id === phase);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Publish “{journeyName}”</h2>
          <div className="mt-3 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    i < phaseIdx
                      ? 'bg-emerald-100 text-emerald-700'
                      : i === phaseIdx
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {i < phaseIdx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    i === phaseIdx ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-200" />}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          {phase === 'validate' && (
            <>
              {validation.ok ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> No blocking issues found.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {validation.errors.map((iss, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-rose-700">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {iss.message}
                    </li>
                  ))}
                </ul>
              )}
              {validation.warnings.length > 0 && (
                <ul className="space-y-1.5 border-t border-slate-100 pt-2">
                  {validation.warnings.map((iss, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {iss.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {phase === 'test' && (
            <>
              <p className="text-xs text-slate-500">
                Enrolls up to 5 sandbox profiles and steps them through the journey. No real
                messages are sent.
              </p>
              {testResult ? (
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                  <Stat label="Enrolled" value={testResult.enrolled} />
                  <Stat label="Advanced" value={testResult.advanced} />
                  <Stat label="Completed" value={testResult.completed} />
                  {testResult.errors.length > 0 && (
                    <p className="col-span-3 text-left text-[11px] text-amber-600">
                      {testResult.errors.length} error(s): {testResult.errors[0]}
                    </p>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={busy}
                  onClick={onRunTest}
                >
                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Run test (5 profiles, sandbox)
                </Button>
              )}
            </>
          )}

          {phase === 'publish' && (
            <p className="text-sm text-slate-600">
              This freezes the current version as an immutable published snapshot and starts a
              fresh draft (v+1) for future edits. Live customers stay on the published version.
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            {phase !== 'validate' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onSetPhase(STEPS[phaseIdx - 1].id)}
                disabled={busy}
              >
                Back
              </Button>
            )}
            {phase === 'validate' && (
              <Button size="sm" onClick={() => onSetPhase('test')} disabled={!validation.ok}>
                Continue
              </Button>
            )}
            {phase === 'test' && (
              <Button size="sm" onClick={() => onSetPhase('publish')} disabled={busy}>
                Continue
              </Button>
            )}
            {phase === 'publish' && (
              <Button size="sm" onClick={onPublish} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Rocket className="mr-1 h-3.5 w-3.5" />
                )}
                Publish now
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
