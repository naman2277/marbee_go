import {
  CheckCircle2,
  Focus,
  GitBranch,
  LayoutGrid,
  Maximize2,
  Minimize2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui';

type Props = {
  nodeCount: number;
  edgeCount: number;
  validationMessages: string[];
  fullscreen?: boolean;
  onAutoLayout: () => void;
  onFitView: () => void;
  onValidate: () => void;
  onToggleFullscreen?: () => void;
};

export function WorkflowToolbar({
  nodeCount,
  edgeCount,
  validationMessages,
  fullscreen,
  onAutoLayout,
  onFitView,
  onValidate,
  onToggleFullscreen,
}: Props) {
  const hasIssues = validationMessages.length > 0;

  return (
    <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur-md">
        <GitBranch className="h-4 w-4 text-indigo-400" />
        <span className="text-xs font-medium text-slate-300">
          <span className="text-white">{nodeCount}</span> nodes
          <span className="mx-1.5 text-slate-600">·</span>
          <span className="text-white">{edgeCount}</span> connections
        </span>
        {hasIssues ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {validationMessages.length} issue{validationMessages.length === 1 ? '' : 's'}
          </span>
        ) : nodeCount > 0 ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Valid
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-900/90 p-1 shadow-xl backdrop-blur-md">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAutoLayout}
          className="!text-slate-300 hover:!bg-slate-800 hover:!text-white"
          title="Auto-layout nodes"
        >
          <LayoutGrid className="mr-1 h-3.5 w-3.5" />
          Auto layout
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onFitView}
          className="!text-slate-300 hover:!bg-slate-800 hover:!text-white"
          title="Fit to screen"
        >
          <Focus className="mr-1 h-3.5 w-3.5" />
          Fit view
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onValidate}
          className="!text-slate-300 hover:!bg-slate-800 hover:!text-white"
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          Validate
        </Button>
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
