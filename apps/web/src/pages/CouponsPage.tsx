import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Plus,
  Search,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  TrendingUp,
  X,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCouponCampaigns,
  fetchCouponCodes,
  createCouponCampaign,
  generateAdditionalCodes,
  deleteCouponCampaign,
  clearAllCouponCampaigns,
  type CouponCampaign,
  type CouponType,
} from '@/lib/coupons';
import { formatNumber } from '@/lib/utils';

export function CouponsPage() {
  const { tenantId, environment } = useAuth();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'generic' | 'unique'>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<CouponCampaign | null>(null);
  const [generatorModalOpen, setGeneratorModalOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // New Campaign state
  const [campName, setCampName] = useState('');
  const [codePattern, setCodePattern] = useState('SUMMER-####-****');
  const [isGeneric, setIsGeneric] = useState(false);
  const [discountType, setDiscountType] = useState<CouponType>('percentage');
  const [discountValue, setDiscountValue] = useState(20);
  const [minCartValue, setMinCartValue] = useState(1500);
  const [maxDiscountCap, setMaxDiscountCap] = useState(500);
  const [initialCodesCount, setInitialCodesCount] = useState(50);
  const [expiresAt, setExpiresAt] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    showToast(`Copied code "${text}" to clipboard`);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const { data: campaigns = [], refetch } = useQuery({
    queryKey: ['coupon-campaigns', tenantId, environment],
    queryFn: () => fetchCouponCampaigns(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: codes = [], refetch: refetchCodes } = useQuery({
    queryKey: ['coupon-codes', selectedCampaign?.id],
    queryFn: () => (selectedCampaign ? fetchCouponCodes(selectedCampaign.id) : Promise.resolve([])),
    enabled: Boolean(selectedCampaign?.id),
  });

  const stats = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const totalVouchersGenerated = campaigns.reduce((acc, c) => acc + c.total_codes_generated, 0);
    const totalRedeemed = campaigns.reduce((acc, c) => acc + c.total_redeemed, 0);
    const totalRevenue = campaigns.reduce((acc, c) => acc + c.revenue_generated, 0);
    const redemptionRate = totalVouchersGenerated > 0 ? ((totalRedeemed / totalVouchersGenerated) * 100).toFixed(1) : '0';

    return {
      totalCampaigns,
      totalVouchersGenerated,
      totalRedeemed,
      totalRevenue,
      redemptionRate,
    };
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (typeFilter === 'generic' && !c.is_generic) return false;
      if (typeFilter === 'unique' && c.is_generic) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.code_pattern.toLowerCase().includes(q);
      }
      return true;
    });
  }, [campaigns, typeFilter, search]);

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      return await createCouponCampaign(
        tenantId,
        environment,
        {
          name: campName.trim(),
          code_pattern: isGeneric ? codePattern.trim().toUpperCase() : codePattern.trim(),
          is_generic: isGeneric,
          discount_type: discountType,
          discount_value: Number(discountValue),
          min_cart_value: Number(minCartValue),
          max_discount_cap: maxDiscountCap ? Number(maxDiscountCap) : undefined,
          max_redemptions_per_customer: 1,
          starts_at: new Date().toISOString(),
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          status: 'active',
          tags: ['automated', isGeneric ? 'promo-broadcast' : 'unique-vouchers'],
        },
        initialCodesCount
      );
    },
    onSuccess: (newCamp) => {
      setGeneratorModalOpen(false);
      setSelectedCampaign(newCamp);
      showToast(`Created campaign "${campName}" with ${newCamp.total_codes_generated} codes`);
      refetch();
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      await deleteCouponCampaign(tenantId, environment, campaignId);
    },
    onSuccess: () => {
      if (selectedCampaign?.id) setSelectedCampaign(null);
      showToast('Deleted coupon campaign');
      refetch();
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await clearAllCouponCampaigns(tenantId, environment);
    },
    onSuccess: () => {
      setConfirmClearOpen(false);
      setSelectedCampaign(null);
      showToast('Cleared all coupon campaigns');
      refetch();
    },
  });

  const generateMoreCodesMutation = useMutation({
    mutationFn: async ({ campaignId, pattern }: { campaignId: string; pattern: string }) => {
      return await generateAdditionalCodes(campaignId, pattern, 50);
    },
    onSuccess: (updatedCodes) => {
      showToast(`Generated +50 unique voucher codes! Total: ${updatedCodes.length}`);
      refetchCodes();
      refetch();
    },
  });

  const handleExportCodesCsv = () => {
    if (!codes || codes.length === 0) return;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Code,Claimed,Redeemed,Customer,Discount,Created At']
        .concat(
          codes.map(
            (c) =>
              `"${c.code}","${c.is_claimed ? 'YES' : 'NO'}","${c.is_redeemed ? 'YES' : 'NO'}","${c.claimed_by_customer_name || ''}","${c.discount_applied || ''}","${c.created_at}"`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedCampaign?.name || 'vouchers'}_codes.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported codes to CSV!');
  };

  const openGenerator = () => {
    setCampName('');
    setCodePattern('VIP-####-****');
    setIsGeneric(false);
    setDiscountType('percentage');
    setDiscountValue(20);
    setMinCartValue(1500);
    setMaxDiscountCap(500);
    setInitialCodesCount(50);
    setExpiresAt(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setGeneratorModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification - Positioned at bottom right to prevent header overlap */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-2xl border border-indigo-300/40 bg-slate-950/95 backdrop-blur-md px-5 py-3.5 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5 ring-1 ring-white/10">
          <CheckCircle2 className="h-4 w-4 text-indigo-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Futuristic Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-200/80 bg-gradient-to-r from-slate-950 via-indigo-950 to-purple-950 p-6 sm:p-8 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300 backdrop-blur-md">
              <Tag className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
              <span>Voucher Tokenization & Fraud Defense</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>Coupons & Voucher Management</span>
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-indigo-200/80 leading-relaxed">
              Generate dynamic 1-time single-use voucher codes (`VIP-####-****`), shared promo broadcasts, real-time redemption ledgers, and fraud caps.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            {campaigns.length > 0 && (
              <Button
                onClick={() => setConfirmClearOpen(true)}
                variant="ghost"
                className="text-rose-300 hover:bg-rose-950/40 font-bold text-xs h-9 px-3.5 rounded-xl border border-rose-500/30"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clear All
              </Button>
            )}
            <Button
              onClick={openGenerator}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg h-9 px-4 rounded-xl ring-1 ring-white/20"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Coupon Campaign
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-2 hover:border-indigo-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Campaigns
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Ticket className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">{stats.totalCampaigns}</p>
            <p className="text-[11px] text-slate-500 font-medium">Active Collections</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-2 hover:border-purple-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Vouchers Issued
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-purple-600">{formatNumber(stats.totalVouchersGenerated)}</p>
            <p className="text-[11px] text-purple-700 font-medium">Codes In Circulation</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-2 hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Redemptions
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{formatNumber(stats.totalRedeemed)}</p>
            <p className="text-[11px] text-emerald-700 font-medium">Claimed Customer Codes</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-2 hover:border-teal-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Attributed GMV
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-teal-600">₹{formatNumber(stats.totalRevenue)}</p>
            <p className="text-[11px] text-teal-700 font-medium">Influenced Revenue</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-2 hover:border-amber-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Burn Rate
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-amber-600">{stats.redemptionRate}%</p>
            <p className="text-[11px] text-amber-700 font-medium">Redemption Conversion</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          {(['all', 'unique', 'generic'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                typeFilter === type
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type === 'all' ? `All Campaigns (${campaigns.length})` : type === 'unique' ? 'Single-Use Unique Vouchers' : 'Shared Promo Codes'}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns, patterns…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Main Content Layout: Campaigns List on Left + Code Explorer on Right */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Campaigns Grid */}
        <div className="space-y-4 lg:col-span-7">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Campaign Collections ({filteredCampaigns.length})
          </h3>

          {filteredCampaigns.length === 0 ? (
            <Card className="p-12 text-center space-y-3">
              <Tag className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900">No Coupon Campaigns Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Create a campaign to generate single-use voucher codes or generic broadcast promo codes with budget and fraud controls.
              </p>
              <Button onClick={openGenerator} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-4 rounded-xl">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Coupon Campaign
              </Button>
            </Card>
          ) : (
            filteredCampaigns.map((camp) => {
              const isSelected = selectedCampaign?.id === camp.id;
              return (
                <div
                  key={camp.id}
                  onClick={() => setSelectedCampaign(camp)}
                  className={`group cursor-pointer rounded-3xl border p-5 shadow-2xs transition space-y-3 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                      : 'border-slate-200/90 bg-white hover:border-indigo-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-lg bg-indigo-100 px-2 py-0.5 font-mono text-xs font-black text-indigo-800">
                          {camp.discount_type === 'percentage'
                            ? `${camp.discount_value}% OFF`
                            : camp.discount_type === 'fixed_amount'
                            ? `₹${camp.discount_value} OFF`
                            : 'REWARD'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-bold text-slate-600 border border-slate-200">
                          {camp.is_generic ? '📢 Shared Code' : '🔒 Single-Use Unique'}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 truncate">{camp.name}</h4>
                      <p className="text-[11px] font-mono text-slate-500">Pattern: {camp.code_pattern}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCampaignMutation.mutate(camp.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="Delete campaign"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Generated</p>
                      <p className="font-black text-slate-800">{camp.total_codes_generated}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Redeemed</p>
                      <p className="font-black text-emerald-600">{camp.total_redeemed}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">GMV</p>
                      <p className="font-black text-teal-600">₹{formatNumber(camp.revenue_generated)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Min Cart: ₹{camp.min_cart_value}</span>
                    <span className="font-bold text-indigo-600 group-hover:underline">
                      View & Manage Codes →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Code Ledger / Inspection Panel */}
        <div className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {selectedCampaign ? `Voucher Ledger: ${selectedCampaign.name}` : 'Voucher Ledger'}
            </h3>

            {selectedCampaign && (
              <div className="flex items-center gap-1.5">
                {!selectedCampaign.is_generic && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      generateMoreCodesMutation.mutate({
                        campaignId: selectedCampaign.id,
                        pattern: selectedCampaign.code_pattern,
                      })
                    }
                    disabled={generateMoreCodesMutation.isPending}
                    className="h-7 px-2.5 text-[11px] font-bold bg-white rounded-xl shadow-2xs"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    +50 Codes
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportCodesCsv}
                  disabled={codes.length === 0}
                  className="h-7 px-2.5 text-[11px] font-bold bg-white rounded-xl shadow-2xs"
                >
                  <Download className="mr-1 h-3 w-3" />
                  CSV
                </Button>
              </div>
            )}
          </div>

          {selectedCampaign ? (
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{selectedCampaign.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {codes.length} Codes Loaded · {codes.filter((c) => c.is_redeemed).length} Claimed
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  Live
                </span>
              </div>

              {/* Codes List */}
              <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                {codes.length > 0 ? (
                  codes.map((code) => (
                    <div
                      key={code.id}
                      className={`flex items-center justify-between rounded-2xl border p-3 text-xs transition ${
                        code.is_redeemed
                          ? 'border-slate-100 bg-slate-50 opacity-60'
                          : 'border-slate-200/80 bg-white hover:border-indigo-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs">{code.code}</span>
                          {code.is_redeemed ? (
                            <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-800">
                              Redeemed
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                              Available
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {code.is_redeemed
                            ? `Used: ${new Date(code.redeemed_at || code.created_at).toLocaleDateString()}`
                            : 'Single-Use Auth Cap'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(code.id, code.code)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        title="Copy Code"
                      >
                        {copiedCodeId === code.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No codes generated yet. Click "+50 Codes" to issue tokens.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Card className="p-12 text-center text-slate-400 space-y-2">
              <Ticket className="mx-auto h-8 w-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-700">Select a Campaign</p>
              <p className="text-[11px] text-slate-400">
                Click any campaign on the left to inspect voucher ledger, issue tokens, or export CSV.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* CONFIRM CLEAR ALL MODAL */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Clear All Coupon Campaigns?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This will permanently delete all {campaigns.length} campaigns and all generated voucher tokens. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirmClearOpen(false)} className="font-bold text-xs h-9 px-4 rounded-xl">
                Cancel
              </Button>
              <Button
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs"
              >
                {clearAllMutation.isPending ? 'Clearing…' : 'Yes, Delete All'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* GENERATOR MODAL */}
      {generatorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <Tag className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create Coupon Campaign</h3>
                  <p className="text-[11px] text-slate-500">
                    Generate unique alphanumeric single-use codes or generic broadcast promo tokens.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGeneratorModalOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Campaign Name *</label>
                <input
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="e.g. VIP Customer Win-Back Q3"
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-indigo-400 focus:outline-hidden"
                />
              </div>

              {/* Coupon Mode Toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsGeneric(false)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    !isGeneric
                      ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className="font-bold text-xs text-slate-900">🔒 Unique 1-Time Vouchers</p>
                  <p className="text-[10px] text-slate-500">Each recipient gets an exclusive single-use code.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setIsGeneric(true)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    isGeneric
                      ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className="font-bold text-xs text-slate-900">📢 Shared Promo Code</p>
                  <p className="text-[10px] text-slate-500">A single broadcast code shared by multiple users.</p>
                </button>
              </div>

              {/* Code Pattern */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  {isGeneric ? 'Promo Code Word' : 'Code Pattern (#### = numbers, **** = random letters)'}
                </label>
                <input
                  value={codePattern}
                  onChange={(e) => setCodePattern(e.target.value)}
                  placeholder={isGeneric ? 'e.g. FLASH20' : 'e.g. WINBACK-####-****'}
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono uppercase focus:border-indigo-400 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as CouponType)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount (₹)</option>
                    <option value="free_shipping">Free Shipping</option>
                    <option value="points_multiplier">Points Multiplier</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Discount Value</label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Min Cart (₹)</label>
                  <input
                    type="number"
                    value={minCartValue}
                    onChange={(e) => setMinCartValue(Number(e.target.value))}
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold"
                  />
                </div>
              </div>

              {!isGeneric && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Initial Batch Size</label>
                  <select
                    value={initialCodesCount}
                    onChange={(e) => setInitialCodesCount(Number(e.target.value))}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium"
                  >
                    <option value={25}>25 Codes</option>
                    <option value={50}>50 Codes (Recommended)</option>
                    <option value={100}>100 Codes</option>
                    <option value={250}>250 Codes</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="ghost"
                onClick={() => setGeneratorModalOpen(false)}
                className="font-bold text-xs h-9 px-4 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createCampaignMutation.mutate()}
                disabled={!campName.trim() || createCampaignMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs"
              >
                {createCampaignMutation.isPending ? 'Generating Tokens…' : 'Create & Issue Codes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
