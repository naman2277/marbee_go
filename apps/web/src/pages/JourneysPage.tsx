import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GitBranch, Megaphone, Plus } from 'lucide-react';
import { Button, Badge, Card, EmptyState } from '@/components/ui';
import { CampaignEditorShell } from '@/components/journeys/campaign/CampaignEditorShell';
import { JourneyBuilder } from '@/components/journeys/builder/JourneyBuilder';
import type { CampaignView } from '@/components/journeys/campaign/CampaignViewTabs';
import {
  isoFromDateInput,
  type CampaignGeneralForm,
} from '@/components/journeys/campaign/CampaignGeneralPanel';
import { CanvasErrorBoundary } from '@/components/journeys/CanvasErrorBoundary';
import { JourneyCard } from '@/components/journeys/JourneyCard';
import { JourneyFolderSidebar } from '@/components/journeys/JourneyFolderSidebar';
import { JourneyFolderTile } from '@/components/journeys/JourneyFolderTile';
import { JourneyLibraryToolbar } from '@/components/journeys/JourneyLibraryToolbar';
import { RenameModal } from '@/components/journeys/RenameModal';
import { CreateFolderModal } from '@/components/assets/CreateFolderModal';
import { DeleteConfirmModal } from '@/components/journeys/DeleteConfirmModal';
import {
  createJourney,
  createJourneyFolder,
  deleteJourney,
  deleteJourneyFolder,
  fetchJourneyDetail,
  fetchJourneyFolders,
  fetchJourneys,
  isCampaignJourney,
  journeyType,
  moveJourneyToFolder,
  renameJourney,
  renameJourneyFolder,
  resolveJourneyDisplayStatus,
  resolveJourneyVersion,
  updateCampaignDetails,
} from '@/lib/journeys';
import {
  buildJourneyFolderTree,
  folderNameFromPath,
  joinFolderPath,
  journeysInFolder,
  listChildJourneyFolders,
  normalizeFolderPath,
  parentFolderPath,
  ROOT_FOLDER_LABEL,
  ROOT_FOLDER_TITLE,
} from '@/lib/journey-folders';
import { nurtureBlastTemplate, workflowBlastTemplate } from '@/lib/campaign-templates';
import { fetchCampaignRunStats, launchBlastCampaign } from '@/lib/journey-runner';
import { publishJourneyFlow } from '@/lib/journey-builder';
import { fetchAudiences } from '@/lib/audiences';
import { fetchInformationServices } from '@/lib/subscriptions';
import { fetchContentTemplates } from '@/lib/content-templates';
import { fetchChannelProviders } from '@/lib/channel-providers';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createNotification } from '@/lib/notifications';

export function JourneyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { tenantId, environment, user, displayName } = useAuth();
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');

  const { data: journey, isLoading, error: journeyError, isFetched } = useQuery({
    queryKey: ['journey', id, tenantId, environment],
    queryFn: () => fetchJourneyDetail(id!, tenantId, environment),
    enabled: Boolean(id && tenantId),
  });

  const version = resolveJourneyVersion(journey);

  const isCampaign = journey ? isCampaignJourney(journey) : false;
  const isFlow = journey ? journeyType(journey) === 'flow' : false;

  const { data: runStats } = useQuery({
    queryKey: ['campaign-run-stats', id, version?.canvas_json],
    queryFn: () => fetchCampaignRunStats(id!, version!.canvas_json),
    enabled: Boolean(id && version && isFlow),
    refetchInterval: isFlow ? 15_000 : false,
  });

  // Reference data for the redesigned Journey builder (flow journeys only).
  const { data: builderAudiences } = useQuery({
    queryKey: ['journey-builder-audiences', tenantId, environment],
    queryFn: () => fetchAudiences(tenantId, environment),
    enabled: Boolean(tenantId && isFlow),
  });
  const { data: builderServices } = useQuery({
    queryKey: ['journey-builder-services', tenantId, environment],
    queryFn: () => fetchInformationServices(tenantId, environment),
    enabled: Boolean(tenantId && isFlow),
  });
  const { data: builderTemplates } = useQuery({
    queryKey: ['journey-builder-templates', tenantId, environment],
    queryFn: () => fetchContentTemplates(tenantId, environment),
    enabled: Boolean(tenantId && isFlow),
  });
  const { data: builderProviders } = useQuery({
    queryKey: ['journey-builder-providers', tenantId, environment],
    queryFn: () => fetchChannelProviders(tenantId, environment),
    enabled: Boolean(tenantId && isFlow),
  });

  const invalidateRun = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign-run-stats', id] });
    queryClient.invalidateQueries({ queryKey: ['journey', id] });
  };

  const saveMutation = useMutation({
    mutationFn: async (canvasJson: unknown) => {
      if (!version) return;
      const { error } = await supabase
        .from('journey_versions')
        .update({ canvas_json: canvasJson })
        .eq('id', version.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journey', id] }),
  });

  const launchMutation = useMutation({
    mutationFn: (testMode: boolean) =>
      launchBlastCampaign({
        journeyId: id!,
        versionId: version!.id,
        tenantId,
        environment,
        canvasJson: version!.canvas_json,
        journeyName: journey!.name,
        testMode,
      }),
    onSuccess: () => invalidateRun(),
  });

  // Flow-journey: mirror entry source + selection criteria onto journeys.entry_trigger_config.
  const entryTriggerMutation = useMutation({
    mutationFn: async (mirror: Record<string, unknown>) => {
      const { error } = await supabase
        .from('journeys')
        .update({ entry_trigger_config: mirror })
        .eq('id', id!)
        .eq('tenant_id', tenantId)
        .eq('environment', environment);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journey', id] }),
  });

  // Flow-journey: versioned publish — freeze current version, spin a fresh draft.
  const publishFlowMutation = useMutation({
    mutationFn: () =>
      publishJourneyFlow({
        journeyId: id!,
        tenantId,
        environment,
        name: journey!.name,
        currentVersionId: version!.id,
        canvasJson: version!.canvas_json,
        publishedBy: user?.id ?? null,
      }),
    onSuccess: invalidateRun,
  });

  const loadTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!version) return;
      const template = isCampaign ? workflowBlastTemplate() : nurtureBlastTemplate();
      const { error } = await supabase
        .from('journey_versions')
        .update({ canvas_json: { nodes: template.nodes, edges: template.edges } })
        .eq('id', version.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journey', id] }),
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameJourney(id!, tenantId, environment, name),
    onSuccess: (result) => {
      if (result.error) {
        setRenameError(result.error);
        return;
      }
      setRenameError('');
      setRenameOpen(false);
      queryClient.invalidateQueries({ queryKey: ['journey', id] });
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
    },
    onError: (err: Error) => setRenameError(err.message),
  });

  const tabParam = searchParams.get('tab');
  const initialCampaignView: CampaignView =
    tabParam === 'general' ? 'general'
    : tabParam === 'canvas' || tabParam === 'workflow' ? 'canvas'
    : 'dashboard';

  const handleSaveGeneral = async (form: CampaignGeneralForm) => {
    if (!journey) return { error: 'Campaign not loaded' };
    const result = await updateCampaignDetails(
      journey.id,
      tenantId,
      environment,
      {
        name: form.name,
        description: form.description.trim() || null,
        startsAt: isoFromDateInput(form.startsAt, false),
        endsAt: isoFromDateInput(form.endsAt, true),
        settings: {
          campaign_owner: form.campaignOwner.trim() || undefined,
          campaign_owner_id: form.campaignOwnerId || undefined,
          campaign_developer: form.campaignDeveloper.trim() || undefined,
          campaign_developer_id: form.campaignDeveloperId || undefined,
          approval_status: form.approvalStatus ?? 'none',
          approval_notes: form.approvalNotes.trim() || undefined,
        },
      },
      journey.settings,
    );
    if (!result.error) {
      queryClient.invalidateQueries({ queryKey: ['journey', id] });
      queryClient.invalidateQueries({ queryKey: ['journeys'] });

      // Notify anyone newly assigned as owner / developer of this campaign
      const prev = (journey.settings ?? {}) as Record<string, unknown>;
      const roleAssignments: Array<{ id?: string; wasId?: unknown; role: string }> = [
        { id: form.campaignOwnerId, wasId: prev.campaign_owner_id, role: 'owner' },
        { id: form.campaignDeveloperId, wasId: prev.campaign_developer_id, role: 'developer' },
      ];
      for (const a of roleAssignments) {
        if (a.id && a.id !== a.wasId && a.id !== user?.id) {
          void createNotification(
            {
              title: `You were assigned to campaign "${form.name}"`,
              message: `${displayName || 'A teammate'} set you as ${a.role} of "${form.name}".`,
              type: 'campaign_assigned',
              recipientUserId: a.id,
              entityType: 'campaign',
              entityId: journey.id,
              actorName: displayName || undefined,
              actionUrl: `/journeys/${journey.id}`,
              actionLabel: 'View campaign',
            },
            tenantId,
            environment,
          ).catch(() => {});
        }
      }
    }
    return result;
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">Loading journey…</div>
    );
  }

  if (journeyError || !journey) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-slate-900">Journey not found</p>
        <p className="mt-2 text-sm text-slate-500">
          {journeyError instanceof Error ? journeyError.message : 'This journey does not exist or you do not have access.'}
        </p>
        <Link to="/journeys" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Back to Journeys
        </Link>
      </div>
    );
  }

  if (isFetched && !version) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-slate-900">Journey version missing</p>
        <p className="mt-2 text-sm text-slate-500">No canvas version was found for this journey.</p>
        <Link to="/journeys" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Back to Journeys
        </Link>
      </div>
    );
  }

  return (
    <div
      className={
        isCampaign
          ? 'flex h-[calc(100vh-5rem)] flex-col'
          : 'flex h-[calc(100vh-5rem)] flex-col'
      }
    >
      {!isCampaign && !isFlow && (
        <div className="mb-3 flex items-center gap-3 px-0.5">
          <Link to="/journeys" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="truncate text-sm font-semibold text-slate-800">{journey.name}</h1>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-500">{journey.status}</span>
          <span className="text-xs text-slate-400">v{version?.version_number ?? 1}</span>
          <span className="ml-auto">
            <Badge variant="success">Journey</Badge>
          </span>
        </div>
      )}

      {isCampaign ? (
        <CanvasErrorBoundary>
          <CampaignEditorShell
            key={version?.id}
            campaignId={id!}
            versionNumber={version?.version_number ?? 1}
            journeyStatus={journey.status}
            startsAt={journey.starts_at}
            endsAt={journey.ends_at}
            description={journey.description}
            settings={journey.settings}
            initialView={initialCampaignView}
            canvasJson={version?.canvas_json}
            tenantId={tenantId}
            environment={environment}
            journeyId={id}
            versionId={version?.id}
            journeyName={journey.name}
            savePending={saveMutation.isPending}
            onSave={(json) => saveMutation.mutate(json)}
            onLoadTemplate={() => loadTemplateMutation.mutate()}
            templatePending={loadTemplateMutation.isPending}
            onSaveGeneral={handleSaveGeneral}
            onRename={
              isCampaign
                ? () => {
                    setRenameName(journey.name);
                    setRenameError('');
                    setRenameOpen(true);
                  }
                : undefined
            }
          />
        </CanvasErrorBoundary>
      ) : isFlow ? (
        <CanvasErrorBoundary>
          <JourneyBuilder
            key={version?.id}
            journeyId={id!}
            versionId={version!.id}
            tenantId={tenantId}
            environment={environment}
            journeyName={journey.name}
            journeyStatus={journey.status}
            displayStatus={resolveJourneyDisplayStatus(journey)}
            versionNumber={version?.version_number ?? 1}
            canvasJson={version?.canvas_json}
            entryTriggerConfig={journey.entry_trigger_config}
            settings={journey.settings}
            startsAt={journey.starts_at ?? null}
            endsAt={journey.ends_at ?? null}
            audiences={builderAudiences ?? []}
            services={builderServices ?? []}
            templates={builderTemplates ?? []}
            providers={builderProviders ?? []}
            runStats={runStats}
            savePending={saveMutation.isPending}
            publishPending={publishFlowMutation.isPending}
            onSaveCanvas={(json) => saveMutation.mutate(json)}
            onSaveEntryTrigger={(mirror) => entryTriggerMutation.mutate(mirror)}
            onSaveSettings={async (patch) => {
              const result = await updateCampaignDetails(
                journey.id,
                tenantId,
                environment,
                patch,
                journey.settings,
              );
              if (!result.error) {
                queryClient.invalidateQueries({ queryKey: ['journey', id] });
                queryClient.invalidateQueries({ queryKey: ['journeys'] });
              }
              return result;
            }}
            onPublish={() => publishFlowMutation.mutateAsync().then(() => undefined)}
            onTest={() => launchMutation.mutateAsync(true)}
            onRename={() => {
              setRenameName(journey.name);
              setRenameError('');
              setRenameOpen(true);
            }}
          />
        </CanvasErrorBoundary>
      ) : (
        <Card className="flex flex-1 items-center justify-center p-12 text-center">
          <div>
            <GitBranch className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-medium text-slate-700">Unknown journey type</p>
            <Link to="/journeys" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
              Back to journeys
            </Link>
          </div>
        </Card>
      )}

      {renameOpen && journey && (
        <RenameModal
          title="Rename campaign"
          subtitle={journey.name}
          name={renameName}
          onNameChange={setRenameName}
          onSubmit={() => renameMutation.mutate(renameName)}
          onClose={() => setRenameOpen(false)}
          loading={renameMutation.isPending}
          error={renameError}
          placeholder="Campaign name"
        />
      )}
    </div>
  );
}

function CreateJourneyModal({
  open,
  loading,
  error,
  defaultType = 'campaign',
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  defaultType?: 'flow' | 'campaign';
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    type: 'flow' | 'campaign';
    startsAt?: string;
    endsAt?: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'flow' | 'campaign'>(defaultType);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setName('');
      setDescription('');
      setStartsAt('');
      setEndsAt('');
    }
  }, [open, defaultType]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      type,
      startsAt: startsAt || undefined,
      endsAt: endsAt || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">
          Create {type === 'campaign' ? 'Campaign' : 'Journey'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {type === 'campaign'
            ? 'Blast & scheduled outbound campaign with step-by-step query and delivery'
            : 'Multi-step automated customer flow with triggers and branching'}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              {type === 'campaign' ? 'Campaign Name' : 'Journey Name'} *
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'campaign' ? 'e.g. Summer VIP Flash Sale' : 'e.g. New User Onboarding Nurture'}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType('campaign')}
              className={`rounded-xl border p-4 text-left transition ${
                type === 'campaign' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Megaphone className={`h-5 w-5 ${type === 'campaign' ? 'text-blue-600' : 'text-slate-400'}`} />
              <p className="mt-2 text-sm font-semibold text-slate-900">Campaign</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Query → dedupe → delivery — run step-by-step, confirm before send</p>
            </button>
            <button
              type="button"
              onClick={() => setType('flow')}
              className={`rounded-xl border p-4 text-left transition ${
                type === 'flow' ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <GitBranch className={`h-5 w-5 ${type === 'flow' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <p className="mt-2 text-sm font-semibold text-slate-900">Journey</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Segment → wait → email → decisions — nurture orchestration</p>
            </button>
          </div>
          {type === 'campaign' && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Start date</span>
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">End date</span>
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  min={startsAt || undefined}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <p className="col-span-2 text-[11px] text-slate-500">
                Campaign status becomes Finished automatically after the end date passes.
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={loading || !name.trim()}>
              {loading ? 'Creating…' : 'Create'}
            </Button>
          </div>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}

export function JourneysPage({ pageMode = 'journeys' }: { pageMode?: 'journeys' | 'campaigns' | 'all' }) {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState('/');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [moveMessage, setMoveMessage] = useState('');
  const [draggingJourneyId, setDraggingJourneyId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<
    | { type: 'folder'; path: string; name: string }
    | { type: 'journey'; id: string; name: string }
    | null
  >(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');

  const journeysQueryKey = ['journeys', tenantId, environment];
  const folderQueryKey = ['journey-folders', tenantId, environment];

  const { data: journeys, isLoading } = useQuery({
    queryKey: journeysQueryKey,
    queryFn: () => fetchJourneys(tenantId, environment),
  });

  const { data: explicitFolders = [] } = useQuery({
    queryKey: folderQueryKey,
    queryFn: () => fetchJourneyFolders(tenantId, environment),
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      name: string;
      description: string;
      type: 'flow' | 'campaign';
      startsAt?: string;
      endsAt?: string;
    }) =>
      createJourney({
        tenantId,
        environment,
        name: input.name,
        description: input.description,
        type: input.type,
        folderPath: currentFolder,
        startsAt: input.startsAt ? new Date(`${input.startsAt}T00:00:00`).toISOString() : null,
        endsAt: input.endsAt ? new Date(`${input.endsAt}T23:59:59`).toISOString() : null,
      }),
    onSuccess: (journey) => {
      queryClient.setQueryData(['journey', journey.id, tenantId, environment], journey);
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      setCreateOpen(false);
      setCreateError(null);
      const targetPrefix = journeyType(journey) === 'campaign' ? '/campaigns' : '/journeys';
      navigate(`${targetPrefix}/${journey.id}`);
    },
    onError: (err: Error) => {
      setCreateError(err.message || 'Failed to create');
    },
  });

  const folderMutation = useMutation({
    mutationFn: () => createJourneyFolder(tenantId, environment, currentFolder, newFolderName),
    onSuccess: (result) => {
      if (result.error) {
        setFolderError(result.error);
        return;
      }
      setFolderError('');
      setNewFolderName('');
      setShowNewFolder(false);
      queryClient.refetchQueries({ queryKey: folderQueryKey });
    },
    onError: (e: Error) => setFolderError(e.message),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderPath: string) => deleteJourneyFolder(tenantId, environment, folderPath),
    onSuccess: (result) => {
      if (result.error) {
        setFolderError(result.error);
        return;
      }
      setFolderError('');
      setCurrentFolder(parentFolderPath(currentFolder));
      refresh();
    },
    onError: (e: Error) => setFolderError(e.message),
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) =>
      renameJourneyFolder(tenantId, environment, path, name),
    onSuccess: (result, { path, name }) => {
      if (result.error) {
        setRenameError(result.error);
        return;
      }
      setRenameError('');
      setRenameTarget(null);
      const newPath = joinFolderPath(parentFolderPath(path), name);
      if (normalizeFolderPath(currentFolder) === normalizeFolderPath(path)) {
        setCurrentFolder(normalizeFolderPath(newPath));
      }
      refresh();
    },
    onError: (e: Error) => setRenameError(e.message),
  });

  const renameJourneyMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameJourney(id, tenantId, environment, name),
    onSuccess: (result) => {
      if (result.error) {
        setRenameError(result.error);
        return;
      }
      setRenameError('');
      setRenameTarget(null);
      refresh();
    },
    onError: (e: Error) => setRenameError(e.message),
  });

  const moveMutation = useMutation({
    mutationFn: ({ journeyId, folderPath }: { journeyId: string; folderPath: string }) =>
      moveJourneyToFolder(journeyId, folderPath),
    onSuccess: (result, { folderPath }) => {
      if (result.error) {
        setMoveMessage(result.error);
        return;
      }
      setMoveMessage(`Moved to ${folderNameFromPath(folderPath)}`);
      setTimeout(() => setMoveMessage(''), 2500);
      refresh();
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<JourneyRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteJourneyMutation = useMutation({
    mutationFn: (target: JourneyRow) =>
      deleteJourney(target.id, tenantId, environment, target.name),
    onSuccess: (result) => {
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteError(null);
      setDeleteTarget(null);
      refresh();
    },
    onError: (err: Error) => {
      setDeleteError(err.message || 'Failed to delete');
    },
  });

  const refresh = () => {
    queryClient.refetchQueries({ queryKey: journeysQueryKey });
    queryClient.refetchQueries({ queryKey: folderQueryKey });
  };

  const [statusFilter, setStatusFilter] = useState<'all' | 'started' | 'draft' | 'finished' | 'paused'>('all');

  const isCampaignMode = pageMode === 'campaigns';
  const isJourneyMode = pageMode === 'journeys';

  const folderTree = useMemo(() => {
    const scopedJourneys = (journeys ?? []).filter((j) => {
      if (isCampaignMode) return isCampaignJourney(j) || journeyType(j) === 'campaign';
      if (isJourneyMode) return journeyType(j) === 'flow';
      return true;
    });
    return buildJourneyFolderTree(scopedJourneys, explicitFolders);
  }, [journeys, explicitFolders, isCampaignMode, isJourneyMode]);

  const childFolders = useMemo(
    () => listChildJourneyFolders(currentFolder, journeys ?? [], explicitFolders),
    [currentFolder, journeys, explicitFolders],
  );

  const inFolderItems = useMemo(() => {
    const raw = journeysInFolder(journeys ?? [], currentFolder);
    return raw.filter((j) => {
      if (isCampaignMode) return isCampaignJourney(j) || journeyType(j) === 'campaign';
      if (isJourneyMode) return journeyType(j) === 'flow';
      return true;
    });
  }, [journeys, currentFolder, isCampaignMode, isJourneyMode]);

  const filtered = useMemo(() => {
    return inFolderItems.filter((j) => {
      if (statusFilter === 'all') return true;
      const status = resolveJourneyDisplayStatus(j);
      if (statusFilter === 'started')
        return (
          status === 'started' ||
          status === 'running' ||
          status === 'active' ||
          status === 'published'
        );
      if (statusFilter === 'draft') return status === 'draft';
      if (statusFilter === 'finished') return status === 'finished' || status === 'completed';
      if (statusFilter === 'paused') return status === 'paused';
      return true;
    });
  }, [inFolderItems, statusFilter]);

  const startedCount = inFolderItems.filter((j) => {
    const s = resolveJourneyDisplayStatus(j);
    return s === 'started' || s === 'running' || s === 'active' || s === 'published';
  }).length;
  const draftCount = inFolderItems.filter((j) => resolveJourneyDisplayStatus(j) === 'draft').length;
  const finishedCount = inFolderItems.filter((j) => {
    const s = resolveJourneyDisplayStatus(j);
    return s === 'finished' || s === 'completed';
  }).length;
  const pausedCount = inFolderItems.filter((j) => resolveJourneyDisplayStatus(j) === 'paused').length;

  const folderLabel =
    currentFolder === '/' ? ROOT_FOLDER_LABEL : folderNameFromPath(currentFolder);
  const folderTitle =
    currentFolder === '/' ? ROOT_FOLDER_TITLE : folderNameFromPath(currentFolder);
  const dragging = draggingJourneyId !== null;
  const canDeleteFolder = normalizeFolderPath(currentFolder) !== '/';

  const handleDrop = (folderPath: string, journeyId: string) => {
    const target = normalizeFolderPath(folderPath);
    const journey = journeys?.find((j) => j.id === journeyId);
    if (!journey || normalizeFolderPath(journey.folder_path ?? '/') === target) return;
    moveMutation.mutate({ journeyId, folderPath: target });
    setDraggingJourneyId(null);
    setDropTarget(null);
  };

  const pageTitle = isCampaignMode
    ? 'Campaigns'
    : isJourneyMode
    ? 'Journeys'
    : 'Campaigns & Journeys';

  const pageSubtitle = isCampaignMode
    ? 'Design, target, and launch scheduled blast campaigns and outbound broadcasts across channels.'
    : isJourneyMode
    ? 'Multi-step automated customer lifecycle journeys, event triggers, and branching logic.'
    : 'Organize in folders · drag to move · campaigns show delivery channels and schedule status';

  const createBtnLabel = isCampaignMode
    ? 'New Campaign'
    : isJourneyMode
    ? 'New Journey'
    : 'Create';

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="mt-1 text-slate-500">{pageSubtitle}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="font-bold shadow-xs">
          <Plus className="mr-1.5 h-4 w-4" />
          {createBtnLabel}
        </Button>
      </div>

      {/* Status Sub-Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(isCampaignMode
          ? [
              ['all', `All Campaigns (${inFolderItems.length})`],
              ['started', `Active / Started (${startedCount})`],
              ['draft', `Draft (${draftCount})`],
              ['finished', `Finished (${finishedCount})`],
            ]
          : isJourneyMode
          ? [
              ['all', `All Journeys (${inFolderItems.length})`],
              ['started', `Active / Published (${startedCount})`],
              ['draft', `Draft (${draftCount})`],
              ['paused', `Paused (${pausedCount})`],
            ]
          : [
              ['all', `All Items (${inFolderItems.length})`],
              ['started', `Active (${startedCount})`],
              ['draft', `Draft (${draftCount})`],
            ]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key as any)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition shadow-2xs ${
              statusFilter === key
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {folderError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {folderError}
        </div>
      )}

      {moveMessage && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {moveMessage}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <JourneyFolderSidebar
            tree={folderTree}
            currentPath={currentFolder}
            dropTarget={dropTarget}
            dragging={dragging}
            onSelect={setCurrentFolder}
            onDrop={handleDrop}
            onDragOver={setDropTarget}
          />

          <div className="min-w-0 flex-1">
            <JourneyLibraryToolbar
              currentFolder={currentFolder}
              folderLabel={folderLabel}
              folderTitle={folderTitle}
              itemCount={childFolders.length + filtered.length}
              onNavigateFolder={setCurrentFolder}
              onNewFolder={() => {
                setShowNewFolder(true);
                setFolderError('');
              }}
              canDeleteFolder={canDeleteFolder}
              onRenameFolder={
                canDeleteFolder
                  ? () => {
                      setRenameTarget({ type: 'folder', path: currentFolder, name: folderLabel });
                      setRenameName(folderLabel);
                      setRenameError('');
                    }
                  : undefined
              }
              onDeleteFolder={() => {
                if (
                  window.confirm(
                    `Delete folder "${folderLabel}"? Items inside will move to the parent folder.`,
                  )
                ) {
                  deleteFolderMutation.mutate(currentFolder);
                }
              }}
            />

            <div className="p-6">
              {isLoading ? (
                <div className="py-12 text-center text-sm text-slate-500">Loading items…</div>
              ) : childFolders.length === 0 && filtered.length === 0 ? (
                <EmptyState
                  icon={isCampaignMode ? Megaphone : GitBranch}
                  title={isCampaignMode ? 'No campaigns yet' : isJourneyMode ? 'No journeys yet' : 'No items yet'}
                  description={
                    currentFolder === '/'
                      ? isCampaignMode
                        ? 'Create your first broadcast campaign to target audiences and send messages.'
                        : 'Create your first automated journey flow or campaign.'
                      : `Folder "${folderLabel}" is empty.`
                  }
                  action={
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setShowNewFolder(true)}>
                        New folder
                      </Button>
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        {createBtnLabel}
                      </Button>
                    </div>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {childFolders.map((sub) => (
                    <JourneyFolderTile
                      key={sub.path}
                      folder={sub}
                      dropTarget={dropTarget}
                      onNavigate={setCurrentFolder}
                      onDrop={handleDrop}
                      onDragOver={setDropTarget}
                      onRename={(f) => {
                        setRenameTarget({ type: 'folder', path: f.path, name: f.name });
                        setRenameName(f.name);
                        setRenameError('');
                      }}
                      onDelete={(f) => {
                        if (
                          window.confirm(
                            `Delete folder "${f.name}"? Items inside will move to the parent folder.`,
                          )
                        ) {
                          deleteFolderMutation.mutate(f.path);
                        }
                      }}
                    />
                  ))}
                  {filtered.map((j) => (
                    <JourneyCard
                      key={j.id}
                      journey={j}
                      isDragging={draggingJourneyId === j.id}
                      onDragStart={() => setDraggingJourneyId(j.id)}
                      onDragEnd={() => {
                        setDraggingJourneyId(null);
                        setDropTarget(null);
                      }}
                      onRename={() => {
                        setRenameTarget({ type: 'journey', id: j.id, name: j.name });
                        setRenameName(j.name);
                        setRenameError('');
                      }}
                      onDelete={() => {
                        setDeleteError(null);
                        setDeleteTarget(j);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <CreateJourneyModal
        open={createOpen}
        loading={createMutation.isPending}
        error={createError}
        defaultType={isCampaignMode ? 'campaign' : 'flow'}
        onClose={() => {
          setCreateOpen(false);
          setCreateError(null);
        }}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      {showNewFolder && (
        <CreateFolderModal
          parentPath={currentFolder}
          name={newFolderName}
          onNameChange={setNewFolderName}
          onSubmit={() => folderMutation.mutate()}
          onClose={() => setShowNewFolder(false)}
          loading={folderMutation.isPending}
          error={folderError}
        />
      )}

      {renameTarget && (
        <RenameModal
          title={renameTarget.type === 'folder' ? 'Rename folder' : 'Rename'}
          subtitle={renameTarget.name}
          name={renameName}
          onNameChange={setRenameName}
          onSubmit={() => {
            if (renameTarget.type === 'folder') {
              renameFolderMutation.mutate({ path: renameTarget.path, name: renameName });
            } else {
              renameJourneyMutation.mutate({ id: renameTarget.id, name: renameName });
            }
          }}
          onClose={() => setRenameTarget(null)}
          loading={renameFolderMutation.isPending || renameJourneyMutation.isPending}
          error={renameError}
          placeholder={renameTarget.type === 'folder' ? 'Folder name' : 'Campaign or journey name'}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          open={Boolean(deleteTarget)}
          title={`Delete ${isCampaignJourney(deleteTarget) ? 'Campaign' : 'Journey'}?`}
          name={deleteTarget.name}
          itemType={isCampaignJourney(deleteTarget) ? 'campaign' : 'journey'}
          loading={deleteJourneyMutation.isPending}
          error={deleteError}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          onConfirm={() => {
            if (deleteTarget) deleteJourneyMutation.mutate(deleteTarget);
          }}
        />
      )}
    </div>
  );
}

