import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Database,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { BulkActionBar } from '@/components/bulk/BulkActionBar';
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog';
import { SelectCheckbox } from '@/components/bulk/SelectCheckbox';
import { AudienceDiyBuilder } from '@/components/audiences/AudienceDiyBuilder';
import { AudienceAiPanel } from '@/components/audiences/AudienceAiPanel';
import { AudienceCohortCard } from '@/components/audiences/AudienceCohortCard';
import { useAudienceScheduler } from '@/components/audiences/useAudienceScheduler';
import { useListBulkDelete } from '@/hooks/useListBulkDelete';
import { useModuleDeleteAccess } from '@/hooks/useModuleDeleteAccess';
import { useAuth } from '@/contexts/AuthContext';
import {
  AUDIENCE_TEMPLATES,
  createAudience,
  deleteAudience,
  fetchAudiences,
  filterRootFromRules,
  refreshAudience,
  slugifyAudienceName,
} from '@/lib/audiences';

function playSuccessPingSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Harmonic bell ping chime (A5 880Hz -> E6 1320Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, now + 0.06);
    gain2.gain.setValueAtTime(0.22, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.65);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

type Tab = 'cohorts' | 'diy' | 'ai';

const TAB_LABELS: Record<Tab, { label: string; icon: typeof Target }> = {
  cohorts: { label: 'All Cohorts', icon: Target },
  diy: { label: 'DIY Rule Builder', icon: SlidersHorizontal },
  ai: { label: 'AI Cohort Generator', icon: Sparkles },
};

export function AudiencePage() {
  const { tenantId, environment } = useAuth();
  const { canDelete } = useModuleDeleteAccess('customers.audiences');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'ai' | 'diy' | 'template' | 'auto'>('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [templateSubModal, setTemplateSubModal] = useState(false);

  const [refreshProgress, setRefreshProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    currentName?: string;
  } | null>(null);
  const [showRefreshSuccessDialog, setShowRefreshSuccessDialog] = useState(false);
  const [refreshedTotalCount, setRefreshedTotalCount] = useState(0);

  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam === 'diy' || tabParam === 'ai' ? tabParam : 'cohorts';

  useAudienceScheduler(tenantId, environment, tab === 'cohorts');

  const setTab = (t: Tab) => {
    setSearchParams(t === 'cohorts' ? {} : { tab: t }, { replace: true });
  };

  const { data: audiences, refetch, isLoading } = useQuery({
    queryKey: ['audiences', tenantId, environment],
    queryFn: () => fetchAudiences(tenantId, environment),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAudience,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audiences'] });
      setDeletingId(null);
    },
    onError: () => setDeletingId(null),
  });

  const filteredAudiences = useMemo(() => {
    return (audiences ?? []).filter((a) => {
      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = a.name.toLowerCase().includes(q);
        const matchSchema = a.schema_slug?.toLowerCase().includes(q);
        const matchDesc = a.description?.toLowerCase().includes(q);
        if (!matchName && !matchSchema && !matchDesc) return false;
      }

      // 2. Mode / Type Sub-Filter
      if (modeFilter === 'all') return true;
      if (modeFilter === 'auto') return Boolean(a.auto_refresh);
      return a.creation_mode === modeFilter;
    });
  }, [audiences, searchQuery, modeFilter]);

  const listItems = useMemo(
    () => (filteredAudiences ?? []).map((a) => ({ id: a.id, label: a.name })),
    [filteredAudiences],
  );

  const bulk = useListBulkDelete({
    module: 'customers.audiences',
    items: listItems,
    deleteFn: deleteAudience,
    onComplete: () => queryClient.invalidateQueries({ queryKey: ['audiences'] }),
  });

  const totalMembers = audiences?.reduce((s, a) => s + (a.member_count ?? 0), 0) ?? 0;
  const autoCount = audiences?.filter((a) => a.auto_refresh).length ?? 0;
  const aiCount = audiences?.filter((a) => a.creation_mode === 'ai').length ?? 0;
  const diyCount = audiences?.filter((a) => a.creation_mode === 'diy').length ?? 0;
  const templateCount = audiences?.filter((a) => a.creation_mode === 'template').length ?? 0;

  const handleSaved = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ['audiences'] });
    navigate(`/customers/audiences/${id}`);
  };

  const handleRefresh = async (id: string) => {
    const audience = audiences?.find((a) => a.id === id);
    if (!audience) return;
    setRefreshingId(id);
    try {
      await refreshAudience(audience, tenantId, environment, 'manual');
      await refetch();
    } finally {
      setRefreshingId(null);
    }
  };

  const refreshAll = async () => {
    const list = audiences ?? [];
    if (!list.length) return;

    setRefreshProgress({
      current: 0,
      total: list.length,
      percent: 5,
      currentName: list[0]?.name,
    });

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      setRefreshProgress({
        current: i + 1,
        total: list.length,
        percent: Math.round(((i + 1) / list.length) * 100),
        currentName: a.name,
      });
      await refreshAudience(a, tenantId, environment, 'manual');
    }

    await refetch();
    playSuccessPingSound();
    setRefreshedTotalCount(list.length);
    setRefreshProgress(null);
    setShowRefreshSuccessDialog(true);
  };

  const useTemplate = async (template: (typeof AUDIENCE_TEMPLATES)[0]) => {
    const created = await createAudience({
      tenant_id: tenantId,
      environment,
      name: template.name,
      slug: slugifyAudienceName(template.name),
      description: template.description,
      schema_slug: template.schema_slug,
      filter_json: filterRootFromRules(template.rules),
      creation_mode: 'template',
    });
    setTemplateSubModal(false);
    setShowCreateModal(false);
    refetch();
    navigate(`/customers/audiences/${created.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Simple Progress Bar (Just Above Audience Cohorts Line) */}
      {refreshProgress && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-2xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600 shrink-0" />
              <span className="font-bold text-emerald-900">
                Refreshing cohorts ({refreshProgress.current}/{refreshProgress.total}):
              </span>
              <span className="truncate text-emerald-700 font-medium font-mono text-[11px]">
                {refreshProgress.currentName}
              </span>
            </div>
            <span className="font-bold text-emerald-800 tabular-nums font-mono">
              {refreshProgress.percent}%
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200/80">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${refreshProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audience Cohorts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Segment customers using schema criteria, automated sync schedules, or AI generation.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {tab === 'cohorts' && (audiences?.length ?? 0) > 0 && (
            <Button variant="secondary" onClick={refreshAll} className="font-bold shadow-2xs">
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Refresh All
            </Button>
          )}
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold shadow-xs"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Cohort
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total Cohorts"
          value={String(audiences?.length ?? 0)}
          icon={Target}
          subtext="Active segment queries"
        />
        <StatTile
          label="Total Reachable Members"
          value={totalMembers.toLocaleString()}
          icon={Users}
          subtext="Across all cohort queries"
        />
        <StatTile
          label="Auto-Refresh Schedules"
          value={String(autoCount)}
          icon={Zap}
          subtext="Automated cron syncs"
        />
        <StatTile
          label="Connected Schemas"
          value="Customer +"
          icon={Database}
          subtext="Data model entities"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200/90 pb-2">
        <div className="flex gap-2">
          {(Object.keys(TAB_LABELS) as Tab[]).map((key) => {
            const { label, icon: Icon } = TAB_LABELS[key];
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-2xs ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200/90 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        {tab === 'cohorts' && autoCount > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-xs font-bold text-amber-800">
            <Zap className="h-3.5 w-3.5 text-amber-600" />
            <span>{autoCount} on auto-refresh</span>
          </div>
        )}
      </div>

      {tab === 'cohorts' && (
        <div className="space-y-6">
          {/* Search, Sub-filters, and Quick Templates */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search cohorts by name or schema…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                ['all', `All (${audiences?.length ?? 0})`],
                ['ai', `AI (${aiCount})`],
                ['diy', `Rules (${diyCount})`],
                ['template', `Templates (${templateCount})`],
                ['auto', `Auto-Refresh (${autoCount})`],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setModeFilter(k as any)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition shadow-2xs ${
                    modeFilter === k
                      ? 'bg-brand-600 text-white'
                      : 'bg-white border border-slate-200/90 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Templates Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                1-Click Ready Cohort Templates
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => useTemplate(t)}
                  className="group inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-600 transition" />
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Cohort Grid */}
          {isLoading ? (
            <div className="py-20 text-center text-sm font-medium text-slate-400">
              Loading audience cohorts…
            </div>
          ) : filteredAudiences.length > 0 ? (
            <div className="space-y-4">
              <BulkActionBar
                count={bulk.selection.count}
                resourceLabel={bulk.resourceLabel}
                onDelete={bulk.openDeleteConfirm}
                onClear={bulk.selection.clear}
                disabled={!canDelete || bulk.deleting}
              />

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredAudiences.map((a) => (
                  <div key={a.id} className="relative">
                    {canDelete && (
                      <div className="absolute left-3 top-3 z-10">
                        <SelectCheckbox
                          checked={bulk.selection.isSelected(a.id)}
                          onChange={() => bulk.selection.toggle(a.id)}
                          aria-label={`Select ${a.name}`}
                        />
                      </div>
                    )}
                    <AudienceCohortCard
                      audience={a}
                      refreshing={refreshingId === a.id}
                      deleting={deletingId === a.id}
                      onRefresh={() => handleRefresh(a.id)}
                      onDelete={
                        canDelete
                          ? () => {
                              setDeletingId(a.id);
                              deleteMutation.mutate(a.id);
                            }
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center space-y-4 shadow-2xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-2xs">
                <Target className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">No matching cohorts found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery
                    ? `No audience cohorts matched "${searchQuery}". Try clearing search or sub-filters.`
                    : 'Create your first audience cohort with the AI assistant or visual DIY rule builder.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="secondary" onClick={() => setTab('diy')} className="font-bold text-xs">
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                  DIY Cohort
                </Button>
                <Button onClick={() => setTab('ai')} className="font-bold text-xs">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  AI Cohort
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'diy' && (
        <AudienceDiyBuilder tenantId={tenantId} environment={environment} onSaved={handleSaved} />
      )}

      {tab === 'ai' && (
        <AudienceAiPanel tenantId={tenantId} environment={environment} onSaved={handleSaved} />
      )}

      <BulkDeleteDialog
        open={bulk.confirmOpen}
        title="Delete audiences"
        resourceLabel={bulk.resourceLabel}
        items={bulk.selectedItems}
        loading={bulk.deleting}
        onConfirm={bulk.confirmBulkDelete}
        onCancel={() => bulk.setConfirmOpen(false)}
      />

      {/* Cohort Creation Selection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Close"
            onClick={() => {
              setShowCreateModal(false);
              setTemplateSubModal(false);
            }}
          />

          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Choose Cohort Creation Mode</h2>
              <p className="mt-1 text-xs text-slate-500">
                Select how you would like to build and segment your audience cohort.
              </p>
            </div>

            {!templateSubModal ? (
              <div className="grid gap-3.5 sm:grid-cols-3">
                {/* 1. AI Prompt */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setTab('ai');
                  }}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-left hover:border-purple-300 hover:bg-purple-50/40 hover:shadow-md transition duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-900">AI Prompt</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Describe target customers in natural language. AI builds precision rules.
                      </p>
                    </div>
                  </div>
                  <span className="mt-4 inline-flex items-center text-[10px] font-bold text-purple-600">
                    Prompt Agent →
                  </span>
                </button>

                {/* 2. DIY Rule Builder */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setTab('diy');
                  }}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-left hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md transition duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                      <SlidersHorizontal className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-900">DIY Rules</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Build nested AND / OR / EXCEPT rules, relational joins, and expressions.
                      </p>
                    </div>
                  </div>
                  <span className="mt-4 inline-flex items-center text-[10px] font-bold text-blue-600">
                    Rule Builder →
                  </span>
                </button>

                {/* 3. Ready Templates */}
                <button
                  type="button"
                  onClick={() => setTemplateSubModal(true)}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-left hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md transition duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                      <Target className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-900">Templates</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Start instantly from high-converting pre-built audience recipes.
                      </p>
                    </div>
                  </div>
                  <span className="mt-4 inline-flex items-center text-[10px] font-bold text-emerald-600">
                    Browse Templates →
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Select a Ready Template:</span>
                  <button
                    type="button"
                    onClick={() => setTemplateSubModal(false)}
                    className="text-xs font-semibold text-brand-600 hover:underline"
                  >
                    ← Back to Modes
                  </button>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {AUDIENCE_TEMPLATES.map((tmpl) => (
                    <div
                      key={tmpl.name}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:border-brand-300 hover:bg-brand-50/30 transition"
                    >
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-slate-900">{tmpl.name}</h4>
                        <p className="text-[11px] text-slate-500">{tmpl.description}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => useTemplate(tmpl)}
                        className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shrink-0"
                      >
                        Use Template
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setTemplateSubModal(false);
                }}
                className="font-bold text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* All Cohorts Refreshed Dialogue Confirmation with Ping */}
      {showRefreshSuccessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Close"
            onClick={() => setShowRefreshSuccessDialog(false)}
          />

          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-emerald-100 bg-white p-7 shadow-2xl animate-in zoom-in-95 text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-md ring-8 ring-emerald-50">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-slate-900">All Cohorts Refreshed!</h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Successfully re-evaluated rules and synchronized live member counts for all{' '}
                <span className="font-bold text-slate-800">{refreshedTotalCount} audience cohorts</span>.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 text-xs text-emerald-900 font-medium">
              ✨ Member counters and sync timestamps have been updated across your workspace.
            </div>

            <Button
              type="button"
              onClick={() => setShowRefreshSuccessDialog(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl shadow-xs text-xs"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  subtext,
}: {
  label: string;
  value: string;
  icon: typeof Target;
  subtext: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500 border border-slate-100">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-black tabular-nums text-slate-900">{value}</p>
        <p className="mt-0.5 text-[11px] text-slate-500 font-medium">{subtext}</p>
      </div>
    </div>
  );
}
