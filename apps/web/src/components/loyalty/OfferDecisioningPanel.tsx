import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Play, Plus, Pencil, Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchDecisionPolicies,
  fetchPolicyOfferIds,
  fetchRecentDecisions,
  saveDecisionPolicy,
  simulateBestOffer,
} from '@/lib/offer-decisioning';
import { fetchOffers } from '@/lib/offers';
import {
  CHANNEL_OPTIONS,
  PLACEMENT_OPTIONS,
  STRATEGY_LABELS,
  type DecisionStrategy,
  type OfferDecisionPolicy,
} from '@/lib/loyalty-types';

export function OfferDecisioningPanel() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OfferDecisionPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<OfferDecisionPolicy['status']>('draft');
  const [strategy, setStrategy] = useState<DecisionStrategy>('balanced');
  const [channel, setChannel] = useState('any');
  const [placement, setPlacement] = useState('checkout');
  const [fallbackOfferId, setFallbackOfferId] = useState('');
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [holdoutPercent, setHoldoutPercent] = useState(5);

  const [simPolicySlug, setSimPolicySlug] = useState('checkout-best-offer');
  const [simCart, setSimCart] = useState(1500);
  const [simTier, setSimTier] = useState('');
  const [simPropensity, setSimPropensity] = useState(1);
  const [simResult, setSimResult] = useState<string | null>(null);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['offer-policies', tenantId, environment],
    queryFn: () => fetchDecisionPolicies(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: offers } = useQuery({
    queryKey: ['loyalty-offers', tenantId, environment],
    queryFn: () => fetchOffers(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: recentDecisions } = useQuery({
    queryKey: ['offer-decisions', tenantId, environment],
    queryFn: () => fetchRecentDecisions(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  useEffect(() => {
    if (!editing) return;
    void fetchPolicyOfferIds(editing.id).then(setSelectedOfferIds);
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveDecisionPolicy({
        tenantId, environment, id: editing?.id, name, slug, description, status, strategy,
        channel, placement, fallbackOfferId: fallbackOfferId || null,
        settings: { holdout_percent: holdoutPercent, value_weight: 0.4, margin_weight: 0.3, propensity_weight: 0.3 },
        offerIds: selectedOfferIds,
      }),
    onSuccess: () => {
      setEditorOpen(false);
      setEditing(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['offer-policies', tenantId, environment] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const simulateMutation = useMutation({
    mutationFn: () =>
      simulateBestOffer({
        tenantId, environment, policySlug: simPolicySlug,
        context: { channel: 'web', placement: 'checkout', cart_value: simCart, tier_slug: simTier || undefined, propensity: simPropensity },
      }),
    onSuccess: (result) => setSimResult(JSON.stringify(result, null, 2)),
    onError: (err: Error) => setSimResult(JSON.stringify({ error: err.message }, null, 2)),
  });

  function openCreate() {
    setEditing(null);
    setName(''); setSlug(''); setDescription(''); setStatus('draft');
    setStrategy('balanced'); setChannel('any'); setPlacement('checkout');
    setFallbackOfferId(''); setSelectedOfferIds([]); setHoldoutPercent(5);
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(p: OfferDecisionPolicy) {
    setEditing(p);
    setName(p.name); setSlug(p.slug); setDescription(p.description ?? '');
    setStatus(p.status); setStrategy(p.strategy); setChannel(p.channel);
    setPlacement(p.placement); setFallbackOfferId(p.fallbackOfferId ?? '');
    setHoldoutPercent(p.settings.holdout_percent ?? 5);
    setError(null);
    setEditorOpen(true);
  }

  function toggleOffer(id: string) {
    setSelectedOfferIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <Brain className="mt-0.5 h-5 w-5 text-indigo-600" />
          <div>
            <h3 className="font-semibold text-slate-900">Best Offer Decisioning (BOD)</h3>
            <p className="mt-1 text-sm text-slate-600">
              Real-time offer ranking with margin protection, propensity scoring, frequency caps, holdout groups,
              and explore/exploit strategies — callable from journeys, web, app, and POS via RPC.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-3">
        <p className="text-sm text-slate-600">Policies define which offers compete and how winners are scored.</p>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New policy</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(policies ?? []).map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{p.name}</h3>
                <p className="text-xs text-slate-500">{p.slug} · {p.channel} / {p.placement}</p>
              </div>
              <Badge variant={p.status === 'active' ? 'success' : 'default'}>{p.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600">{p.description || 'No description'}</p>
            <p className="mt-2 text-xs font-medium text-indigo-700">{STRATEGY_LABELS[p.strategy]}</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => openEdit(p)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />Configure
            </Button>
          </Card>
        ))}
      </div>

      {!policies?.length && !isLoading && (
        <EmptyState title="No decision policies" description="Create a BOD policy to start ranking offers in real time." />
      )}

      <Card className="overflow-hidden">
        <div className="border-b bg-slate-50 px-6 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Decision simulator
          </h3>
          <p className="mt-1 text-xs text-slate-500">Test BOD with customer context before going live</p>
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">Policy slug
              <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={simPolicySlug} onChange={(e) => setSimPolicySlug(e.target.value)}>
                {(policies ?? []).filter((p) => p.status === 'active').map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
                {!policies?.some((p) => p.status === 'active') && <option value="checkout-best-offer">checkout-best-offer</option>}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">Cart value (₹)<input type="number" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={simCart} onChange={(e) => setSimCart(Number(e.target.value))} /></label>
            <label className="block text-xs font-medium text-slate-600">Tier slug<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={simTier} onChange={(e) => setSimTier(e.target.value)} placeholder="gold, silver…" /></label>
            <label className="block text-xs font-medium text-slate-600">Propensity (0–2)<input type="number" step="0.1" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={simPropensity} onChange={(e) => setSimPropensity(Number(e.target.value))} /></label>
            <Button onClick={() => simulateMutation.mutate()} disabled={simulateMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />{simulateMutation.isPending ? 'Running…' : 'Simulate decision'}
            </Button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-100">
            {simResult ?? '// Click Simulate to see ranked offers, winner, and score breakdown'}
          </pre>
        </div>
      </Card>

      {recentDecisions && recentDecisions.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b px-6 py-4"><h3 className="font-semibold text-slate-900">Recent decisions</h3></div>
          <div className="divide-y">
            {recentDecisions.slice(0, 8).map((d) => (
              <div key={d.id as string} className="flex items-center justify-between px-6 py-3 text-sm">
                <span className="text-slate-600">{new Date(d.created_at as string).toLocaleString()}</span>
                <span className="font-medium">{String(d.strategy)}</span>
                <span className="text-xs text-slate-500">{String(d.placement)} · {String(d.channel)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden">
            <div className="border-b px-6 py-4"><h2 className="text-lg font-semibold">{editing ? 'Edit policy' : 'New BOD policy'}</h2></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">Name<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="block text-xs font-medium text-slate-600">Slug<input className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></label>
              </div>
              <label className="block text-xs font-medium text-slate-600">Description<textarea className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">Strategy
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={strategy} onChange={(e) => setStrategy(e.target.value as DecisionStrategy)}>
                    {Object.entries(STRATEGY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">Status
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as OfferDecisionPolicy['status'])}>
                    <option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">Channel
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </label>
                <label className="block text-xs font-medium text-slate-600">Placement
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={placement} onChange={(e) => setPlacement(e.target.value)}>{PLACEMENT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">Holdout %<input type="number" min={0} max={50} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={holdoutPercent} onChange={(e) => setHoldoutPercent(Number(e.target.value))} /></label>
              <label className="block text-xs font-medium text-slate-600">Fallback offer
                <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={fallbackOfferId} onChange={(e) => setFallbackOfferId(e.target.value)}>
                  <option value="">None</option>
                  {(offers ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <div>
                <p className="text-xs font-medium text-slate-600">Eligible offers (empty = all active)</p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {(offers ?? []).map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={selectedOfferIds.includes(o.id)} onChange={() => toggleOffer(o.id)} />
                      {o.name} <span className="text-xs text-slate-400">({o.status})</span>
                    </label>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save policy</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
