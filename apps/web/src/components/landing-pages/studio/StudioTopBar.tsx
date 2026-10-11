/** Landing Studio — top command bar. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  Settings,
  Rocket,
  RefreshCw,
  Minus,
  Plus,
} from 'lucide-react';

type Device = 'desktop' | 'tablet' | 'mobile';

type Props = {
  pageName: string;
  onRename: (name: string) => void;
  slug: string;
  statusBadge?: ReactNode;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  isPublished: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  device: Device;
  onDevice: (d: Device) => void;
  zoom: number;
  onZoom: (z: number) => void;
  previewing: boolean;
  onTogglePreview: () => void;
  onOpenSettings: () => void;
  onSave: () => void;
  onPublish: (publish: boolean) => void;
  onBack?: () => void;
};

export function StudioTopBar({
  pageName,
  onRename,
  slug,
  statusBadge,
  dirty,
  saving,
  publishing,
  isPublished,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  device,
  onDevice,
  zoom,
  onZoom,
  previewing,
  onTogglePreview,
  onOpenSettings,
  onSave,
  onPublish,
  onBack,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(pageName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraftName(pageName), [pageName]);
  useEffect(() => {
    if (editingName) inputRef.current?.select();
  }, [editingName]);

  const commitName = () => {
    setEditingName(false);
    const t = draftName.trim();
    if (t && t !== pageName) onRename(t);
    else setDraftName(pageName);
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Back to landing pages"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}

      <div className="flex min-w-0 items-center gap-2">
        {editingName ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setDraftName(pageName);
                setEditingName(false);
              }
            }}
            className="w-56 rounded-md border border-brand-300 px-2 py-1 text-sm font-semibold focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="truncate rounded-md px-2 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            title="Rename"
          >
            {pageName}
          </button>
        )}
        <span className="hidden font-mono text-[11px] text-slate-400 sm:inline">/pages/{slug}</span>
        {statusBadge}
      </div>

      <div className="mx-1 flex items-center gap-0.5">
        <IconBtn icon={Undo2} title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} />
        <IconBtn icon={Redo2} title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo} />
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            ['desktop', Monitor],
            ['tablet', Tablet],
            ['mobile', Smartphone],
          ] as Array<[Device, typeof Monitor]>
        ).map(([d, Icon]) => (
          <button
            key={d}
            type="button"
            onClick={() => onDevice(d)}
            className={`rounded-md p-1.5 ${device === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            title={d}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <div className="hidden items-center gap-1 rounded-lg bg-slate-100 p-1 md:flex">
        <button type="button" onClick={() => onZoom(Math.max(0.4, zoom - 0.1))} className="rounded p-1 text-slate-500 hover:text-slate-700">
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-10 text-center text-[11px] tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => onZoom(Math.min(1.5, zoom + 0.1))} className="rounded p-1 text-slate-500 hover:text-slate-700">
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePreview}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
            previewing ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>
        {dirty && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {isPublished ? (
          <button
            type="button"
            onClick={() => onPublish(true)}
            disabled={publishing}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {publishing ? 'Publishing…' : 'Republish'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPublish(true)}
            disabled={publishing}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Rocket className="h-3.5 w-3.5" />
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  icon: Icon,
  title,
  onClick,
  disabled,
}: {
  icon: typeof Undo2;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
