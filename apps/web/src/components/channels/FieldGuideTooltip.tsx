import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import type { FieldGuide } from '@/lib/channel-field-guides';

type FieldGuideTooltipProps = {
  guide: FieldGuide;
  required?: boolean;
};

export function FieldGuideTooltip({ guide, required }: FieldGuideTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const panelWidth = 320;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16;
    }
    setPos({
      top: rect.bottom + 8,
      left: Math.max(16, left),
    });
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
        aria-label={`Help: ${guide.title}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[200] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            role="tooltip"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{guide.title}</p>
              {required && (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600">
                  Required
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{guide.summary}</p>

            {guide.steps && guide.steps.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
                {guide.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}

            {guide.example && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Example</p>
                <code className="mt-1 block break-all font-mono text-xs text-slate-700">{guide.example}</code>
              </div>
            )}

            {guide.link && (
              <a
                href={guide.link.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                {guide.link.label} →
              </a>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
