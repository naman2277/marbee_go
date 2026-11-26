import { useState } from 'react';
import { Bell, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import {
  DEFAULT_WEB_PUSH_BEHAVIOR,
  diagnoseWebPushSetup,
  fetchWebPushRuntimeConfig,
  fetchWebPushSubscriberStats,
  type WebPushBehaviorConfig,
} from '@/lib/web-push-config';
import { runPushTestWithWelcome, type PushTestFlowResult } from '@/lib/web-push-sdk';
import { useQuery } from '@tanstack/react-query';

type WebPushBehaviorPanelProps = {
  tenantId: string;
  environment: string;
  behavior: WebPushBehaviorConfig;
  onChange: (behavior: WebPushBehaviorConfig) => void;
  onBeforeTest?: () => Promise<string | undefined>;
  enabled?: boolean;
};

export function WebPushBehaviorPanel({
  tenantId,
  environment,
  behavior,
  onChange,
  onBeforeTest,
  enabled = true,
}: WebPushBehaviorPanelProps) {
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<PushTestFlowResult | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: subscriberStats } = useQuery({
    queryKey: ['web-push-subscriber-stats', tenantId, environment],
    queryFn: () => fetchWebPushSubscriberStats(tenantId, environment),
    enabled: enabled && Boolean(tenantId),
  });

  const { data: diagnostic, refetch: refetchDiagnostic } = useQuery({
    queryKey: ['web-push-diagnostic', tenantId, environment],
    queryFn: () => diagnoseWebPushSetup(tenantId, environment),
    enabled: enabled && Boolean(tenantId),
  });

  const patch = (patchValues: Partial<WebPushBehaviorConfig>) => {
    onChange({ ...DEFAULT_WEB_PUSH_BEHAVIOR, ...behavior, ...patchValues });
  };

  const handleTestPush = async () => {
    setTesting(true);
    setTestStatus(null);
    setTestResult(null);
    try {
      let providerId: string | undefined;
      if (onBeforeTest) providerId = await onBeforeTest();
      const runtime = await fetchWebPushRuntimeConfig(tenantId, environment, providerId);
      if (!runtime) throw new Error('Save Firebase provider first — all required fields must be valid');
      const result = await runPushTestWithWelcome(runtime);
      setTestResult(result);
      setTestStatus(result.message);
      void refetchDiagnostic();
    } catch (err) {
      setTestStatus(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {diagnostic && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">Delivery checklist</h4>
            <BadgeLike ok={diagnostic.ok} />
          </div>
          <ul className="mt-4 space-y-3">
            {diagnostic.checks.map((check) => (
              <li key={check.label} className="flex gap-3 text-sm">
                {check.pass ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className="font-medium text-slate-800">{check.label}</p>
                  <p className="text-slate-600">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          {!diagnostic.ok && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Add a Firebase provider with the web config (Project ID, Sender ID, App ID, Web API key, VAPID public
              key) and the service-account JSON, mark it default, and Save. Then run Test push.
            </p>
          )}
        </Card>
      )}

      {subscriberStats && (
        <Card className="p-5">
          <h4 className="text-sm font-semibold text-slate-900">Subscriber stats</h4>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={subscriberStats.total} />
            <Stat label="Active" value={subscriberStats.active} />
            <Stat label="Inactive" value={subscriberStats.inactive} />
            <Stat label="Granted" value={subscriberStats.granted} />
          </div>
        </Card>
      )}

      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h4 className="text-sm font-semibold text-slate-900">Web push behavior</h4>
          <p className="mt-0.5 text-xs text-slate-500">Permission prompt, welcome notification, and delivery defaults.</p>
        </div>
        <div className="space-y-4 p-5">
          <Toggle
            label="Show permission prompt"
            checked={behavior.prompt_enabled ?? true}
            onChange={(v) => patch({ prompt_enabled: v })}
          />
          <Field
            label="Prompt delay (ms)"
            value={String(behavior.prompt_delay_ms ?? 4000)}
            onChange={(v) => patch({ prompt_delay_ms: Number(v) || 4000 })}
          />
          <Field label="Prompt title" value={behavior.prompt_title ?? ''} onChange={(v) => patch({ prompt_title: v })} />
          <Field
            label="Prompt message"
            value={behavior.prompt_message ?? ''}
            onChange={(v) => patch({ prompt_message: v })}
          />
          <Toggle
            label="Auto-resubscribe returning visitors"
            checked={behavior.auto_resubscribe ?? true}
            onChange={(v) => patch({ auto_resubscribe: v })}
          />
          <Toggle
            label="Send welcome notification on subscribe"
            checked={behavior.welcome_enabled ?? true}
            onChange={(v) => patch({ welcome_enabled: v })}
          />
          <Field label="Welcome title" value={behavior.welcome_title ?? ''} onChange={(v) => patch({ welcome_title: v })} />
          <Field label="Welcome body" value={behavior.welcome_body ?? ''} onChange={(v) => patch({ welcome_body: v })} />
          <Field
            label="Default icon URL"
            value={behavior.default_icon_url ?? '/favicon.svg'}
            onChange={(v) => patch({ default_icon_url: v })}
          />
          <Toggle
            label="Track opens via /push/open"
            checked={behavior.track_opens ?? true}
            onChange={(v) => patch({ track_opens: v })}
          />
          <Field
            label="Default TTL (seconds)"
            value={String(behavior.default_ttl_seconds ?? 86400)}
            onChange={(v) => patch({ default_ttl_seconds: Number(v) || 86400 })}
          />

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={handleTestPush} disabled={testing}>
              <Bell className="mr-2 h-4 w-4" />
              {testing ? 'Testing connection…' : 'Test connection on this browser'}
            </Button>
            {testStatus && (
              <span
                className={`text-sm ${
                  testResult?.sent ? 'text-emerald-600' : 'text-amber-700'
                }`}
              >
                {testStatus}
              </span>
            )}
          </div>

          {testResult && testResult.checks.length > 0 && (
            <ul className="mt-4 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
              {testResult.checks.map((check) => (
                <li key={check.label} className="flex gap-2 text-sm">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium text-slate-800">{check.label}</p>
                    {check.detail && <p className="text-slate-600">{check.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function BadgeLike({ ok }: { ok: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {ok ? 'Ready to send' : 'Action needed'}
    </span>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3">
      <span className="text-sm text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}
