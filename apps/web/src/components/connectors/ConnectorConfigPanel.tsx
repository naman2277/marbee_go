import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, ExternalLink, PlugZap, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { connectorMeta, type ConfigFieldDef } from '@/lib/connector-meta';
import { testConnector } from '@/lib/connector-test';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';

type Props = {
  connectorId: string;
  connectorType: string;
  direction: string;
  config: Record<string, unknown>;
  tenantId?: string;
  environment?: string;
  mapping?: ConnectorMappingRow[];
};

export function ConnectorConfigPanel({
  connectorId,
  connectorType,
  direction,
  config,
  tenantId,
  environment,
  mapping = [],
}: Props) {
  const queryClient = useQueryClient();
  const meta = connectorMeta(connectorType);
  const fields = meta?.configFields ?? [];
  const [values, setValues] = useState<Record<string, unknown>>(config ?? {});
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const webhookUrl = `${window.location.origin.replace(':5173', ':54321')}/functions/v1/connector-webhook/${connectorId}`;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('connectors')
        .update({ config: values, updated_at: new Date().toISOString() })
        .eq('id', connectorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector'] });
      if (tenantId && environment) {
        void logAudit({
          tenantId,
          environment,
          action: 'update',
          resourceType: 'connector',
          resourceId: connectorId,
          resourceName: meta?.label ?? connectorType,
          summary: 'Updated connector configuration',
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">{meta?.label ?? connectorType} settings</h3>
          <p className="mt-1 text-sm text-slate-500">{meta?.description}</p>

          <div className="mt-6 space-y-4">
            {fields.length ? (
              fields.map((field) => (
                <ConfigField
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                />
              ))
            ) : (
              <p className="text-sm text-slate-500">No configuration fields for this connector type.</p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Save configuration
            </Button>
            {tenantId && environment && (
              <Button
                variant="secondary"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  setTestMsg('');
                  const r = await testConnector({
                    tenantId,
                    environment,
                    connectorId,
                    connectorType,
                    direction,
                    config: values,
                    mapping,
                  });
                  setTestMsg(r.status === 'success' ? `✓ ${r.message}` : `✗ ${r.message}`);
                  setTesting(false);
                }}
              >
                {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1.5 h-4 w-4" />}
                Test connection
              </Button>
            )}
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
            {testMsg && (
              <span className={`text-sm ${testMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{testMsg}</span>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        {direction === 'inbound' && connectorType === 'webhook' && (
          <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
            <h4 className="text-sm font-semibold text-teal-900">Webhook endpoint</h4>
            <p className="mt-1 text-xs text-teal-700">POST JSON payloads to this URL after deploy</p>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/80 p-3 ring-1 ring-teal-200">
              <code className="flex-1 break-all font-mono text-[11px] text-slate-700">{webhookUrl}</code>
              <button type="button" onClick={copyWebhook} className="shrink-0 text-teal-600 hover:text-teal-800">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white">
          <h4 className="text-sm font-semibold">Connection tips</h4>
          <ul className="mt-3 space-y-2 text-xs text-slate-400">
            {connectorType === 'webhook' && (
              <>
                <li>• Verify HMAC signature with your signing secret</li>
                <li>• Map nested JSON paths like <code className="text-teal-400">data.email</code></li>
              </>
            )}
            {connectorType === 'rest_api' && (
              <>
                <li>• Use pagination for large datasets</li>
                <li>• Store auth tokens securely — never commit to git</li>
              </>
            )}
            {connectorType === 'sftp' && (
              <>
                <li>• Use SSH key auth in production</li>
                <li>• Wildcards supported in remote path</li>
              </>
            )}
            {connectorType === 'csv_upload' && (
              <>
                <li>• Upload files to the configured storage path</li>
                <li>• Header row auto-detects column names</li>
              </>
            )}
            {(connectorType === 'webhook_out' || connectorType === 'api_push') && (
              <>
                <li>• Records are batched before push</li>
                <li>• Failed rows are logged in sync history</li>
              </>
            )}
            <li className="flex items-center gap-1 pt-1 text-teal-400">
              <ExternalLink className="h-3 w-3" />
              connector-sync Edge Function required for live sync
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-semibold text-slate-900">Raw config (JSON)</h4>
          <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600">
            {JSON.stringify(values, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const baseClass = `w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 ${field.mono ? 'font-mono text-xs' : ''}`;

  if (field.kind === 'select') {
    return (
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">{field.label}</label>
        <select
          value={String(value ?? field.options?.[0]?.value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">{field.label}</label>
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={baseClass}
        />
      </div>
    );
  }

  if (field.kind === 'toggle') {
    return (
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-teal-600"
        />
      </label>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{field.label}</label>
      <input
        type={field.kind === 'password' ? 'password' : field.kind === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange(field.kind === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={field.placeholder}
        className={baseClass}
      />
    </div>
  );
}
