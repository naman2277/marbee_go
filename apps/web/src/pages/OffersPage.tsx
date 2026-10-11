import { useEffect, useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Gift,
  History,
  Globe,
  Grid3X3,
  Image as ImageIcon,
  LayoutList,
  Link as LinkIcon,
  Megaphone,
  Minus,
  MousePointerClick,
  Percent,
  Plus,
  Rocket,
  Search,
  Settings2,
  Users,
  ShoppingCart,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  TrendingUp,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchOffers,
  saveOffer,
  deleteOffer,
  clearAllOffers,
  formatOfferValue,
  setOffersStatus,
  deleteOffers,
  offerStatusMeta,
  needsRepublish,
  offerChannelLabel,
  offerPlacementLabel,
  placementOptionsForChannel,
  OFFER_CHANNEL_GROUPS,
} from '@/lib/offers';
import {
  EMPTY_ELIGIBILITY,
  ELIGIBILITY_FIELDS,
  FIELD_GROUPS,
  countEligibleCustomers,
  fetchEligibleCustomers,
  eligibilityFromOffer,
  eligibilityToRules,
  operatorsForField,
  needsValue,
  newRule,
  describeRule,
  type OfferEligibility,
} from '@/lib/offer-eligibility';
import { fetchAudiences } from '@/lib/audiences';
import type { LoyaltyOffer, OfferType, OfferCtaParam } from '@/lib/loyalty-types';
import { OFFER_TYPE_LABELS } from '@/lib/loyalty-types';
import {
  fetchAuditLogsPage,
  auditActorLabel,
  formatAuditTime,
  AUDIT_ACTION_LABELS,
} from '@/lib/audit';
import { formatNumber } from '@/lib/utils';

type PageTab = 'offers' | 'bulk_import' | 'logs';
type ViewMode = 'grid' | 'list';
type SortKey = 'updated' | 'name' | 'value' | 'priority' | 'redemptions';

const PAGE_SIZE = 50;

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name' },
  { value: 'value', label: 'Offer value' },
  { value: 'priority', label: 'Priority' },
  { value: 'redemptions', label: 'Redemptions' },
];

const INDUSTRY_OPTIONS = [
  'E-commerce', 'Retail', 'F&B / Restaurant', 'Travel & Hospitality',
  'BFSI / Banking', 'Healthcare', 'Education', 'SaaS / Tech',
  'Automotive', 'Real Estate', 'Fashion & Apparel', 'Grocery',
  'Telecom', 'Entertainment', 'Fitness & Wellness', 'Other',
];

const SAMPLE_CSV = `name,slug,offer_type,offer_value,min_purchase,max_discount,channel,placement,status,starts_at,ends_at,description,tags,image_url,cta_label,cta_type,cta_value,redemption_type,terms,target_industry
"Summer Flash Sale",summer-flash-25,discount_percent,25,500,1000,website,checkout,draft,2026-09-10,2026-09-30,"25% off on all orders above ₹500","seasonal,flash",https://example.com/summer.jpg,Shop Now,link,https://shop.example.com/summer,auto,"Valid on orders ₹500+. Max discount ₹1000.",E-commerce
"Free Shipping Week",free-ship-week,free_shipping,0,299,,website,checkout,draft,2026-09-15,2026-09-22,"Free shipping on all orders ₹299+","shipping,promo",,Get Free Delivery,button,,auto,"Min order ₹299. Domestic only.",E-commerce
"BOGO Coffee",bogo-coffee,bogo,1,0,,pos,checkout,draft,2026-09-01,2026-12-31,"Buy 1 Get 1 on all espresso drinks","bogo,coffee",https://example.com/coffee.jpg,Order Now,deeplink,myapp://menu/coffee,code,"Valid at participating outlets only.",F&B / Restaurant
"₹200 Cashback",cashback-200,cashback,200,1500,,website,checkout,draft,2026-09-10,2026-10-10,"Get ₹200 cashback on ₹1500+ purchases","cashback,festive",,Claim Cashback,button,,auto,"Cashback credited within 48 hours.",BFSI / Banking`;

function generateId() {
  return `offer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function OffersPage() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pageTab, setPageTab] = useState<PageTab>('offers');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'expired' | 'scheduled' | 'paused'>('all');
  const [typeFilter, setTypeFilter] = useState<OfferType | 'all'>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<'details' | 'media' | 'cta' | 'eligibility' | 'rules'>('details');
  const [editingOffer, setEditingOffer] = useState<LoyaltyOffer | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState<LoyaltyOffer | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Bulk selection, sorting & pagination
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [eligibility, setEligibility] = useState<OfferEligibility>(EMPTY_ELIGIBILITY);
  const [eligibilityPreviewFor, setEligibilityPreviewFor] = useState<LoyaltyOffer | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [republishPrompt, setRepublishPrompt] = useState<{ id: string; name: string } | null>(null);

  const toggleId = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSortDir = () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));

  // Bulk import state
  const [csvText, setCsvText] = useState('');
  const [csvParsed, setCsvParsed] = useState<Record<string, string>[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '', slug: '', description: '',
    offerType: 'discount_percent' as OfferType,
    offerValue: 20, minPurchase: 1000, maxDiscount: 500,
    channel: 'website', placement: 'homepage',
    status: 'draft' as LoyaltyOffer['status'],
    priority: 50,
    stackingMode: 'exclusive' as 'exclusive' | 'stackable',
    startsAt: new Date().toISOString().split('T')[0],
    endsAt: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    budgetTotal: 0, maxRedemptions: 0,
    frequencyCapHours: 0,
    imageUrl: '', thumbnailUrl: '',
    termsAndConditions: '',
    ctaParams: [] as OfferCtaParam[],
    redemptionType: 'auto' as LoyaltyOffer['redemptionType'],
    redemptionInstructions: '',
    targetIndustry: '',
    tags: '',
    expectedLift: 0, marginImpact: 0, propensityWeight: 1,
  });

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 4000); };
  const updateForm = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const { data: offers = [], isLoading, refetch } = useQuery({
    queryKey: ['loyalty-offers', tenantId, environment],
    queryFn: () => fetchOffers(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const stats = useMemo(() => {
    const active = offers.filter(o => o.status === 'active').length;
    const totalRedemptions = offers.reduce((s, o) => s + (o.redemptionCount ?? 0), 0);
    return { total: offers.length, active, redemptions: totalRedemptions };
  }, [offers]);

  const filtered = useMemo(() => {
    const list = offers.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (typeFilter !== 'all' && o.offerType !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q) || o.tags.some(t => t.includes(q));
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'value': return (a.offerValue - b.offerValue) * dir;
        case 'priority': return (a.priority - b.priority) * dir;
        case 'redemptions': return ((a.redemptionCount ?? 0) - (b.redemptionCount ?? 0)) * dir;
        default: return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      }
    });
  }, [offers, statusFilter, typeFilter, search, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  // Reset to page 1 whenever the result set changes shape
  useEffect(() => { setPage(1); }, [statusFilter, typeFilter, search, sortKey, sortDir]);

  const pagedIds = paged.map(o => o.id);
  const selectedOnPage = pagedIds.filter(id => selectedIds.has(id));
  const allOnPageSelected = pagedIds.length > 0 && selectedOnPage.length === pagedIds.length;
  const toggleAllOnPage = () =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) pagedIds.forEach(id => next.delete(id));
      else pagedIds.forEach(id => next.add(id));
      return next;
    });

  // ── Eligibility: audiences + live reach ───────────────────────────
  const { data: audiences = [] } = useQuery({
    queryKey: ['audiences', tenantId, environment],
    queryFn: () => fetchAudiences(tenantId, environment),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const { data: eligibleCount, isFetching: countingReach } = useQuery({
    queryKey: ['offer-reach', tenantId, environment, JSON.stringify(eligibility)],
    queryFn: () => countEligibleCustomers(tenantId, environment, eligibility),
    enabled: Boolean(tenantId) && editorOpen && editorStep === 'eligibility',
    staleTime: 15_000,
  });

  const { data: totalCustomers = 0 } = useQuery({
    queryKey: ['offer-reach-total', tenantId, environment],
    queryFn: () => countEligibleCustomers(tenantId, environment, EMPTY_ELIGIBILITY),
    enabled: Boolean(tenantId) && editorOpen,
    staleTime: 60_000,
  });

  const updateEligibility = (patch: Partial<OfferEligibility>) =>
    setEligibility(e => ({ ...e, ...patch }));

  // ── Open create / edit ────────────────────────────────────────────
  const openCreate = () => {
    setEditingOffer(null);
    setEligibility(EMPTY_ELIGIBILITY);
    setForm({
      name: '', slug: '', description: '',
      offerType: 'discount_percent', offerValue: 20, minPurchase: 1000, maxDiscount: 500,
      channel: 'website', placement: 'homepage', status: 'draft', priority: 50,
      stackingMode: 'exclusive',
      startsAt: new Date().toISOString().split('T')[0],
      endsAt: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      budgetTotal: 0, maxRedemptions: 0, frequencyCapHours: 0,
      imageUrl: '', thumbnailUrl: '', termsAndConditions: '',
      ctaParams: [], redemptionType: 'auto', redemptionInstructions: '',
      targetIndustry: '', tags: '', expectedLift: 0, marginImpact: 0, propensityWeight: 1,
    });
    setEditorStep('details');
    setEditorOpen(true);
  };

  const openEdit = (o: LoyaltyOffer) => {
    setEditingOffer(o);
    setEligibility(eligibilityFromOffer(o));
    setForm({
      name: o.name, slug: o.slug, description: o.description || '',
      offerType: o.offerType, offerValue: o.offerValue,
      minPurchase: o.minPurchase || 0, maxDiscount: o.maxDiscount || 0,
      channel: o.channel, placement: o.placement, status: o.status,
      priority: o.priority, stackingMode: o.stackingMode,
      startsAt: o.startsAt?.split('T')[0] || '', endsAt: o.endsAt?.split('T')[0] || '',
      budgetTotal: o.budgetTotal || 0, maxRedemptions: o.maxRedemptions || 0,
      frequencyCapHours: o.frequencyCapHours || 0,
      imageUrl: o.imageUrl || '', thumbnailUrl: o.thumbnailUrl || '',
      termsAndConditions: o.termsAndConditions || '',
      ctaParams: o.ctaParams || [], redemptionType: o.redemptionType || 'auto',
      redemptionInstructions: o.redemptionInstructions || '',
      targetIndustry: o.targetIndustry || '', tags: o.tags.join(', '),
      expectedLift: o.expectedLift, marginImpact: o.marginImpact,
      propensityWeight: o.propensityWeight,
    });
    setEditorStep('details');
    setEditorOpen(true);
  };

  // ── Save ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      await saveOffer({
        tenantId, environment,
        id: editingOffer?.id,
        name: form.name.trim(),
        slug: form.slug.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-'),
        description: form.description.trim(),
        offerType: form.offerType, offerValue: Number(form.offerValue),
        minPurchase: form.minPurchase ? Number(form.minPurchase) : null,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        channel: form.channel, placement: form.placement, status: form.status,
        priority: form.priority, stackingMode: form.stackingMode,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        budgetTotal: form.budgetTotal || null, maxRedemptions: form.maxRedemptions || null,
        frequencyCapHours: form.frequencyCapHours || null,
        previous: editingOffer ?? undefined,
        audienceId: eligibility.audienceId,
        requiredTierSlug: eligibility.requiredTierSlug,
        eligibilityRules: eligibilityToRules(eligibility),
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        expectedLift: form.expectedLift, marginImpact: form.marginImpact,
        propensityWeight: form.propensityWeight,
        imageUrl: form.imageUrl || null, thumbnailUrl: form.thumbnailUrl || null,
        termsAndConditions: form.termsAndConditions || null,
        ctaParams: form.ctaParams, redemptionType: form.redemptionType,
        redemptionInstructions: form.redemptionInstructions || null,
        targetIndustry: form.targetIndustry || null,
      });
    },
    onSuccess: () => {
      setEditorOpen(false);
      // Editing an already-live offer leaves the published version stale until
      // it is republished — prompt for it rather than saving silently.
      if (editingOffer && editingOffer.status === 'active') {
        setRepublishPrompt({ id: editingOffer.id, name: form.name });
      } else {
        showToast(`Saved "${form.name}"`);
      }
      refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (o: LoyaltyOffer) => { await deleteOffer(tenantId, environment, o.id, o.name); },
    onSuccess: () => { showToast('Deleted'); refetch(); },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => { await clearAllOffers(tenantId, environment); },
    onSuccess: () => { setConfirmClearOpen(false); showToast('Cleared all offers'); refetch(); },
  });

  // ── Bulk actions ──────────────────────────────────────────────────
  const bulkStatusMutation = useMutation({
    mutationFn: (status: LoyaltyOffer['status']) =>
      setOffersStatus(tenantId, environment, [...selectedIds], status),
    onSuccess: (_d, status) => {
      showToast(status === 'active' ? `${selectedIds.size} offer(s) published — now Live` : `${selectedIds.size} offer(s) moved to ${status}`);
      clearSelection();
      refetch();
    },
    onError: (e: any) => showToast(e?.message || 'Bulk update failed'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => deleteOffers(tenantId, environment, [...selectedIds]),
    onSuccess: () => {
      showToast(`${selectedIds.size} offer(s) deleted`);
      setBulkDeleteOpen(false);
      clearSelection();
      refetch();
    },
    onError: (e: any) => showToast(e?.message || 'Bulk delete failed'),
  });

  // ── CTA Params helpers ────────────────────────────────────────────
  const addCta = () => {
    updateForm({ ctaParams: [...form.ctaParams, { id: generateId(), label: 'Shop Now', type: 'link', value: '', style: '' }] });
  };
  const updateCta = (id: string, patch: Partial<OfferCtaParam>) => {
    updateForm({ ctaParams: form.ctaParams.map(c => c.id === id ? { ...c, ...patch } : c) });
  };
  const removeCta = (id: string) => {
    updateForm({ ctaParams: form.ctaParams.filter(c => c.id !== id) });
  };

  // ── CSV Parsing ───────────────────────────────────────────────────
  const parseCsv = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) { setCsvErrors(['CSV must have a header row and at least one data row.']); setCsvParsed([]); return; }

    const headers = parseCsvLine(lines[0]);
    const requiredHeaders = ['name', 'offer_type', 'offer_value'];
    const missing = requiredHeaders.filter(h => !headers.includes(h));
    if (missing.length > 0) { setCsvErrors([`Missing required columns: ${missing.join(', ')}`]); setCsvParsed([]); return; }

    const rows: Record<string, string>[] = [];
    const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = parseCsvLine(lines[i]);
      if (vals.length !== headers.length) { errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${vals.length}`); continue; }
      const row: Record<string, string> = {};
      headers.forEach((h, j) => { row[h] = vals[j]; });
      if (!row.name?.trim()) { errors.push(`Row ${i + 1}: name is required`); continue; }
      rows.push(row);
    }
    setCsvParsed(rows);
    setCsvErrors(errors);
  };

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };

  const importCsv = async () => {
    if (csvParsed.length === 0) return;
    setImporting(true);
    let imported = 0;
    for (const row of csvParsed) {
      try {
        const ctaParams: OfferCtaParam[] = [];
        if (row.cta_label) {
          ctaParams.push({ id: generateId(), label: row.cta_label, type: (row.cta_type as OfferCtaParam['type']) || 'link', value: row.cta_value || '' });
        }
        await saveOffer({
          tenantId, environment,
          name: row.name,
          slug: row.slug || row.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          description: row.description || '',
          offerType: (row.offer_type as OfferType) || 'discount_percent',
          offerValue: Number(row.offer_value) || 0,
          minPurchase: row.min_purchase ? Number(row.min_purchase) : null,
          maxDiscount: row.max_discount ? Number(row.max_discount) : null,
          channel: row.channel || 'website',
          placement: row.placement || 'homepage',
          status: (row.status as LoyaltyOffer['status']) || 'draft',
          priority: Number(row.priority) || 50,
          stackingMode: (row.stacking_mode as 'exclusive' | 'stackable') || 'exclusive',
          startsAt: row.starts_at || null,
          endsAt: row.ends_at || null,
          tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
          imageUrl: row.image_url || null,
          termsAndConditions: row.terms || null,
          ctaParams,
          redemptionType: (row.redemption_type as LoyaltyOffer['redemptionType']) || 'auto',
          targetIndustry: row.target_industry || null,
          expectedLift: 0, marginImpact: 0, propensityWeight: 1,
        });
        imported++;
      } catch (e: any) {
        setCsvErrors(prev => [...prev, `Failed to import "${row.name}": ${e?.message || e?.details || String(e)}`]);
      }
    }
    setImporting(false);
    showToast(`Imported ${imported} of ${csvParsed.length} offers`);
    setCsvParsed([]);
    setCsvText('');
    refetch();
  };

  const downloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'marbee_offers_sample.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parseCsv(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Editor step config ────────────────────────────────────────────
  const editorSteps: { id: typeof editorStep; label: string; icon: typeof Gift }[] = [
    { id: 'details', label: 'Offer Details', icon: Gift },
    { id: 'media', label: 'Media & Visuals', icon: ImageIcon },
    { id: 'cta', label: 'CTA & Actions', icon: MousePointerClick },
    { id: 'eligibility', label: 'Eligibility', icon: Users },
    { id: 'rules', label: 'Rules & Budget', icon: Settings2 },
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-2xl border border-purple-300/40 bg-slate-950/95 backdrop-blur-md px-5 py-3.5 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5 ring-1 ring-white/10">
          <CheckCircle2 className="h-4 w-4 text-purple-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/80 bg-gradient-to-r from-slate-950 via-purple-950 to-indigo-950 p-6 sm:p-8 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300 backdrop-blur-md">
              <Gift className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
              <span>Omnichannel Offer Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Offers & Promotions
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-purple-200/80 leading-relaxed">
              Create, configure, and manage personalized offers with rich media, CTAs, eligibility rules, and budget controls — across every channel and industry.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-center text-center">
            <div>
              <p className="text-2xl font-black text-white">{stats.active}</p>
              <p className="text-[10px] text-purple-300 font-bold uppercase">Live</p>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div>
              <p className="text-2xl font-black text-emerald-400">{formatNumber(stats.redemptions)}</p>
              <p className="text-[10px] text-purple-300 font-bold uppercase">Redeemed</p>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div>
              <p className="text-2xl font-black text-amber-400">{stats.total}</p>
              <p className="text-[10px] text-purple-300 font-bold uppercase">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PAGE TABS ═══ */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/90 pb-2">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setPageTab('offers')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${pageTab === 'offers' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Gift className="h-4 w-4" /> Offers {offers.length > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${pageTab === 'offers' ? 'bg-white/20' : 'bg-slate-200'}`}>{offers.length}</span>}
          </button>
          <button type="button" onClick={() => setPageTab('bulk_import')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${pageTab === 'bulk_import' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}>
            <FileSpreadsheet className="h-4 w-4" /> Bulk Import
          </button>
          <button type="button" onClick={() => setPageTab('logs')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${pageTab === 'logs' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}>
            <History className="h-4 w-4" /> Activity Log
          </button>
        </div>
        <div className="flex items-center gap-2">
          {pageTab === 'offers' && offers.length > 0 && (
            <Button onClick={() => setConfirmClearOpen(true)} variant="ghost"
              className="text-rose-600 hover:bg-rose-50 font-bold text-xs h-8 px-3 rounded-xl border border-rose-200">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear All
            </Button>
          )}
          <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Offer
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
           TAB: OFFERS
         ═══════════════════════════════════════════════════════════════ */}
      {pageTab === 'offers' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(['all', 'active', 'draft', 'scheduled', 'paused', 'expired'] as const).map(st => (
                <button key={st} type="button" onClick={() => setStatusFilter(st)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 ${statusFilter === st ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {st === 'all'
                    ? `All (${offers.length})`
                    : `${offerStatusMeta(st).label} (${offers.filter(o => o.status === st).length})`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium">
                <option value="all">All Types</option>
                {Object.entries(OFFER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search offers..." className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs" />
              </div>
              {/* Sort key + direction toggle */}
              <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden">
                <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                  className="h-9 border-0 bg-transparent px-2.5 text-xs font-medium focus:outline-hidden">
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button type="button" onClick={toggleSortDir}
                  title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
                  className="border-l border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition">
                  {sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden">
                <button type="button" onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}><Grid3X3 className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}><LayoutList className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>

          {/* Republish prompt — live offers edited since they were published */}
          {(() => {
            const stale = offers.filter(needsRepublish);
            if (stale.length === 0) return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-bold text-amber-900">
                      {stale.length} live offer{stale.length === 1 ? ' has' : 's have'} unpublished changes
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Edits are saved but not yet pushed to the live surfaces — republish to apply them.
                      <span className="ml-1 font-semibold">{stale.slice(0, 3).map(o => o.name).join(', ')}{stale.length > 3 ? ` +${stale.length - 3} more` : ''}</span>
                    </p>
                  </div>
                </div>
                <button type="button" disabled={bulkStatusMutation.isPending}
                  onClick={() => {
                    setSelectedIds(new Set(stale.map(o => o.id)));
                    bulkStatusMutation.mutate('active');
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700 disabled:opacity-50">
                  <Rocket className="h-3.5 w-3.5" />
                  Republish {stale.length === 1 ? '' : `all ${stale.length}`}
                </button>
              </div>
            );
          })()}

          {/* Bulk selection bar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-2.5 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-3 text-xs font-bold text-purple-900">
                <button type="button" onClick={clearSelection} title="Clear selection"
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-purple-500 hover:bg-purple-100 transition">
                  <X className="h-4 w-4" />
                </button>
                <span>{selectedIds.size} selected</span>
                {!allOnPageSelected && (
                  <button type="button" onClick={toggleAllOnPage} className="font-bold text-purple-600 hover:underline">
                    Select all {pagedIds.length} on this page
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={bulkStatusMutation.isPending}
                  onClick={() => bulkStatusMutation.mutate('draft')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50">
                  Unpublish
                </button>
                <button type="button" disabled={bulkStatusMutation.isPending}
                  onClick={() => bulkStatusMutation.mutate('active')}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50">
                  <Rocket className="h-3.5 w-3.5" />
                  {bulkStatusMutation.isPending ? 'Publishing…' : `Publish ${selectedIds.size}`}
                </button>
                <button type="button" disabled={bulkDeleteMutation.isPending}
                  onClick={() => setBulkDeleteOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> Delete {selectedIds.size}
                </button>
              </div>
            </div>
          )}

          {/* Offer Cards or List */}
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 font-medium animate-pulse">Loading offers...</div>
          ) : filtered.length > 0 ? (
            <>
            {viewMode === 'grid' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paged.map(offer => (
                  <OfferCard key={offer.id} offer={offer} selected={selectedIds.has(offer.id)} onToggleSelect={toggleId}
                    onEdit={openEdit} onDelete={o => deleteMutation.mutate(o)} onPreview={setPreviewOpen} onShowEligible={setEligibilityPreviewFor} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="w-10 py-3 pl-4 pr-1">
                          <input type="checkbox" checked={allOnPageSelected}
                            ref={el => { if (el) el.indeterminate = selectedOnPage.length > 0 && !allOnPageSelected; }}
                            onChange={toggleAllOnPage}
                            className="h-3.5 w-3.5 cursor-pointer accent-purple-600"
                            title={allOnPageSelected ? 'Clear selection' : 'Select all on page'} />
                        </th>
                        <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Offer</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Type</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Value</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Status</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Channel</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Redeemed</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Expires</th>
                        <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase text-[10px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map(offer => (
                        <tr key={offer.id} className={`border-b border-slate-50 ${selectedIds.has(offer.id) ? 'bg-purple-50/60' : 'hover:bg-slate-50/50'}`}>
                          <td className="py-2.5 pl-4 pr-1">
                            <input type="checkbox" checked={selectedIds.has(offer.id)} onChange={() => toggleId(offer.id)}
                              className="h-3.5 w-3.5 cursor-pointer accent-purple-600" />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {offer.imageUrl ? (
                                <img src={offer.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover border border-slate-200" />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 shrink-0"><Gift className="h-3.5 w-3.5" /></div>
                              )}
                              <div>
                                <p className="font-bold text-slate-900">{offer.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{offer.slug}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5"><span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">{OFFER_TYPE_LABELS[offer.offerType] || offer.offerType}</span></td>
                          <td className="px-4 py-2.5 font-mono font-bold text-purple-700">{formatOfferValue(offer)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${offerStatusMeta(offer.status).chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${offerStatusMeta(offer.status).dot}`} />
                              {offerStatusMeta(offer.status).label}
                            </span>
                            {needsRepublish(offer) && (
                              <span className="mt-1 flex items-center gap-1 text-[9px] font-bold text-amber-700"><AlertTriangle className="h-2.5 w-2.5" /> unpublished edits</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {offerChannelLabel(offer.channel)}
                            <span className="block text-[10px] text-slate-400">{offerPlacementLabel(offer.placement)}</span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-emerald-700">{formatNumber(offer.redemptionCount)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{offer.endsAt ? new Date(offer.endsAt).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" onClick={() => setEligibilityPreviewFor(offer)} title="Eligible customers" className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><Users className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => setPreviewOpen(offer)} className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-purple-50 hover:text-purple-600"><Eye className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => openEdit(offer)} className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => deleteMutation.mutate(offer)} className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination — 50 per page */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] font-medium text-slate-500">
                Showing <strong className="text-slate-800">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</strong> of{' '}
                <strong className="text-slate-800">{filtered.length}</strong> offers
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="px-2 text-xs font-bold text-slate-600 tabular-nums">
                    Page {currentPage} / {pageCount}
                  </span>
                  <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            </>
          ) : (
            <Card className="p-12 text-center space-y-3">
              <Gift className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900">No Offers Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">Create your first personalized offer or bulk import from a CSV file.</p>
              <div className="flex items-center justify-center gap-2">
                <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create Offer</Button>
                <Button onClick={() => setPageTab('bulk_import')} variant="secondary" className="font-bold text-xs h-9 px-4 rounded-xl"><FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Bulk Import</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           TAB: BULK IMPORT
         ═══════════════════════════════════════════════════════════════ */}
      {pageTab === 'logs' && (
        <OfferActivityLog tenantId={tenantId} environment={environment} />
      )}

      {pageTab === 'bulk_import' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Instructions */}
          <div className="rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-indigo-600" /> Bulk Create Offers via CSV
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Upload a CSV file or paste CSV content to create multiple offers at once. Download the sample CSV to see all supported columns including images, CTAs, terms, and industry targeting.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={downloadSampleCsv} variant="secondary" className="font-bold text-xs h-9 px-4 rounded-xl">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download Sample CSV
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} variant="secondary" className="font-bold text-xs h-9 px-4 rounded-xl">
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload CSV File
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
            </div>
          </div>

          {/* CSV Input */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700">Paste CSV Content</label>
            <textarea value={csvText} onChange={e => { setCsvText(e.target.value); if (e.target.value.trim()) parseCsv(e.target.value); else { setCsvParsed([]); setCsvErrors([]); } }}
              rows={10} placeholder="name,slug,offer_type,offer_value,min_purchase,max_discount,channel,placement,status,..."
              className="w-full rounded-2xl border border-slate-200 p-4 text-xs font-mono focus:border-purple-400 focus:outline-hidden" />
          </div>

          {/* Errors */}
          {csvErrors.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-1">
              <p className="text-xs font-bold text-rose-800 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Validation Issues</p>
              {csvErrors.map((e, i) => <p key={i} className="text-xs text-rose-700">{e}</p>)}
            </div>
          )}

          {/* Preview */}
          {csvParsed.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">{csvParsed.length} Offers Ready to Import</h4>
                <Button onClick={importCsv} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs">
                  {importing ? 'Importing...' : `Import ${csvParsed.length} Offers`}
                </Button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">#</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">Name</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">Type</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">Value</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">Channel</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">Status</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">CTA</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 text-[10px]">Industry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvParsed.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">{row.name}</td>
                          <td className="px-3 py-2"><span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">{row.offer_type}</span></td>
                          <td className="px-3 py-2 font-mono font-bold text-purple-700">{row.offer_value}</td>
                          <td className="px-3 py-2 uppercase text-slate-600">{row.channel || 'website'}</td>
                          <td className="px-3 py-2">{row.status || 'draft'}</td>
                          <td className="px-3 py-2">{row.cta_label || '—'}</td>
                          <td className="px-3 py-2">{row.target_industry || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvParsed.length > 20 && <p className="px-3 py-2 text-xs text-slate-400">...and {csvParsed.length - 20} more rows</p>}
              </div>
            </div>
          )}

          {/* Supported Columns Reference */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-3">
            <h4 className="text-xs font-bold text-slate-700">Supported CSV Columns</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px]">
              {[
                { col: 'name *', desc: 'Offer name' },
                { col: 'slug', desc: 'URL-safe identifier' },
                { col: 'offer_type *', desc: 'discount_percent, discount_fixed, bogo, etc.' },
                { col: 'offer_value *', desc: 'Numeric value' },
                { col: 'min_purchase', desc: 'Minimum order amount' },
                { col: 'max_discount', desc: 'Discount cap' },
                { col: 'channel', desc: 'all, email, whatsapp, sms, web, pos' },
                { col: 'placement', desc: 'checkout, homepage, cart, email, etc.' },
                { col: 'status', desc: 'draft, active, scheduled, paused' },
                { col: 'starts_at', desc: 'Start date (YYYY-MM-DD)' },
                { col: 'ends_at', desc: 'End date (YYYY-MM-DD)' },
                { col: 'description', desc: 'Offer description' },
                { col: 'tags', desc: 'Comma-separated tags' },
                { col: 'image_url', desc: 'Hero image URL' },
                { col: 'cta_label', desc: 'CTA button text' },
                { col: 'cta_type', desc: 'link, button, deeplink, coupon_code' },
                { col: 'cta_value', desc: 'CTA destination URL or code' },
                { col: 'redemption_type', desc: 'auto, code, link, manual' },
                { col: 'terms', desc: 'Terms & conditions' },
                { col: 'target_industry', desc: 'Industry vertical' },
              ].map(c => (
                <div key={c.col} className="rounded-xl bg-white p-2 border border-slate-200">
                  <p className="font-bold text-slate-900 font-mono">{c.col}</p>
                  <p className="text-slate-500">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           OFFER PREVIEW MODAL
         ═══════════════════════════════════════════════════════════════ */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Preview Image */}
            {previewOpen.imageUrl ? (
              <div className="relative h-48 w-full bg-slate-100">
                <img src={previewOpen.imageUrl} alt={previewOpen.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <span className="rounded-lg bg-purple-600 px-2.5 py-1 text-xs font-black text-white">{formatOfferValue(previewOpen)}</span>
                  <h3 className="text-lg font-black text-white mt-1">{previewOpen.name}</h3>
                </div>
              </div>
            ) : (
              <div className="relative h-36 w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 flex items-center justify-center">
                <Gift className="h-12 w-12 text-white/40" />
                <div className="absolute bottom-4 left-4 right-4">
                  <span className="rounded-lg bg-white/20 backdrop-blur-sm px-2.5 py-1 text-xs font-black text-white">{formatOfferValue(previewOpen)}</span>
                  <h3 className="text-lg font-black text-white mt-1">{previewOpen.name}</h3>
                </div>
              </div>
            )}

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${offerStatusMeta(previewOpen.status).chip}`}><span className={`h-1.5 w-1.5 rounded-full ${offerStatusMeta(previewOpen.status).dot}`} />{offerStatusMeta(previewOpen.status).label}</span>
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">{OFFER_TYPE_LABELS[previewOpen.offerType]}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase">{previewOpen.channel}</span>
                {previewOpen.targetIndustry && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">{previewOpen.targetIndustry}</span>}
              </div>

              {previewOpen.description && <p className="text-xs text-slate-600 leading-relaxed">{previewOpen.description}</p>}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl bg-slate-50 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Min Purchase</span>
                  <p className="font-bold text-slate-800">₹{previewOpen.minPurchase ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Max Discount</span>
                  <p className="font-bold text-slate-800">{previewOpen.maxDiscount ? `₹${previewOpen.maxDiscount}` : 'Unlimited'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Priority</span>
                  <p className="font-bold text-slate-800">{previewOpen.priority}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Stacking</span>
                  <p className="font-bold text-slate-800 capitalize">{previewOpen.stackingMode}</p>
                </div>
              </div>

              {/* CTAs */}
              {previewOpen.ctaParams && previewOpen.ctaParams.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Call to Action</span>
                  <div className="flex flex-wrap gap-2">
                    {previewOpen.ctaParams.map(cta => (
                      <div key={cta.id} className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white">
                        <MousePointerClick className="h-3.5 w-3.5" />
                        {cta.label}
                        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase">{cta.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewOpen.termsAndConditions && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Terms & Conditions</span>
                  <p>{previewOpen.termsAndConditions}</p>
                </div>
              )}

              {previewOpen.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {previewOpen.tags.map(t => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">#{t}</span>)}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[10px] text-slate-400">
                  {previewOpen.startsAt ? new Date(previewOpen.startsAt).toLocaleDateString() : '—'} → {previewOpen.endsAt ? new Date(previewOpen.endsAt).toLocaleDateString() : 'No expiry'}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setPreviewOpen(null); openEdit(previewOpen); }} className="font-bold text-xs h-8 px-3 rounded-xl"><Edit2 className="h-3 w-3 mr-1" /> Edit</Button>
                  <button type="button" onClick={() => setPreviewOpen(null)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           CONFIRM CLEAR ALL
         ═══════════════════════════════════════════════════════════════ */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"><AlertTriangle className="h-6 w-6" /></div>
            <h3 className="text-base font-bold text-slate-900">Clear All Offers?</h3>
            <p className="text-xs text-slate-500">This will permanently delete all {offers.length} offers. This cannot be undone.</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirmClearOpen(false)} className="font-bold text-xs h-9 px-4 rounded-xl">Cancel</Button>
              <Button onClick={() => clearAllMutation.mutate()} disabled={clearAllMutation.isPending} className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9 px-5 rounded-xl">
                {clearAllMutation.isPending ? 'Clearing...' : 'Yes, Delete All'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           REPUBLISH PROMPT (live offer was edited)
         ═══════════════════════════════════════════════════════════════ */}
      {republishPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-2xl animate-in zoom-in-95">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <Rocket className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Republish this offer?</h3>
              <p className="mt-1 text-xs text-slate-500">
                “{republishPrompt.name}” is <strong className="text-emerald-700">Live</strong>, and your changes are saved
                but <strong>not yet pushed</strong> to the surfaces it renders on. Republish to apply them now.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button variant="ghost" onClick={() => { setRepublishPrompt(null); showToast('Saved as unpublished changes'); }}
                className="h-9 rounded-xl px-4 text-xs font-bold">
                Later
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await setOffersStatus(tenantId, environment, [republishPrompt.id], 'active');
                    showToast(`Republished “${republishPrompt.name}” — changes are live`);
                  } catch (e: any) {
                    showToast(e?.message || 'Republish failed');
                  }
                  setRepublishPrompt(null);
                  refetch();
                }}
                className="h-9 rounded-xl bg-amber-600 px-5 text-xs font-bold text-white hover:bg-amber-700">
                Republish now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           ELIGIBLE CUSTOMERS DRAWER
         ═══════════════════════════════════════════════════════════════ */}
      {eligibilityPreviewFor && (
        <EligibleCustomersModal
          offer={eligibilityPreviewFor}
          tenantId={tenantId}
          environment={environment}
          onClose={() => setEligibilityPreviewFor(null)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════
           CONFIRM BULK DELETE
         ═══════════════════════════════════════════════════════════════ */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-2xl animate-in zoom-in-95">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"><AlertTriangle className="h-6 w-6" /></div>
            <h3 className="text-base font-bold text-slate-900">Delete {selectedIds.size} offer{selectedIds.size === 1 ? '' : 's'}?</h3>
            <p className="text-xs text-slate-500">This permanently removes the selected offers. This cannot be undone.</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} className="h-9 rounded-xl px-4 text-xs font-bold">Cancel</Button>
              <Button onClick={() => bulkDeleteMutation.mutate()} disabled={bulkDeleteMutation.isPending}
                className="h-9 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white hover:bg-rose-700">
                {bulkDeleteMutation.isPending ? 'Deleting…' : `Delete ${selectedIds.size}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           CREATE / EDIT OFFER MODAL (Multi-Step)
         ═══════════════════════════════════════════════════════════════ */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700"><Gift className="h-4 w-4" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{editingOffer ? 'Edit Offer' : 'Create New Offer'}</h3>
                  <p className="text-[11px] text-slate-500">Configure all aspects of your offer in one place.</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            {/* Step Navigation */}
            <div className="flex items-center gap-1 border-b border-slate-100 px-5 py-2 shrink-0 overflow-x-auto">
              {editorSteps.map((s, i) => {
                const Icon = s.icon;
                return (
                  <button key={s.id} type="button" onClick={() => setEditorStep(s.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 ${editorStep === s.id ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-100'}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Step Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* ── Step 1: Details ── */}
              {editorStep === 'details' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Offer Name *</label>
                      <input value={form.name} onChange={e => updateForm({ name: e.target.value })}
                        placeholder="e.g. VIP Platinum 25% Flash" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Slug</label>
                      <input value={form.slug} onChange={e => updateForm({ slug: e.target.value })}
                        placeholder="auto-generated from name" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Description</label>
                    <textarea value={form.description} onChange={e => updateForm({ description: e.target.value })}
                      placeholder="Offer details, customer messaging, terms..." rows={2} className="w-full rounded-xl border border-slate-200 p-2.5 text-xs" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Offer Type</label>
                      <select value={form.offerType} onChange={e => updateForm({ offerType: e.target.value as OfferType })}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium">
                        {Object.entries(OFFER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Value</label>
                      <input type="number" value={form.offerValue} onChange={e => updateForm({ offerValue: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Status</label>
                      <select value={form.status} onChange={e => updateForm({ status: e.target.value as LoyaltyOffer['status'] })}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                        <option value="draft">Draft</option>
                        <option value="active">Live (published)</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="paused">Paused</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Min Purchase (₹)</label>
                      <input type="number" value={form.minPurchase} onChange={e => updateForm({ minPurchase: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Max Discount (₹)</label>
                      <input type="number" value={form.maxDiscount} onChange={e => updateForm({ maxDiscount: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Priority (1-100)</label>
                      <input type="number" min={1} max={100} value={form.priority} onChange={e => updateForm({ priority: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Surface / Channel</label>
                      <select value={form.channel}
                        onChange={e => {
                          const channel = e.target.value;
                          // keep placement valid for the newly chosen surface
                          const allowed = placementOptionsForChannel(channel).map(o => o.value);
                          updateForm({
                            channel,
                            placement: allowed.includes(form.placement) ? form.placement : (allowed[1] ?? 'any'),
                          });
                        }}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                        {OFFER_CHANNEL_GROUPS.map(g => (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Placement</label>
                      <select value={form.placement} onChange={e => updateForm({ placement: e.target.value })}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                        {placementOptionsForChannel(form.channel).map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Starts At</label>
                      <input type="date" value={form.startsAt} onChange={e => updateForm({ startsAt: e.target.value })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Ends At</label>
                      <input type="date" value={form.endsAt} onChange={e => updateForm({ endsAt: e.target.value })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Target Industry</label>
                      <select value={form.targetIndustry} onChange={e => updateForm({ targetIndustry: e.target.value })}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                        <option value="">All Industries</option>
                        {INDUSTRY_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Tags (comma separated)</label>
                      <input value={form.tags} onChange={e => updateForm({ tags: e.target.value })}
                        placeholder="seasonal, vip, flash" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 2: Media & Visuals ── */}
              {editorStep === 'media' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-1">
                    <p className="text-xs font-bold text-indigo-800 flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Offer Visuals</p>
                    <p className="text-[11px] text-indigo-700">Add hero images, thumbnails for card views, and branded visuals for omnichannel delivery.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Hero Image URL</label>
                    <input value={form.imageUrl} onChange={e => updateForm({ imageUrl: e.target.value })}
                      placeholder="https://cdn.example.com/offers/summer-sale.jpg" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                  </div>

                  {form.imageUrl && (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                      <img src={form.imageUrl} alt="Preview" className="w-full h-48 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Thumbnail URL (optional — for card/list views)</label>
                    <input value={form.thumbnailUrl} onChange={e => updateForm({ thumbnailUrl: e.target.value })}
                      placeholder="https://cdn.example.com/offers/summer-sale-thumb.jpg" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                  </div>

                  {form.thumbnailUrl && (
                    <div className="flex items-center gap-3">
                      <img src={form.thumbnailUrl} alt="Thumbnail" className="h-16 w-16 rounded-xl object-cover border border-slate-200" onError={e => (e.currentTarget.style.display = 'none')} />
                      <span className="text-xs text-slate-500">Thumbnail preview</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Terms & Conditions</label>
                    <textarea value={form.termsAndConditions} onChange={e => updateForm({ termsAndConditions: e.target.value })}
                      placeholder="Valid on orders above ₹500. Max discount ₹1000. Not combinable with other offers. One use per customer."
                      rows={3} className="w-full rounded-xl border border-slate-200 p-2.5 text-xs" />
                  </div>
                </div>
              )}

              {/* ── Step 3: CTA & Actions ── */}
              {editorStep === 'cta' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 space-y-1">
                    <p className="text-xs font-bold text-purple-800 flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Call-to-Action Parameters</p>
                    <p className="text-[11px] text-purple-700">Define the buttons, links, or deep links shown with this offer. Each CTA has a label, type, and destination.</p>
                  </div>

                  {form.ctaParams.map(cta => (
                    <div key={cta.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">CTA Action</span>
                        <button type="button" onClick={() => removeCta(cta.id)} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">Label</label>
                          <input value={cta.label} onChange={e => updateCta(cta.id, { label: e.target.value })}
                            placeholder="Shop Now" className="h-8 w-full rounded-xl border border-slate-200 px-2.5 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">Type</label>
                          <select value={cta.type} onChange={e => updateCta(cta.id, { type: e.target.value as OfferCtaParam['type'] })}
                            className="h-8 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs">
                            <option value="link">Web Link</option>
                            <option value="button">Button Action</option>
                            <option value="deeplink">Deep Link (App)</option>
                            <option value="coupon_code">Show Coupon Code</option>
                            <option value="custom">Custom</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">Value / URL</label>
                          <input value={cta.value} onChange={e => updateCta(cta.id, { value: e.target.value })}
                            placeholder={cta.type === 'deeplink' ? 'myapp://offers/123' : cta.type === 'coupon_code' ? 'SAVE20' : 'https://...'}
                            className="h-8 w-full rounded-xl border border-slate-200 px-2.5 text-xs font-mono" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Style / CSS Class (optional)</label>
                        <input value={cta.style || ''} onChange={e => updateCta(cta.id, { style: e.target.value })}
                          placeholder="e.g. primary, secondary, ghost, danger" className="h-8 w-full rounded-xl border border-slate-200 px-2.5 text-xs" />
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={addCta}
                    className="flex items-center gap-1.5 rounded-2xl border border-dashed border-purple-300 bg-purple-50/50 p-4 text-xs font-bold text-purple-700 hover:bg-purple-100/50 transition w-full justify-center">
                    <Plus className="h-3.5 w-3.5" /> Add CTA Parameter
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Redemption Type</label>
                      <select value={form.redemptionType} onChange={e => updateForm({ redemptionType: e.target.value as LoyaltyOffer['redemptionType'] })}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                        <option value="auto">Auto-apply at checkout</option>
                        <option value="code">Enter coupon code</option>
                        <option value="link">Click redemption link</option>
                        <option value="manual">Manual (staff applies)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Stacking</label>
                      <select value={form.stackingMode} onChange={e => updateForm({ stackingMode: e.target.value as 'exclusive' | 'stackable' })}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                        <option value="exclusive">Exclusive (one at a time)</option>
                        <option value="stackable">Stackable with others</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Redemption Instructions (optional)</label>
                    <textarea value={form.redemptionInstructions} onChange={e => updateForm({ redemptionInstructions: e.target.value })}
                      placeholder="e.g. Apply code at checkout. Valid once per customer."
                      rows={2} className="w-full rounded-xl border border-slate-200 p-2.5 text-xs" />
                  </div>
                </div>
              )}

              {/* ── Step 4: Rules & Budget ── */}
              {editorStep === 'eligibility' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Live reach meter */}
                  <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <Users className="h-3.5 w-3.5" /> Eligible customers
                        </p>
                        <p className="mt-0.5 text-[11px] text-emerald-700">
                          Live count of profiles matching this offer's criteria.
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black leading-none text-emerald-700 tabular-nums">
                          {countingReach ? '…' : formatNumber(eligibleCount ?? 0)}
                        </p>
                        <p className="text-[10px] font-bold text-emerald-600">
                          of {formatNumber(totalCustomers)} customers
                          {totalCustomers > 0 && !countingReach && (
                            <> · {Math.round(((eligibleCount ?? 0) / totalCustomers) * 100)}%</>
                          )}
                        </p>
                      </div>
                    </div>
                    {totalCustomers > 0 && (
                      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-emerald-200/70">
                        <div className="h-full rounded-full bg-emerald-600 transition-all"
                          style={{ width: `${Math.min(100, ((eligibleCount ?? 0) / totalCustomers) * 100)}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Audience + tier */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Audience segment</label>
                      <select value={eligibility.audienceId ?? ''} onChange={e => updateEligibility({ audienceId: e.target.value || null })}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                        <option value="">All customers (no segment)</option>
                        {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Required loyalty tier</label>
                      <input type="text" value={eligibility.requiredTierSlug ?? ''}
                        onChange={e => updateEligibility({ requiredTierSlug: e.target.value || null })}
                        placeholder="e.g. gold (blank = any tier)"
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                  </div>

                  {/* Rule builder */}
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-700">Eligibility criteria</p>
                      <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                        {(['all', 'any'] as const).map(m => (
                          <button key={m} type="button" onClick={() => updateEligibility({ match: m })}
                            className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${eligibility.match === m ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                            Match {m.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {eligibility.rules.length === 0 && (
                      <p className="py-2 text-center text-[11px] text-slate-400">
                        No criteria — every customer qualifies for this offer.
                      </p>
                    )}

                    {eligibility.rules.map((rule, i) => (
                      <div key={rule.id} className="flex items-center gap-1.5">
                        <span className="w-8 shrink-0 text-[10px] font-bold uppercase text-slate-400">
                          {i === 0 ? 'IF' : eligibility.match === 'all' ? 'AND' : 'OR'}
                        </span>
                        <select value={rule.field}
                          onChange={e => {
                            const field = e.target.value;
                            const ops = operatorsForField(field);
                            updateEligibility({
                              rules: eligibility.rules.map(r => r.id === rule.id
                                ? { ...r, field, operator: ops[0].value, value: '' } : r),
                            });
                          }}
                          className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px]">
                          {FIELD_GROUPS.map(g => (
                            <optgroup key={g} label={g}>
                              {ELIGIBILITY_FIELDS.filter(f => f.group === g).map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <select value={rule.operator}
                          onChange={e => updateEligibility({
                            rules: eligibility.rules.map(r => r.id === rule.id ? { ...r, operator: e.target.value as any } : r),
                          })}
                          className="h-8 w-28 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-[11px]">
                          {operatorsForField(rule.field).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {needsValue(rule.operator) && (
                          <input type="text" value={rule.value}
                            onChange={e => updateEligibility({
                              rules: eligibility.rules.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r),
                            })}
                            placeholder="value"
                            className="h-8 w-32 shrink-0 rounded-lg border border-slate-200 px-2 text-[11px]" />
                        )}
                        <button type="button"
                          onClick={() => updateEligibility({ rules: eligibility.rules.filter(r => r.id !== rule.id) })}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <button type="button"
                      onClick={() => updateEligibility({ rules: [...eligibility.rules, newRule()] })}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-purple-300 py-2 text-[11px] font-bold text-purple-700 transition hover:bg-purple-50">
                      <Plus className="h-3.5 w-3.5" /> Add criterion
                    </button>
                  </div>

                  {/* Plain-English summary */}
                  {(eligibility.rules.length > 0 || eligibility.requiredTierSlug || eligibility.audienceId) && (
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 text-[11px] text-indigo-900">
                      <p className="mb-1 font-bold">This offer is shown to customers where:</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {eligibility.audienceId && (
                          <li>they belong to <strong>{audiences.find(a => a.id === eligibility.audienceId)?.name ?? 'the selected segment'}</strong></li>
                        )}
                        {eligibility.requiredTierSlug && <li>loyalty tier is <strong>{eligibility.requiredTierSlug}</strong></li>}
                        {eligibility.rules.map(r => <li key={r.id}>{describeRule(r)}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {editorStep === 'rules' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-1">
                    <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Budget & Frequency Controls</p>
                    <p className="text-[11px] text-amber-700">Set spend limits, redemption caps, and frequency controls to protect your margin.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Total Budget (₹)</label>
                      <input type="number" value={form.budgetTotal} onChange={e => updateForm({ budgetTotal: Number(e.target.value) })}
                        placeholder="0 = unlimited" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Max Redemptions</label>
                      <input type="number" value={form.maxRedemptions} onChange={e => updateForm({ maxRedemptions: Number(e.target.value) })}
                        placeholder="0 = unlimited" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Cooldown (hours)</label>
                      <input type="number" value={form.frequencyCapHours} onChange={e => updateForm({ frequencyCapHours: Number(e.target.value) })}
                        placeholder="0 = no cooldown" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Expected Lift (%)</label>
                      <input type="number" step={0.1} value={form.expectedLift} onChange={e => updateForm({ expectedLift: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Margin Impact (%)</label>
                      <input type="number" step={0.1} value={form.marginImpact} onChange={e => updateForm({ marginImpact: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Propensity Weight</label>
                      <input type="number" step={0.1} min={0} max={5} value={form.propensityWeight} onChange={e => updateForm({ propensityWeight: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                  </div>

                  {/* Budget utilization preview */}
                  {editingOffer && editingOffer.budgetTotal && editingOffer.budgetTotal > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">Budget Utilization</span>
                        <span className="font-mono font-bold text-slate-800">₹{formatNumber(editingOffer.budgetSpent)} / ₹{formatNumber(editingOffer.budgetTotal)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${Math.min(100, (editingOffer.budgetSpent / editingOffer.budgetTotal) * 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-500">{Math.round((editingOffer.budgetSpent / editingOffer.budgetTotal) * 100)}% utilized · {formatNumber(editingOffer.redemptionCount)} redemptions</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 shrink-0">
              <div className="flex items-center gap-1.5">
                {editorSteps.map((s, i) => (
                  <div key={s.id} className={`h-1.5 w-6 rounded-full transition ${editorStep === s.id ? 'bg-purple-600' : 'bg-slate-200'}`} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {editorStep !== 'details' && (
                  <Button variant="ghost" onClick={() => {
                    const idx = editorSteps.findIndex(s => s.id === editorStep);
                    if (idx > 0) setEditorStep(editorSteps[idx - 1].id);
                  }} className="font-bold text-xs h-9 px-4 rounded-xl">Back</Button>
                )}
                {editorStep !== 'rules' ? (
                  <Button onClick={() => {
                    const idx = editorSteps.findIndex(s => s.id === editorStep);
                    if (idx < editorSteps.length - 1) setEditorStep(editorSteps[idx + 1].id);
                  }} className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-9 px-5 rounded-xl">
                    Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs">
                    {saveMutation.isPending ? 'Saving...' : 'Save Offer'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Offer Card Component ──────────────────────────────────────────
function OfferCard({ offer, selected, onToggleSelect, onEdit, onDelete, onPreview, onShowEligible }: {
  offer: LoyaltyOffer;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (o: LoyaltyOffer) => void;
  onDelete: (o: LoyaltyOffer) => void;
  onPreview: (o: LoyaltyOffer) => void;
  onShowEligible: (o: LoyaltyOffer) => void;
}) {
  const st = offerStatusMeta(offer.status);
  return (
    <div className={`group relative flex flex-col justify-between rounded-2xl border bg-white shadow-2xs transition overflow-hidden ${
      selected ? 'border-purple-400 ring-2 ring-purple-100' : 'border-slate-200/90 hover:border-purple-300 hover:shadow-md'
    }`}>
      {/* Select checkbox */}
      <div className="absolute left-2 top-2 z-10">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(offer.id)}
          className={`h-3.5 w-3.5 cursor-pointer accent-purple-600 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
      </div>

      {/* Image or gradient accent */}
      {offer.imageUrl ? (
        <div className="relative h-20 w-full bg-slate-100">
          <img src={offer.imageUrl} alt={offer.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-1.5 left-2.5">
            <span className="rounded-md bg-purple-600/90 px-1.5 py-0.5 font-mono text-[11px] font-black text-white backdrop-blur-sm">{formatOfferValue(offer)}</span>
          </div>
          <div className="absolute right-2 top-2">
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${st.chip}`}>{st.label}</span>
          </div>
        </div>
      ) : (
        <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500" />
      )}

      <div className="flex-1 space-y-2 p-3 pt-3.5">
        {!offer.imageUrl && (
          <div className="flex flex-wrap items-center gap-1.5 pl-5">
            <span className="rounded-md bg-purple-100 px-1.5 py-0.5 font-mono text-[11px] font-black text-purple-800">{formatOfferValue(offer)}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${st.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}
            </span>
          </div>
        )}

        <h3 className="truncate text-[13px] font-bold text-slate-900" title={offer.name}>{offer.name}</h3>
        {needsRepublish(offer) && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
            <AlertTriangle className="h-2.5 w-2.5" /> Unpublished changes
          </span>
        )}

        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-800">{OFFER_TYPE_LABELS[offer.offerType]}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{offerChannelLabel(offer.channel)}</span>
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">{offerPlacementLabel(offer.placement)}</span>
        </div>

        {offer.description && <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">{offer.description}</p>}

        <div className="grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2 text-center">
          <div>
            <p className="text-[9px] font-bold uppercase text-slate-400">Min</p>
            <p className="text-[11px] font-bold text-slate-700">₹{formatNumber(offer.minPurchase ?? 0)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase text-slate-400">Redeemed</p>
            <p className="text-[11px] font-black text-emerald-600">{formatNumber(offer.redemptionCount ?? 0)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase text-slate-400">Spent</p>
            <p className="text-[11px] font-black text-teal-600">₹{formatNumber(offer.budgetSpent ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-2.5 py-1.5">
        <span className="truncate text-[9px] text-slate-400">
          {offer.endsAt ? `Ends ${new Date(offer.endsAt).toLocaleDateString()}` : 'No expiry'}
        </span>
        <div className="flex items-center gap-0.5 opacity-70 transition group-hover:opacity-100">
          <button type="button" onClick={() => onShowEligible(offer)} className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Eligible customers"><Users className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onPreview(offer)} className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-purple-50 hover:text-purple-600" title="Preview"><Eye className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onEdit(offer)} className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit"><Edit2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onDelete(offer)} className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

// ── Eligible Customers Modal ──────────────────────────────────────
function EligibleCustomersModal({ offer, tenantId, environment, onClose }: {
  offer: LoyaltyOffer;
  tenantId: string;
  environment: string;
  onClose: () => void;
}) {
  const criteria = eligibilityFromOffer(offer);

  const { data: count, isLoading: loadingCount } = useQuery({
    queryKey: ['offer-eligible-count', offer.id, tenantId, environment],
    queryFn: () => countEligibleCustomers(tenantId, environment, criteria),
    enabled: Boolean(tenantId),
  });

  const { data: sample = [], isLoading: loadingSample } = useQuery({
    queryKey: ['offer-eligible-sample', offer.id, tenantId, environment],
    queryFn: () => fetchEligibleCustomers(tenantId, environment, criteria, 50),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Users className="h-4 w-4" /></div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Eligible customers</h3>
              <p className="text-[11px] text-slate-500">Who qualifies for “{offer.name}”</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
            <p className="text-3xl font-black leading-none text-emerald-700 tabular-nums">
              {loadingCount ? '…' : formatNumber(count ?? 0)}
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">customers eligible</p>
          </div>

          {/* Criteria summary */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 text-[11px] text-slate-700">
            <p className="mb-1.5 font-bold text-slate-800">Criteria</p>
            {criteria.rules.length === 0 && !criteria.requiredTierSlug && !criteria.audienceId ? (
              <p className="text-slate-500">Open to all customers — no eligibility criteria set.</p>
            ) : (
              <ul className="list-inside list-disc space-y-0.5">
                {criteria.audienceId && <li>In the selected audience segment</li>}
                {criteria.requiredTierSlug && <li>Loyalty tier is <strong>{criteria.requiredTierSlug}</strong></li>}
                {criteria.rules.map(r => <li key={r.id}>{describeRule(r)}</li>)}
              </ul>
            )}
            <p className="mt-2 text-[10px] text-slate-400">
              Matching {criteria.match === 'all' ? 'ALL' : 'ANY'} of the above.
            </p>
          </div>

          {/* Sample list → Customer 360 */}
          <div>
            <p className="mb-2 text-[11px] font-bold text-slate-700">
              Sample profiles {sample.length > 0 && <span className="font-normal text-slate-400">(first {sample.length})</span>}
            </p>
            {loadingSample ? (
              <p className="py-6 text-center text-xs text-slate-400">Loading…</p>
            ) : sample.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No customers match these criteria yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                {sample.map(c => (
                  <Link key={c.id} to={`/customers/${c.id}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">{c.name}</p>
                      <p className="truncate text-[10px] text-slate-400">{c.email ?? '—'}{c.city ? ` · ${c.city}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {c.loyaltyTier && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">{c.loyaltyTier}</span>}
                      {c.loyaltyPoints != null && <span className="font-mono text-[10px] font-bold text-slate-500">{formatNumber(c.loyaltyPoints)} pts</span>}
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Offer Activity / Audit Log ────────────────────────────────────
const OFFER_LOG_PAGE_SIZE = 25;

const LOG_ACTION_TONE: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-rose-100 text-rose-800',
  publish: 'bg-purple-100 text-purple-800',
  unpublish: 'bg-slate-200 text-slate-700',
};

function OfferActivityLog({ tenantId, environment }: { tenantId: string; environment: string }) {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logSortDir, setLogSortDir] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['offer-audit-logs', tenantId, environment, page, actionFilter, logSearch, logSortDir],
    queryFn: () => fetchAuditLogsPage({
      tenantId,
      environment,
      resourceType: 'loyalty_offer',
      actionFilter: actionFilter || undefined,
      search: logSearch || undefined,
      page,
      pageSize: OFFER_LOG_PAGE_SIZE,
      sortBy: 'created_at',
      sortDir: logSortDir,
    }),
    enabled: Boolean(tenantId),
  });

  useEffect(() => { setPage(1); }, [actionFilter, logSearch, logSortDir]);

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Retention notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
        <div className="flex items-start gap-2.5">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
          <div>
            <p className="text-xs font-bold text-indigo-900">Offer activity log</p>
            <p className="text-[11px] text-indigo-700">
              Every create, edit, publish and delete — who did it, what changed and when.
              Stored in <code className="rounded bg-white/70 px-1 font-mono">public.audit_logs</code> with a{' '}
              <strong>30-day retention</strong>, purged nightly at 03:00 UTC.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => refetch()} disabled={isFetching}
          className="shrink-0 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50">
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium">
            <option value="">All actions</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="publish">Published</option>
            <option value="unpublish">Unpublished</option>
            <option value="delete">Deleted</option>
          </select>
          <button type="button" onClick={() => setLogSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
            title={logSortDir === 'asc' ? 'Oldest first' : 'Newest first'}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
            {logSortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {logSortDir === 'asc' ? 'Oldest' : 'Newest'}
          </button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input type="text" value={logSearch} onChange={e => setLogSearch(e.target.value)}
            placeholder="Search offer name, user, summary…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs" />
        </div>
      </div>

      {/* Log list */}
      {isLoading ? (
        <div className="p-16 text-center text-sm text-slate-400 animate-pulse">Loading activity…</div>
      ) : logs.length === 0 ? (
        <Card className="p-12 text-center">
          <History className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-900">No activity yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Offer changes from the last 30 days will appear here.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="divide-y divide-slate-100">
            {logs.map(log => {
              const changes = ((log.metadata?.changes ?? []) as Array<{ field: string; from?: unknown; to?: unknown }>);
              return (
                <div key={log.id} className="flex items-start gap-3 p-3.5 hover:bg-slate-50/60">
                  <span className={`mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase ${LOG_ACTION_TONE[log.action] ?? 'bg-slate-100 text-slate-700'}`}>
                    {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900">
                      {(log.metadata?.resource_name as string) || 'Offer'}
                    </p>
                    {Boolean(log.metadata?.summary) && (
                      <p className="text-[11px] text-slate-500">{log.metadata.summary as string}</p>
                    )}
                    {changes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {changes.map((c, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                            <strong className="font-bold text-slate-800">{c.field}</strong>
                            <span className="text-rose-600 line-through">{String(c.from ?? '—').slice(0, 24)}</span>
                            <ArrowRight className="h-2.5 w-2.5 text-slate-400" />
                            <span className="text-emerald-700">{String(c.to ?? '—').slice(0, 24)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-bold text-slate-600">{auditActorLabel(log)}</p>
                    <p className="text-[10px] text-slate-400" title={new Date(log.created_at).toLocaleString()}>
                      {formatAuditTime(log.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-medium text-slate-500">
            Showing <strong className="text-slate-800">{(page - 1) * OFFER_LOG_PAGE_SIZE + 1}–{Math.min(page * OFFER_LOG_PAGE_SIZE, total)}</strong> of{' '}
            <strong className="text-slate-800">{total}</strong> entries
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="px-2 text-xs font-bold tabular-nums text-slate-600">Page {page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
