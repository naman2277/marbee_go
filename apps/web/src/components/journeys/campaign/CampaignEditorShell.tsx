import { useCallback, useEffect, useState } from 'react';
import { BlastCampaignCanvas, type BlastCampaignCanvasProps } from '@/components/journeys/BlastCampaignCanvas';
import { CampaignHeader } from '@/components/journeys/campaign/CampaignHeader';
import { CampaignViewTabs, type CampaignView } from '@/components/journeys/campaign/CampaignViewTabs';
import { CampaignMonitorPanel } from '@/components/journeys/campaign/CampaignMonitorPanel';
import { ActivityInspectorPanel } from '@/components/journeys/campaign/ActivityInspectorPanel';
import { CampaignDashboard } from '@/components/journeys/campaign/CampaignDashboard';
import {
  CampaignGeneralPanel,
  campaignFormFromJourney,
  type CampaignGeneralForm,
} from '@/components/journeys/campaign/CampaignGeneralPanel';
import { DeliveryPrepWizard } from '@/components/journeys/campaign/DeliveryPrepWizard';
import { CampaignWorkflowToolbar } from '@/components/journeys/campaign/CampaignWorkflowToolbar';
import type { CampaignSettings } from '@/lib/journeys';
import {
  CampaignEditorBridgeProvider,
  bridgeDataSignature,
  type CampaignEditorBridgeState,
} from '@/components/journeys/campaign/CampaignEditorBridge';

type Props = BlastCampaignCanvasProps & {
  campaignId: string;
  versionNumber: number;
  journeyStatus: string;
  startsAt?: string | null;
  endsAt?: string | null;
  description?: string | null;
  settings?: CampaignSettings | null;
  initialView?: CampaignView;
  onRename?: () => void;
  onSaveGeneral?: (form: CampaignGeneralForm) => Promise<{ error?: string }>;
};

const EMPTY_BRIDGE: CampaignEditorBridgeState = {
  workflow: null,
  workflowLog: [],
  activityRows: [],
  selectedNode: null,
  previewResult: null,
  nodeCount: 0,
  edgeCount: 0,
  validationMessages: [],
  onSave: () => {},
  onValidate: () => {},
  onAutoLayout: () => {},
  onFitView: () => {},
  onUpdateNode: () => {},
  onDeleteNode: () => {},
  onDuplicateNode: () => {},
};

export function CampaignEditorShell({
  campaignId,
  versionNumber,
  journeyStatus,
  startsAt,
  endsAt,
  description,
  settings,
  initialView = 'dashboard',
  onRename,
  onSaveGeneral,
  journeyName = 'Campaign',
  ...canvasProps
}: Props) {
  const [bridge, setBridge] = useState<CampaignEditorBridgeState>(EMPTY_BRIDGE);
  const [view, setView] = useState<CampaignView>(initialView);
  const [logsCollapsed, setLogsCollapsed] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [generalForm, setGeneralForm] = useState<CampaignGeneralForm>(() =>
    campaignFormFromJourney({
      name: journeyName,
      description,
      starts_at: startsAt,
      ends_at: endsAt,
      settings,
    }),
  );
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalMessage, setGeneralMessage] = useState('');
  const [generalError, setGeneralError] = useState('');

  const handleBridgeChange = useCallback((next: CampaignEditorBridgeState) => {
    setBridge((prev) => (bridgeDataSignature(prev) === bridgeDataSignature(next) ? prev : next));
  }, []);

  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);

  const wf = bridge.workflow;

  useEffect(() => {
    setView(initialView);
  }, [initialView, campaignId]);

  useEffect(() => {
    setGeneralForm(
      campaignFormFromJourney({
        name: journeyName,
        description,
        starts_at: startsAt,
        ends_at: endsAt,
        settings,
      }),
    );
  }, [journeyName, description, startsAt, endsAt, settings, campaignId]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const handleSaveGeneral = async () => {
    if (!onSaveGeneral) return;
    setGeneralSaving(true);
    setGeneralError('');
    setGeneralMessage('');
    const result = await onSaveGeneral(generalForm);
    setGeneralSaving(false);
    if (result.error) {
      setGeneralError(result.error);
      return;
    }
    setGeneralMessage('Saved');
    setTimeout(() => setGeneralMessage(''), 2500);
  };

  const shell = (
    <>
      <CampaignHeader
        campaignName={journeyName}
        campaignId={campaignId}
        versionNumber={versionNumber}
        journeyStatus={journeyStatus}
        startsAt={startsAt}
        endsAt={endsAt}
        canvasJson={canvasProps.canvasJson}
        onRename={onRename}
        onOpenDashboard={() => setView('dashboard')}
      />

      <div className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
        <CampaignViewTabs
          active={view}
          onChange={setView}
          deliveryCount={wf?.deployedDeliveries.length ?? 0}
          isFinished={wf?.isFinished}
        />
        {view === 'canvas' && (
          <CampaignWorkflowToolbar
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col bg-slate-50">
        <div className={`flex min-h-0 flex-1 ${view !== 'canvas' ? 'invisible absolute inset-0 -z-10' : ''}`}>
          <BlastCampaignCanvas
            {...canvasProps}
            journeyName={journeyName}
            mode="campaign"
            classicLayout
            onBridgeChange={handleBridgeChange}
          />
          {view === 'canvas' && (
            <ActivityInspectorPanel
              tenantId={canvasProps.tenantId}
              environment={canvasProps.environment}
            />
          )}
        </div>

        {view === 'dashboard' && (
          <CampaignDashboard
            tenantId={canvasProps.tenantId}
            environment={canvasProps.environment}
            journeyId={campaignId}
            nodeResults={wf?.nodeResults ?? {}}
            isFinished={wf?.isFinished}
            completedAt={wf?.completedAt}
            campaignName={journeyName}
          />
        )}

        {view === 'general' && (
          <CampaignGeneralPanel
            tenantId={canvasProps.tenantId}
            form={generalForm}
            onChange={(patch) => setGeneralForm((prev) => ({ ...prev, ...patch }))}
            onSave={handleSaveGeneral}
            saving={generalSaving}
            saveMessage={generalMessage}
            error={generalError}
            journeyStatus={journeyStatus}
            versionNumber={versionNumber}
          />
        )}

        <CampaignMonitorPanel
          logs={bridge.workflowLog}
          activityRows={bridge.activityRows}
          collapsed={logsCollapsed}
          onToggleCollapse={() => setLogsCollapsed((v) => !v)}
        />
      </div>

      {wf?.pendingDelivery && (
        <DeliveryPrepWizard
          prep={wf.pendingDelivery}
          confirming={wf.confirmingDelivery}
          onConfirm={() => void wf.confirmDelivery()}
          onCancel={wf.cancelDelivery}
        />
      )}
    </>
  );

  return (
    <CampaignEditorBridgeProvider value={bridge}>
      <div
        className={
          fullscreen
            ? 'fixed inset-0 z-[300] flex flex-col overflow-hidden bg-white'
            : 'flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'
        }
      >
        {shell}
      </div>
    </CampaignEditorBridgeProvider>
  );
}
