import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type XYPosition,
} from 'reactflow';
import {
  ArrowLeft,
  GitBranch,
  Loader2,
  LogIn,
  Rocket,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { JourneyStatusBadge } from '@/components/journeys/JourneyStatusBadge';
import { autoLayoutCampaign, type CampaignNodeData } from '@/lib/campaign-graph';
import { defaultConfigForType, paletteItem } from '@/lib/campaign-nodes';
import type { CampaignSettings, JourneyDisplayStatus } from '@/lib/journeys';
import type { Audience } from '@/lib/audiences';
import type { InformationService } from '@/lib/subscriptions';
import type { MarbeeContentTemplate } from '@/lib/content-templates';
import type { ChannelProviderRow } from '@/lib/channel-providers';
import type { CampaignRunStats, RunResult } from '@/lib/journey-runner';
import {
  JOURNEY_EDGE_TYPE,
  applyEntryConfigToNode,
  entryConfigFromNode,
  entryTriggerConfigMirror,
  findEntryNode,
  hydrateJourneyGraph,
  journeySettingsFromRow,
  mkActivityNode,
  mkJourneyEdge,
  serializeJourneyGraph,
  settingsPatchFromJourneySettings,
  validateJourney,
  type EntryConfig,
  type JourneyEdgeData,
  type JourneySettings,
} from '@/lib/journey-builder';
import { JourneyActivityRail } from './JourneyActivityRail';
import { JourneyCanvas, JOURNEY_DND_MIME } from './JourneyCanvas';
import { JourneyInspector } from './JourneyInspector';
import { JourneyEntryPanel } from './JourneyEntryPanel';
import { JourneySettingsPanel } from './JourneySettingsPanel';
import { JourneyValidationDrawer } from './JourneyValidationDrawer';
import { JourneyPublishDialog, type PublishPhase } from './JourneyPublishDialog';
import type { JourneyCanvasApi } from './JourneyBuilderCanvasContext';

export type JourneyBuilderView = 'build' | 'entry' | 'settings';

export type JourneyBuilderProps = {
  journeyId: string;
  versionId: string;
  tenantId: string;
  environment: string;
  journeyName: string;
  journeyStatus: string;
  displayStatus: JourneyDisplayStatus;
  versionNumber?: number;
  canvasJson: unknown;
  entryTriggerConfig?: Record<string, unknown> | null;
  settings?: CampaignSettings | null;
  startsAt?: string | null;
  endsAt?: string | null;
  audiences: Audience[];
  services: InformationService[];
  templates: MarbeeContentTemplate[];
  providers: ChannelProviderRow[];
  runStats?: CampaignRunStats;
  savePending?: boolean;
  publishPending?: boolean;
  onSaveCanvas: (json: ReturnType<typeof serializeJourneyGraph>) => void;
  onSaveEntryTrigger: (mirror: Record<string, unknown>) => void;
  onSaveSettings: (patch: {
    settings?: Partial<CampaignSettings>;
    startsAt?: string | null;
    endsAt?: string | null;
  }) => Promise<{ error?: string }>;
  onPublish: () => Promise<void>;
  onTest: () => Promise<RunResult>;
  onRename?: () => void;
};

const AUTOSAVE_MS = 900;
const BRANCH_LABELS: Record<string, string> = { yes: 'Yes', no: 'No', a: 'A', b: 'B' };

export function JourneyBuilder(props: JourneyBuilderProps) {
  const {
    journeyName,
    displayStatus,
    versionNumber,
    canvasJson,
    entryTriggerConfig,
    settings,
    startsAt,
    endsAt,
    savePending,
    onSaveCanvas,
    onRename,
  } = props;

  const [view, setView] = useState<JourneyBuilderView>('build');
  const [validationOpen, setValidationOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>('validate');
  const [testResult, setTestResult] = useState<RunResult | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState('');

  const initial = useMemo(() => hydrateJourneyGraph(canvasJson), [canvasJson]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CampaignNodeData>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const hasRealCanvas =
    Boolean(canvasJson) &&
    typeof canvasJson === 'object' &&
    Array.isArray((canvasJson as { nodes?: unknown }).nodes);

  // Seed once, when a real canvas_json is available (it can arrive after first render).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !hasRealCanvas) return;
    hydratedRef.current = true;
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial, hasRealCanvas, setNodes, setEdges]);

  const entryNode = useMemo(() => findEntryNode(nodes) ?? null, [nodes]);
  const entryConfig: EntryConfig = useMemo(
    () =>
      entryConfigFromNode(entryNode, {
        entry_trigger_config: entryTriggerConfig ?? undefined,
        settings,
        starts_at: startsAt,
        ends_at: endsAt,
      }),
    [entryNode, entryTriggerConfig, settings, startsAt, endsAt],
  );
  const journeySettings: JourneySettings = useMemo(
    () => journeySettingsFromRow({ settings }),
    [settings],
  );

  // Editable settings draft (Settings tab). Re-synced when the persisted value changes.
  const [settingsDraft, setSettingsDraft] = useState<JourneySettings>(journeySettings);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsErr, setSettingsErr] = useState('');
  useEffect(() => setSettingsDraft(journeySettingsFromRow({ settings })), [settings]);

  const validation = useMemo(
    () => validateJourney(nodes, edges, entryConfig, journeySettings),
    [nodes, edges, entryConfig, journeySettings],
  );

  /* -------------------------------------------------------------- *
   * Debounced canvas autosave
   * -------------------------------------------------------------- */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ nodes: Node<CampaignNodeData>[]; edges: Edge[] }>({ nodes, edges });
  latest.current = { nodes, edges };

  // Keep the (possibly inline) save callback in a ref so the autosave effect
  // depends only on the graph — never on the callback identity.
  const onSaveCanvasRef = useRef(onSaveCanvas);
  onSaveCanvasRef.current = onSaveCanvas;

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onSaveCanvasRef.current(serializeJourneyGraph(latest.current.nodes, latest.current.edges));
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      onSaveCanvasRef.current(serializeJourneyGraph(latest.current.nodes, latest.current.edges));
    }, AUTOSAVE_MS);
  }, []);

  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return;
    }
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Flush any pending canvas edit on unmount (e.g. version remount after publish).
  useEffect(
    () => () => {
      if (saveTimer.current) flushSave();
    },
    [flushSave],
  );

  /* -------------------------------------------------------------- *
   * Graph reducers
   * -------------------------------------------------------------- */
  const addNode = useCallback(
    (stepType: string, position?: XYPosition) => {
      const id = crypto.randomUUID();
      const pos =
        position ?? {
          x: 160 + (nodes.length % 4) * 60,
          y: 140 + Math.floor(nodes.length / 4) * 90,
        };
      setNodes((ns) => [
        ...ns,
        mkActivityNode(id, stepType, paletteItem(stepType)?.label ?? stepType, pos.x, pos.y),
      ]);
      setSelectedNodeId(id);
    },
    [nodes.length, setNodes],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const branchLabel = conn.sourceHandle ? BRANCH_LABELS[conn.sourceHandle] : undefined;
      setEdges((es) =>
        addEdge(
          {
            ...conn,
            type: JOURNEY_EDGE_TYPE,
            label: branchLabel,
            data: branchLabel ? { branchLabel } : undefined,
          },
          es,
        ),
      );
    },
    [setEdges],
  );

  const insertBetween = useCallback(
    (edgeId: string, stepType: string) => {
      const e = latest.current.edges.find((x) => x.id === edgeId);
      if (!e) return;
      const src = latest.current.nodes.find((n) => n.id === e.source);
      const tgt = latest.current.nodes.find((n) => n.id === e.target);
      const mid =
        src && tgt
          ? { x: (src.position.x + tgt.position.x) / 2, y: (src.position.y + tgt.position.y) / 2 }
          : { x: 320, y: 200 };
      const id = crypto.randomUUID();
      const branchLabel =
        (e.data as JourneyEdgeData | undefined)?.branchLabel ??
        (typeof e.label === 'string' ? e.label : undefined);

      setNodes((ns) => [
        ...ns,
        mkActivityNode(id, stepType, paletteItem(stepType)?.label ?? stepType, mid.x, mid.y),
      ]);
      setEdges((es) => [
        ...es.filter((x) => x.id !== edgeId),
        mkJourneyEdge(`e-${crypto.randomUUID()}`, e.source, id, e.sourceHandle ?? undefined, branchLabel),
        mkJourneyEdge(`e-${crypto.randomUUID()}`, id, e.target),
      ]);
      setSelectedNodeId(id);
    },
    [setNodes, setEdges],
  );

  const fitViewRef = useRef<(() => void) | null>(null);

  const autoLayout = useCallback(() => {
    setNodes((ns) => autoLayoutCampaign(ns, latest.current.edges));
    setTimeout(() => fitViewRef.current?.(), 60);
  }, [setNodes]);

  const deleteNode = useCallback(
    (id: string) => {
      const target = latest.current.nodes.find((n) => n.id === id);
      if (target && paletteItem(target.data.stepType)?.entryOnly) return;
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setSelectedNodeId((cur) => (cur === id ? null : cur));
    },
    [setNodes, setEdges],
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const src = latest.current.nodes.find((n) => n.id === id);
      if (!src || paletteItem(src.data.stepType)?.entryOnly) return;
      const newId = crypto.randomUUID();
      setNodes((ns) => [
        ...ns,
        {
          ...src,
          id: newId,
          position: { x: src.position.x + 56, y: src.position.y + 56 },
          data: {
            ...src.data,
            label: `${src.data.label} copy`,
            config: { ...(src.data.config ?? defaultConfigForType(src.data.stepType)) },
          },
        },
      ]);
      setSelectedNodeId(newId);
    },
    [setNodes],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<CampaignNodeData>) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, ...patch, config: patch.config ?? n.data.config } }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const updateNodeLabel = useCallback(
    (id: string, label: string) => updateNode(id, { label }),
    [updateNode],
  );

  /* -------------------------------------------------------------- *
   * Entry config — dual-write: canvas entry node + entry_trigger_config mirror
   * -------------------------------------------------------------- */
  const onSaveEntryTriggerRef = useRef(props.onSaveEntryTrigger);
  onSaveEntryTriggerRef.current = props.onSaveEntryTrigger;
  const onSaveSettingsRef = useRef(props.onSaveSettings);
  onSaveSettingsRef.current = props.onSaveSettings;
  const entryMirrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEntryChange = useCallback(
    (next: EntryConfig) => {
      setNodes((ns) => {
        const existing = findEntryNode(ns);
        if (existing) {
          return ns.map((n) => (n.id === existing.id ? applyEntryConfigToNode(n, next) : n));
        }
        // Synthesize an entry node at the graph head for legacy journeys.
        const firstId = ns.find((n) => !latest.current.edges.some((e) => e.target === n.id))?.id;
        const entry = applyEntryConfigToNode(
          mkActivityNode('entry', 'segment_entry', 'Audience entry', 40, 200),
          next,
        );
        if (firstId) {
          setEdges((es) => [...es, mkJourneyEdge(`e-${crypto.randomUUID()}`, entry.id, firstId)]);
        }
        return [entry, ...ns];
      });

      if (entryMirrorTimer.current) clearTimeout(entryMirrorTimer.current);
      entryMirrorTimer.current = setTimeout(() => {
        onSaveEntryTriggerRef.current(entryTriggerConfigMirror(next));
        if (next.schedule && (next.schedule.startsAt || next.schedule.endsAt)) {
          void onSaveSettingsRef.current({
            startsAt: next.schedule.startsAt ?? null,
            endsAt: next.schedule.endsAt ?? null,
          });
        }
      }, 700);
    },
    [setNodes, setEdges],
  );

  useEffect(
    () => () => {
      if (entryMirrorTimer.current) clearTimeout(entryMirrorTimer.current);
    },
    [],
  );

  const canvasApi: JourneyCanvasApi = useMemo(
    () => ({
      selectedNodeId,
      liveCounts: props.runStats?.byNode,
      onSelectNode: setSelectedNodeId,
      onUpdateNodeLabel: updateNodeLabel,
      onDeleteNode: deleteNode,
      onDuplicateNode: duplicateNode,
      onInsertBetween: insertBetween,
    }),
    [selectedNodeId, props.runStats?.byNode, updateNodeLabel, deleteNode, duplicateNode, insertBetween],
  );

  const onDragStartActivity = useCallback((e: React.DragEvent, stepType: string) => {
    e.dataTransfer.setData(JOURNEY_DND_MIME, stepType);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  /* -------------------------------------------------------------- *
   * Settings save + validate + publish
   * -------------------------------------------------------------- */
  const onPublishRef = useRef(props.onPublish);
  onPublishRef.current = props.onPublish;
  const onTestRef = useRef(props.onTest);
  onTestRef.current = props.onTest;

  const handleSaveSettings = useCallback(async () => {
    setSettingsSaving(true);
    setSettingsErr('');
    setSettingsMsg('');
    const res = await onSaveSettingsRef.current(settingsPatchFromJourneySettings(settingsDraft));
    setSettingsSaving(false);
    if (res.error) setSettingsErr(res.error);
    else {
      setSettingsMsg('Saved');
      setTimeout(() => setSettingsMsg(''), 2500);
    }
  }, [settingsDraft]);

  const focusNode = useCallback((id: string) => {
    setView('build');
    setSelectedNodeId(id);
    setValidationOpen(false);
  }, []);

  const openPublish = useCallback(() => {
    setTestResult(null);
    setPublishError('');
    setPublishPhase('validate');
    setPublishOpen(true);
  }, []);

  const runTest = useCallback(async () => {
    setPublishBusy(true);
    setPublishError('');
    try {
      const r = await onTestRef.current();
      setTestResult(r);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setPublishBusy(false);
    }
  }, []);

  const doPublish = useCallback(async () => {
    setPublishBusy(true);
    setPublishError('');
    flushSave();
    try {
      await onPublishRef.current();
      setPublishOpen(false);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishBusy(false);
    }
  }, [flushSave]);

  return (
    <div className="flex h-full min-h-[600px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <a href="/journeys" className="text-slate-400 hover:text-slate-600" title="Back to journeys">
          <ArrowLeft className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onRename}
          className="truncate text-sm font-semibold text-slate-800 hover:text-slate-950"
          title="Rename journey"
        >
          {journeyName}
        </button>
        <JourneyStatusBadge status={displayStatus} />
        {versionNumber != null && <span className="text-xs text-slate-400">v{versionNumber}</span>}
        <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
          {savePending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <ShieldCheck className="h-3 w-3 text-emerald-500" /> Saved
            </>
          )}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-slate-400">
            {nodes.length} activities · {edges.length} paths
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setValidationOpen((v) => !v)}
            title="Validate journey"
          >
            {validation.ok ? (
              <ShieldCheck className="mr-1 h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <span className="mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-100 px-1 text-[10px] font-bold text-rose-600">
                {validation.errors.length}
              </span>
            )}
            Validate
          </Button>
          <Button size="sm" onClick={openPublish}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {displayStatus === 'published' ? 'Republish' : 'Publish'}
          </Button>
        </div>
      </header>

      {/* View tabs */}
      <nav className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50/70 px-3">
        {(
          [
            ['build', 'Build', GitBranch],
            ['entry', 'Entry', LogIn],
            ['settings', 'Settings', Settings2],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${
              view === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {view === 'build' && (
          <>
            <JourneyActivityRail
              onAddActivity={addNode}
              onDragStartActivity={onDragStartActivity}
            />
            <JourneyCanvas
              nodes={nodes}
              edges={edges}
              api={canvasApi}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onAddNode={addNode}
              onAutoLayout={autoLayout}
              registerFitView={(fn) => {
                fitViewRef.current = fn;
              }}
            />
            <JourneyInspector
              node={selectedNode}
              tenantId={props.tenantId}
              environment={props.environment}
              audiences={props.audiences}
              services={props.services}
              templates={props.templates}
              providers={props.providers}
              onUpdate={updateNode}
              onDelete={deleteNode}
              onDuplicate={duplicateNode}
              onClose={() => setSelectedNodeId(null)}
              onEditEntry={() => setView('entry')}
            />
            <JourneyValidationDrawer
              open={validationOpen}
              result={validation}
              onClose={() => setValidationOpen(false)}
              onFocusNode={focusNode}
            />
          </>
        )}

        {view === 'entry' && (
          <div className="flex-1 overflow-y-auto bg-slate-100">
            <JourneyEntryPanel
              value={entryConfig}
              audiences={props.audiences}
              journeyStatus={props.journeyStatus}
              onChange={handleEntryChange}
            />
          </div>
        )}
        {view === 'settings' && (
          <div className="flex-1 overflow-y-auto bg-slate-100">
            <JourneySettingsPanel
              value={settingsDraft}
              audiences={props.audiences}
              saving={settingsSaving}
              saveMessage={settingsMsg}
              error={settingsErr}
              onChange={setSettingsDraft}
              onSave={handleSaveSettings}
            />
          </div>
        )}
      </div>

      <JourneyPublishDialog
        open={publishOpen}
        journeyName={journeyName}
        validation={validation}
        phase={publishPhase}
        testResult={testResult}
        busy={publishBusy || props.publishPending}
        error={publishError}
        onSetPhase={setPublishPhase}
        onRunTest={runTest}
        onPublish={doPublish}
        onClose={() => setPublishOpen(false)}
      />
    </div>
  );
}
