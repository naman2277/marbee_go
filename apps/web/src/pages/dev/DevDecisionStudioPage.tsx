/**
 * DEV-ONLY harness for Decision Studio (Next Best Experience Engine).
 * Mounted at /dev/decision-studio when import.meta.env.DEV.
 * Seeds realistic items, policies, guardrails, and customers into localStorage
 * so the full ML pipeline can be exercised without auth or Supabase.
 */
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DecisionStudioPage } from '@/pages/DecisionStudioPage';
import { AuthContext } from '@/contexts/AuthContext';
import {
  type DecisionItem,
  type DecisionPolicy,
  DEFAULT_FORMULA,
  DEFAULT_GUARDRAILS,
} from '@/lib/decisions';

const TENANT = '00000000-0000-0000-0000-000000000001';
const ENV = 'production';

// ── Seed Decision Items ───────────────────────────────────────────

const SEED_ITEMS: DecisionItem[] = [
  {
    id: 'item_gold_20', type: 'offer', name: 'Gold VIP 20% Off', description: 'Exclusive 20% discount for Gold+ loyalty members on their next purchase.',
    category: 'discount_percent', tags: ['vip', 'gold', 'retention'], business_value: 40, cost: 8, margin: 0.8, priority: 90,
    channels: ['email', 'whatsapp', 'web'], placements: ['web_checkout', 'email_primary'], status: 'active',
    starts_at: new Date(Date.now() - 7 * 86400000).toISOString(), ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    budget_total: 50000, budget_spent: 12500, max_redemptions: 2000, redemption_count: 480, stacking: 'exclusive',
    content_variants: {}, config_version: 3, metadata: {},
  },
  {
    id: 'item_free_ship', type: 'offer', name: 'Free Shipping (₹999+)', description: 'Free shipping on orders above ₹999. Universal, stackable.',
    category: 'free_shipping', tags: ['shipping', 'universal'], business_value: 15, cost: 3, margin: 0.95, priority: 60,
    channels: ['web', 'app', 'push'], placements: ['web_checkout', 'app_home'], status: 'active',
    starts_at: new Date(Date.now() - 14 * 86400000).toISOString(), ends_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    budget_total: null, budget_spent: 0, max_redemptions: null, redemption_count: 1240, stacking: 'stackable',
    content_variants: {}, config_version: 1, metadata: {},
  },
  {
    id: 'item_winback', type: 'coupon', name: 'Win-Back ₹500 Off', description: 'Flat ₹500 off for dormant customers who haven\'t purchased in 60+ days.',
    category: 'discount_flat', tags: ['winback', 'reactivation'], business_value: 35, cost: 10, margin: 0.7, priority: 85,
    channels: ['email', 'sms', 'whatsapp'], placements: ['email_primary', 'whatsapp_offer'], status: 'active',
    starts_at: new Date(Date.now() - 3 * 86400000).toISOString(), ends_at: new Date(Date.now() + 45 * 86400000).toISOString(),
    budget_total: 100000, budget_spent: 18000, max_redemptions: 5000, redemption_count: 320, stacking: 'exclusive',
    content_variants: {}, config_version: 2, metadata: {},
  },
  {
    id: 'item_cashback_10', type: 'offer', name: '10% Cashback', description: 'Earn 10% cashback as loyalty points on your next purchase.',
    category: 'cashback', tags: ['cashback', 'points', 'loyalty'], business_value: 25, cost: 5, margin: 0.85, priority: 70,
    channels: ['push', 'app', 'web'], placements: ['app_home', 'web_checkout', 'push_daily'], status: 'active',
    starts_at: new Date(Date.now() - 5 * 86400000).toISOString(), ends_at: new Date(Date.now() + 20 * 86400000).toISOString(),
    budget_total: 75000, budget_spent: 22000, max_redemptions: 3000, redemption_count: 890, stacking: 'stackable',
    content_variants: {}, config_version: 1, metadata: {},
  },
  {
    id: 'item_bogo', type: 'offer', name: 'Buy 1 Get 1 Free', description: 'BOGO on selected electronics category items.',
    category: 'bogo', tags: ['bogo', 'electronics', 'seasonal'], business_value: 50, cost: 25, margin: 0.5, priority: 95,
    channels: ['email', 'web', 'sms'], placements: ['web_checkout', 'email_primary', 'sms_promo'], status: 'active',
    starts_at: new Date(Date.now() - 1 * 86400000).toISOString(), ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    budget_total: 200000, budget_spent: 0, max_redemptions: 1000, redemption_count: 42, stacking: 'exclusive',
    content_variants: {}, config_version: 1, metadata: {},
  },
  {
    id: 'item_content_guide', type: 'content', name: 'Style Guide 2024', description: 'Personalized fashion style guide based on purchase history.',
    category: 'content_personalized', tags: ['content', 'fashion', 'engagement'], business_value: 10, cost: 0.5, margin: 0.98, priority: 40,
    channels: ['email', 'app'], placements: ['email_secondary', 'app_home'], status: 'active',
    starts_at: null, ends_at: null,
    budget_total: null, budget_spent: 0, max_redemptions: null, redemption_count: 3200, stacking: 'stackable',
    content_variants: {}, config_version: 2, metadata: {},
  },
  {
    id: 'item_rec_cross', type: 'recommendation', name: 'Cross-Sell Accessories', description: 'AI-driven accessory recommendations based on recent purchases.',
    category: 'recommendation_ai', tags: ['recommendation', 'cross-sell', 'ai'], business_value: 18, cost: 0, margin: 1.0, priority: 55,
    channels: ['web', 'app', 'email'], placements: ['web_pdp', 'app_home', 'email_secondary'], status: 'active',
    starts_at: null, ends_at: null,
    budget_total: null, budget_spent: 0, max_redemptions: null, redemption_count: 5600, stacking: 'stackable',
    content_variants: {}, config_version: 1, metadata: {},
  },
  {
    id: 'item_draft_loyalty', type: 'experience', name: 'Loyalty Tier Upgrade Surprise', description: 'Draft: surprise tier upgrade for customers close to next level.',
    category: 'loyalty_surprise', tags: ['loyalty', 'surprise', 'draft'], business_value: 30, cost: 0, margin: 1.0, priority: 75,
    channels: ['push', 'email'], placements: ['push_daily'], status: 'draft',
    starts_at: null, ends_at: null,
    budget_total: null, budget_spent: 0, max_redemptions: null, redemption_count: 0, stacking: 'exclusive',
    content_variants: {}, config_version: 1, metadata: {},
  },
];

// ── Seed Policies ──────────────────────────────────────────────────

const SEED_POLICIES: DecisionPolicy[] = [
  {
    id: 'pol_checkout_ml', name: 'Checkout ML Policy', description: 'ML-scored decisioning for checkout placement. Uses explore/exploit for continuous learning.',
    status: 'active', objective: 'maximize_revenue',
    placement_ids: ['web_checkout', 'app_checkout'],
    item_collection: { type: 'all', filter: [] },
    eligibility: [{
      id: 'eg_1', logic: 'and', conditions: [
        { id: 'c_1', field: 'cart_value', operator: 'gt', value: 500 },
        { id: 'c_2', field: 'loyalty_tier', operator: 'in', value: ['Bronze', 'Silver', 'Gold', 'Platinum'] },
      ],
    }],
    ranking_method: 'explore_exploit', ranking_formula: { ...DEFAULT_FORMULA },
    guardrail_ids: DEFAULT_GUARDRAILS.filter(g => g.enabled).map(g => g.id),
    fallback_item_id: 'item_free_ship',
    allow_no_action: true, channel_arbitration: true, timing_optimization: false,
    experiment: { enabled: true, holdout_percent: 10, exploration_rate: 0.15, variant_splits: [] },
    max_items_returned: 3, ttl_seconds: 300, version: 2,
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'pol_email_daily', name: 'Daily Email Campaign', description: 'Formula-based ranking for daily email send. Conservative, no exploration.',
    status: 'active', objective: 'maximize_engagement',
    placement_ids: ['email_primary', 'email_secondary'],
    item_collection: { type: 'all', filter: [] },
    eligibility: [{
      id: 'eg_2', logic: 'and', conditions: [
        { id: 'c_3', field: 'consent_email', operator: 'eq', value: true },
        { id: 'c_4', field: 'email_opens_7d', operator: 'gte', value: 1 },
      ],
    }],
    ranking_method: 'formula',
    ranking_formula: { ...DEFAULT_FORMULA, conversion_probability_weight: 0.3, customer_affinity_weight: 0.25 },
    guardrail_ids: DEFAULT_GUARDRAILS.filter(g => g.enabled).map(g => g.id),
    fallback_item_id: 'item_content_guide',
    allow_no_action: true, channel_arbitration: false, timing_optimization: false,
    experiment: { enabled: false, holdout_percent: 0, exploration_rate: 0, variant_splits: [] },
    max_items_returned: 2, ttl_seconds: 600, version: 1,
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(), updated_at: new Date().toISOString(),
  },
];

// ── Seed Customers ─────────────────────────────────────────────────

const FIRST_NAMES = ['Aarav', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Meera', 'Arjun', 'Sneha', 'Rohan', 'Kavya',
  'Aditya', 'Neha', 'Siddharth', 'Pooja', 'Karthik', 'Divya', 'Harsh', 'Riya', 'Varun', 'Ishita'];
const LAST_NAMES = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Verma', 'Iyer', 'Nair', 'Joshi'];
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];
const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow'];

function seedCustomers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `cust-${String(i).padStart(4, '0')}`,
    tenant_id: TENANT,
    environment: ENV,
    email: `user${i}@example.com`,
    first_name: FIRST_NAMES[i % FIRST_NAMES.length],
    last_name: LAST_NAMES[i % LAST_NAMES.length],
    phone: `+9199${String(10000000 + i).slice(-8)}`,
    status: 'active',
    created_at: new Date(Date.now() - (30 + Math.floor(Math.random() * 365)) * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    loyalty_tier: TIERS[Math.min(3, Math.floor(i / (n / 4)))],
    lifetime_value: Math.floor(1000 + Math.random() * 80000),
    total_orders: Math.floor(1 + Math.random() * 40),
    avg_order_value: Math.floor(500 + Math.random() * 5000),
    days_since_last_purchase: Math.floor(Math.random() * 120),
    country: 'IN',
    city: CITIES[i % CITIES.length],
  }));
}

const FAKE_CUSTOMERS = seedCustomers(30);

// ── Seed into localStorage ──────────────────────────────────────────

function seedLocalStorage() {
  const k = (suffix: string) => `marbee_nbe_${suffix}_${TENANT}_${ENV}`;

  if (!localStorage.getItem(k('items'))) {
    localStorage.setItem(k('items'), JSON.stringify(SEED_ITEMS));
  }
  if (!localStorage.getItem(k('policies'))) {
    localStorage.setItem(k('policies'), JSON.stringify(SEED_POLICIES));
  }
  if (!localStorage.getItem(k('guardrails'))) {
    localStorage.setItem(k('guardrails'), JSON.stringify(DEFAULT_GUARDRAILS));
  }
}

// ── Dev QueryClient with pre-seeded customer data ─────────────────

const devQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
  },
});

devQueryClient.setQueryData(['customers', TENANT, ENV], FAKE_CUSTOMERS);

// ── Mock Auth ─────────────────────────────────────────────────────

const mockAuth = {
  user: null,
  session: null,
  profile: null,
  displayName: 'Dev User',
  loading: false,
  tenantId: TENANT,
  tenantName: 'Dev Tenant',
  environment: ENV as 'production',
  setEnvironment: () => {},
  access: { roleSlug: 'admin', roleName: 'Admin', roleId: 'r1', permissions: [], isAdmin: true, instanceAccess: null },
  accessLoading: false,
  refreshAccess: async () => {},
  refreshProfile: async () => {},
  hasPermission: () => true,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
};

// ── Page ──────────────────────────────────────────────────────────

function DevDecisionStudioPageInner() {
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    seedLocalStorage();
    setSeeded(true);
    console.debug('[DevDecisionStudio] Seeded localStorage with', SEED_ITEMS.length, 'items,', SEED_POLICIES.length, 'policies,', FAKE_CUSTOMERS.length, 'customers');
  }, []);

  if (!seeded) return null;
  return <DecisionStudioPage />;
}

export function DevDecisionStudioPage() {
  return (
    <AuthContext.Provider value={mockAuth as any}>
      <QueryClientProvider client={devQueryClient}>
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">DEV HARNESS</span>
                <span className="text-xs text-slate-500">
                  {SEED_ITEMS.length} items · {SEED_POLICIES.length} policies · {FAKE_CUSTOMERS.length} customers · ML pipeline active
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const k = (s: string) => `marbee_nbe_${s}_${TENANT}_${ENV}`;
                  ['items', 'policies', 'guardrails', 'log', 'model'].forEach(s => localStorage.removeItem(k(s)));
                  seedLocalStorage();
                  window.location.reload();
                }}
                className="rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-200"
              >
                Reset Seed Data
              </button>
            </div>
            <DevDecisionStudioPageInner />
          </div>
        </div>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
