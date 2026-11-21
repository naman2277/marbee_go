import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { DeleteConfirmModal } from '@/components/journeys/DeleteConfirmModal';
import { cronLabel, formatRelativeTime, type Audience } from '@/lib/audiences';

type Props = {
  audience: Audience;
  onRefresh: () => void;
  refreshing?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
};

export function AudienceCohortCard({
  audience,
  onRefresh,
  refreshing,
  onDelete,
  deleting,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isAi = audience.creation_mode === 'ai';
  const isDiy = audience.creation_mode === 'diy';

  const ModeIcon = isAi ? Sparkles : isDiy ? SlidersHorizontal : Target;

  const bannerGradient = isAi
    ? 'bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white'
    : isDiy
    ? 'bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white'
    : 'bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white';

  return (
    <>
      <article className="group relative flex flex-col justify-between h-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
        {/* Top Header Banner */}
        <div className={`relative px-5 py-3.5 shrink-0 ${bannerGradient}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-md border border-white/20 shadow-xs font-bold">
                <ModeIcon className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="rounded-md bg-white/20 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider border border-white/20">
                    {audience.schema_slug || 'Customer'}
                  </span>
                  <span className="rounded-md bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/90">
                    {isAi ? 'AI Prompt' : isDiy ? 'Rules' : 'Template'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Icons in Banner */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                title="Refresh Member Count"
                onClick={onRefresh}
                disabled={refreshing}
                className="rounded-lg bg-black/25 p-1.5 text-white/80 hover:bg-black/40 hover:text-white transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-white' : ''}`} />
              </button>

              <Link
                to={`/customers/audiences/${audience.id}?tab=rules`}
                title="Edit Cohort Rules"
                className="rounded-lg bg-black/25 p-1.5 text-white/80 hover:bg-black/40 hover:text-white transition"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Link>

              {onDelete && (
                <button
                  type="button"
                  title="Delete Cohort"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg bg-black/25 p-1.5 text-white/80 hover:bg-rose-600 hover:text-white transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card Body - Flex Column for Strict Vertical Uniformity */}
        <div className="flex-1 flex flex-col justify-between p-5 space-y-3.5">
          {/* Title & Description - Fixed Height Box for Perfect Alignment */}
          <div className="space-y-1 h-[48px] overflow-hidden">
            <Link
              to={`/customers/audiences/${audience.id}`}
              className="block group-hover:text-brand-600 transition"
            >
              <h3 className="text-sm font-bold text-slate-900 truncate leading-snug">
                {audience.name}
              </h3>
            </Link>
            {audience.description ? (
              <p className="line-clamp-2 text-xs text-slate-500 leading-relaxed">
                {audience.description}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 italic">No description provided</p>
            )}
          </div>

          {/* KPI Metrics Box - Uniform Height */}
          <div className="h-[68px] rounded-xl border border-slate-100 bg-slate-50/70 p-3 flex items-center justify-between shrink-0">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Cohort Size
              </p>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <Users className="h-3.5 w-3.5 text-brand-600 self-center" />
                <span className="text-xl font-black tabular-nums text-slate-900">
                  {audience.member_count?.toLocaleString() ?? 0}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">members</span>
              </div>
            </div>

            <div className="text-right space-y-0.5">
              {audience.auto_refresh ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/80 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                  <Zap className="h-2.5 w-2.5" />
                  {cronLabel(audience.refresh_cron) ?? 'Auto'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                  Manual
                </span>
              )}
              <p className="text-[10px] text-slate-400 font-medium">
                {audience.last_refreshed_at
                  ? `Updated ${formatRelativeTime(audience.last_refreshed_at)}`
                  : 'Not refreshed yet'}
              </p>
            </div>
          </div>

          {/* Footer Actions - Flush Bottom Aligned */}
          <div className="pt-2 border-t border-slate-100 flex items-center gap-2 shrink-0">
            <Link
              to={`/customers/audiences/${audience.id}`}
              className="flex-1 inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition shadow-2xs"
            >
              Explore Members
            </Link>
            <Link
              to={`/customers/audiences/${audience.id}?tab=rules`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition shadow-2xs"
            >
              Rules
            </Link>
          </div>
        </div>
      </article>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <DeleteConfirmModal
          open={confirmDelete}
          title={`Delete Cohort "${audience.name}"?`}
          name={audience.name}
          itemType="campaign"
          loading={deleting}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete?.();
          }}
        />
      )}
    </>
  );
}
