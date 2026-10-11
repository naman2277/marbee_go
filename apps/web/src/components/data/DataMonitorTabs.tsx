import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Shared tab strip that ties Overview / Lineage / Data Health into one
 *  "Monitor" module. Rendered at the top of each of the three pages. */
const TABS = [
  { key: 'overview', label: 'Overview', to: '/data/overview' },
  { key: 'lineage', label: 'Lineage', to: '/data/lineage' },
  { key: 'quality', label: 'Data Health', to: '/data/quality' },
] as const;

export type DataMonitorTab = (typeof TABS)[number]['key'];

export function DataMonitorTabs({ active }: { active: DataMonitorTab }) {
  return (
    <div className="mb-5 flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-medium transition-colors',
            active === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
