import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCircle2, GitBranch, Link2, Plus, Search, Sparkles, User, Workflow, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { UserAssignField } from '@/components/journeys/campaign/UserAssignField';
import { Breadcrumbs, ChannelChip } from '@/components/campaigns/CampaignUi';
import { useAuth } from '@/contexts/AuthContext';
import {
  activateCampaign,
  attachPipelines,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_PRESETS,
  CAMPAIGN_PRIORITIES,
  CAMPAIGN_TYPES,
  CAMPAIGN_WORKFLOW_TEMPLATES,
  CampaignLinkMissingError,
  createCampaign,
  createCampaignPipeline,
  DELIVERY_NODE_TYPES,
  fetchAllPipelines,
  formatDate,
} from '@/lib/campaigns';
import { getWorkflowGraph } from '@/lib/data-jobs';
import { folderNameFromPath, normalizeFolderPath } from '@/lib/journey-folders';

const STEPS = ['Basic information', 'Planning', 'Workflow', 'Review'] as const;

const FALLBACK_TIMEZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney'];

function timezones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    return intl.supportedValuesOf?.('timeZone') ?? FALLBACK_TIMEZONES;
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

type WorkflowMode = 'create' | 'attach' | 'later';

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function CampaignWizardPage() {
  const { tenantId, environment, user, displayName } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = CAMPAIGN_PRESETS.find((p) => p.id === params.get('preset'));
  const folderPath = normalizeFolderPath(params.get('folder') ?? '/');

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'draft' | 'create' | null>(null);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState(preset?.description ?? '');
  const [type, setType] = useState(preset?.meta.type ?? 'Promotional');
  const [ownerName, setOwnerName] = useState(displayName || user?.email || '');
  const [ownerId, setOwnerId] = useState(user?.id ?? '');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  // Step 2
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [priority, setPriority] = useState(preset?.meta.priority ?? 'Medium');
  const [objective, setObjective] = useState(preset?.meta.objective ?? '');
  const [primaryChannel, setPrimaryChannel] = useState(preset?.meta.primary_channel ?? 'email');
  const [budget, setBudget] = useState('');
  const [targetKpi, setTargetKpi] = useState(preset?.meta.target_kpi ?? '');
  const [notes, setNotes] = useState('');

  // Step 3
  const [mode, setMode] = useState<WorkflowMode>('create');
  const [templateId, setTemplateId] = useState(preset?.workflowTemplateId ?? 'email_blast');
  const [attachIds, setAttachIds] = useState<string[]>([]);
  const [pipelineSearch, setPipelineSearch] = useState('');

  const pipelinesQuery = useQuery({
    queryKey: ['campaign-attachable-pipelines', tenantId, environment],
    queryFn: () => fetchAllPipelines(tenantId, environment),
    enabled: step >= 2,
    retry: false,
  });
  const linkMissing = pipelinesQuery.error instanceof CampaignLinkMissingError;

  const pipelines = useMemo(() => {
    const q = pipelineSearch.trim().toLowerCase();
    return (pipelinesQuery.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [pipelinesQuery.data, pipelineSearch]);

  const template = CAMPAIGN_WORKFLOW_TEMPLATES.find((t) => t.id === templateId) ?? CAMPAIGN_WORKFLOW_TEMPLATES[0];
  const attached = (pipelinesQuery.data ?? []).filter((p) => attachIds.includes(p.id));
  const reviewChannels = useMemo(() => {
    if (mode === 'create') return template.channels;
    if (mode === 'attach') {
      const set = new Set<string>();
      attached.forEach((p) =>
        getWorkflowGraph({ id: p.id, workflow_json: p.workflow_json }).nodes.forEach((n) => {
          const d = DELIVERY_NODE_TYPES[String(n.data?.stepType)];
          if (d) set.add(d.channel);
        }),
      );
      return [...set];
    }
    return [];
  }, [mode, template, attached]);

  const canContinue = step === 0 ? Boolean(name.trim()) : step === 1 ? !endsAt || !startsAt || endsAt >= startsAt : step === 2 ? mode !== 'attach' || attachIds.length > 0 : true;

  const addTag = () => {
    const t = tagDraft.trim().replace(/,$/, '');
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagDraft('');
  };

  const submit = async (asDraft: boolean) => {
    if (!name.trim()) {
      setStep(0);
      setError('Campaign name is required.');
      return;
    }
    setError('');
    setSaving(asDraft ? 'draft' : 'create');
    try {
      const campaign = await createCampaign({
        tenantId,
        environment,
        name: name.trim(),
        description: description.trim() || undefined,
        folderPath,
        startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        owner: { name: ownerName, id: ownerId },
        meta: {
          type,
          tags,
          timezone,
          priority,
          objective: objective.trim() || undefined,
          primary_channel: primaryChannel,
          budget: budget.trim() || undefined,
          target_kpi: targetKpi.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });

      if (mode === 'create') {
        await createCampaignPipeline({ campaign, tenantId, environment, template });
      } else if (mode === 'attach' && attachIds.length) {
        await attachPipelines(campaign, attachIds, tenantId, environment);
      }
      if (!asDraft) await activateCampaign(campaign, tenantId, environment);

      navigate(`/campaigns/${campaign.id}${mode === 'create' ? '?tab=workflows' : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create campaign');
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-2">
        <Breadcrumbs items={[{ label: 'Campaigns', to: '/campaigns' }, { label: 'Create campaign' }]} />
        <div className="flex items-center gap-3">
          <Link to="/campaigns" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Create campaign</h1>
            <p className="text-xs text-slate-500">
              {preset ? `From template "${preset.name}" · ` : ''}
              {folderPath !== '/' ? `In folder "${folderNameFromPath(folderPath)}"` : 'Business container for your pipeline workflows'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* ── Stepper ── */}
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => setStep(i)}
                  className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    active ? 'bg-indigo-50 font-semibold text-indigo-700' : done ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      active ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>

        {/* ── Step body ── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          <div className="space-y-5 p-6">
            {step === 0 && (
              <>
                <StepTitle title="Basic information" subtitle="Who owns this campaign and what it is." />
                <Field label="Campaign name" required>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali Customer Promotion 2026" className={inputCls} autoFocus />
                </Field>
                <Field label="Description">
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Campaign type">
                    <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                      {CAMPAIGN_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Folder" hint="Change folders later by dragging in the campaign list.">
                    <input value={folderPath === '/' ? 'All (root)' : folderNameFromPath(folderPath)} disabled className={`${inputCls} bg-slate-50 text-slate-500`} />
                  </Field>
                </div>
                <UserAssignField
                  tenantId={tenantId}
                  label="Campaign owner"
                  hint="Defaults to you."
                  icon={User}
                  value={ownerName}
                  assignedUserId={ownerId || undefined}
                  onAssign={(email, id) => {
                    setOwnerName(email);
                    setOwnerId(id ?? '');
                  }}
                  onClear={() => {
                    setOwnerName('');
                    setOwnerId('');
                  }}
                />
                <Field label="Tags" hint="Press Enter or comma to add.">
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                    {tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {t}
                        <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addTag();
                        } else if (e.key === 'Backspace' && !tagDraft && tags.length) setTags(tags.slice(0, -1));
                      }}
                      onBlur={addTag}
                      placeholder={tags.length ? '' : 'festive, q4, vip'}
                      className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none"
                    />
                  </div>
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <StepTitle title="Campaign planning" subtitle="Shown on the campaign dashboard as the plan of record." />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Start date">
                    <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="End date">
                    <input type="date" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Timezone">
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
                      {timezones().map((tz) => <option key={tz}>{tz}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Priority">
                    <div className="flex gap-1.5">
                      {CAMPAIGN_PRIORITIES.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${priority === p ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Primary channel">
                    <select value={primaryChannel} onChange={(e) => setPrimaryChannel(e.target.value)} className={inputCls}>
                      {CAMPAIGN_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Business objective">
                  <textarea
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    rows={2}
                    placeholder="Increase repeat bookings among customers who travelled in the last 90 days."
                    className={inputCls}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Target KPI">
                    <input value={targetKpi} onChange={(e) => setTargetKpi(e.target.value)} placeholder="Conversion" className={inputCls} />
                  </Field>
                  <Field label="Budget">
                    <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="₹5,00,000" className={inputCls} />
                  </Field>
                </div>
                <Field label="Business notes">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
                </Field>
                {startsAt && endsAt && endsAt < startsAt && <p className="text-xs font-semibold text-red-600">End date must be on or after the start date.</p>}
              </>
            )}

            {step === 2 && (
              <>
                <StepTitle title="Add workflow" subtitle="Workflows are Pipelines — built and executed in the existing Pipeline builder." />
                <div className="grid gap-3 sm:grid-cols-3">
                  <ModeCard active={mode === 'create'} onClick={() => setMode('create')} icon={Plus} title="Create new workflow" hint="New pipeline linked to this campaign" />
                  <ModeCard active={mode === 'attach'} onClick={() => setMode('attach')} icon={Link2} title="Use existing workflow" hint="Attach pipelines you already built" />
                  <ModeCard active={mode === 'later'} onClick={() => setMode('later')} icon={Workflow} title="Add later" hint="Attach from the campaign dashboard" />
                </div>

                {mode === 'create' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700">Starting point</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CAMPAIGN_WORKFLOW_TEMPLATES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTemplateId(t.id)}
                          className={`rounded-xl border-2 p-3 text-left transition-all ${templateId === t.id ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-800">{t.name}</p>
                            {templateId === t.id && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500">{t.description}</p>
                          {t.channels.length > 0 && (
                            <div className="mt-2 flex gap-1">{t.channels.map((c) => <ChannelChip key={c} channel={c} label={c} />)}</div>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                      Campaign name and ID are passed to the pipeline (delivery labels, UTM campaign). Open it from the Workflows tab after creation.
                    </p>
                  </div>
                )}

                {mode === 'attach' && (
                  <div className="space-y-2">
                    {linkMissing ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        Attaching requires <code className="font-mono">supabase/sql/82_campaign_pipeline_link.sql</code>. Run it once, then reload.
                      </p>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input value={pipelineSearch} onChange={(e) => setPipelineSearch(e.target.value)} placeholder="Search pipelines…" className={`${inputCls} pl-9`} />
                        </div>
                        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                          {pipelinesQuery.isLoading && <p className="p-4 text-center text-xs text-slate-500">Loading pipelines…</p>}
                          {!pipelinesQuery.isLoading && pipelines.length === 0 && <p className="p-4 text-center text-xs text-slate-500">No pipelines found.</p>}
                          {pipelines.map((p) => {
                            const checked = attachIds.includes(p.id);
                            const taken = Boolean(p.campaign_id);
                            return (
                              <label key={p.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${taken ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                                <input
                                  type="checkbox"
                                  disabled={taken}
                                  checked={checked}
                                  onChange={(e) => setAttachIds(e.target.checked ? [...attachIds, p.id] : attachIds.filter((x) => x !== p.id))}
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                />
                                <GitBranch className="h-4 w-4 shrink-0 text-indigo-500" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {p.pipeline_status ?? 'draft'} · Last run {formatDate(p.last_run_at, true)}
                                    {taken && ' · already in another campaign'}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-500">{attachIds.length} selected</p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <StepTitle title="Review" subtitle="Check everything before creating the campaign." />
                <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm sm:grid-cols-2">
                  <ReviewItem label="Campaign name" value={name} />
                  <ReviewItem label="Campaign type" value={type} />
                  <ReviewItem label="Owner" value={ownerName || '—'} />
                  <ReviewItem label="Priority" value={priority} />
                  <ReviewItem label="Start date" value={startsAt ? formatDate(`${startsAt}T00:00:00`) : 'Not set'} />
                  <ReviewItem label="End date" value={endsAt ? formatDate(`${endsAt}T00:00:00`) : 'Not set'} />
                  <ReviewItem label="Timezone" value={timezone} />
                  <ReviewItem label="Target KPI" value={targetKpi || '—'} />
                  <div className="sm:col-span-2">
                    <ReviewItem label="Objective" value={objective || '—'} />
                  </div>
                  <ReviewItem
                    label="Workflows"
                    value={mode === 'create' ? `New: ${template.name}` : mode === 'attach' ? attached.map((p) => p.name).join(', ') : 'None yet'}
                  />
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Channels</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {reviewChannels.length ? reviewChannels.map((c) => <ChannelChip key={c} channel={c} label={c} />) : <span className="text-slate-500">—</span>}
                    </dd>
                  </div>
                  <ReviewItem label="Status after create" value={startsAt && new Date(`${startsAt}T00:00:00`) > new Date() ? 'Scheduled' : 'Running (Draft if saved as draft)'} />
                  {tags.length > 0 && <ReviewItem label="Tags" value={tags.join(', ')} />}
                </dl>
              </>
            )}

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3.5">
            <Button variant="ghost" onClick={() => (step === 0 ? navigate('/campaigns') : setStep(step - 1))} className="text-xs">
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => submit(true)} disabled={!name.trim() || saving !== null} className="text-xs">
                {saving === 'draft' ? 'Saving…' : 'Save draft'}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep(step + 1)} disabled={!canContinue} className="text-xs font-semibold">
                  Continue
                </Button>
              ) : (
                <Button onClick={() => submit(false)} disabled={saving !== null} className="text-xs font-semibold">
                  {saving === 'create' ? 'Creating…' : 'Create campaign'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function ModeCard({ active, onClick, icon: Icon, title, hint }: { active: boolean; onClick: () => void; icon: typeof Plus; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-3.5 text-left transition-all ${active ? 'border-indigo-400 bg-indigo-50/60 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <Icon className={`h-5 w-5 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
      <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
      <p className="text-[11px] text-slate-500">{hint}</p>
    </button>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-800">{value}</dd>
    </div>
  );
}
