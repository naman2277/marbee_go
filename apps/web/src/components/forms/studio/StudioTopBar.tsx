import { useState } from 'react';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  EyeOff,
  Settings,
  Rocket,
  Save,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@/components/ui';

export type Device = 'desktop' | 'tablet' | 'mobile';

type Props = {
  name: string;
  status: 'draft' | 'published';
  liveVersion?: number;
  device: Device;
  onDeviceChange: (d: Device) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  previewing: boolean;
  onPreviewToggle: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSettingsOpen: () => void;
  onPublish: () => void;
  onSave?: () => void;
  onRename: (name: string) => void;
  publishing?: boolean;
  saving?: boolean;
  dirty?: boolean;
  backTo?: string;
};

const DEVICES: Array<{ key: Device; icon: typeof Monitor; label: string }> = [
  { key: 'desktop', icon: Monitor, label: 'Desktop' },
  { key: 'tablet', icon: Tablet, label: 'Tablet' },
  { key: 'mobile', icon: Smartphone, label: 'Mobile' },
];

export function StudioTopBar({
  name,
  status,
  liveVersion,
  device,
  onDeviceChange,
  zoom,
  onZoomChange,
  previewing,
  onPreviewToggle,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSettingsOpen,
  onPublish,
  onSave,
  onRename,
  publishing,
  saving,
  dirty,
  backTo = '/content/forms',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const commitName = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
      <Link
        to={backTo}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
        title="Back to Forms"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {editing ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          className="rounded border border-brand-400 px-2 py-0.5 text-sm font-semibold text-slate-900 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(name); setEditing(true); }}
          className="max-w-[320px] truncate text-sm font-semibold text-slate-900 hover:text-brand-700 transition"
          title="Click to rename"
        >
          {name}
        </button>
      )}

      <Badge variant={status === 'published' ? 'success' : 'warning'}>
        {status === 'published' ? `Live v${liveVersion || 1}` : 'Draft'}
      </Badge>

      <div className="flex-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {/* Device switcher */}
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {DEVICES.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onDeviceChange(key)}
            className={`rounded-md p-1.5 transition ${
              device === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
            }`}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onZoomChange(Math.max(50, zoom - 10))}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[36px] text-center text-[11px] font-semibold text-slate-500">{zoom}%</span>
        <button
          type="button"
          onClick={() => onZoomChange(Math.min(150, zoom + 10))}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {/* Preview toggle */}
      <button
        type="button"
        onClick={onPreviewToggle}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
          previewing ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'text-slate-500 hover:bg-slate-100'
        }`}
        title="Toggle preview mode"
      >
        {previewing ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {previewing ? 'Edit' : 'Preview'}
      </button>

      {/* Settings */}
      <button
        type="button"
        onClick={onSettingsOpen}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        title="Form settings"
      >
        <Settings className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {/* Save + Publish */}
      {onSave && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onSave}
          disabled={saving || !dirty}
          className="text-xs"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Save
        </Button>
      )}
      <Button
        size="sm"
        onClick={onPublish}
        disabled={publishing}
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
      >
        {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Rocket className="h-3.5 w-3.5 mr-1" />}
        Publish
      </Button>
    </div>
  );
}
