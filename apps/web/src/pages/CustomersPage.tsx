import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { PageHeader, Button, EmptyState, Badge } from '@/components/ui';
import { CustomerListCard } from '@/components/customers/CustomerListCard';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import { CustomerTestersPanel } from '@/components/customers/CustomerTestersPanel';
import {
  fetchCustomers,
  fetchCustomersCount,
  fetchCustomerFilterOptions,
  fetchCustomerListSummary,
  getCustomerDisplayName,
  type CustomerFilters,
} from '@/lib/customers';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 100;
import { useTenantScope } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Link, useSearchParams } from 'react-router-dom';
import { ACTIVE_JOURNEY_STATUSES } from '@/lib/customer-journeys';
import { formatSchemaDate } from '@/lib/schema-stats';
import { getCustomerTesterProfiles } from '@/lib/customer-testers';

export function CustomersPage() {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'testers' ? 'testers' : 'profiles';

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('table');
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<CustomerFilters>({});

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.status && filters.status !== 'all') c++;
    if (filters.loyaltyTier && filters.loyaltyTier !== 'all') c++;
    if (filters.country && filters.country !== 'all') c++;
    if (filters.city && filters.city !== 'all') c++;
    if (filters.consentEmail !== undefined) c++;
    if (filters.consentSms !== undefined) c++;
    if (filters.consentWebPush !== undefined) c++;
    if (filters.consentWhatsapp !== undefined) c++;
    if (filters.hasEmail !== undefined) c++;
    if (filters.hasPhone !== undefined) c++;
    if (filters.loyaltyMember !== undefined) c++;
    return c;
  }, [filters]);

  const clearFilters = () => { setFilters({}); setPage(0); };

  const updateFilter = <K extends keyof CustomerFilters>(key: K, value: CustomerFilters[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (value === undefined || value === 'all') delete next[key];
      return next;
    });
    setPage(0);
  };

  // Reset to the first page whenever the search query changes.
  useEffect(() => {
    setPage(0);
  }, [search]);

  const { data: filterOptions } = useQuery({
    queryKey: ['customer-filter-options', tenantId, environment],
    queryFn: () => fetchCustomerFilterOptions(tenantId, environment),
    enabled: activeTab === 'profiles',
    staleTime: 60_000,
  });

  const { data: customers = [], isLoading, isFetching } = useQuery({
    queryKey: ['customers', tenantId, environment, search, page, filters],
    queryFn: () => fetchCustomers(tenantId, environment, search, PAGE_SIZE, page, filters),
    enabled: activeTab === 'profiles',
    placeholderData: keepPreviousData,
  });

  const { data: totalCount = 0 } = useQuery({
    queryKey: ['customers-count', tenantId, environment, search, filters],
    queryFn: () => fetchCustomersCount(tenantId, environment, search, filters),
    enabled: activeTab === 'profiles',
    placeholderData: keepPreviousData,
  });

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = page * PAGE_SIZE + customers.length;

  // Listen for real-time customer upsert events from RTM identity resolution
  useEffect(() => {
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customers-count'] });
      void queryClient.invalidateQueries({ queryKey: ['customers-summary'] });
    };
    window.addEventListener('marbee_customer_upserted', handler);
    return () => window.removeEventListener('marbee_customer_upserted', handler);
  }, [queryClient]);

  // If the result set shrinks (e.g. after a search) and the current page is
  // now out of range, snap back to the last valid page.
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const { data: summary } = useQuery({
    queryKey: ['customers-summary', tenantId, environment],
    queryFn: () => fetchCustomerListSummary(tenantId, environment),
    enabled: activeTab === 'profiles',
  });

  const testers = useMemo(() => getCustomerTesterProfiles(tenantId), [tenantId]);

  const { data: eventCounts } = useQuery({
    queryKey: ['customer-event-counts', tenantId, environment, customers.map((c) => c.id).join(',')],
    queryFn: async () => {
      const ids = customers.map((c) => c.id);
      if (!ids.length) return new Map<string, number>();
      const { data } = await supabase
        .from('events')
        .select('customer_id')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .in('customer_id', ids);
      const map = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.customer_id) map.set(row.customer_id, (map.get(row.customer_id) ?? 0) + 1);
      }
      return map;
    },
    enabled: activeTab === 'profiles' && customers.length > 0,
  });

  const { data: lastActivityMap } = useQuery({
    queryKey: ['customer-last-activity', tenantId, environment, customers.map((c) => c.id).join(',')],
    queryFn: async () => {
      const ids = customers.map((c) => c.id);
      if (!ids.length) return new Map<string, string>();
      const { data } = await supabase
        .from('events')
        .select('customer_id, timestamp')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .in('customer_id', ids)
        .order('timestamp', { ascending: false });
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.customer_id && !map.has(row.customer_id)) {
          map.set(row.customer_id, row.timestamp);
        }
      }
      return map;
    },
    enabled: activeTab === 'profiles' && customers.length > 0,
  });

  const { data: journeyMap } = useQuery({
    queryKey: ['customer-active-journeys', tenantId, environment, customers.map((c) => c.id).join(',')],
    queryFn: async () => {
      const ids = customers.map((c) => c.id);
      if (!ids.length) return new Map<string, { count: number; names: string[] }>();
      const { data } = await supabase
        .from('journey_instances')
        .select('customer_id, status, journeys(name)')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .in('customer_id', ids)
        .in('status', [...ACTIVE_JOURNEY_STATUSES]);
      const map = new Map<string, { count: number; names: string[] }>();
      for (const row of data ?? []) {
        if (!row.customer_id) continue;
        const entry = map.get(row.customer_id) ?? { count: 0, names: [] };
        entry.count += 1;
        const journey = Array.isArray(row.journeys) ? row.journeys[0] : row.journeys;
        if (journey?.name) entry.names.push(journey.name);
        map.set(row.customer_id, entry);
      }
      return map;
    },
    enabled: activeTab === 'profiles' && customers.length > 0,
  });

  const stats = useMemo(
    () => [
      { label: 'Total profiles', value: summary?.total ?? 0, icon: Users, color: 'text-brand-600 bg-brand-50' },
      { label: 'Active', value: summary?.active ?? 0, icon: Sparkles, color: 'text-emerald-600 bg-emerald-50' },
      { label: 'Active this week', value: summary?.withEvents ?? 0, icon: Activity, color: 'text-violet-600 bg-violet-50' },
    ],
    [summary],
  );

  return (
    <div className="space-y-6">
      {showAdd && (
        <AddCustomerModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['customers-summary'] });
            setShowAdd(false);
          }}
        />
      )}

      <PageHeader
        title="Customer Profiles & 360°"
        description="Unified identity, behavior, location, loyalty, and template testing profiles."
        action={
          <div className="flex items-center gap-2">
            {activeTab === 'profiles' && (
              <Button onClick={() => setShowAdd(true)} className="rounded-xl shadow-xs font-semibold">
                <Plus className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            )}
          </div>
        }
      />

      {/* TOP NAVIGATION TAB SWITCHER */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'profiles' })}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === 'profiles'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>All Customer Profiles</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              activeTab === 'profiles' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {summary?.total ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'testers' })}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === 'testers'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Testers & Dummy Profiles</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              activeTab === 'testers' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
            }`}
          >
            {testers.length}
          </span>
        </button>
      </div>

      {activeTab === 'testers' ? (
        /* TAB 2: TESTERS DUMMY PROFILES MANAGEMENT */
        <CustomerTestersPanel />
      ) : (
        /* TAB 1: ALL CUSTOMER PROFILES */
        <>
          {/* Stats Ribbon */}
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-black tabular-nums text-slate-900">{stat.value}</p>
                    <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Search Toolbar & View Switcher */}
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="relative min-w-[240px] flex-1 max-w-lg">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Search customers by name, email, phone, city…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-xs font-medium focus:bg-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition',
                    showFilters || activeFilterCount > 0
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="bg-indigo-600 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none">{activeFilterCount}</span>
                  )}
                  <ChevronDown className={cn('h-3 w-3 transition-transform', showFilters && 'rotate-180')} />
                </button>

                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium">
                    <RotateCcw className="h-3 w-3" /> Clear all
                  </button>
                )}

                <span className="text-xs text-slate-500 font-medium tabular-nums">
                  {totalCount > 0 ? (
                    <>
                      Showing <span className="font-bold text-slate-700">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}</span> of{' '}
                      {totalCount.toLocaleString()}
                    </>
                  ) : (
                    '0 customers'
                  )}
                  {isFetching && <span className="ml-2 text-slate-400">Loading…</span>}
                </span>

                <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setView('table')}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      view === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                    aria-label="Table view"
                  >
                    <List className="h-3.5 w-3.5" />
                    <span>Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('grid')}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      view === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Cards</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Advanced Filters Panel */}
            {showFilters && (
              <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/50 rounded-b-2xl">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Status */}
                  <FilterSelect
                    label="Status"
                    value={filters.status ?? 'all'}
                    onChange={(v) => updateFilter('status', v)}
                    options={[
                      { value: 'all', label: 'All statuses' },
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                      { value: 'prospect', label: 'Prospect' },
                      { value: 'blocked', label: 'Blocked' },
                    ]}
                  />

                  {/* Country */}
                  <FilterSelect
                    label="Country"
                    value={filters.country ?? 'all'}
                    onChange={(v) => updateFilter('country', v)}
                    options={[
                      { value: 'all', label: 'All countries' },
                      ...(filterOptions?.countries ?? []).map((c) => ({ value: c, label: c })),
                    ]}
                  />

                  {/* City */}
                  <FilterSelect
                    label="City"
                    value={filters.city ?? 'all'}
                    onChange={(v) => updateFilter('city', v)}
                    options={[
                      { value: 'all', label: 'All cities' },
                      ...(filterOptions?.cities ?? []).map((c) => ({ value: c, label: c })),
                    ]}
                  />

                  {/* Loyalty Tier */}
                  <FilterSelect
                    label="Loyalty tier"
                    value={filters.loyaltyTier ?? 'all'}
                    onChange={(v) => updateFilter('loyaltyTier', v)}
                    options={[
                      { value: 'all', label: 'All tiers' },
                      ...(filterOptions?.loyaltyTiers ?? []).map((t) => ({ value: t.slug, label: t.name })),
                    ]}
                  />
                </div>

                {/* Toggle filters */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ToggleChip label="Has email" active={filters.hasEmail === true} onClick={() => updateFilter('hasEmail', filters.hasEmail === true ? undefined : true)} />
                  <ToggleChip label="Has phone" active={filters.hasPhone === true} onClick={() => updateFilter('hasPhone', filters.hasPhone === true ? undefined : true)} />
                  <ToggleChip label="Loyalty member" active={filters.loyaltyMember === true} onClick={() => updateFilter('loyaltyMember', filters.loyaltyMember === true ? undefined : true)} />
                  <span className="w-px h-5 bg-slate-200 self-center mx-1" />
                  <ToggleChip label="Email consent" active={filters.consentEmail === true} onClick={() => updateFilter('consentEmail', filters.consentEmail === true ? undefined : true)} />
                  <ToggleChip label="SMS consent" active={filters.consentSms === true} onClick={() => updateFilter('consentSms', filters.consentSms === true ? undefined : true)} />
                  <ToggleChip label="Push consent" active={filters.consentWebPush === true} onClick={() => updateFilter('consentWebPush', filters.consentWebPush === true ? undefined : true)} />
                  <ToggleChip label="WhatsApp consent" active={filters.consentWhatsapp === true} onClick={() => updateFilter('consentWhatsapp', filters.consentWhatsapp === true ? undefined : true)} />
                </div>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-slate-400 font-medium animate-pulse">
              Loading customer profiles…
            </div>
          ) : !customers.length ? (
            <EmptyState
              title="No customer profiles found"
              description={
                search
                  ? 'No profiles match your search query.'
                  : 'Create customer profiles to begin orchestrating omnichannel journeys.'
              }
              action={
                <Button onClick={() => setShowAdd(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Customer
                </Button>
              }
            />
          ) : view === 'grid' ? (
            /* Cards Grid View */
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {customers.map((c) => (
                <CustomerListCard
                  key={c.id}
                  customer={c}
                  eventCount={eventCounts?.get(c.id) ?? 0}
                  lastActivity={lastActivityMap?.get(c.id)}
                  activeJourneyCount={journeyMap?.get(c.id)?.count ?? 0}
                  journeyNames={journeyMap?.get(c.id)?.names ?? []}
                />
              ))}
            </div>
          ) : (
            /* High-Clarity Responsive Table View */
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="px-5 py-4 min-w-[220px]">Customer Identity</th>
                      <th className="px-4 py-4 min-w-[200px]">Contact Info</th>
                      <th className="px-4 py-4 min-w-[140px]">Location</th>
                      <th className="px-4 py-4 min-w-[120px]">Loyalty</th>
                      <th className="px-4 py-4 min-w-[100px] text-center">Events</th>
                      <th className="px-4 py-4 min-w-[130px]">Journeys</th>
                      <th className="px-4 py-4 min-w-[120px]">Last Seen</th>
                      <th className="px-4 py-4 min-w-[100px]">Source</th>
                      <th className="px-5 py-4 text-right min-w-[120px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customers.map((c) => {
                      const displayName = getCustomerDisplayName(c);
                      const initials = displayName
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase() || 'C';

                      const locationStr = [c.city, c.state, c.country].filter(Boolean).join(', ');

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/80 transition group">
                          {/* Identity */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-700 text-xs shadow-2xs">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  to={`/customers/${c.id}`}
                                  className="font-bold text-slate-900 text-xs hover:text-brand-600 transition block truncate"
                                >
                                  {displayName}
                                </Link>
                                <p className="font-mono text-[10px] text-slate-400">
                                  ID: {c.id.slice(0, 8)}…
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Contact Info */}
                          <td className="px-4 py-4 space-y-1">
                            <div className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px]">
                              <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate">{c.email ?? 'No email'}</span>
                            </div>
                            {c.mobile && (
                              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                {String(c.mobile).includes('@') ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-rose-50 text-rose-700 px-1.5 py-0.5 border border-rose-200" title="Data Anomaly: Email string stored in phone number column">
                                    <span>{c.mobile}</span>
                                    <span className="text-[8px] font-black uppercase text-rose-800">(Email in phone)</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500">{c.mobile}</span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Location */}
                          <td className="px-4 py-4">
                            {locationStr ? (
                              <div className="flex items-center gap-1.5 text-slate-700 text-[11px]">
                                <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[140px]">{locationStr}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          {/* Loyalty */}
                          <td className="px-4 py-4">
                            {c.loyalty_tier_name ? (
                              <div>
                                <Badge variant="default" className="text-[10px] font-bold">
                                  {c.loyalty_tier_name}
                                </Badge>
                                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                  {c.loyalty_points_balance ?? 0} pts
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Standard</span>
                            )}
                          </td>

                          {/* Events */}
                          <td className="px-4 py-4 text-center">
                            <span className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700 text-[11px]">
                              {eventCounts?.get(c.id) ?? 0}
                            </span>
                          </td>

                          {/* Journeys */}
                          <td className="px-4 py-4">
                            {journeyMap?.get(c.id)?.count ? (
                              <Badge variant="success" className="text-[10px] font-bold">
                                {journeyMap.get(c.id)!.count} active
                              </Badge>
                            ) : (
                              <span className="text-slate-400 text-[11px]">None active</span>
                            )}
                          </td>

                          {/* Last Seen */}
                          <td className="px-4 py-4 whitespace-nowrap text-slate-500 text-[11px]">
                            {lastActivityMap?.get(c.id) ? formatSchemaDate(lastActivityMap.get(c.id)!) : '—'}
                          </td>

                          {/* Source */}
                          <td className="px-4 py-4">
                            {(c as Record<string, unknown>).source ? (
                              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {String((c as Record<string, unknown>).source)}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="px-5 py-4 text-right">
                            <Link
                              to={`/customers/${c.id}`}
                              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition"
                            >
                              <span>360° View</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAGINATION — 100 profiles per page */}
          {!isLoading && totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                Page <span className="font-bold text-slate-700">{page + 1}</span> of {pageCount.toLocaleString()}
                <span className="mx-1.5 text-slate-300">·</span>
                {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {totalCount.toLocaleString()} profiles
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isFetching}
                  className="rounded-lg font-semibold"
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1 || isFetching}
                  className="rounded-lg font-semibold"
                >
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-xs font-medium transition',
          value !== 'all'
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-700'
        )}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition border',
        active
          ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      )}
    >
      {active && <X className="h-3 w-3" />}
      {label}
    </button>
  );
}
