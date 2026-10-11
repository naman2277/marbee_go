import {
  ACC_STAGE_LABELS,
  resolveAccApprovalStage,
  type AccApprovalStage,
} from '@/lib/campaign-acc-stages';
import type { CampaignLifecycle } from '@/lib/campaign-lifecycle';

type Props = {
  lifecycle: CampaignLifecycle;
  hasPopulation: boolean;
  hasDeliveries: boolean;
};

const STAGE_ORDER: AccApprovalStage[] = [
  'in_progress',
  'targeting_ready',
  'awaiting_delivery',
  'ready_to_send',
  'finished',
];

export function CampaignApprovalBar({ lifecycle, hasPopulation, hasDeliveries }: Props) {
  const current = resolveAccApprovalStage({ lifecycle, hasPopulation, hasDeliveries });
  const currentIdx = STAGE_ORDER.indexOf(current);

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800/80 bg-[#0a0d16] px-4 py-2">
      <span className="mr-2 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
        Campaign status
      </span>
      {STAGE_ORDER.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={stage} className="flex shrink-0 items-center">
            {idx > 0 && (
              <span
                className={`mx-1 h-px w-4 ${done ? 'bg-emerald-600' : 'bg-slate-700'}`}
                aria-hidden
              />
            )}
            <span
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-semibold ${
                active
                  ? 'bg-sky-600/25 text-sky-300 ring-1 ring-sky-500/40'
                  : done
                    ? 'text-emerald-400/90'
                    : 'text-slate-600'
              }`}
            >
              {ACC_STAGE_LABELS[stage]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
