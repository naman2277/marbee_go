import { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Focus,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  RotateCcw,
  Save,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { WorkflowExecutionPhase } from '@/components/journeys/useCampaignWorkflow';
import { isCampaignWorkflowMode, type CampaignModeInput } from '@/lib/campaign-nodes';

type Props = {
  mode: CampaignModeInput;
  nodeCount: number;
  edgeCount: number;
  validationMessages: string[];
  savePending?: boolean;
  runPending?: boolean;
  executionPhase?: WorkflowExecutionPhase;
  isLoopActive?: boolean;
  pauseRequested?: boolean;
  stopRequested?: boolean;
  workflowLoading?: boolean;
  resetPending?: boolean;
  populationTotal?: number;
  onSave: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onValidate: () => void;
  onStartWorkflow?: () => void;
  onPauseWorkflow?: () => void;
  onStopWorkflow?: () => void;
  onRunNext?: () => void;
  onResetWorkflow?: () => void;
  runningNodeLabel?: string;
  workflowFinished?: boolean;
  deliveryCount?: number;
  onLoadTemplate?: () => void;
  templatePending?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function StartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8.25 6.75v6.5c0 .45.48.73.86.5l5.25-3.25a.6.6 0 0 0 0-1l-5.25-3.25a.6.6 0 0 0-.86.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.25" />
      <rect x="7.25" y="6.75" width="2" height="6.5" rx="0.75" fill="currentColor" />
      <rect x="10.75" y="6.75" width="2" height="6.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.25" />
      <rect x="6.75" y="6.75" width="6.5" height="6.5" rx="1.25" fill="currentColor" />
    </svg>
  );
}

function WorkflowControl({
  title,
  onClick,
  disabled,
  active,
  variant,
  label,
  icon,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  variant: 'start' | 'pause' | 'stop';
  label: string;
  icon: React.ReactNode;
}) {
  const variantStyles = {
    start: {
      idle: 'text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300',
      active: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
      icon: 'text-emerald-400',
    },
    pause: {
      idle: 'text-amber-400 hover:bg-amber-500/10 hover:text-amber-300',
      active: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      icon: 'text-amber-400',
    },
    stop: {
      idle: 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300',
      active: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
      icon: 'text-rose-400',
    },
  };

  const styles = variantStyles[variant];

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'group relative inline-flex h-9 min-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl px-3 transition-all duration-200',
        'disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none',
        active ? styles.active : styles.idle,
      ].join(' ')}
    >
      <span className={`transition-transform duration-200 group-hover:scale-105 group-disabled:scale-100 ${styles.icon}`}>
        {icon}
      </span>
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </button>
  );
}

function WorkflowControls({
  executionPhase,
  runPending,
  isLoopActive,
  pauseRequested,
  stopRequested,
  workflowLoading,
  onStartWorkflow,
  onPauseWorkflow,
  onStopWorkflow,
}: {
  executionPhase: WorkflowExecutionPhase;
  runPending?: boolean;
  isLoopActive?: boolean;
  pauseRequested?: boolean;
  stopRequested?: boolean;
  workflowLoading?: boolean;
  onStartWorkflow?: () => void;
  onPauseWorkflow?: () => void;
  onStopWorkflow?: () => void;
}) {
  const isRunning = isLoopActive || executionPhase === 'running' || runPending;
  const isPaused = executionPhase === 'paused';
  const isActive = isRunning || isPaused || stopRequested;
  const canPause = (executionPhase === 'running' || isLoopActive) && !isPaused && !stopRequested;
  const startLabel = isPaused ? 'Resume' : 'Start';
  const startDisabled = workflowLoading || ((isRunning || stopRequested) && !isPaused);

  return (
    <div className="relative z-50 flex items-center gap-0.5 rounded-2xl border border-slate-700/70 bg-slate-950/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {onStartWorkflow && (
        <WorkflowControl
          title={
            workflowLoading
              ? 'Preparing workflow…'
              : isPaused
                ? 'Resume workflow execution'
                : 'Start workflow execution'
          }
          variant="start"
          label={workflowLoading ? 'Loading' : startLabel}
          disabled={startDisabled}
          active={isRunning && !isPaused}
          onClick={onStartWorkflow}
          icon={
            workflowLoading ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <StartIcon className="h-[18px] w-[18px]" />
            )
          }
        />
      )}
      {onPauseWorkflow && (
        <>
          <span className="mx-0.5 h-5 w-px bg-slate-700/80" aria-hidden />
          <WorkflowControl
            title={
              pauseRequested && executionPhase === 'running'
                ? 'Will pause after the current step finishes'
                : 'Pause after current step completes'
            }
            variant="pause"
            label={pauseRequested && executionPhase === 'running' ? 'Pausing…' : 'Pause'}
            disabled={!canPause}
            active={isPaused || Boolean(pauseRequested)}
            onClick={onPauseWorkflow}
            icon={<PauseIcon className="h-[18px] w-[18px]" />}
          />
        </>
      )}
      {onStopWorkflow && (
        <>
          <span className="mx-0.5 h-5 w-px bg-slate-700/80" aria-hidden />
          <WorkflowControl
            title="Stop workflow execution"
            variant="stop"
            label={stopRequested ? 'Stopping…' : 'Stop'}
            disabled={!isActive}
            active={Boolean(stopRequested)}
            onClick={onStopWorkflow}
            icon={<StopIcon className="h-[18px] w-[18px]" />}
          />
        </>
      )}
    </div>
  );
}

export function CampaignToolbar({
  mode,
  nodeCount,
  edgeCount,
  validationMessages,
  savePending,
  runPending,
  executionPhase = 'idle',
  isLoopActive,
  pauseRequested,
  stopRequested,
  workflowLoading,
  resetPending,
  populationTotal,
  onSave,
  onAutoLayout,
  onFitView,
  onValidate,
  onStartWorkflow,
  onPauseWorkflow,
  onStopWorkflow,
  onRunNext,
  onResetWorkflow,
  runningNodeLabel,
  workflowFinished,
  deliveryCount = 0,
  onLoadTemplate,
  templatePending,
  fullscreen,
  onToggleFullscreen,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasIssues = validationMessages.length > 0;
  const isRunning = isLoopActive || executionPhase === 'running' || runPending;
  const isPaused = executionPhase === 'paused';
  const isActive = isRunning || isPaused || stopRequested;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <div className="modern-campaign-toolbar pointer-events-auto flex max-w-4xl flex-wrap items-center gap-2.5 rounded-2xl py-1.5 pl-4 pr-1.5">
        <span className="hidden text-xs text-slate-500 sm:inline">
          {nodeCount} · {edgeCount}
          {isCampaignWorkflowMode(mode) && populationTotal != null && populationTotal > 0 && (
            <span className="ml-2 font-medium text-brand-600">{populationTotal.toLocaleString()}</span>
          )}
        </span>

        {hasIssues && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            {validationMessages.length} issue{validationMessages.length === 1 ? '' : 's'}
          </span>
        )}

        {isCampaignWorkflowMode(mode) && workflowFinished && (
          <span className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Campaign finished
            {deliveryCount > 0 && (
              <span className="text-emerald-400/70">· {deliveryCount} delivered</span>
            )}
          </span>
        )}

        {isCampaignWorkflowMode(mode) && isRunning && !isPaused && runningNodeLabel && (
          <span className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-medium text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="campaign-node-run-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-emerald-400/70">
              {stopRequested ? 'Stopping' : pauseRequested ? 'Pausing after' : 'Running'}
            </span>
            {runningNodeLabel}
          </span>
        )}

        {isCampaignWorkflowMode(mode) && isPaused && !stopRequested && (
          <span className="flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-1 text-[10px] font-medium text-amber-300">
            <PauseIcon className="h-3.5 w-3.5 text-amber-400" />
            Paused
          </span>
        )}

        <span className="mx-1 hidden h-4 w-px bg-slate-700 sm:block" />

        {isCampaignWorkflowMode(mode) && (
          <WorkflowControls
            executionPhase={executionPhase}
            runPending={runPending}
            isLoopActive={isLoopActive}
            pauseRequested={pauseRequested}
            stopRequested={stopRequested}
            workflowLoading={workflowLoading}
            onStartWorkflow={onStartWorkflow}
            onPauseWorkflow={onPauseWorkflow}
            onStopWorkflow={onStopWorkflow}
          />
        )}

        <div className="flex items-center">
          {isCampaignWorkflowMode(mode) && onResetWorkflow && (
            <IconBtn title="Reset workflow" disabled={resetPending || isActive} onClick={onResetWorkflow}>
              <RotateCcw className="h-3.5 w-3.5" />
            </IconBtn>
          )}
          <IconBtn title="Auto layout" onClick={onAutoLayout}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Fit view" onClick={onFitView}>
            <Focus className="h-3.5 w-3.5" />
          </IconBtn>
          {onToggleFullscreen && (
            <IconBtn
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={onToggleFullscreen}
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </IconBtn>
          )}

          <div className="relative" ref={menuRef}>
            <IconBtn title="More actions" onClick={() => setMenuOpen((v) => !v)}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </IconBtn>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[180px] rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
                {isCampaignWorkflowMode(mode) && onRunNext && !isActive && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800"
                    onClick={() => {
                      onRunNext();
                      setMenuOpen(false);
                    }}
                  >
                    <SkipForward className="h-3.5 w-3.5" /> Run next step only
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    onValidate();
                    setMenuOpen(false);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Validate
                </button>
                {onLoadTemplate && (
                  <button
                    type="button"
                    disabled={templatePending}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    onClick={() => {
                      onLoadTemplate();
                      setMenuOpen(false);
                    }}
                  >
                    Load template
                  </button>
                )}
              </div>
            )}
          </div>

          <Button
            size="sm"
            onClick={onSave}
            disabled={savePending || isActive}
            className="!ml-1 !h-8 !rounded-full !bg-brand-600 !px-4 !text-xs !font-semibold !text-white hover:!bg-brand-500"
          >
            {savePending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            {savePending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
