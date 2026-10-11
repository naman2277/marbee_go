import { HardDrive, Image as ImageIcon } from 'lucide-react';
import { ASSET_STORAGE_QUOTA_BYTES, sumAssetBytes } from '@/lib/assets';
import { formatBytes } from '@/lib/schema-stats';
import type { MarbeeAsset } from '@/lib/assets';

type Props = {
  assets: MarbeeAsset[];
  quotaBytes?: number;
};

function usageColor(pct: number) {
  if (pct >= 90) return 'bg-rose-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-brand-600';
}

export function AssetQuotaBar({ assets, quotaBytes = ASSET_STORAGE_QUOTA_BYTES }: Props) {
  const used = sumAssetBytes(assets);
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((used / quotaBytes) * 100)) : 0;
  const published = assets.filter((a) => a.metadata.status === 'published').length;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Storage quota</p>
            <p className="text-xs text-slate-500">
              {formatBytes(used)} used of {formatBytes(quotaBytes)} ({pct}%)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <ImageIcon className="h-4 w-4 text-slate-400" />
            <span>
              <span className="font-semibold text-slate-900">{assets.length}</span> assets
            </span>
          </div>
          <div className="text-slate-600">
            <span className="font-semibold text-emerald-600">{published}</span> published
          </div>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all ${usageColor(pct)}`}
          style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}
