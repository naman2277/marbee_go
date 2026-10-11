import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code2, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Badge, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { API_SCOPE_OPTIONS, type ApiScope } from '@/lib/api-scopes';
import {
  PIPELINE_TEMPLATES,
  formatPipelineJson,
  validatePipeline,
  type ApiPipelineStep,
} from '@/lib/api-pipeline';
import {
  customApiInvokeUrl,
  deleteCustomApiEndpoint,
  fetchCustomApiEndpoints,
  saveCustomApiEndpoint,
  type CustomApiEndpoint,
} from '@/lib/custom-api';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'disabled', label: 'Disabled' },
] as const;

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

export function CustomEndpointsPanel() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CustomApiEndpoint | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomApiEndpoint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [httpMethod, setHttpMethod] = useState<CustomApiEndpoint['httpMethod']>('POST');
  const [status, setStatus] = useState<CustomApiEndpoint['status']>('draft');
  const [scopes, setScopes] = useState<ApiScope[]>(['custom_api:invoke', 'events:write']);
  const [pipelineText, setPipelineText] = useState(formatPipelineJson(PIPELINE_TEMPLATES[0].pipeline));

  const endpointsQuery = useQuery({
    queryKey: ['custom-api-endpoints', tenantId, environment],
    queryFn: () => fetchCustomApiEndpoints(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(pipelineText);
      } catch {
        throw new Error('Pipeline must be valid JSON');
      }
      const validated = validatePipeline(parsed);
      if (!validated.ok) throw new Error(validated.errors[0]);

      return saveCustomApiEndpoint({
        tenantId,
        environment,
        id: editing?.id,
        name,
        slug,
        description,
        httpMethod,
        requiredScopes: scopes,
        pipeline: validated.steps,
        status,
      });
    },
    onSuccess: () => {
      setEditorOpen(false);
      setEditing(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['custom-api-endpoints', tenantId, environment] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (row: CustomApiEndpoint) => deleteCustomApiEndpoint(tenantId, environment, row.id, row.name),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['custom-api-endpoints', tenantId, environment] });
    },
  });

  const endpoints = endpointsQuery.data ?? [];

  const invokeBase = useMemo(() => customApiInvokeUrl('{slug}'), []);

  function openCreate(templateId?: string) {
    const template = PIPELINE_TEMPLATES.find((t) => t.id === templateId) ?? PIPELINE_TEMPLATES[0];
    setEditing(null);
    setName(template.label);
    setSlug(template.id);
    setDescription(template.description);
    setHttpMethod(template.method);
    setScopes(template.scopes);
    setPipelineText(formatPipelineJson(template.pipeline));
    setStatus('draft');
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(row: CustomApiEndpoint) {
    setEditing(row);
    setName(row.name);
    setSlug(row.slug);
    setDescription(row.description ?? '');
    setHttpMethod(row.httpMethod);
    setScopes(row.requiredScopes);
    setPipelineText(formatPipelineJson(row.pipeline));
    setStatus(row.status);
    setError(null);
    setEditorOpen(true);
  }

  function toggleScope(scope: ApiScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function applyTemplate(templateId: string) {
    const template = PIPELINE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setPipelineText(formatPipelineJson(template.pipeline));
    setHttpMethod(template.method);
    setScopes(template.scopes);
    if (!slug) setSlug(template.id);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Build custom HTTP endpoints using a <strong>secure pipeline</strong> (validated JSON steps — no arbitrary code execution).
        </p>
        <Button onClick={() => openCreate()}>
          <Plus className="mr-2 h-4 w-4" />
          New endpoint
        </Button>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Security model</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
          <li>Only whitelisted pipeline steps run server-side (track event, upsert customer, respond, etc.)</li>
          <li>API keys are bcrypt-verified; scopes enforced per step and per endpoint</li>
          <li>8s timeout, body size limits, no eval / no user JavaScript on the server</li>
        </ul>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {PIPELINE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openCreate(t.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-brand-300 hover:bg-brand-50/50"
          >
            <span className="font-semibold text-slate-800">{t.label}</span>
            <span className="mt-0.5 block text-slate-500">{t.description}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold">Name</th>
                <th className="px-6 py-3 font-semibold">Slug</th>
                <th className="px-6 py-3 font-semibold">Method</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {endpoints.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <p className="font-medium">{row.name}</p>
                    {row.description && <p className="text-xs text-slate-500">{row.description}</p>}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{row.slug}</td>
                  <td className="px-6 py-4">{row.httpMethod}</td>
                  <td className="px-6 py-4">
                    <Badge variant={row.status === 'published' ? 'success' : row.status === 'disabled' ? 'error' : 'default'}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {row.status === 'published' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Copy invoke URL"
                          onClick={() => void navigator.clipboard.writeText(customApiInvokeUrl(row.slug))}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!endpoints.length && !endpointsQuery.isLoading && (
            <EmptyState
              title="No custom endpoints"
              description="Create an endpoint from a template or write your own pipeline JSON."
              action={<Code2 className="mx-auto h-10 w-10 text-slate-300" />}
            />
          )}
        </div>
      </Card>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? 'Edit endpoint' : 'New custom endpoint'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Invoke URL: <code className="rounded bg-slate-100 px-1">{invokeBase.replace('{slug}', slug || 'your-slug')}</code>
              </p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Name</span>
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Slug</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="track-event"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Description</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">HTTP method</span>
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={httpMethod} onChange={(e) => setHttpMethod(e.target.value as CustomApiEndpoint['httpMethod'])}>
                    {METHOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Status</span>
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as CustomApiEndpoint['status'])}>
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Template</span>
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" onChange={(e) => applyTemplate(e.target.value)} defaultValue="">
                    <option value="" disabled>Insert template…</option>
                    {PIPELINE_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-600">Required scopes (API key must have these)</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {API_SCOPE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                      <input type="checkbox" checked={scopes.includes(opt.value)} onChange={() => toggleScope(opt.value)} />
                      {opt.value}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Pipeline (JSON)</span>
                <textarea
                  className="mt-1 h-64 w-full rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-emerald-100"
                  value={pipelineText}
                  onChange={(e) => setPipelineText(e.target.value)}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Allowed steps: require_scope, parse_body, track_event, upsert_customer, get_customer, respond
                </p>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <Button variant="secondary" onClick={() => { setEditorOpen(false); setEditing(null); }}>Cancel</Button>
              <Button disabled={!name.trim() || !slug.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Saving…' : 'Save endpoint'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete endpoint"
        message={deleteTarget ? `Delete "${deleteTarget.name}"? Published URLs will stop working.` : ''}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
