import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { createForm } from '@/lib/forms';
import { toSchemaSlug } from '@/lib/schema-slug';
import { useTenantScope } from '@/contexts/AuthContext';

export function CreateFormModal({ onClose }: { onClose: () => void }) {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => createForm(tenantId, environment, name),
    onSuccess: (result) => {
      if (result.error || !result.form) {
        setError(result.error ?? 'Failed to create form');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['forms', tenantId, environment] });
      onClose();
      navigate(`/content/forms/${result.form.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create form</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Build lead capture, signup, and survey forms mapped to your data schemas.
        </p>

        <div className="space-y-3">
          <input
            placeholder="Form name (e.g. Contact Us)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {name && (
            <p className="text-xs text-slate-400">
              Slug: <span className="font-mono">{toSchemaSlug(name) || '—'}</span>
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name.trim()}
          >
            {mutation.isPending ? 'Creating…' : 'Create form'}
          </Button>
        </div>
      </div>
    </div>
  );
}
