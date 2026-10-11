import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DataMonitorTabs } from '@/components/data/DataMonitorTabs';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Database,
  ExternalLink,
  Filter,
  GitMerge,
  KeyRound,
  Layers,
  Mail,
  Merge,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  Users,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCustomers } from '@/lib/customers';
import type { Customer } from '@marbee/shared';
import {
  analyzeCustomerDataIssues,
  autoFixAllEmailInPhone,
  CUSTOMER_DUPLICATE_COLUMNS,
  deleteSingleCustomerRecord,
  evaluateJoinIndexHealth,
  fixEmailInPhoneRecord,
  mergeCustomerProfiles,
  pickMasterCustomer,
  type DuplicateMatchCriteria,
  type JoinIndexIssue,
  type MasterStrategy,
  type RealCustomerIssue,
  type RealDataIssueType,
} from '@/lib/customer-data-cleaner';
import {
  getHealthWorkerState,
  subscribeHealthWorker,
  startBulkAutoMerge,
  startBulkDeleteDuplicates,
  dismissHealthWorker,
  type HealthWorkerState,
} from '@/lib/data-health-worker';

function playSuccessPingSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, now + 0.06);
    gain2.gain.setValueAtTime(0.22, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.65);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

function playTrashSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.22);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1300, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.22);
    filter.Q.setValueAtTime(2.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now + 0.04);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    oscGain.gain.setValueAtTime(0.3, now + 0.04);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.22);
    osc.start(now + 0.04);
    osc.stop(now + 0.25);
  } catch (err) {
    console.warn('Trash audio error:', err);
  }
}

type MainTab = 'hygiene' | 'joins_indexes';

export function DataQualityPage() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();

  const [activeMainTab, setActiveMainTab] = useState<MainTab>('hygiene');
  const [activeFilter, setActiveFilter] = useState<'all' | RealDataIssueType>('all');
  const [duplicateCriteria, setDuplicateCriteria] = useState<DuplicateMatchCriteria>('email');
  const [customColumns, setCustomColumns] = useState<(keyof Customer)[]>(['first_name', 'last_name']);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Background Worker State (persists across tab switches)
  const [workerState, setWorkerState] = useState<HealthWorkerState>(getHealthWorkerState());

  useEffect(() => {
    const unsub = subscribeHealthWorker((state) => {
      setWorkerState(state);
      if (state.completed) {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['customers-health-check'] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['customers-summary'] });
      }
    });
    return unsub;
  }, [queryClient]);

  // Merge modal state
  const [mergeModalData, setMergeModalData] = useState<{
    open: boolean;
    issue: RealCustomerIssue | null;
    strategy: MasterStrategy;
    manualMasterId?: string;
  }>({
    open: false,
    issue: null,
    strategy: 'creation_date_oldest',
  });

  // Delete modal state
  const [deleteModalData, setDeleteModalData] = useState<{
    open: boolean;
    customerId: string | null;
    customerName: string | null;
  }>({
    open: false,
    customerId: null,
    customerName: null,
  });

  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);

  // Fetch real customers from Supabase (fetch full dataset for comprehensive health check)
  const { data: customers = [], refetch, isLoading } = useQuery({
    queryKey: ['customers-health-check', tenantId, environment],
    queryFn: () => fetchCustomers(tenantId, environment, undefined, 10000),
  });

  // Run real customer data analysis with chosen matching criteria
  const analysis = useMemo(() => {
    return analyzeCustomerDataIssues(customers, duplicateCriteria, customColumns);
  }, [customers, duplicateCriteria, customColumns]);

  // Extract distinct duplicate groups
  const duplicateCustomerGroups = useMemo(() => {
    const groupMap = new Map<string, Customer[]>();
    analysis.issues.forEach((issue) => {
      if (
        (issue.issueType === 'duplicate_email' || issue.issueType === 'duplicate_phone') &&
        issue.duplicateCustomers &&
        issue.duplicateCustomers.length > 1
      ) {
        const key = issue.duplicateCustomerIds?.slice().sort().join('_') || issue.id;
        if (!groupMap.has(key)) {
          groupMap.set(key, issue.duplicateCustomers);
        }
      }
    });
    return Array.from(groupMap.values());
  }, [analysis.issues]);

  const totalDuplicateCopiesCount = useMemo(() => {
    return duplicateCustomerGroups.reduce((acc, g) => acc + (g.length - 1), 0);
  }, [duplicateCustomerGroups]);

  // Evaluate Join Indexes
  const joinIssues: JoinIndexIssue[] = useMemo(() => {
    return evaluateJoinIndexHealth();
  }, []);

  const showToast = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  // 1-Click Fix: Single Email in Phone record
  const fixSingleContaminationMutation = useMutation({
    mutationFn: async (customerId: string) => {
      await fixEmailInPhoneRecord(tenantId, environment, customerId);
    },
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['customers-health-check'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-summary'] });
      showToast('Cleaned contaminated email from phone column');
    },
  });

  // 1-Click Fix: Auto-clean all email-in-phone records
  const autoFixContaminationsMutation = useMutation({
    mutationFn: async () => {
      return await autoFixAllEmailInPhone(tenantId, environment, customers);
    },
    onSuccess: async (count) => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['customers-health-check'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-summary'] });
      showToast(`Cleaned ${count} contaminated phone fields`);
    },
  });

  // Execute Individual Merge
  const executeMergeMutation = useMutation({
    mutationFn: async ({
      masterId,
      duplicates,
    }: {
      masterId: string;
      duplicates: string[];
    }) => {
      await mergeCustomerProfiles(tenantId, environment, masterId, duplicates);
    },
    onSuccess: async () => {
      playTrashSound();
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['customers-health-check'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-summary'] });
      setMergeModalData({ open: false, issue: null, strategy: 'creation_date_oldest' });
      showToast('Merged duplicate customer profiles into master record');
    },
  });

  // Delete Single Customer
  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      await deleteSingleCustomerRecord(tenantId, environment, customerId);
    },
    onSuccess: async () => {
      playTrashSound();
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['customers-health-check'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-summary'] });
      setDeleteModalData({ open: false, customerId: null, customerName: null });
      showToast('Deleted customer record from database');
    },
  });

  // Start High-Speed 1-Click Bulk Auto-Merge in Background
  const handleBulkAutoMerge = () => {
    startBulkAutoMerge(
      tenantId,
      environment,
      duplicateCustomerGroups,
      'creation_date_oldest',
      () => {
        refetch();
        showToast('Bulk Auto-Merge completed successfully!');
      }
    );
  };

  // Start High-Speed 1-Click Bulk Delete Duplicates in Background
  const handleBulkDeleteDuplicates = () => {
    startBulkDeleteDuplicates(
      tenantId,
      environment,
      duplicateCustomerGroups,
      'creation_date_oldest',
      () => {
        refetch();
        showToast('Bulk Duplicate Deletion completed successfully!');
      }
    );
  };

  const handleScan = async () => {
    setIsScanning(true);
    await refetch();
    playSuccessPingSound();
    setIsScanning(false);
    showToast('Database health scan completed successfully!');
  };

  const handleCopySql = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 2000);
  };

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return analysis.issues.filter((issue) => {
      if (activeFilter !== 'all' && issue.issueType !== activeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          issue.customerName.toLowerCase().includes(q) ||
          issue.currentValue.toLowerCase().includes(q) ||
          issue.title.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analysis.issues, activeFilter, searchQuery]);

  // Compute master / secondary preview for modal
  const mergePreview = useMemo(() => {
    if (!mergeModalData.issue?.duplicateCustomers?.length) return null;
    return pickMasterCustomer(
      mergeModalData.issue.duplicateCustomers,
      mergeModalData.strategy,
      mergeModalData.manualMasterId
    );
  }, [mergeModalData]);

  const cleanPercentage = analysis.cleanScore ?? analysis.healthScore ?? 100;
  const totalCustomerCount = analysis.totalCustomers ?? analysis.totalCount ?? customers.length;

  return (
    <div className="space-y-6">
      <DataMonitorTabs active="quality" />

      {/* Toast Confirmation Notification */}
      {actionSuccessMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-900 px-4 py-3 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-top-4">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Persistent Background Worker Progress Banner */}
      {(workerState.isRunning || workerState.completed || workerState.error) && (
        <div className="overflow-hidden rounded-3xl border border-purple-200 bg-white p-5 shadow-xl animate-in slide-in-from-top-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs ${
                  workerState.error
                    ? 'bg-rose-100 text-rose-600'
                    : workerState.completed
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-purple-100 text-purple-600'
                }`}
              >
                {workerState.isRunning ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : workerState.error ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    {workerState.type === 'merge_all'
                      ? '⚡ Bulk Auto-Merge Pipeline'
                      : workerState.type === 'delete_duplicates'
                      ? '🗑️ Bulk Duplicate Deletion'
                      : 'Data Health Task'}
                  </h4>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      workerState.isRunning
                        ? 'bg-purple-100 text-purple-800 animate-pulse'
                        : workerState.completed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {workerState.isRunning
                      ? '● Running in Background'
                      : workerState.completed
                      ? '✓ Completed'
                      : 'Failed'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {workerState.statusText || 'Executing batch operations…'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <span className="text-xl font-black text-slate-900">{workerState.progress}%</span>
                <p className="text-[10px] text-slate-400 font-bold">
                  {workerState.processedCount} / {workerState.totalCount} items
                </p>
              </div>

              {workerState.completed && (
                <button
                  type="button"
                  onClick={dismissHealthWorker}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  title="Dismiss banner"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Smooth Linear Progress Bar */}
          <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                workerState.error
                  ? 'bg-rose-500'
                  : workerState.completed
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600'
              }`}
              style={{ width: `${Math.max(workerState.progress, 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Data Health</h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time customer data hygiene, duplicate unification, join indexes, and foreign key link health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleScan}
            disabled={isScanning || isLoading}
            className="shadow-2xs font-bold text-xs h-9 px-3.5 rounded-xl bg-white hover:bg-slate-50"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning…' : 'Run Health Scan'}
          </Button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200/90 pb-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('hygiene')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeMainTab === 'hygiene'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Customer Profile Health ({analysis.issues.length} Issues)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('joins_indexes')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeMainTab === 'joins_indexes'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>Join Indexes & Foreign Keys ({joinIssues.length} Recommended)</span>
        </button>
      </div>

      {activeMainTab === 'joins_indexes' ? (
        /* Tab 2: Join Indexes & Foreign Keys */
        <div className="space-y-4">
          <div className="rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/70 p-5 space-y-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-600" />
              <span>Relational Join Indexes & Fast Query Optimization</span>
            </h3>
            <p className="text-xs text-slate-600">
              Foreign keys and high-frequency join columns require composite B-Tree indexes in PostgreSQL to ensure fast segment queries and prevent table locks.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {joinIssues.map((item) => (
              <div
                key={item.id}
                className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {item.sourceTable}.{item.sourceColumn} → {item.targetTable}.{item.targetColumn}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.impact === 'critical'
                        ? 'bg-rose-100 text-rose-800'
                        : item.impact === 'high'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.impact} impact
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>

                <div className="rounded-xl bg-slate-900 p-3 relative group">
                  <pre className="font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                    {item.recommendedSql}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleCopySql(item.id, item.recommendedSql)}
                    className="absolute right-2 top-2 rounded-lg bg-slate-800 p-1.5 text-slate-300 opacity-80 hover:opacity-100 hover:text-white transition"
                    title="Copy SQL Migration"
                  >
                    {copiedSqlId === item.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Tab 1: Customer Profile Health & Hygiene */
        <div className="space-y-6">
          {/* Executive Hygiene KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Clean Data Score
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-600">{cleanPercentage}%</p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {analysis.cleanCount} of {totalCustomerCount} Healthy Profiles
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Duplicate Email Groups
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <Mail className="h-3.5 w-3.5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-purple-600">
                  {analysis.issueCounts.duplicate_email}
                </p>
                <p className="text-[11px] text-purple-700 font-medium">Shared Email Profiles</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Duplicate Phone Groups
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Phone className="h-3.5 w-3.5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-indigo-600">
                  {analysis.issueCounts.duplicate_phone}
                </p>
                <p className="text-[11px] text-indigo-700 font-medium">Shared Mobile Profiles</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Email in Phone Field
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-rose-600">
                  {analysis.issueCounts.email_in_phone}
                </p>
                <p className="text-[11px] text-rose-700 font-medium">Column Contaminations</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Invalid Formatting
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-amber-600">
                  {analysis.issueCounts.invalid_email + analysis.issueCounts.invalid_phone}
                </p>
                <p className="text-[11px] text-amber-700 font-medium">RFC / Length Errors</p>
              </div>
            </div>
          </div>

          {/* DUPLICATE ENGINE CONTROLS & 1-CLICK BULK REMEDIATION TOOLBAR */}
          <div className="rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-50/80 via-white to-indigo-50/80 p-5 space-y-4 shadow-2xs">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Duplicate Criteria Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-purple-700" />
                  <span className="text-xs font-bold text-slate-900">Duplicate Matching Rule:</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setDuplicateCriteria('email')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      duplicateCriteria === 'email'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ✉️ Exact Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateCriteria('mobile')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      duplicateCriteria === 'mobile'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    📱 Mobile Number
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateCriteria('both')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      duplicateCriteria === 'both'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🔗 Email or Mobile (Both)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateCriteria('custom')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      duplicateCriteria === 'custom'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ⚙️ Custom Columns ({customColumns.length})
                  </button>
                </div>
              </div>

              {/* 1-Click High-Speed Bulk Remediation Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {analysis.issueCounts.email_in_phone > 0 && (
                  <Button
                    size="sm"
                    onClick={() => autoFixContaminationsMutation.mutate()}
                    disabled={autoFixContaminationsMutation.isPending || workerState.isRunning}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs h-9 px-3.5 rounded-xl"
                  >
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                    {autoFixContaminationsMutation.isPending
                      ? 'Fixing…'
                      : `Fix All ${analysis.issueCounts.email_in_phone} Email-in-Phone`}
                  </Button>
                )}

                {duplicateCustomerGroups.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      onClick={handleBulkAutoMerge}
                      disabled={workerState.isRunning}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs h-9 px-4 rounded-xl"
                      title="Auto-merge all duplicate groups in high-speed parallel batches"
                    >
                      <Merge className={`mr-1.5 h-3.5 w-3.5 ${workerState.isRunning && workerState.type === 'merge_all' ? 'animate-spin' : ''}`} />
                      {workerState.isRunning && workerState.type === 'merge_all'
                        ? 'Merging in Background…'
                        : `⚡ 1-Click Auto-Merge All (${duplicateCustomerGroups.length} Groups)`}
                    </Button>

                    <Button
                      size="sm"
                      onClick={handleBulkDeleteDuplicates}
                      disabled={workerState.isRunning}
                      className="bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs shadow-xs h-9 px-3.5 rounded-xl"
                      title="Keep master profile and delete all duplicate copies"
                    >
                      <Trash2 className={`mr-1.5 h-3.5 w-3.5 ${workerState.isRunning && workerState.type === 'delete_duplicates' ? 'animate-spin' : ''}`} />
                      {workerState.isRunning && workerState.type === 'delete_duplicates'
                        ? 'Deleting…'
                        : `🗑️ 1-Click Bulk Delete Duplicates (${totalDuplicateCopiesCount})`}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Custom Column Multi-Selector Chips */}
            {duplicateCriteria === 'custom' && (
              <div className="rounded-2xl border border-purple-200 bg-white/90 p-3.5 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-purple-950 uppercase tracking-wider">
                    Select Match Columns (Find profiles where all selected columns match):
                  </span>
                  <span className="text-[10px] font-bold text-purple-700">
                    {customColumns.length} Column{customColumns.length !== 1 ? 's' : ''} Active
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CUSTOMER_DUPLICATE_COLUMNS.map((col) => {
                    const isSelected = customColumns.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (customColumns.length > 1) {
                              setCustomColumns(customColumns.filter((c) => c !== col.id));
                            }
                          } else {
                            setCustomColumns([...customColumns, col.id]);
                          }
                        }}
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-bold transition ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                        <span>{col.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Search and Issue Filter Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'all', label: `All Issues (${analysis.issues.length})` },
                { id: 'duplicate_email', label: `Duplicate Emails (${analysis.issueCounts.duplicate_email})` },
                { id: 'duplicate_phone', label: `Duplicate Phones (${analysis.issueCounts.duplicate_phone})` },
                { id: 'email_in_phone', label: `Email in Phone (${analysis.issueCounts.email_in_phone})` },
                { id: 'invalid_phone', label: `Invalid Phone (${analysis.issueCounts.invalid_phone})` },
                { id: 'invalid_email', label: `Invalid Email (${analysis.issueCounts.invalid_email})` },
                { id: 'missing_contact', label: `Missing Contact (${analysis.issueCounts.missing_contact})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id as typeof activeFilter)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 ${
                    activeFilter === f.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search issues, customer names, emails…"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Issues List */}
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 font-medium animate-pulse">
              Scanning database health and indexing duplicates…
            </div>
          ) : filteredIssues.length > 0 ? (
            <div className="grid gap-3">
              {filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="group relative flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:border-slate-300 hover:shadow-md transition sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        issue.issueType === 'duplicate_email' || issue.issueType === 'duplicate_phone'
                          ? 'bg-purple-100 text-purple-700'
                          : issue.issueType === 'email_in_phone'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {issue.issueType === 'duplicate_email' || issue.issueType === 'duplicate_phone' ? (
                        <Users className="h-5 w-5" />
                      ) : issue.issueType === 'email_in_phone' ? (
                        <AlertCircle className="h-5 w-5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/customers/${issue.customerId}`}
                          className="font-bold text-xs text-slate-900 hover:text-indigo-600 transition"
                        >
                          {issue.customerName}
                        </Link>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {issue.customerId.slice(0, 8)}…</span>
                        <span
                          className={`rounded-full px-2 py-0.2 text-[9px] font-black uppercase tracking-wider ${
                            issue.severity === 'critical'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {issue.severity}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-800">{issue.title}</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{issue.description}</p>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* If Email in Phone, offer 1-click clean */}
                    {issue.issueType === 'email_in_phone' && (
                      <Button
                        size="sm"
                        onClick={() => fixSingleContaminationMutation.mutate(issue.customerId)}
                        disabled={fixSingleContaminationMutation.isPending}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-8 px-3 rounded-xl shadow-xs"
                      >
                        <Zap className="mr-1 h-3 w-3" />
                        Clean Phone Field
                      </Button>
                    )}

                    {/* If Duplicate, offer Merge Modal */}
                    {(issue.issueType === 'duplicate_email' || issue.issueType === 'duplicate_phone') && (
                      <Button
                        size="sm"
                        onClick={() =>
                          setMergeModalData({
                            open: true,
                            issue,
                            strategy: 'creation_date_oldest',
                          })
                        }
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8 px-3 rounded-xl shadow-xs"
                      >
                        <Merge className="mr-1 h-3 w-3" />
                        Merge Records
                      </Button>
                    )}

                    {/* Option to delete any record */}
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteModalData({
                          open: true,
                          customerId: issue.customerId,
                          customerName: issue.customerName,
                        })
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition shadow-2xs"
                      title="Delete this customer record"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-12 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-2xs">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-emerald-950">Customer Data is 100% Clean!</h3>
              <p className="mx-auto max-w-md text-xs text-emerald-800">
                No duplicate customer profiles, column contaminations, or invalid formats detected under the active matching rules.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MERGE MODAL (Pick Master Record & Unify) */}
      {mergeModalData.open && mergeModalData.issue && mergePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Merge className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Merge Duplicate Customer Records</h3>
                  <p className="text-[11px] text-slate-500">
                    Unify duplicate profiles into one primary master and re-link all events and journeys.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMergeModalData({ open: false, issue: null, strategy: 'creation_date_oldest' })}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Master Record Strategy Picker */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800">Select Master Record Selection Strategy:</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: 'creation_date_oldest',
                    label: 'Oldest Creation Date (First Created)',
                    desc: 'Preserves original customer profile and ID created first in time',
                  },
                  {
                    id: 'last_updated_recent',
                    label: 'Most Recently Updated',
                    desc: 'Uses latest profile state as primary master',
                  },
                  {
                    id: 'action_date_most_active',
                    label: 'Most Complete Profile',
                    desc: 'Chooses profile with greatest number of populated attributes',
                  },
                  {
                    id: 'manual',
                    label: 'Manual Pick',
                    desc: 'Directly click on the record below you wish to keep as Master',
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setMergeModalData((prev) => ({
                        ...prev,
                        strategy: s.id as MasterStrategy,
                      }))
                    }
                    className={`rounded-2xl border p-3 text-left transition ${
                      mergeModalData.strategy === s.id
                        ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-600/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">{s.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Records Breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-800">Customer Records In This Duplicate Cluster:</p>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {mergeModalData.issue.duplicateCustomers?.map((c) => {
                  const isMaster = c.id === mergePreview.master.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (mergeModalData.strategy === 'manual') {
                          setMergeModalData((prev) => ({ ...prev, manualMasterId: c.id }));
                        }
                      }}
                      className={`flex items-center justify-between rounded-2xl border p-3 transition ${
                        isMaster
                          ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-slate-50 opacity-80'
                      } ${mergeModalData.strategy === 'manual' ? 'cursor-pointer hover:border-purple-300' : ''}`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            {[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed Profile'}
                          </span>
                          {isMaster ? (
                            <span className="rounded-md bg-emerald-600 px-1.5 py-0.2 text-[9px] font-black uppercase text-white">
                              ★ Master Record
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-200 px-1.5 py-0.2 text-[9px] font-black uppercase text-slate-600">
                              Will Be Merged & Removed
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">
                          Email: {c.email || '—'} · Mobile: {c.mobile || '—'} · Created:{' '}
                          {new Date(c.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {isMaster && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="ghost"
                onClick={() => setMergeModalData({ open: false, issue: null, strategy: 'creation_date_oldest' })}
                className="font-bold text-xs h-9 px-4 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  executeMergeMutation.mutate({
                    masterId: mergePreview.master.id,
                    duplicates: mergePreview.secondary.map((d) => d.id),
                  })
                }
                disabled={executeMergeMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs"
              >
                {executeMergeMutation.isPending ? 'Merging Profiles…' : 'Confirm Merge & Remove Duplicates'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModalData.open && deleteModalData.customerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Customer Record</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to permanently remove "{deleteModalData.customerName}"?
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-rose-50/60 border border-rose-100 rounded-2xl p-3">
              This will remove this profile from the active customer directory. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setDeleteModalData({ open: false, customerId: null, customerName: null })}
                className="font-bold text-xs h-9 px-4 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={() => deleteCustomerMutation.mutate(deleteModalData.customerId!)}
                disabled={deleteCustomerMutation.isPending}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs"
              >
                {deleteCustomerMutation.isPending ? 'Deleting…' : 'Delete Record'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
