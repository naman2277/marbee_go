import { useSearchParams, Link } from 'react-router-dom';
import { Award, Brain, Gift, Layers, LayoutGrid, Tag, Users, Sparkles, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { LoyaltyOverviewPanel } from '@/components/loyalty/LoyaltyOverviewPanel';
import { LoyaltyProgramsPanel } from '@/components/loyalty/LoyaltyProgramsPanel';
import { LoyaltyMembersPanel } from '@/components/loyalty/LoyaltyMembersPanel';
import { LoyaltyTiersPanel } from '@/components/loyalty/LoyaltyTiersPanel';

const TABS = [
  { id: 'overview', label: 'Program Overview', icon: LayoutGrid },
  { id: 'programs', label: 'Loyalty Programs', icon: Award },
  { id: 'tiers', label: 'Tiers & Points Structure', icon: Layers },
  { id: 'members', label: 'Member Ledger', icon: Users },
] as const;

type TabId = (typeof TABS)[number]['id'];

function parseTab(value: string | null): TabId {
  if (TABS.some((t) => t.id === value)) return value as TabId;
  return 'overview';
}

export function LoyaltyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  function setTab(id: TabId) {
    setSearchParams(id === 'overview' ? {} : { tab: id });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loyalty Hub"
        description="Customer loyalty programs, reward point ledgers, tier progression rules, and member retention."
      />

        {/* Quick Jump Bar across Loyalty & Decisioning Suite */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to="/loyalty/offers"
            className="group flex items-center justify-between rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50/70 via-white to-pink-50/70 p-4 shadow-2xs hover:border-purple-300 hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                <Gift className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition">
                  Dynamic Offers Hub
                </h4>
                <p className="text-[10px] text-slate-500">Multi-channel promotion campaigns</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-purple-700 group-hover:translate-x-0.5 transition" />
          </Link>

          <Link
            to="/loyalty/coupons"
            className="group flex items-center justify-between rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/70 p-4 shadow-2xs hover:border-indigo-300 hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Tag className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-700 transition">
                  Coupons & Vouchers
                </h4>
                <p className="text-[10px] text-slate-500">Unique single-use promo codes</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-700 group-hover:translate-x-0.5 transition" />
          </Link>

          <Link
            to="/loyalty/decision-engine"
            className="group flex items-center justify-between rounded-2xl border border-slate-900 bg-gradient-to-r from-slate-950 via-purple-950 to-indigo-950 p-4 text-white shadow-md hover:shadow-xl transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-purple-300 backdrop-blur-xs">
                <Brain className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Next Best Action Engine</h4>
                <p className="text-[10px] text-purple-200">Arbitration & RFM prediction</p>
              </div>
            </div>
            <Sparkles className="h-4 w-4 text-purple-300" />
          </Link>
        </div>

        {/* Loyalty Core Tabs */}
        <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-2xs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                tab === id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <LoyaltyOverviewPanel />}
        {tab === 'programs' && <LoyaltyProgramsPanel />}
        {tab === 'tiers' && <LoyaltyTiersPanel />}
        {tab === 'members' && <LoyaltyMembersPanel />}
      </div>
  );
}
