import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { toSchemaSlug } from '@/lib/schema-slug';
import {
  defaultCustomTableName,
  normalizeCustomTableName,
  validateCustomTableName,
} from '@/lib/schema-table-name';
import { useTenantScope } from '@/contexts/AuthContext';

export function CreateSchemaModal({ onClose }: { onClose: () => void }) {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableNameTouched, setTableNameTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const slug = toSchemaSlug(name);

  useEffect(() => {
    if (tableNameTouched || !slug) return;
    setTableName(defaultCustomTableName(tenantId, slug));
  }, [slug, tenantId, tableNameTouched]);

  const mutation = useMutation({
    mutationFn: async () => {
      const nextSlug = toSchemaSlug(name);
      if (!nextSlug) throw new Error('Enter a valid schema name');

      const normalizedTable = normalizeCustomTableName(tableName);
      const tableError = validateCustomTableName(normalizedTable);
      if (tableError) throw new Error(tableError);

      const { data: existingSlug } = await supabase
        .from('schema_definitions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .eq('slug', nextSlug)
        .maybeSingle();

      if (existingSlug) throw new Error(`Schema slug "${nextSlug}" already exists — choose a different name`);

      const { data: existingTable } = await supabase
        .from('schema_definitions')
        .select('id')
        .eq('table_name', normalizedTable)
        .maybeSingle();

      if (existingTable) throw new Error(`Table name "${normalizedTable}" is already in use`);

      const { data, error: err } = await supabase
        .from('schema_definitions')
        .insert({
          tenant_id: tenantId,
          environment,
          name: name.trim(),
          slug: nextSlug,
          table_name: normalizedTable,
          is_system: false,
          description: description.trim() || null,
          status: 'draft',
        })
        .select('slug')
        .single();

      if (err) throw err;
      return data.slug as string;
    },
    onSuccess: (nextSlug) => {
      queryClient.invalidateQueries({ queryKey: ['schemas', tenantId, environment] });
      onClose();
      navigate(`/data/schemas/${nextSlug}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create custom schema</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Define a metadata schema for integrations, forms, or custom data models.
        </p>

        <div className="space-y-3">
          <input
            placeholder="Schema name (e.g. Training)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {name && (
            <p className="text-xs text-slate-400">
              Slug: <span className="font-mono">{slug || '—'}</span>
            </p>
          )}
          <div>
            <input
              placeholder="Database table name"
              value={tableName}
              onChange={(e) => {
                setTableNameTouched(true);
                setTableName(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">
              Postgres table (e.g. cs_00000000_training). Locked after publish.
            </p>
          </div>
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name.trim() || !tableName.trim()}
          >
            {mutation.isPending ? 'Creating…' : 'Create schema'}
          </Button>
        </div>
      </div>
    </div>
  );
}
