import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Lock, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  canDeleteDraftSchema,
  canEditTableName,
  canRenameSchemaSlug,
  deleteDraftSchema,
  updateCustomSchema,
} from '@/lib/schema-metadata';
import { toSchemaSlug } from '@/lib/schema-slug';
import {
  defaultCustomTableName,
  normalizeCustomTableName,
} from '@/lib/schema-table-name';
import { useTenantScope } from '@/contexts/AuthContext';

type Props = {
  schemaId: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  tableName: string | null;
  currentVersion: number;
  isSystem: boolean;
};

export function SchemaSettingsPanel({
  schemaId,
  name,
  slug,
  description,
  status,
  tableName,
  currentVersion,
  isSystem,
}: Props) {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description ?? '');
  const [draftTableName, setDraftTableName] = useState(tableName ?? '');
  const [tableNameTouched, setTableNameTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraftName(name);
    setDraftDescription(description ?? '');
    setDraftTableName(tableName ?? '');
    setTableNameTouched(false);
  }, [name, description, tableName]);

  const draftSlug = toSchemaSlug(draftName);

  useEffect(() => {
    if (!editing || tableNameTouched || !draftSlug) return;
    setDraftTableName(defaultCustomTableName(tenantId, draftSlug));
  }, [draftSlug, tenantId, tableNameTouched, editing]);

  if (isSystem) return null;

  const slugEditable = canRenameSchemaSlug({
    isSystem,
    status,
    tableName,
    currentVersion,
  });
  const tableEditable = canEditTableName({
    isSystem,
    status,
    currentVersion,
  });
  const deletable = canDeleteDraftSchema({
    isSystem,
    status,
    tableName,
    currentVersion,
  });
  const tableLocked = !tableEditable && Boolean(tableName);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['schema'] });
    queryClient.invalidateQueries({ queryKey: ['schemas'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      updateCustomSchema({
        schemaId,
        tenantId,
        environment,
        name: draftName,
        description: draftDescription,
        tableName: tableEditable ? normalizeCustomTableName(draftTableName) : tableName,
        status,
        currentVersion,
        currentSlug: slug,
        currentTableName: tableName,
      }),
    onSuccess: (result) => {
      if (result.error) {
        setError(result.error);
        setMessage('');
        return;
      }
      setError('');
      setMessage('Schema updated');
      setEditing(false);
      invalidate();
      if (result.slug !== slug) {
        navigate(`/data/schemas/${result.slug}`, { replace: true });
      }
      setTimeout(() => setMessage(''), 3000);
    },
    onError: (e: Error) => {
      setError(e.message);
      setMessage('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteDraftSchema(schemaId);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
      navigate('/data/schemas');
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleDelete = () => {
    if (
      !confirm(
        `Delete draft schema "${name}"? This removes all field definitions and cannot be undone.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate();
  };

  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">Schema settings</h3>
          <p className="mt-1 text-sm text-slate-500">
            {tableEditable
              ? 'Set the Postgres table name now — it cannot be changed after publish.'
              : 'Display name and description can be changed anytime. Table name is locked after publish.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {deletable && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete draft
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-4 max-w-lg space-y-3">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Schema name"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          {slugEditable && draftName && (
            <p className="text-xs text-slate-400">
              Slug: <span className="font-mono">{toSchemaSlug(draftName) || '—'}</span>
            </p>
          )}
          {!slugEditable && (
            <p className="text-xs text-slate-400">
              Slug: <span className="font-mono">{slug}</span>
            </p>
          )}
          {tableEditable ? (
            <div>
              <input
                value={draftTableName}
                onChange={(e) => {
                  setTableNameTouched(true);
                  setDraftTableName(e.target.value);
                }}
                placeholder="Database table name"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-400">
                e.g. cs_00000000_training — locked after publish
              </p>
            </div>
          ) : (
            tableName && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5" />
                Table: <span className="font-mono text-slate-700">{tableName}</span>
              </p>
            )
          )}
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !draftName.trim() ||
                (tableEditable && !draftTableName.trim())
              }
            >
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setDraftName(name);
                setDraftDescription(description ?? '');
                setDraftTableName(tableName ?? '');
                setTableNameTouched(false);
                setError('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Display name</dt>
            <dd className="font-medium text-slate-900">{name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Slug</dt>
            <dd className="font-mono text-slate-700">{slug}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Database table</dt>
            <dd className="flex items-center gap-1.5 font-mono text-slate-700">
              {tableLocked && <Lock className="h-3.5 w-3.5 text-slate-400" />}
              {tableName ?? '—'}
            </dd>
          </div>
          {description && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Description</dt>
              <dd className="text-slate-700">{description}</dd>
            </div>
          )}
        </dl>
      )}

      {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
