import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { fetchLoyaltyPrograms, saveLoyaltyProgram } from '@/lib/loyalty';
import type { LoyaltyProgram } from '@/lib/loyalty-types';

export function LoyaltyProgramsPanel() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyProgram | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [pointsCurrency, setPointsCurrency] = useState('Points');
  const [earnRate, setEarnRate] = useState(1);
  const [status, setStatus] = useState<LoyaltyProgram['status']>('draft');
  const [error, setError] = useState<string | null>(null);

  const { data: programs, isLoading } = useQuery({
    queryKey: ['loyalty-programs', tenantId, environment],
    queryFn: () => fetchLoyaltyPrograms(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveLoyaltyProgram({
        tenantId, environment, id: editing?.id, name, slug, description, pointsCurrency, earnRate, status,
      }),
    onSuccess: () => {
      setEditorOpen(false);
      setEditing(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['loyalty-programs', tenantId, environment] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setSlug('');
    setDescription('');
    setPointsCurrency('Points');
    setEarnRate(1);
    setStatus('draft');
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(p: LoyaltyProgram) {
    setEditing(p);
    setName(p.name);
    setSlug(p.slug);
    setDescription(p.description ?? '');
    setPointsCurrency(p.pointsCurrency);
    setEarnRate(p.earnRate);
    setStatus(p.status);
    setError(null);
    setEditorOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex justify-between gap-3">
        <p className="text-sm text-slate-600">Multi-program loyalty with earn rates, tier ladders, and member enrollment.</p>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New program</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(programs ?? []).map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{p.name}</h3>
                <p className="mt-1 text-xs text-slate-500">{p.description || 'No description'}</p>
              </div>
              <Badge variant={p.status === 'active' ? 'success' : p.status === 'paused' ? 'warning' : 'default'}>{p.status}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-slate-500">Currency</dt><dd className="font-medium">{p.pointsCurrency}</dd></div>
              <div><dt className="text-slate-500">Earn rate</dt><dd className="font-medium">{p.earnRate}×</dd></div>
              <div><dt className="text-slate-500">Members</dt><dd className="font-medium">{p.memberCount}</dd></div>
              <div><dt className="text-slate-500">Slug</dt><dd className="font-mono">{p.slug}</dd></div>
            </dl>
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => openEdit(p)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
            </Button>
          </Card>
        ))}
      </div>

      {!programs?.length && !isLoading && (
        <EmptyState title="No loyalty programs" description="Create a program to start enrolling members and linking offers." />
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
            <h2 className="text-lg font-semibold">{editing ? 'Edit program' : 'New loyalty program'}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">Name<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="block text-xs font-medium text-slate-600">Slug<input className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></label>
              <label className="block text-xs font-medium text-slate-600">Description<textarea className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-600">Points name<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={pointsCurrency} onChange={(e) => setPointsCurrency(e.target.value)} /></label>
                <label className="block text-xs font-medium text-slate-600">Earn rate<input type="number" step="0.1" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={earnRate} onChange={(e) => setEarnRate(Number(e.target.value))} /></label>
              </div>
              <label className="block text-xs font-medium text-slate-600">Status
                <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as LoyaltyProgram['status'])}>
                  <option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option>
                </select>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
