import { BarChart3, GitBranch, LayoutDashboard, Settings2 } from 'lucide-react';

export type CampaignView = 'dashboard' | 'general' | 'canvas';

type Props = {
  active: CampaignView;
  onChange: (view: CampaignView) => void;
  deliveryCount?: number;
  isFinished?: boolean;
};

export function CampaignViewTabs({ active, onChange, deliveryCount, isFinished }: Props) {
  const tabs: { id: CampaignView; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: deliveryCount || undefined },
    { id: 'general', label: 'General', icon: Settings2 },
    { id: 'canvas', label: 'Campaign canvas', icon: GitBranch },
  ];

  return (
    <nav className="flex items-center gap-1">
      {tabs.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            active === id
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
          {badge != null && badge > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {badge}
            </span>
          )}
          {id === 'dashboard' && isFinished && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </button>
      ))}
      <span className="ml-2 hidden items-center gap-1 text-xs text-slate-400 sm:inline-flex">
        <BarChart3 className="h-3.5 w-3.5" />
        Reports & performance live on Dashboard
      </span>
    </nav>
  );
}
