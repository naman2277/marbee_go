import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import {
  resolveWorkflowErrorHelp,
  type WorkflowErrorContext,
  type WorkflowErrorHelp,
} from '@/lib/workflow-error-help';

type Props = WorkflowErrorContext & {
  help?: WorkflowErrorHelp;
  variant?: 'error' | 'warning' | 'default';
};

export function WorkflowErrorHelpIcon({
  help: helpOverride,
  variant = 'error',
  ...ctx
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const help = helpOverride ?? resolveWorkflowErrorHelp(ctx);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const panelWidth = 320;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16;
    }
    const top = rect.top - 8;
    setPos({
      top: Math.max(16, top),
      left: Math.max(16, left),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) {
        const panel = document.getElementById('workflow-error-help-panel');
        if (panel?.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const btnClass =
    variant === 'error'
      ? 'text-red-500 hover:bg-red-100 hover:text-red-700'
      : variant === 'warning'
        ? 'text-amber-500 hover:bg-amber-100 hover:text-amber-700'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600';

  const borderClass =
    variant === 'error'
      ? 'border-red-200'
      : variant === 'warning'
        ? 'border-amber-200'
        : 'border-slate-200';

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 ${btnClass}`}
        aria-label={`How to fix: ${help.title}`}
        title="How to fix this"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id="workflow-error-help-panel"
            className={`fixed z-[200] w-80 -translate-y-full rounded-xl border bg-white p-4 shadow-xl ${borderClass}`}
            style={{ top: pos.top, left: pos.left }}
            role="dialog"
            aria-label={help.title}
          >
            <p className="text-sm font-semibold text-slate-900">{help.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{help.summary}</p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              How to fix
            </p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-700">
              {help.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>,
          document.body,
        )}
    </>
  );
}
