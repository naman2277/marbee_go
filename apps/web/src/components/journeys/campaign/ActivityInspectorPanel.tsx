import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { CampaignNodeConfigPanel } from '@/components/journeys/CampaignNodeConfigPanel';
import { NodePopulationPreview } from '@/components/journeys/NodePopulationPreview';
import { useCampaignEditorBridge } from './CampaignEditorBridge';

type InspectorTab = 'properties' | 'population' | 'execution';

export function ActivityInspectorPanel({
  tenantId,
  environment,
}: {
  tenantId: string;
  environment: string;
}) {
  const bridge = useCampaignEditorBridge();
  const wf = bridge.workflow;
  const [tab, setTab] = useState<InspectorTab>('properties');

  const tabs: { id: InspectorTab; label: string }[] = [
    { id: 'properties', label: 'Properties' },
    { id: 'population', label: 'Population' },
    { id: 'execution', label: 'Execution' },
  ];

  if (!bridge.selectedNode) {
    return (
      <aside className="modern-campaign-inspector flex w-[440px] shrink-0 flex-col">
        <div className="border-b border-slate-100 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">Activity inspector</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <span className="text-xl text-slate-400">◎</span>
          </div>
          <p className="text-sm font-medium text-slate-700">No activity selected</p>
          <p className="mt-2 max-w-[240px] text-xs leading-relaxed text-slate-400">
            Click an activity on the canvas to configure templates, channel accounts, and settings.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="modern-campaign-inspector flex w-[420px] shrink-0 flex-col">
      <div className="flex border-b border-slate-100 bg-slate-50/50">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-3 text-xs font-semibold transition ${
              tab === t.id
                ? 'border-b-2 border-brand-600 text-brand-700 bg-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'properties' && (
        <CampaignNodeConfigPanel
          node={bridge.selectedNode}
          tenantId={tenantId}
          environment={environment}
          mode="campaign"
          variant="light"
          populationResult={bridge.previewResult}
          personalizationFields={bridge.personalizationFields}
          personalizationSample={bridge.personalizationSample}
          previewLabel={bridge.previewLabel}
          runPending={wf?.runMutation.isPending}
          canRun={Boolean(bridge.selectedNode && wf?.canRunNode(bridge.selectedNode.id))}
          onRun={bridge.onRunActivity}
          onUpdate={bridge.onUpdateNode}
          onDelete={bridge.onDeleteNode}
          onDuplicate={bridge.onDuplicateNode}
          showPopulationPreview={false}
        />
      )}

      {tab === 'population' && (
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
          {bridge.threadPreviewLabel && (
            <p className="mb-2 text-xs font-semibold text-emerald-600">
              Thread: {bridge.threadPreviewLabel}
            </p>
          )}
          <NodePopulationPreview result={bridge.previewResult} loading={wf?.runMutation.isPending} />
        </div>
      )}

      {tab === 'execution' && wf && (
        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-slate-600">
          <dl className="space-y-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Run status</dt>
              <dd className="mt-1 font-medium text-slate-900">{wf.runState?.status ?? '—'}</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phase</dt>
              <dd className="mt-1 capitalize text-slate-900">{wf.executionPhase.replace('_', ' ')}</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Population</dt>
              <dd className="mt-1 font-mono text-slate-900">
                {bridge.previewResult?.count?.toLocaleString() ?? '—'}
              </dd>
            </div>
            {wf.nextRunnable && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Next runnable</dt>
                <dd className="mt-1 text-emerald-800">{wf.remainingCount} remaining</dd>
              </div>
            )}
          </dl>
          {wf.enabled && wf.runState && !wf.isWorkflowActive && bridge.onRunActivity && (
            <button
              type="button"
              onClick={bridge.onRunActivity}
              disabled={wf.runMutation.isPending}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              {wf.runMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run activity
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
