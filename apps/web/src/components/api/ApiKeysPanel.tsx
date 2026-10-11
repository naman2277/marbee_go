import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Key, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Badge, EmptyState } from '@/components/ui';
import { BulkActionBar } from '@/components/bulk/BulkActionBar';
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog';
import { SelectCheckbox } from '@/components/bulk/SelectCheckbox';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { useListBulkDelete } from '@/hooks/useListBulkDelete';
import { useModuleDeleteAccess } from '@/hooks/useModuleDeleteAccess';
import { useAuth } from '@/contexts/AuthContext';
import { API_SCOPE_OPTIONS } from '@/lib/api-scopes';
import {
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
  updateApiKey,
  type ApiKeyRow,
} from '@/lib/access-management';

function formatDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function ApiKeysPanel() {
  const { tenantId, environment } = useAuth();
  const { canDelete, deleteDeniedReason } = useModuleDeleteAccess('settings.api_keys');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiKeyRow | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['events:write', 'custom_api:invoke']);
  const [expiresDays, setExpiresDays] = useState<number | ''>('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  const keysQuery = useQuery({
    queryKey: ['api-keys', tenantId],
    queryFn: () => fetchApiKeys(tenantId),
    enabled: Boolean(tenantId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(tenantId, environment, {
        name: name.trim(),
        environment,
        scopes,
        expiresDays: expiresDays === '' ? null : Number(expiresDays),
      }),
    onSuccess: (result) => {
      setCreatedKey(result.apiKey);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['api-keys', tenantId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error('No key selected');
      return updateApiKey(tenantId, environment, editTarget.id, {
        name: name.trim(),
        scopes,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      });
    },
    onSuccess: () => {
      setEditTarget(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['api-keys', tenantId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, keyName }: { id: string; keyName: string }) =>
      revokeApiKey(tenantId, environment, id, keyName),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['api-keys', tenantId] }),
  });

  const keys = keysQuery.data ?? [];
  const activeKeys = keys.filter((k) => !k.revokedAt);

  const activeItems = useMemo(
    () => activeKeys.map((k) => ({ id: k.id, label: k.name })),
    [activeKeys],
  );

  const bulk = useListBulkDelete({
    module: 'settings.api_keys',
    items: activeItems,
    deleteFn: async (id) => {
      const key = keys.find((k) => k.id === id);
      if (!key) return { error: 'Key not found' };
      try {
        await revokeApiKey(tenantId, environment, id, key.name);
        return {};
      } catch (err) {
        return { error: (err as Error).message };
      }
    },
    onComplete: () => void queryClient.invalidateQueries({ queryKey: ['api-keys', tenantId] }),
  });

  function toggleScope(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function openCreate() {
    setCreateOpen(true);
    setEditTarget(null);
    setCreatedKey(null);
    setName('');
    setScopes(['events:write', 'custom_api:invoke']);
    setExpiresDays('');
    setError(null);
  }

  function openEdit(key: ApiKeyRow) {
    setEditTarget(key);
    setCreateOpen(false);
    setCreatedKey(null);
    setName(key.name);
    setScopes(key.scopes);
    setExpiresAt(formatDateInput(key.expiresAt));
    setError(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Bearer tokens for server integrations. Secrets are shown once at creation — use Update to change name, scopes, or expiry.
        </p>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create key
        </Button>
      </div>

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Keys are verified with bcrypt on every request. Revoked or expired keys are rejected immediately.
      </div>

      {!canDelete && deleteDeniedReason && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {deleteDeniedReason}
        </div>
      )}

      <Card className="overflow-hidden">
        <BulkActionBar
          count={bulk.selection.count}
          resourceLabel="API key"
          onDelete={bulk.openDeleteConfirm}
          onClear={bulk.selection.clear}
          disabled={!canDelete || bulk.deleting}
        />
        {bulk.lastError && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{bulk.lastError}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
                {canDelete && (
                  <th className="w-10 px-4 py-3">
                    <SelectCheckbox
                      checked={bulk.selection.allSelected && activeItems.length > 0}
                      indeterminate={bulk.selection.someSelected && !bulk.selection.allSelected}
                      onChange={() => bulk.selection.toggleAll()}
                      aria-label="Select all active keys"
                    />
                  </th>
                )}
                <th className="px-6 py-3 font-semibold">Name</th>
                <th className="px-6 py-3 font-semibold">Prefix</th>
                <th className="px-6 py-3 font-semibold">Scopes</th>
                <th className="px-6 py-3 font-semibold">Environment</th>
                <th className="px-6 py-3 font-semibold">Last used</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-slate-50/50">
                  {canDelete && !key.revokedAt && (
                    <td className="px-4 py-4">
                      <SelectCheckbox
                        checked={bulk.selection.isSelected(key.id)}
                        onChange={() => bulk.selection.toggle(key.id)}
                        aria-label={`Select ${key.name}`}
                      />
                    </td>
                  )}
                  {canDelete && key.revokedAt && <td className="px-4 py-4" />}
                  <td className="px-6 py-4 font-medium">{key.name}</td>
                  <td className="px-6 py-4 font-mono text-xs">{key.keyPrefix}…</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 capitalize">{key.environment}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={key.revokedAt ? 'error' : 'success'}>
                      {key.revokedAt ? 'Revoked' : 'Active'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {!key.revokedAt && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(key)} title="Update key">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!keys.length && !keysQuery.isLoading && (
            <EmptyState
              title="No API keys"
              description="Create a key to authenticate server-side integrations."
              action={<Key className="mx-auto h-10 w-10 text-slate-300" />}
            />
          )}
        </div>
      </Card>

      {(createOpen || editTarget) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              {editTarget ? 'Update API key' : 'Create API key'}
            </h2>

            {!createdKey ? (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-600">Name</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Production ingestion"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Scopes</label>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                    {API_SCOPE_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={scopes.includes(opt.value)}
                          onChange={() => toggleScope(opt.value)}
                        />
                        <span>
                          <span className="font-medium">{opt.label}</span>
                          <span className="block text-xs text-slate-500">{opt.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {editTarget ? (
                  <div>
                    <label className="text-xs font-medium text-slate-600">Expires on (optional)</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-slate-600">Expires in (days, optional)</label>
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={expiresDays}
                      onChange={(e) => setExpiresDays(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Never"
                    />
                  </div>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCreateOpen(false);
                      setEditTarget(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!name.trim() || !scopes.length || createMutation.isPending || updateMutation.isPending}
                    onClick={() => (editTarget ? updateMutation.mutate() : createMutation.mutate())}
                  >
                    {editTarget ? 'Save changes' : 'Create'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-emerald-700">Copy your API key now. You won&apos;t see it again.</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                    value={createdKey}
                  />
                  <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(createdKey)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setCreateOpen(false)}>Done</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <BulkDeleteDialog
        open={bulk.confirmOpen}
        title="Revoke API keys"
        resourceLabel="API key"
        items={bulk.selectedItems}
        loading={bulk.deleting}
        onConfirm={bulk.confirmBulkDelete}
        onCancel={() => bulk.setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke API key"
        message={
          revokeTarget
            ? `Revoke "${revokeTarget.name}"? Integrations using this key will stop working immediately.`
            : ''
        }
        confirmLabel="Revoke"
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (!revokeTarget) return;
          revokeMutation.mutate(
            { id: revokeTarget.id, keyName: revokeTarget.name },
            { onSettled: () => setRevokeTarget(null) },
          );
        }}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
