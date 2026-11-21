import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  X,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import {
  formatAssetSize,
  getAssetValidity,
  getPublicCopyUrl,
  validityLabel,
  type MarbeeAsset,
} from '@/lib/assets';
import { formatSchemaDate } from '@/lib/schema-stats';
import { copyText } from '@/lib/schema-export';

type Props = {
  asset: MarbeeAsset | null;
  displayUrl: string | null;
  onClose: () => void;
};

export function AssetPreviewModal({ asset, displayUrl, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!asset) return null;

  const validity = getAssetValidity(asset.metadata);
  const isExpired = validity === 'expired';
  const isPublished = asset.metadata.status === 'published';
  const publicUrl = getPublicCopyUrl(asset);
  const fileExt = asset.name.split('.').pop()?.toUpperCase() || 'FILE';

  const handleCopy = async () => {
    if (!publicUrl || isExpired) return;
    await copyText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-black text-white uppercase">
              {fileExt}
            </span>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm truncate">{asset.name}</h3>
              <p className="text-xs text-slate-400 font-mono">
                {formatAssetSize(asset.file_size)} · Updated {formatSchemaDate(asset.updated_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="grid flex-1 overflow-hidden lg:grid-cols-[1fr_320px]">
          {/* Main Media Preview Canvas */}
          <div className="flex items-center justify-center bg-slate-950 p-6 overflow-hidden relative">
            {/* Subtle grid pattern */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(#fff 1px, transparent 1px)`,
                backgroundSize: '16px 16px',
              }}
            />

            {asset.mime_type?.startsWith('image/') && displayUrl ? (
              <img
                src={displayUrl}
                alt={asset.name}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            ) : asset.mime_type?.startsWith('video/') && displayUrl ? (
              <video src={displayUrl} controls className="max-h-[60vh] max-w-full rounded-lg shadow-2xl" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <FileText className="h-20 w-20" />
                <p className="text-sm font-semibold">{fileExt} Document</p>
              </div>
            )}
          </div>

          {/* Right Details Panel */}
          <div className="flex flex-col justify-between border-l border-slate-100 bg-slate-50/50 p-6 space-y-5 overflow-y-auto">
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Publication Status
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant={isExpired ? 'error' : isPublished ? 'success' : 'warning'}>
                    {isExpired ? 'Expired' : isPublished ? 'Live Published' : 'Private Draft'}
                  </Badge>
                  {validity !== 'none' && !isExpired && (
                    <Badge variant={validity === 'active' ? 'success' : 'warning'}>
                      {validityLabel(validity)}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Public Link Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-brand-600" />
                  Public CDN Delivery URL
                </span>
                {publicUrl && !isExpired ? (
                  <>
                    <input
                      type="text"
                      readOnly
                      value={publicUrl}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-mono text-slate-600 focus:outline-none"
                    />
                    <Button
                      size="sm"
                      onClick={handleCopy}
                      className="w-full rounded-xl font-bold text-xs"
                    >
                      {copied ? (
                        <>
                          <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-300" />
                          Copied CDN Link!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Copy Public CDN URL
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">
                    {isExpired
                      ? 'Link revoked — asset has expired.'
                      : 'Not published to CDN. Click Publish to generate a shareable link.'}
                  </p>
                )}
              </div>

              {/* File Specs */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <span className="font-bold text-slate-800 text-xs">File Specifications</span>
                <div className="space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">File Size:</span>
                    <span className="font-bold text-slate-900">{formatAssetSize(asset.file_size)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">MIME Type:</span>
                    <span className="font-mono text-[10px] text-slate-900">{asset.mime_type || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Folder:</span>
                    <span className="font-mono text-[10px] text-slate-900">{asset.folder || '/'}</span>
                  </div>
                  {asset.metadata.valid_until && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Valid Until:</span>
                      <span className="font-bold text-slate-900">{asset.metadata.valid_until.slice(0, 10)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Download */}
            {displayUrl && (
              <a
                href={displayUrl}
                download={asset.name}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition"
              >
                <Download className="h-4 w-4" />
                Download Original Asset
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
