import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Calendar,
  Check,
  Copy,
  Eye,
  FileText,
  Film,
  Globe,
  GripVertical,
  Lock,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import {
  formatAssetSize,
  getAssetDisplayUrl,
  getAssetValidity,
  getPublicCopyUrl,
  setAssetPublished,
  updateAsset,
  deleteAsset,
  type MarbeeAsset,
  type AssetMetadata,
} from '@/lib/assets';
import { formatSchemaDate } from '@/lib/schema-stats';
import { ASSET_DRAG_MIME } from '@/lib/asset-folders';

type Props = {
  asset: MarbeeAsset;
  copied: boolean;
  onCopy: (url: string) => void;
  onUpdated: () => void | Promise<void>;
  onDeleted: () => void;
  onPreview?: (asset: MarbeeAsset, url: string | null) => void;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
};

export function AssetCard({
  asset,
  copied,
  onCopy,
  onUpdated,
  onDeleted,
  onPreview,
  draggable = true,
  isDragging,
  onDragStart,
  onDragEnd,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(asset.name);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showValidity, setShowValidity] = useState(false);
  const [validFrom, setValidFrom] = useState(asset.metadata.valid_from?.slice(0, 10) ?? '');
  const [validUntil, setValidUntil] = useState(asset.metadata.valid_until?.slice(0, 10) ?? '');
  const [published, setPublished] = useState(asset.metadata.status === 'published');
  const [publishMessage, setPublishMessage] = useState('');

  const validity = getAssetValidity(asset.metadata);
  const isExpired = validity === 'expired';
  const publicUrl = getPublicCopyUrl(asset);

  const fileExt = asset.name.split('.').pop()?.toUpperCase() || 'FILE';

  useEffect(() => {
    setName(asset.name);
    setValidFrom(asset.metadata.valid_from?.slice(0, 10) ?? '');
    setValidUntil(asset.metadata.valid_until?.slice(0, 10) ?? '');
    setPublished(asset.metadata.status === 'published');
  }, [asset]);

  useEffect(() => {
    let cancelled = false;
    if (asset.mime_type?.startsWith('image/') || asset.mime_type?.startsWith('video/')) {
      getAssetDisplayUrl(asset).then((url) => {
        if (!cancelled) setPreviewUrl(url);
      });
    } else {
      setPreviewUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const copyLink = (url: string) => {
    if (isExpired) return;
    onCopy(url);
  };

  const saveMutation = useMutation({
    mutationFn: async (patch: { name?: string; metadata?: AssetMetadata }) => {
      const result = await updateAsset(asset.id, patch);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => onUpdated(),
  });

  const publishMutation = useMutation({
    mutationFn: async (nextPublished: boolean) => {
      const result = await setAssetPublished(asset, nextPublished);
      if (result.error) throw new Error(result.error);
      return { published: nextPublished, publicUrl: result.publicUrl ?? null };
    },
    onSuccess: async ({ published: nextPublished, publicUrl: url }) => {
      setPublished(nextPublished);
      if (nextPublished && url) {
        setPreviewUrl(url);
      }
      await onUpdated();
      if (nextPublished && url) {
        copyLink(url);
        setPublishMessage('Published live — CDN link copied');
        setTimeout(() => setPublishMessage(''), 3000);
      } else {
        setPublishMessage('Unpublished — CDN link revoked');
        setTimeout(() => setPublishMessage(''), 3000);
      }
    },
    onError: (e: Error) => {
      setPublishMessage(e.message);
      setTimeout(() => setPublishMessage(''), 4000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteAsset(asset);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => onDeleted(),
  });

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === asset.name) {
      setName(asset.name);
      setEditingName(false);
      return;
    }
    saveMutation.mutate({ name: trimmed }, { onSuccess: () => setEditingName(false) });
  };

  const togglePublish = () => {
    if (isExpired) {
      setShowValidity(true);
      setPublishMessage('Extend the validity date to publish this asset.');
      setTimeout(() => setPublishMessage(''), 4000);
      return;
    }
    publishMutation.mutate(!published);
  };

  const saveValidity = async () => {
    const nextFrom = validFrom ? new Date(validFrom).toISOString() : null;
    const nextUntil = validUntil ? new Date(validUntil).toISOString() : null;
    const nextMeta: AssetMetadata = {
      ...asset.metadata,
      valid_from: nextFrom,
      valid_until: nextUntil,
    };
    const nextValidity = getAssetValidity(nextMeta);

    if (nextValidity === 'active' || nextValidity === 'none') {
      saveMutation.mutate(
        { metadata: nextMeta },
        {
          onSuccess: () => {
            setShowValidity(false);
            setPublishMessage('Validity updated — asset active');
            setTimeout(() => setPublishMessage(''), 3000);
          },
        },
      );
    } else {
      saveMutation.mutate(
        { metadata: { ...nextMeta, status: 'draft' } },
        {
          onSuccess: () => {
            setShowValidity(false);
            setPublishMessage('Asset expired — public access revoked');
            setTimeout(() => setPublishMessage(''), 3000);
          },
        },
      );
    }
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${asset.name}"? This removes the file permanently.`)) return;
    deleteMutation.mutate();
  };

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_MIME, asset.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`group relative flex h-full min-h-[310px] flex-col justify-between rounded-2xl border bg-white p-4 shadow-2xs transition-all hover:border-slate-300 hover:shadow-md ${
        isDragging ? 'opacity-40 scale-95 border-dashed border-slate-300' : 'border-slate-200/80'
      }`}
    >
      <div>
        {/* MEDIA THUMBNAIL CANVAS (UNIFORM 16:9 RATIO) */}
        <div
          onClick={() => onPreview?.(asset, previewUrl || publicUrl)}
          className="relative flex h-40 w-full cursor-pointer items-center justify-center rounded-xl bg-slate-50 border border-slate-100/80 overflow-hidden group/thumb"
        >
          {/* Subtle Checkerboard for transparent PNGs/SVGs */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
              backgroundSize: '12px 12px',
            }}
          />

          {draggable && (
            <div className="absolute left-2 bottom-2 cursor-grab rounded-lg bg-white/95 p-1 text-slate-400 opacity-0 shadow-xs active:cursor-grabbing group-hover/thumb:opacity-100 z-10 transition">
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}

          {/* Media Content */}
          {asset.mime_type?.startsWith('image/') && previewUrl ? (
            <img
              src={previewUrl}
              alt={asset.name}
              className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover/thumb:scale-105"
            />
          ) : asset.mime_type?.startsWith('video/') ? (
            <div className="flex flex-col items-center gap-1.5 text-slate-400">
              <Film className="h-10 w-10 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Video Asset</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-400">
              <FileText className="h-10 w-10 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider">{fileExt} Document</span>
            </div>
          )}

          {/* Expired / Private Overlay */}
          {isExpired ? (
            <div className="absolute inset-0 flex items-center justify-center bg-rose-950/40 backdrop-blur-[1px]">
              <span className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
                <Lock className="h-3.5 w-3.5" /> Expired (Inactive)
              </span>
            </div>
          ) : !published ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 opacity-0 group-hover/thumb:opacity-100 transition">
              <span className="flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
                <Eye className="h-3.5 w-3.5 text-slate-500" /> Click to Preview
              </span>
            </div>
          ) : null}

          {/* Top Badges */}
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
            {isExpired ? (
              <Badge variant="error">Expired</Badge>
            ) : (
              <Badge variant={published ? 'success' : 'warning'}>
                {published ? 'Published' : 'Draft'}
              </Badge>
            )}
          </div>

          {/* File Format Pill */}
          <div className="absolute right-2.5 top-2.5 z-10">
            <span className="rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-xs">
              {fileExt}
            </span>
          </div>

          {/* Action Overlay Icons on Hover */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2.5 bottom-2.5 flex items-center gap-1 opacity-0 transition-opacity group-hover/thumb:opacity-100 z-10"
          >
            {publicUrl && !isExpired && (
              <button
                type="button"
                onClick={() => copyLink(publicUrl)}
                title="Copy public CDN link"
                className="rounded-lg bg-white/95 p-1.5 text-slate-600 shadow-xs hover:bg-white hover:text-brand-600 transition"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onPreview?.(asset, previewUrl || publicUrl)}
              title="Full preview"
              className="rounded-lg bg-white/95 p-1.5 text-slate-600 shadow-xs hover:bg-white hover:text-slate-900 transition"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              title="Delete asset"
              className="rounded-lg bg-white/95 p-1.5 text-slate-600 shadow-xs hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ASSET METADATA & TITLE */}
        <div className="mt-3 space-y-1">
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') {
                    setName(asset.name);
                    setEditingName(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-brand-500 px-2 py-0.5 text-xs font-bold text-slate-900 focus:outline-none"
                autoFocus
              />
              <button type="button" onClick={saveName} className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(asset.name);
                  setEditingName(false);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group/name flex items-center gap-1.5 min-w-0 text-left"
                title="Click to rename"
              >
                <span className="truncate font-bold text-slate-900 text-xs hover:text-brand-600 transition">
                  {asset.name}
                </span>
                <Pencil className="h-3 w-3 shrink-0 text-slate-400 opacity-0 group-hover/name:opacity-100 transition" />
              </button>
            </div>
          )}

          {/* Size and Date Row */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-0.5">
            <span>{formatAssetSize(asset.file_size)}</span>
            <span>Updated {formatSchemaDate(asset.updated_at)}</span>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {publishMessage && (
          <p
            className={`mt-2 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
              publishMessage.includes('copied') || publishMessage.includes('active')
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {publishMessage}
          </p>
        )}

        {isExpired && (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50/60 p-2 text-[11px] text-rose-900 space-y-0.5">
            <p className="font-bold flex items-center gap-1">
              <Lock className="h-3 w-3 text-rose-600" />
              Expired on {asset.metadata.valid_until?.slice(0, 10)}
            </p>
            <p className="text-[10px] text-rose-700">Public CDN access is disabled.</p>
          </div>
        )}
      </div>

      {/* CARD BOTTOM ACTIONS */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={published && !isExpired ? 'secondary' : 'primary'}
            onClick={togglePublish}
            disabled={publishMutation.isPending}
            className={`flex-1 text-xs font-semibold rounded-xl h-8 py-0 ${
              isExpired ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''
            }`}
          >
            <Globe className="mr-1.5 h-3.5 w-3.5" />
            {isExpired ? 'Reactivate' : published ? 'Unpublish' : 'Publish'}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowValidity((v) => !v)}
            className={`rounded-xl text-xs font-semibold h-8 py-0 px-2.5 ${
              showValidity || (validity !== 'none' && !isExpired)
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600'
            }`}
            title="Set validity & expiry date"
          >
            <Calendar className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Inline Validity Dropdown */}
        {showValidity && (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-xs animate-in fade-in">
            <span className="font-bold text-slate-800 text-[11px] block">Validity & Expiry Schedule</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                  Valid from
                </label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                  Valid until
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={saveValidity}
              disabled={saveMutation.isPending}
              className="w-full rounded-lg text-xs font-bold h-7 py-0 mt-1"
            >
              Save Validity
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
