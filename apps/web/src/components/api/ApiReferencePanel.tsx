import { Card } from '@/components/ui';
import { customApiInvokeUrl } from '@/lib/custom-api';
import { PIPELINE_TEMPLATES, formatPipelineJson } from '@/lib/api-pipeline';

export function ApiReferencePanel() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://your-project.supabase.co';
  const eventsUrl = `${String(baseUrl).replace(/\/$/, '')}/functions/v1/events-ingest`;
  const customUrl = customApiInvokeUrl('your-slug');

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Authentication</h3>
        <p className="mt-2 text-sm text-slate-600">
          Send your API key in the <code className="rounded bg-slate-100 px-1">Authorization</code> header:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-100">
{`Authorization: Bearer mk_your_api_key_here
Content-Type: application/json`}
        </pre>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Events ingest (built-in)</h3>
        <p className="mt-2 text-sm text-slate-600">Requires <code className="rounded bg-slate-100 px-1">events:write</code> scope.</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-100">
{`POST ${eventsUrl}
X-Tenant-Id: your-tenant-id
X-Environment: production

{
  "event_type": "page_view",
  "identity": { "customer_id": "..." },
  "properties": { "page": "/home" }
}`}
        </pre>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Custom endpoints</h3>
        <p className="mt-2 text-sm text-slate-600">
          Requires <code className="rounded bg-slate-100 px-1">custom_api:invoke</code> plus endpoint-specific scopes.
          Only <strong>published</strong> endpoints are callable.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-100">
{`POST ${customUrl}
Authorization: Bearer mk_...

{ "event_type": "purchase", "properties": { "amount": 99 } }`}
        </pre>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Pipeline step reference</h3>
        <p className="mt-2 text-sm text-slate-600">
          Custom endpoints execute a validated JSON pipeline — not arbitrary JavaScript. Example:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-100">
          {formatPipelineJson(PIPELINE_TEMPLATES[0].pipeline)}
        </pre>
        <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-slate-600">
          {PIPELINE_TEMPLATES.map((t) => (
            <li key={t.id}><strong>{t.label}</strong> — {t.description}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
