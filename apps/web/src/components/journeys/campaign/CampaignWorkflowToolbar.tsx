import {
  LayoutGrid,
  Loader2,
  Maximize2,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  ZoomIn,
} from 'lucide-react';
import { useCampaignEditorBridge } from './CampaignEditorBridge';

type Props = {
  onToggleFullscreen?: () => void;
  fullscreen?: boolean;
};

export function CampaignWorkflowToolbar({ onToggleFullscreen, fullscreen }: Props) {
  const bridge = useCampaignEditorBridge();
  const wf = bridge.workflow;

  return (
    <div className="ml-auto flex items-center gap-1">
      <ToolbarBtn
        title="Save"
        onClick={bridge.onSave}
        disabled={bridge.savePending}
        icon={bridge.savePending ? Loader2 : Save}
        spin={bridge.savePending}
      />
      <ToolbarBtn title="Validate" onClick={bridge.onValidate} icon={ShieldCheck} />
      <ToolbarBtn title="Auto layout" onClick={bridge.onAutoLayout} icon={LayoutGrid} />
      <ToolbarBtn title="Fit view" onClick={bridge.onFitView} icon={ZoomIn} />

      {wf?.enabled && wf.nextRunnable && !wf.isWorkflowActive && (
        <ToolbarBtn
          title="Run next step"
          onClick={() => void wf.runNext()}
          disabled={wf.runMutation.isPending}
          icon={wf.runMutation.isPending ? Loader2 : Play}
          spin={wf.runMutation.isPending}
          primary
        />
      )}

      {bridge.onLoadTemplate && (
        <ToolbarBtn
          title="Load template"
          onClick={bridge.onLoadTemplate}
          disabled={bridge.templatePending}
          icon={bridge.templatePending ? Loader2 : Sparkles}
          spin={bridge.templatePending}
        />
      )}

      {bridge.validationMessages.length > 0 && (
        <span className="ml-1 text-xs text-amber-600">
          {bridge.validationMessages.length} issue{bridge.validationMessages.length === 1 ? '' : 's'}
        </span>
      )}

      {onToggleFullscreen && (
        <>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <ToolbarBtn
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={onToggleFullscreen}
            icon={Maximize2}
          />
        </>
      )}
    </div>
  );
}

function ToolbarBtn({
  title,
  onClick,
  disabled,
  icon: Icon,
  spin,
  primary,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  icon: typeof Save;
  spin?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md p-1.5 transition disabled:opacity-40 ${
        primary
          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <Icon className={`h-4 w-4 ${spin ? 'animate-spin' : ''}`} />
    </button>
  );
}
