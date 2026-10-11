import { useState } from 'react';
import { Copy, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { JourneyRow } from '@/lib/journeys';

export type DuplicateOptions = { name: string; copyDetails: boolean; copyWorkflows: boolean };

export function DuplicateCampaignModal({
  source,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  source: JourneyRow;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (opts: DuplicateOptions) => void;
}) {
  const [name, setName] = useState(`${source.name} (Copy)`);
  const [copyDetails, setCopyDetails] = useState(true);
  const [copyWorkflows, setCopyWorkflows] = useState(true);

  const Check = ({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) => (
    <label className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onConfirm({ name: name.trim(), copyDetails, copyWorkflows });
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
              <Copy className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Duplicate campaign</h3>
              <p className="text-xs text-slate-500">From "{source.name}"</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-slate-700">New campaign name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <div className="space-y-0.5 rounded-xl border border-slate-200 p-2">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">What to copy</p>
          <Check checked={copyDetails} onChange={setCopyDetails} label="Campaign details" hint="Description, type, owner, dates, objective, tags" />
          <Check checked={copyWorkflows} onChange={setCopyWorkflows} label="Workflows & delivery configuration" hint="Each linked pipeline is copied as a new pipeline for the new campaign" />
          <Check checked={false} disabled label="Historical execution data" hint="Never copied — runs, deliveries and engagement stay with the original" />
        </div>

        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="text-xs">
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !name.trim()} className="text-xs font-semibold">
            {busy ? 'Duplicating…' : 'Duplicate'}
          </Button>
        </div>
      </form>
    </div>
  );
}
