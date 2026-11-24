import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Tag } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { deleteOffer, fetchOffers, formatOfferValue, saveOffer } from '@/lib/offers';
import { fetchLoyaltyPrograms } from '@/lib/loyalty';
import {
  CHANNEL_OPTIONS,
  OFFER_TYPE_LABELS,
  PLACEMENT_OPTIONS,
  type LoyaltyOffer,
  type OfferType,
} from '@/lib/loyalty-types';

const OFFER_TYPES = Object.keys(OFFER_TYPE_LABELS) as OfferType[];

export function OffersPanel() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyOffer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoyaltyOffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [offerType, setOfferType] = useState<OfferType>('discount_percent');
  const [offerValue, setOfferValue] = useState(10);
  const [channel, setChannel] = useState('any');
  const [placement, setPlacement] = useState('checkout');
  const [status, setStatus] = useState<LoyaltyOffer['status']>('draft');
  const [priority, setPriority] = useState(50);
  const [minPurchase, setMinPurchase] = useState<number | ''>('');
  const [expectedLift, setExpectedLift] = useState(10);
  const [marginImpact, setMarginImpact] = useState(5);
  const [propensityWeight, setPropensityWeight] = useState(1);
  const [frequencyCapHours, setFrequencyCapHours] = useState<number | ''>('');
  const [requiredTierSlug, setRequiredTierSlug] = useState('');
  const [tags, setTags] = useState('');
  const [programId, setProgramId] = useState<string>('');

  const { data: offers, isLoading } = useQuery({
    queryKey: ['loyalty-offers', tenantId, environment],
    queryFn: () => fetchOffers(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: programs } = useQuery({
    queryKey: ['loyalty-programs', tenantId, environment],
    queryFn: () => fetchLoyaltyPrograms(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveOffer({
        tenantId, environment, id: editing?.id, programId: programId || null,
        name, slug, description, offerType, offerValue, channel, placement, status, priority,
        stackingMode: editing?.stackingMode ?? 'exclusive', // panel has no stacking control; keep existing
        minPurchase: minPurchase === '' ? null : Number(minPurchase),
        expectedLift, marginImpact, propensityWeight,
        frequencyCapHours: frequencyCapHours === '' ? null : Number(frequencyCapHours),
        requiredTierSlug: requiredTierSlug || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      setEditorOpen(false);
      setEditing(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['loyalty-offers', tenantId, environment] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (o: LoyaltyOffer) => deleteOffer(tenantId, environment, o.id, o.name),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['loyalty-offers', tenantId, environment] });
    },
  });

  function resetForm() {
    setName(''); setSlug(''); setDescription(''); setOfferType('discount_percent');
    setOfferValue(10); setChannel('any'); setPlacement('checkout'); setStatus('draft');
    setPriority(50); setMinPurchase(''); setExpectedLift(10); setMarginImpact(5);
    setPropensityWeight(1); setFrequencyCapHours(''); setRequiredTierSlug(''); setTags('');
    setProgramId(programs?.[0]?.id ?? '');
  }

  function openCreate() {
    resetForm();
    setEditing(null);
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(o: LoyaltyOffer) {
    setEditing(o);
    setName(o.name); setSlug(o.slug); setDescription(o.description ?? '');
    setOfferType(o.offerType); setOfferValue(o.offerValue); setChannel(o.channel);
    setPlacement(o.placement); setStatus(o.status); setPriority(o.priority);
    setMinPurchase(o.minPurchase ?? ''); setExpectedLift(o.expectedLift);
    setMarginImpact(o.marginImpact); setPropensityWeight(o.propensityWeight);
    setFrequencyCapHours(o.frequencyCapHours ?? '');
    setRequiredTierSlug(o.requiredTierSlug ?? '');
    setTags(o.tags.join(', '));
    setProgramId(o.programId ?? '');
    setError(null);
    setEditorOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Offer catalog with channel placement, budget caps, tier gates, and scoring attributes for BOD.
        </p>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create offer</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold">Offer</th>
                <th className="px-6 py-3 font-semibold">Value</th>
                <th className="px-6 py-3 font-semibold">Channel</th>
                <th className="px-6 py-3 font-semibold">Placement</th>
                <th className="px-6 py-3 font-semibold">Priority</th>
                <th className="px-6 py-3 font-semibold">Lift / Margin</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(offers ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{o.name}</p>
                    <p className="text-xs text-slate-500">{OFFER_TYPE_LABELS[o.offerType]} · {o.slug}</p>
                    {o.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">{o.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 font-medium">{formatOfferValue(o)}</td>
                  <td className="px-6 py-4 capitalize">{o.channel}</td>
                  <td className="px-6 py-4 capitalize">{o.placement}</td>
                  <td className="px-6 py-4 tabular-nums">{o.priority}</td>
                  <td className="px-6 py-4 text-xs tabular-nums">+{o.expectedLift}% / −{o.marginImpact}</td>
                  <td className="px-6 py-4">
                    <Badge variant={o.status === 'active' ? 'success' : o.status === 'paused' ? 'warning' : 'default'}>{o.status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleteTarget(o)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!offers?.length && !isLoading && (
            <EmptyState title="No offers yet" description="Build your offer catalog for decisioning and journey personalization." action={<Tag className="mx-auto h-10 w-10 text-slate-300" />} />
          )}
        </div>
      </Card>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden">
            <div className="border-b px-6 py-4"><h2 className="text-lg font-semibold">{editing ? 'Edit offer' : 'New offer'}</h2></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">Name<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="block text-xs font-medium text-slate-600">Slug<input className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></label>
              </div>
              <label className="block text-xs font-medium text-slate-600">Description<textarea className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium text-slate-600">Type
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={offerType} onChange={(e) => setOfferType(e.target.value as OfferType)}>
                    {OFFER_TYPES.map((t) => <option key={t} value={t}>{OFFER_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">Value<input type="number" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={offerValue} onChange={(e) => setOfferValue(Number(e.target.value))} /></label>
                <label className="block text-xs font-medium text-slate-600">Priority (1–100)<input type="number" min={1} max={100} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium text-slate-600">Channel
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </label>
                <label className="block text-xs font-medium text-slate-600">Placement
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={placement} onChange={(e) => setPlacement(e.target.value)}>{PLACEMENT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                </label>
                <label className="block text-xs font-medium text-slate-600">Status
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as LoyaltyOffer['status'])}>
                    <option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option>
                  </select>
                </label>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4">
                <p className="text-xs font-semibold text-violet-800">Decisioning attributes</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs text-slate-600">Expected lift %<input type="number" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={expectedLift} onChange={(e) => setExpectedLift(Number(e.target.value))} /></label>
                  <label className="block text-xs text-slate-600">Margin impact<input type="number" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={marginImpact} onChange={(e) => setMarginImpact(Number(e.target.value))} /></label>
                  <label className="block text-xs text-slate-600">Propensity weight<input type="number" step="0.1" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={propensityWeight} onChange={(e) => setPropensityWeight(Number(e.target.value))} /></label>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">Min purchase<input type="number" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Optional" /></label>
                <label className="block text-xs font-medium text-slate-600">Freq. cap (hours)<input type="number" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={frequencyCapHours} onChange={(e) => setFrequencyCapHours(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Optional" /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">Required tier slug<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={requiredTierSlug} onChange={(e) => setRequiredTierSlug(e.target.value)} placeholder="e.g. gold" /></label>
                <label className="block text-xs font-medium text-slate-600">Program
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                    <option value="">None</option>
                    {(programs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">Tags (comma-separated)<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="onboarding, retention" /></label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save offer</Button>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete offer"
        message={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
