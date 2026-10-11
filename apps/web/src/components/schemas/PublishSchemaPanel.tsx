import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Rocket, Pencil } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { publishCustomSchema, revertSchemaToDraft } from '@/lib/schema-publish';
import { getSchemaStatusBadgeVariant, getSchemaStatusLabel } from '@/lib/schema-labels';

type Props = {
  schemaId: string;
  status: string;
  currentVersion: number;
  tableName: string | null;
  isSystem: boolean;
  fieldCount: number;
};

export function PublishSchemaPanel({
  schemaId,
  status,
  currentVersion,
  tableName,
  isSystem,
  fieldCount,
}: Props) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['schema'] });
    queryClient.invalidateQueries({ queryKey: ['schemas'] });
    queryClient.invalidateQueries({ queryKey: ['schema-versions'] });
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (fieldCount === 0) throw new Error('Add at least one field before publishing');
      const result = await publishCustomSchema(schemaId, notes.trim() || undefined);
      if (result.error) throw new Error(result.error);
      return result.data!;
    },
    onSuccess: (data) => {
      setMessage(`Published v${data.version} → table ${data.table_name}`);
      setError('');
      setNotes('');
      invalidate();
    },
    onError: (e: Error) => {
      setError(e.message);
      setMessage('');
    },
  });

  const draftMutation = useMutation({
    mutationFn: async () => {
      const result = await revertSchemaToDraft(schemaId);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setMessage('Schema unlocked for editing (draft mode)');
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isSystem) return null;

  const isPublished = status === 'published';
  const isDraft = status === 'draft' || status === 'active';

  return (
    <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50/50 to-white px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">Publish schema</h3>
            <Badge variant={getSchemaStatusBadgeVariant(false, status)}>
              {getSchemaStatusLabel(false, status)}
            </Badge>
            {currentVersion > 0 && (
              <span className="text-xs text-slate-500">v{currentVersion}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {isPublished
              ? `Live table: ${tableName ?? '—'}. Republish after adding fields to create a new version.`
              : tableName
                ? `Will create Postgres table ${tableName}. Table name is locked after publish.`
                : 'Set a table name in schema settings before publishing.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isPublished && (
            <Button variant="secondary" size="sm" onClick={() => draftMutation.mutate()} disabled={draftMutation.isPending}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit draft
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || fieldCount === 0 || (!isPublished && !tableName)}
          >
            <Rocket className="mr-1.5 h-3.5 w-3.5" />
            {isPublished ? 'Republish' : 'Publish'}
          </Button>
        </div>
      </div>

      {(isDraft || !isPublished) && (
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Version notes (optional)"
          className="mt-3 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      )}

      {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
