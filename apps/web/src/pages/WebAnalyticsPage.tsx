import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Layers,
  MapPin,
  Monitor,
  PieChart,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  TrendingDown,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchWebAnalyticsSites,
  createWebAnalyticsSite,
  deleteWebAnalyticsSite,
  verifySiteConnection,
  fetchWebAnalyticsMetrics,
  ingestWebAnalyticsEvents,
  fetchWebPushSubscribers,
  registerWebPushSubscriber,
  deleteWebPushSubscriber,
  clearTestPushSubscribers,
  sendTestWebPushNotification,
  verifyRemoteWebPushDeployment,
  fetchBehavioralSessions,
  fetchFrictionSignals,
  purgeStaleFakeEvents,
} from '@/lib/web-analytics';
import {
  generateAIBrainAnalysis,
  generateExecutiveBriefing,
  fetchRevenueOpportunities,
} from '@/lib/ai-behavioral-brain';
import { AIBrainTab } from '@/components/analytics/AIBrainTab';
import { AIAgentsTab } from '@/components/analytics/AIAgentsTab';
import { SessionIntelligenceTab } from '@/components/analytics/SessionIntelligenceTab';
import { AskWebsiteCopilotTab } from '@/components/analytics/AskWebsiteCopilotTab';
import { DeveloperCopilotTab } from '@/components/analytics/DeveloperCopilotTab';
import type { WebAnalyticsSite, WebAnalyticsEvent } from '@/lib/web-analytics-types';
import { formatNumber } from '@/lib/utils';

export function WebAnalyticsPage() {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'brain' | 'agents' | 'implementation' | 'settings'
  >('dashboard');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isCheckingPushDeployment, setIsCheckingPushDeployment] = useState(false);
  const [pushDeploymentResult, setPushDeploymentResult] = useState<{
    configured: boolean;
    swReachable: boolean;
    liveSubscribersCount: number;
    message: string;
    checkedUrl: string;
    details?: string;
  } | null>(null);

  // Strict Hourly Auto-Refresh options only (1h, 3h, 6h, 24h, Off) - Default: 1 Hour
  const [savedAutoRefreshMs, setSavedAutoRefreshMs] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`marbee_web_analytics_refresh_${tenantId}`);
      if (saved) return Number(saved);
    } catch {}
    return 1 * 60 * 60 * 1000;
  });
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(savedAutoRefreshMs);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Editable Site Settings (for dirty tracking)
  const [siteAllowedOrigins, setSiteAllowedOrigins] = useState<string>('');
  const [savedSiteAllowedOrigins, setSavedSiteAllowedOrigins] = useState<string>('');
  const [anonymizeIp, setAnonymizeIp] = useState<boolean>(true);
  const [savedAnonymizeIp, setSavedAnonymizeIp] = useState<boolean>(true);
  const [respectDnt, setRespectDnt] = useState<boolean>(false);
  const [savedRespectDnt, setSavedRespectDnt] = useState<boolean>(false);
  const [autoPageviews, setAutoPageviews] = useState<boolean>(true);
  const [savedAutoPageviews, setSavedAutoPageviews] = useState<boolean>(true);
  const [webPushEnabled, setWebPushEnabled] = useState<boolean>(false);
  const [savedWebPushEnabled, setSavedWebPushEnabled] = useState<boolean>(false);

  // Web Push Live Test State
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState<string | null>(null);
  const [testPushMsg, setTestPushMsg] = useState<string | null>(null);

  // Date Range Filtering
  type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Dashboard Filters
  const [filterDevice, setFilterDevice] = useState('');
  const [filterBrowser, setFilterBrowser] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [locationTab, setLocationTab] = useState<'city' | 'state' | 'country'>('city');
  const [activeMetric, setActiveMetric] = useState<'Pageviews' | 'Sessions' | 'Visitors'>('Pageviews');

  const dateRange = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (datePreset === 'today') return { from: today, to: now };
    if (datePreset === 'yesterday') {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      const ye = new Date(today); ye.setMilliseconds(-1);
      return { from: y, to: ye };
    }
    if (datePreset === '7d') { const f = new Date(today); f.setDate(f.getDate() - 7); return { from: f, to: now }; }
    if (datePreset === '30d') { const f = new Date(today); f.setDate(f.getDate() - 30); return { from: f, to: now }; }
    if (datePreset === '90d') { const f = new Date(today); f.setDate(f.getDate() - 90); return { from: f, to: now }; }
    if (datePreset === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') };
    }
    // default last 7d
    const f = new Date(today); f.setDate(f.getDate() - 7);
    return { from: f, to: now };
  }, [datePreset, customFrom, customTo]);


  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteDomain, setNewSiteDomain] = useState('');
  const [allowedOriginsStr, setAllowedOriginsStr] = useState('');

  // Verifier State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    lastEvent?: WebAnalyticsEvent;
    receivedAt?: string;
    domain?: string;
    error?: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const clearAllFilters = () => {
    setFilterDevice('');
    setFilterBrowser('');
    setFilterSource('');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard`);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    showToast('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const { data: sites = [], isLoading: isSitesLoading, refetch: refetchSites } = useQuery({
    queryKey: ['web-analytics-sites', tenantId, environment],
    queryFn: () => fetchWebAnalyticsSites(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  // Auto-select first site if none selected
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].siteId);
    }
  }, [sites, selectedSiteId]);

  const currentSite = useMemo(() => {
    return sites.find((s) => s.siteId === selectedSiteId) || sites[0] || null;
  }, [sites, selectedSiteId]);

  // Sync site settings when currentSite changes
  useEffect(() => {
    if (currentSite) {
      const origStr = (currentSite.allowedOrigins || []).join(', ');
      setSiteAllowedOrigins(origStr);
      setSavedSiteAllowedOrigins(origStr);
      const anon = currentSite.settings?.anonymizeIp ?? true;
      setAnonymizeIp(anon);
      setSavedAnonymizeIp(anon);
      const dnt = currentSite.settings?.respectDoNotTrack ?? false;
      setRespectDnt(dnt);
      setSavedRespectDnt(dnt);
      const apv = currentSite.settings?.autoPageviews ?? true;
      setAutoPageviews(apv);
      setSavedAutoPageviews(apv);
      const wp = currentSite.settings?.webPushEnabled ?? false;
      setWebPushEnabled(wp);
      setSavedWebPushEnabled(wp);
    }
  }, [currentSite?.siteId]);

  // On mount, purge stale v1 events that contained hardcoded Bengaluru/India/Chrome fallbacks
  useEffect(() => {
    if (!currentSite) return;
    purgeStaleFakeEvents(currentSite.siteId);
  }, [currentSite?.siteId]);

  // Dirty State Checker (Has any setting changed?)
  const hasUnsavedChanges = useMemo(() => {
    const refreshChanged = autoRefreshMs !== savedAutoRefreshMs;
    const originsChanged = siteAllowedOrigins !== savedSiteAllowedOrigins;
    const anonChanged = anonymizeIp !== savedAnonymizeIp;
    const dntChanged = respectDnt !== savedRespectDnt;
    const apvChanged = autoPageviews !== savedAutoPageviews;
    const wpChanged = webPushEnabled !== savedWebPushEnabled;
    return refreshChanged || originsChanged || anonChanged || dntChanged || apvChanged || wpChanged;
  }, [
    autoRefreshMs,
    savedAutoRefreshMs,
    siteAllowedOrigins,
    savedSiteAllowedOrigins,
    anonymizeIp,
    savedAnonymizeIp,
    respectDnt,
    savedRespectDnt,
    autoPageviews,
    savedAutoPageviews,
    webPushEnabled,
    savedWebPushEnabled,
  ]);

  const handleSaveAllSettings = () => {
    try {
      localStorage.setItem(`marbee_web_analytics_refresh_${tenantId}`, String(autoRefreshMs));
      setSavedAutoRefreshMs(autoRefreshMs);
      setSavedSiteAllowedOrigins(siteAllowedOrigins);
      setSavedAnonymizeIp(anonymizeIp);
      setSavedRespectDnt(respectDnt);
      setSavedAutoPageviews(autoPageviews);
      setSavedWebPushEnabled(webPushEnabled);

      // Persist to site storage if current site exists
      if (currentSite) {
        try {
          const key = `marbee_web_analytics_sites_v1_${tenantId}_${environment}`;
          const raw = localStorage.getItem(key);
          if (raw) {
            const list: WebAnalyticsSite[] = JSON.parse(raw);
            const originsList = siteAllowedOrigins
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const updated = list.map((s) =>
              s.siteId === currentSite.siteId
                ? {
                    ...s,
                    allowedOrigins: originsList.length > 0 ? originsList : s.allowedOrigins,
                    settings: {
                      ...s.settings,
                      anonymizeIp,
                      respectDoNotTrack: respectDnt,
                      autoPageviews,
                      webPushEnabled,
                    },
                    updatedAt: new Date().toISOString(),
                  }
                : s
            );
            localStorage.setItem(key, JSON.stringify(updated));
            void queryClient.invalidateQueries({ queryKey: ['web-analytics-sites', tenantId, environment] });
            refetchSites();
          }
        } catch {}
      }

      showToast('All web settings saved');
    } catch {}
  };

  const handleCancelChanges = () => {
    setAutoRefreshMs(savedAutoRefreshMs);
    setSiteAllowedOrigins(savedSiteAllowedOrigins);
    setAnonymizeIp(savedAnonymizeIp);
    setRespectDnt(savedRespectDnt);
    setAutoPageviews(savedAutoPageviews);
    setWebPushEnabled(savedWebPushEnabled);
    showToast('Changes discarded');
  };

  // Web Push Subscribers Query (Auto-syncs every 3s)
  const { data: subscribers = [], refetch: refetchSubscribers } = useQuery({
    queryKey: ['web-push-subscribers', tenantId, environment, currentSite?.siteId],
    queryFn: () => fetchWebPushSubscribers(tenantId, environment, currentSite?.siteId),
    enabled: Boolean(tenantId),
    refetchInterval: 3000,
  });

  const handleVerifyRemotePush = async () => {
    if (!currentSite) return;
    setIsCheckingPushDeployment(true);
    setPushDeploymentResult(null);
    try {
      const result = await verifyRemoteWebPushDeployment(tenantId, environment, currentSite.domain, currentSite.siteId);
      setPushDeploymentResult(result);
      if (result.configured) {
        showToast(result.message);
      } else {
        showToast('Web Push is not yet active on live site');
      }
    } catch {
      setPushDeploymentResult({
        configured: false,
        swReachable: false,
        liveSubscribersCount: 0,
        checkedUrl: `https://${currentSite.domain.replace(/^https?:\/\//, '')}/sw.js`,
        message: 'Could not connect to remote website. Please check website domain and CORS settings.',
      });
    } finally {
      setIsCheckingPushDeployment(false);
    }
  };

  const handleTestWebPushDevice = async (customOptinPage = '/') => {
    if (!currentSite) return;
    setIsSubscribingPush(true);
    setTestPushMsg(null);
    try {
      if (!('Notification' in window)) {
        showToast('Push notifications not supported in this browser');
        setTestPushMsg('Push notifications are not supported in this browser.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast('Notification permission denied by browser');
        setTestPushMsg('Notification permission was not granted.');
        return;
      }

      const testToken = `TEST_TOKEN_admin_browser_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
      await registerWebPushSubscriber({
        tenantId,
        environment,
        siteId: currentSite.siteId,
        websiteDomain: currentSite.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
        optinPage: customOptinPage,
        optinStatus: 'yes',
        fcmToken: testToken,
        isTestToken: true,
        permissionStatus: perm,
        browser: navigator.userAgent.includes('Edg') ? 'Edge' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome',
        os: navigator.platform || 'Desktop',
        device: 'desktop',
      });

      const pushRes = await sendTestWebPushNotification({
        title: '🔔 Marbee Web Push Connected!',
        body: `Live test notification from ${currentSite.name} (Opt-in from ${customOptinPage}). Device token registered in subscription table.`,
        clickUrl: window.location.href,
        tenantId,
        environment,
        fcmToken: testToken,
      });

      if (pushRes.ok) {
        showToast('Web push token captured & live notification delivered!');
        setTestPushMsg(`✓ Success: Token registered from ${currentSite.domain}${customOptinPage} & test notification delivered.`);
      } else {
        showToast(pushRes.message);
        setTestPushMsg(`Token registered, notification note: ${pushRes.message}`);
      }
      void queryClient.invalidateQueries({ queryKey: ['web-push-subscribers', tenantId, environment, currentSite?.siteId] });
      refetchSubscribers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Web push registration failed';
      showToast(msg);
      setTestPushMsg(`Error: ${msg}`);
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleSimulateVisitorOptin = async (pagePath: string) => {
    if (!currentSite) return;
    const fakeToken = `TEST_TOKEN_sim_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
    const randomBrowser = ['Chrome', 'Safari', 'Firefox', 'Edge'][Math.floor(Math.random() * 4)];
    const randomOs = ['Windows 11', 'macOS Sonoma', 'iOS 17', 'Android 14'][Math.floor(Math.random() * 4)];
    const isMobile = randomOs.includes('iOS') || randomOs.includes('Android');

    await registerWebPushSubscriber({
      tenantId,
      environment,
      siteId: currentSite.siteId,
      websiteDomain: currentSite.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      optinPage: pagePath,
      optinStatus: 'yes',
      fcmToken: fakeToken,
      isTestToken: true,
      permissionStatus: 'granted',
      browser: randomBrowser,
      os: randomOs,
      device: isMobile ? 'mobile' : 'desktop',
    });

    showToast(`Simulated +1 subscriber opt-in from ${pagePath}`);
    void queryClient.invalidateQueries({ queryKey: ['web-push-subscribers', tenantId, environment, currentSite?.siteId] });
    refetchSubscribers();
  };

  const handleClearTestTokens = async () => {
    try {
      await clearTestPushSubscribers(tenantId, environment);
      void queryClient.invalidateQueries({ queryKey: ['web-push-subscribers', tenantId, environment, currentSite?.siteId] });
      await refetchSubscribers();
      showToast('Cleared all test tokens. Only real device tokens remain.');
    } catch {
      showToast('Failed to clear test tokens');
    }
  };

  const handleSendDirectTestPush = async (token?: string) => {
    setIsSendingTestPush(token || 'all');
    try {
      const res = await sendTestWebPushNotification({
        title: '🚀 Marbee Campaign Web Push Test',
        body: `Campaign test blast delivered to token ${token ? token.substring(0, 14) + '…' : 'all active subscribers'} at ${new Date().toLocaleTimeString()}.`,
        clickUrl: window.location.href,
        tenantId,
        environment,
        fcmToken: token,
      });
      showToast(res.message);
      if (res.autoDeactivated) {
        void queryClient.invalidateQueries({ queryKey: ['web-push-subscribers', tenantId, environment, currentSite?.siteId] });
        refetchSubscribers();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Push test failed');
    } finally {
      setIsSendingTestPush(null);
    }
  };

  const handleDeleteSubscriberToken = async (id: string, token?: string) => {
    try {
      await deleteWebPushSubscriber(tenantId, environment, id, token);
      showToast('Subscriber token removed');
      void queryClient.invalidateQueries({ queryKey: ['web-push-subscribers', tenantId, environment, currentSite?.siteId] });
      refetchSubscribers();
    } catch {
      showToast('Failed to delete subscriber token');
    }
  };

  const { data: metrics, refetch: refetchMetrics, dataUpdatedAt } = useQuery({
    queryKey: ['web-analytics-metrics', tenantId, environment, currentSite?.siteId, dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: () => currentSite ? fetchWebAnalyticsMetrics(tenantId, environment, currentSite.siteId, dateRange) : null,
    enabled: Boolean(currentSite?.siteId),
    refetchInterval: savedAutoRefreshMs > 0 ? savedAutoRefreshMs : false,
    staleTime: 5000,
  });

  // Apply device / browser / source filters to metrics client-side
  const filteredMetrics = useMemo(() => {
    if (!metrics) return null;
    const deviceMatch = (d: string) => !filterDevice || d.toLowerCase() === filterDevice.toLowerCase();
    const browserMatch = (b: string) => !filterBrowser || b.toLowerCase().includes(filterBrowser.toLowerCase());
    const sourceMatch = (s: string) => {
      if (!filterSource) return true;
      if (filterSource === 'direct') return s === 'Direct / Organic' || s === 'direct';
      if (filterSource === 'organic') return s.toLowerCase().includes('google') || s.toLowerCase().includes('organic');
      if (filterSource === 'social') return s.toLowerCase().includes('meta') || s.toLowerCase().includes('twitter') || s.toLowerCase().includes('instagram') || s.toLowerCase().includes('facebook');
      if (filterSource === 'email') return s.toLowerCase().includes('email') || s.toLowerCase().includes('newsletter');
      if (filterSource === 'referral') return s.toLowerCase().includes('referral');
      return true;
    };

    // Filter devices array
    const devices = filterDevice
      ? metrics.devices.filter((d) => deviceMatch(d.name))
      : metrics.devices;

    // Filter browsers array
    const browsers = filterBrowser
      ? metrics.browsers.filter((b) => browserMatch(b.name))
      : metrics.browsers;

    // Filter traffic sources
    const trafficSources = filterSource
      ? metrics.trafficSources.filter((s) => sourceMatch(s.source))
      : metrics.trafficSources;

    // Compute filtered totals from device/browser/source proportions
    const deviceTotal = devices.reduce((a, d) => a + d.count, 0) || 1;
    const allDeviceTotal = metrics.devices.reduce((a, d) => a + d.count, 0) || 1;
    const ratio = filterDevice || filterBrowser || filterSource ? deviceTotal / allDeviceTotal : 1;

    return {
      ...metrics,
      totalPageviews: Math.round(metrics.totalPageviews * ratio),
      uniqueVisitors: Math.round(metrics.uniqueVisitors * ratio),
      totalSessions: Math.round(metrics.totalSessions * ratio),
      devices,
      browsers,
      trafficSources,
      topPages: metrics.topPages.map((p) => ({
        ...p,
        pageviews: Math.round(p.pageviews * ratio),
        uniqueVisitors: Math.round(p.uniqueVisitors * ratio),
      })),
    };
  }, [metrics, filterDevice, filterBrowser, filterSource]);

  // Behavioral Sessions & Friction Queries
  const { data: behavioralSessions = [], refetch: refetchBehavioralSessions } = useQuery({
    queryKey: ['behavioral-sessions', currentSite?.siteId],
    queryFn: () => (currentSite ? fetchBehavioralSessions(currentSite.siteId) : []),
    enabled: Boolean(currentSite?.siteId),
  });

  const { data: frictionSignals = [] } = useQuery({
    queryKey: ['friction-signals', currentSite?.siteId],
    queryFn: () => (currentSite ? fetchFrictionSignals(currentSite.siteId) : []),
    enabled: Boolean(currentSite?.siteId),
  });

  const aiBrain = useMemo(() => {
    if (!currentSite) return null;
    return generateAIBrainAnalysis(currentSite.siteId, metrics || undefined, behavioralSessions);
  }, [currentSite, metrics, behavioralSessions]);

  const executiveBriefing = useMemo(() => {
    if (!currentSite) return null;
    return generateExecutiveBriefing(currentSite.siteId, behavioralSessions);
  }, [currentSite, behavioralSessions]);

  const revenueOpportunities = useMemo(() => {
    if (!currentSite) return [];
    return fetchRevenueOpportunities(currentSite.siteId, behavioralSessions);
  }, [currentSite, behavioralSessions]);

  // Reporting window label
  const reportingWindowLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(dateRange.from)} – ${fmt(dateRange.to)}`;
  }, [dateRange]);

  // Active filter count for badge
  const activeFilterCount = [filterDevice, filterBrowser, filterSource].filter(Boolean).length;

  // Real-time cross-tab & cross-window sync
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window.BroadcastChannel === 'function') {
        channel = new BroadcastChannel('marbee_analytics_stream');
        channel.onmessage = () => {
          void refetchMetrics();
          void refetchSites();
          void refetchBehavioralSessions();
        };
      }
    } catch {}

    const onStorage = (e: StorageEvent) => {
      if (e.key && (e.key.includes('marbee_web_analytics_events') || e.key.includes('marbee_web_push_subscribers'))) {
        void refetchMetrics();
        void refetchSites();
        void refetchSubscribers();
        void refetchBehavioralSessions();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [refetchMetrics, refetchSites, refetchSubscribers, refetchBehavioralSessions]);

  // Cloud SSE Stream for instant cross-domain subscriber capture (Netlify / live sites)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      const safeTopic = `marbee_push_${(tenantId || 'default').replace(/[^a-zA-Z0-9_]/g, '_')}`;
      eventSource = new EventSource(`https://ntfy.sh/${safeTopic}/sse`);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.event === 'message') {
            void queryClient.invalidateQueries({ queryKey: ['web-push-subscribers'] });
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [tenantId, queryClient]);

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([refetchMetrics(), refetchSites(), refetchBehavioralSessions()]);
      showToast('Metrics refreshed');
    } finally {
      setTimeout(() => setIsManualRefreshing(false), 300);
    }
  };

  const createSiteMutation = useMutation({
    mutationFn: async () => {
      const origins = allowedOriginsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return await createWebAnalyticsSite(tenantId, environment, {
        name: newSiteName.trim(),
        domain: newSiteDomain.trim(),
        allowedOrigins: origins.length > 0 ? origins : undefined,
      });
    },
    onSuccess: (newSite) => {
      setRegisterModalOpen(false);
      setNewSiteName('');
      setNewSiteDomain('');
      setAllowedOriginsStr('');
      setSelectedSiteId(newSite.siteId);
      showToast(`Website "${newSite.name}" registered!`);
      void queryClient.invalidateQueries({ queryKey: ['web-analytics-sites', tenantId, environment] });
      refetchSites();
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Could not register the website');
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      await deleteWebAnalyticsSite(tenantId, environment, siteId);
    },
    onSuccess: () => {
      showToast('Deleted website tracking profile');
      void queryClient.invalidateQueries({ queryKey: ['web-analytics-sites', tenantId, environment] });
      refetchSites();
    },
  });

  const handleRunVerification = async () => {
    if (!currentSite) return;
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const res = await verifySiteConnection(currentSite.siteId);
      setVerificationResult(res);
      if (res.verified) {
        showToast('Connection verified! Real events received.');
        refetchSites();
        refetchMetrics();
      } else {
        showToast('Verification check: No events received yet.');
      }
    } catch {
      setVerificationResult({ verified: false, error: 'Verification check timeout' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSimulateVisitor = async (preset: 'mobile' | 'incognito' | 'desktop' | 'google') => {
    if (!currentSite) return;

    const fakeAnonId = 'mb_' + Math.random().toString(36).substring(2, 11);
    const fakeSessionId = 'sess_' + Math.random().toString(36).substring(2, 11);

    let deviceType: 'mobile' | 'desktop' | 'tablet' = 'desktop';
    let browser = 'Chrome';
    let os = 'Windows';
    let utmSource: string | undefined = undefined;
    let utmMedium: string | undefined = undefined;
    let utmCampaign: string | undefined = undefined;
    let path = '/';

    if (preset === 'mobile') {
      deviceType = 'mobile';
      browser = 'Safari';
      os = 'iOS';
      path = '/products/featured';
    } else if (preset === 'incognito') {
      deviceType = 'desktop';
      browser = 'Chrome (Incognito)';
      os = 'macOS';
      path = '/pricing';
    } else if (preset === 'google') {
      deviceType = 'mobile';
      browser = 'Chrome';
      os = 'Android';
      utmSource = 'google';
      utmMedium = 'organic';
      path = '/blog/getting-started';
    }

    await ingestWebAnalyticsEvents({
      site_id: currentSite.siteId,
      origin: `https://${currentSite.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`,
      events: [
        {
          eventName: 'pageview',
          url: `https://${currentSite.domain}${path}`,
          path,
          hostname: currentSite.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
          anonymousId: fakeAnonId,
          sessionId: fakeSessionId,
          utmSource,
          utmMedium,
          utmCampaign,
          pageTitle: `${currentSite.name} — ${path}`,
          deviceType,
          browser,
          os,
          properties: { simulated: true, preset },
        },
      ],
    });

    showToast(`Simulated +1 ${preset.toUpperCase()} visitor successfully!`);
    refetchMetrics();
    refetchSites();
  };

  const currentDomainClean = currentSite
    ? currentSite.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    : 'example.com';



  const webPushSwCode = currentSite
    ? `// Marbee Web Push Service Worker — Place in your website root: /sw.js
self.addEventListener('push', function(event) {
  var data = { title: 'New Notification', body: 'You have an update from ${currentSite.name}', icon: '/favicon.svg' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch(e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.click_action || data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});`
    : '';

  const webPushSnippetCode = currentSite
    ? `<!-- Marbee Web Push Smart Opt-in SDK with Automatic Visitor Prompt -->
<script>
(function(siteId, tenantId, env, siteName) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (localStorage.getItem('_mb_push_dismissed') === '1') return;

  // 1. Register Service Worker on Page Load
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      if (Notification.permission === 'granted') {
        registerPushSubscription(reg, 'yes');
      } else if (Notification.permission === 'default') {
        // Automatically ask visitor after 2.5s with a smart opt-in banner
        setTimeout(function() { showSmartOptinPrompt(reg); }, 2500);
      }
    });
  });

  // 2. Stylish Opt-in Prompt Modal
  function showSmartOptinPrompt(reg) {
    if (document.getElementById('mb-push-modal')) return;
    var el = document.createElement('div');
    el.id = 'mb-push-modal';
    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:#0f172a;color:#fff;padding:12px 18px;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.3);display:flex;align-items:center;gap:12px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;border:1px solid #334155;';
    el.innerHTML = '<span>🔔</span><div><strong>Enable Alerts from ' + siteName + '</strong><div style="color:#94a3b8;font-size:11px;">Stay updated with real-time news & campaign alerts.</div></div><div style="display:flex;gap:6px;margin-left:12px;"><button id="mb-allow-btn" style="background:#6366f1;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:11px;">Allow</button><button id="mb-later-btn" style="background:transparent;color:#94a3b8;border:1px solid #475569;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;">Later</button></div>';
    document.body.appendChild(el);

    document.getElementById('mb-allow-btn').onclick = function() {
      el.remove();
      Notification.requestPermission().then(function(perm) {
        if (perm === 'granted') registerPushSubscription(reg, 'yes');
      });
    };
    document.getElementById('mb-later-btn').onclick = function() {
      el.remove();
      localStorage.setItem('_mb_push_dismissed', '1');
    };
  }

  // Universal VAPID Public Key for cross-website browser push subscription
  var VAPID_KEY = 'BJZ7fKENGyf2FoQf1LUqhbTj3xvpPodPiMzcE1NSvJzUQeCAjSPhQ3EfOdCc9i2zcWOLxZX5Jpkf3svui7_9JY4';

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // 3. Ingest Real Browser Device Token with Website, Page & Opt-in Tracking
  function registerPushSubscription(reg, optinStatus) {
    function sendPayload(token, endpointUrl, p256dhKey, authSecret, isTest) {
      var payload = {
        site_id: siteId,
        tenant_id: tenantId,
        environment: env,
        website_domain: location.hostname,
        optin_page: location.pathname,
        optin_status: optinStatus || 'yes',
        fcm_token: token,
        endpoint: endpointUrl || '',
        p256dh: p256dhKey || '',
        auth: authSecret || '',
        is_test_token: Boolean(isTest),
        permission_status: Notification.permission,
        browser: navigator.userAgent
      };

      // 1. Cloud HTTPS Relay (Works globally from any HTTPS website e.g. Netlify/Shopify/WordPress)
      try {
        var cloudTopic = 'marbee_push_' + (tenantId || 'default').replace(/[^a-zA-Z0-9_]/g, '_');
        fetch('https://ntfy.sh/' + cloudTopic, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function() {
          console.log('✓ Marbee Web Push token connected from ' + location.hostname);
        }).catch(function(){});
      } catch(e) {}

      // 2. Direct Local / Same-Origin API
      try {
        fetch('${window.location.origin}/api/v1/web-push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function(){});
      } catch(e) {}
    }

    function extractAndSend(sub) {
      if (!sub) return;
      var endpoint = sub.endpoint || '';
      var rawToken = endpoint;
      // Extract standard FCM token string from Google endpoint if applicable
      if (endpoint.indexOf('fcm.googleapis.com/fcm/send/') !== -1) {
        rawToken = endpoint.split('fcm.googleapis.com/fcm/send/')[1];
      }
      var p256dh = '';
      var auth = '';
      try {
        if (sub.getKey) {
          var pKey = sub.getKey('p256dh');
          if (pKey) p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(pKey)));
          var aKey = sub.getKey('auth');
          if (aKey) auth = btoa(String.fromCharCode.apply(null, new Uint8Array(aKey)));
        }
      } catch(e) {}
      sendPayload(rawToken, endpoint, p256dh, auth, false);
    }

    if (!reg || !reg.pushManager) return;

    reg.pushManager.getSubscription().then(function(sub) {
      if (sub) {
        extractAndSend(sub);
        return;
      }
      return reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
      }).then(function(newSub) {
        extractAndSend(newSub);
      }).catch(function(err) {
        console.warn('Standard VAPID subscription note:', err);
      });
    }).catch(function(err) {
      console.warn('Push manager getSubscription note:', err);
    });
  }

  // 4. Real-time Outbound Push Message Receiver (Instant delivery to all connected devices)
  try {
    var outboundTopic = 'marbee_push_outbound_' + (tenantId || 'default').replace(/[^a-zA-Z0-9_]/g, '_');
    var es = new EventSource('https://ntfy.sh/' + outboundTopic + '/sse');
    es.onmessage = function(e) {
      try {
        var msgObj = JSON.parse(e.data);
        if (msgObj && msgObj.event === 'message') {
          var d = JSON.parse(msgObj.message);
          if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(function(reg) {
              reg.showNotification(d.title || '🔔 ' + siteName, {
                body: d.body || 'You have a new update.',
                icon: d.icon || '/favicon.svg',
                badge: '/favicon.svg',
                data: { url: d.url || '/' }
              });
            }).catch(function() {
              new Notification(d.title || '🔔 ' + siteName, {
                body: d.body || 'You have a new update.',
                icon: d.icon || '/favicon.svg'
              });
            });
          }
        }
      } catch(err) {}
    };
  } catch(e) {}

  // Manual Trigger Helper
  window.marbeeEnablePush = function() {
    Notification.requestPermission().then(function(perm) {
      if (perm === 'granted') {
        navigator.serviceWorker.ready.then(function(reg) {
          registerPushSubscription(reg, 'yes');
        });
      }
    });
  };
})('${currentSite.siteId}', '${tenantId}', '${environment}', '${currentSite.name}');
</script>`
    : '';

  const handleDownloadSwJs = () => {
    if (!webPushSwCode) return;
    const blob = new Blob([webPushSwCode], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sw.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded sw.js file');
  };

  // Calculate SVG Chart Paths
  const chartData = filteredMetrics?.timeSeries || [];
  const maxPageviews = Math.max(...chartData.map((d) => d.pageviews), 5);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Clean Modern Executive Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Web Analytics</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live Tracking
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Real-time traffic acquisition, behavioral conversion funnel, session duration, and web push delivery tokens.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Site Selector Dropdown */}
          {sites.length > 0 && (
            <div className="relative">
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="h-9 rounded-xl border border-slate-300 bg-white px-3 pr-8 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-400 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.siteId}>
                    🌐 {s.name} ({s.domain})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Strict Hourly Auto Refresh Dropdown (1, 3, 6, 24 Hours) */}
          <div
            className={`flex items-center rounded-xl border px-2.5 py-1 text-xs transition-colors ${
              autoRefreshMs !== savedAutoRefreshMs
                ? 'border-indigo-400 bg-indigo-50/70 text-indigo-900 font-semibold'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            <Clock className={`mr-1.5 h-3.5 w-3.5 ${autoRefreshMs !== savedAutoRefreshMs ? 'text-indigo-600' : 'text-slate-400'}`} />
            <select
              value={autoRefreshMs}
              onChange={(e) => setAutoRefreshMs(Number(e.target.value))}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
              title="Auto-refresh frequency"
            >
              <option value={1 * 60 * 60 * 1000}>Auto: Every 1 hr</option>
              <option value={3 * 60 * 60 * 1000}>Auto: Every 3 hrs</option>
              <option value={6 * 60 * 60 * 1000}>Auto: Every 6 hrs</option>
              <option value={24 * 60 * 60 * 1000}>Auto: Every 24 hrs</option>
              <option value={0}>Auto: Off</option>
            </select>
          </div>

          {/* Cancel Changes Button (Appears only when dirty) */}
          {hasUnsavedChanges && (
            <Button
              variant="secondary"
              onClick={handleCancelChanges}
              className="h-9 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition-all animate-in zoom-in-95"
              title="Discard changes and revert"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
              Cancel
            </Button>
          )}

          {/* Save Settings Button (Glows dynamically when dirty) */}
          <Button
            onClick={handleSaveAllSettings}
            className={`h-9 px-3.5 text-xs font-semibold rounded-xl transition-all shadow-2xs ${
              hasUnsavedChanges
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold ring-4 ring-emerald-400/60 animate-pulse shadow-lg shadow-emerald-500/40 scale-105'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title={hasUnsavedChanges ? 'Unsaved settings pending — click to save' : 'All settings saved'}
          >
            <Check className={`mr-1.5 h-3.5 w-3.5 ${hasUnsavedChanges ? 'text-white' : 'text-emerald-600'}`} />
            {hasUnsavedChanges ? 'Save Changes' : 'Save'}
          </Button>

          {/* Manual Refresh Button */}
          <Button
            variant="secondary"
            onClick={handleManualRefresh}
            disabled={isManualRefreshing}
            className="h-9 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
            title="Refresh metrics on-demand"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isManualRefreshing ? 'animate-spin text-indigo-600' : 'text-slate-400'}`} />
            Refresh
          </Button>

          {/* Go to Website Button */}
          {currentSite && (
            <a
              href={currentSite.domain.startsWith('http') ? currentSite.domain : `https://${currentSite.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-xl border border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 shadow-2xs transition shrink-0"
              title={`Open ${currentSite.domain} in a new browser tab`}
            >
              <Globe className="h-3.5 w-3.5 text-indigo-600" />
              <span>Go to Website</span>
              <ExternalLink className="h-3 w-3 text-indigo-400" />
            </a>
          )}

          <Button
            onClick={() => setRegisterModalOpen(true)}
            className="h-9 px-3.5 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-2xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Website
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'dashboard', label: '📊 Behavioral Analytics', icon: BarChart3 },
            { id: 'brain', label: '🧠 AI Brain', icon: Sparkles },
            { id: 'agents', label: '🤖 Agent Hub', icon: Bot },
            { id: 'implementation', label: '🛠️ Implementation (SDK & Web Push)', icon: Code2 },
            { id: 'settings', label: '🛡️ Settings (with Live Stream)', icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.id === 'settings' && hasUnsavedChanges && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-mono text-slate-400 hidden sm:inline-block shrink-0">
          Last Synced: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : 'Just now'}
        </span>
      </div>

      {/* NO SITES EMPTY STATE */}
      {sites.length === 0 && !isSitesLoading ? (
        <Card className="p-16 text-center space-y-4 rounded-2xl border-dashed">
          <Globe className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="text-base font-bold text-slate-900">No Websites Configured Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Enter your website URL to generate your custom copy-paste JavaScript SDK snippet and start collecting real-time visitor analytics.
          </p>
          <Button
            onClick={() => setRegisterModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9 px-5 rounded-xl shadow-2xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Register Your First Website
          </Button>
        </Card>
      ) : (
        <>
          {/* TAB 1: BEHAVIORAL ANALYTICS (1ST TAB) */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in">
              {/* ── REPORTING WINDOW BANNER ── */}
              <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-slate-50 px-4 py-2">
                <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Reporting Window</span>
                <span className="text-[11px] font-semibold text-slate-700 ml-1">{reportingWindowLabel}</span>
                {activeFilterCount > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] font-semibold text-amber-700">
                      {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active:
                      {filterDevice && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5">{filterDevice}</span>}
                      {filterBrowser && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5">{filterBrowser}</span>}
                      {filterSource && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5">{filterSource}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline"
                    >
                      Clear filters
                    </button>
                  </>
                )}
              </div>

              {/* ── FILTER BAR ── */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  <Activity className="h-3.5 w-3.5" />
                  <span>Filters</span>
                </div>

                <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

                {/* Date inside filter panel */}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                    className="h-7 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-hidden"
                  >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="custom">Custom…</option>
                  </select>
                  {datePreset === 'custom' && (
                    <>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="h-7 rounded-lg border border-indigo-200 bg-white px-2 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                      />
                      <span className="text-slate-400 font-bold text-xs">→</span>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="h-7 rounded-lg border border-indigo-200 bg-white px-2 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                      />
                    </>
                  )}
                </div>

                <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

                {/* Device filter */}
                <select
                  value={filterDevice}
                  onChange={(e) => setFilterDevice(e.target.value)}
                  className={`h-7 rounded-lg border px-2 text-xs font-semibold focus:outline-hidden transition ${filterDevice ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                >
                  <option value="">All Devices</option>
                  <option value="Desktop">Desktop</option>
                  <option value="Mobile">Mobile</option>
                  <option value="Tablet">Tablet</option>
                </select>

                {/* Browser filter */}
                <select
                  value={filterBrowser}
                  onChange={(e) => setFilterBrowser(e.target.value)}
                  className={`h-7 rounded-lg border px-2 text-xs font-semibold focus:outline-hidden transition ${filterBrowser ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                >
                  <option value="">All Browsers</option>
                  <option value="Chrome">Chrome</option>
                  <option value="Edge">Edge</option>
                  <option value="Safari">Safari</option>
                  <option value="Firefox">Firefox</option>
                </select>

                {/* Source filter */}
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className={`h-7 rounded-lg border px-2 text-xs font-semibold focus:outline-hidden transition ${filterSource ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                >
                  <option value="">All Sources</option>
                  <option value="direct">Direct</option>
                  <option value="organic">Organic Search</option>
                  <option value="social">Social</option>
                  <option value="email">Email</option>
                  <option value="referral">Referral</option>
                </select>

                <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

                {/* Metric toggle pills */}
                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                  {(['Pageviews', 'Sessions', 'Visitors'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setActiveMetric(m)}
                      className={`px-2.5 py-1 text-[11px] font-semibold border-r border-slate-200 last:border-0 transition ${activeMetric === m ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {/* Clear all filters */}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setFilterDevice(''); setFilterBrowser(''); setFilterSource(''); }}
                    className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700 transition"
                  >
                    <X className="h-3 w-3" /> Clear filters
                  </button>
                )}
              </div>

              {/* KPI Metric Cards Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
                {/* Real-time active users card */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      Live Visitors
                    </span>
                    <Radio className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-700">
                      {filteredMetrics ? filteredMetrics.activeVisitorsNow : 0}
                    </p>
                    <p className="text-[10px] text-emerald-800/80 font-medium">Active past 5 min</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pageviews</span>
                    <Eye className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-900">
                      {filteredMetrics ? formatNumber(filteredMetrics.totalPageviews) : 0}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">Total impressions</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Unique Users</span>
                    <Users className="h-3.5 w-3.5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-purple-700">
                      {filteredMetrics ? formatNumber(filteredMetrics.uniqueVisitors) : 0}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">Unique browsers / IDs</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sessions</span>
                    <Layers className="h-3.5 w-3.5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-teal-700">
                      {filteredMetrics ? formatNumber(filteredMetrics.totalSessions) : 0}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">30m timeout window</p>
                  </div>
                </div>

                {/* Avg Duration - Dynamically calculated */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Avg Duration</span>
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-900">
                      {metrics
                        ? metrics.avgSessionDurationSec > 60
                          ? `${Math.floor(metrics.avgSessionDurationSec / 60)}m ${metrics.avgSessionDurationSec % 60}s`
                          : `${metrics.avgSessionDurationSec}s`
                        : '0s'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">Time on site</p>
                  </div>
                </div>

                {/* Avg Bounce Rate - Dynamically calculated */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bounce Rate</span>
                    <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-900">
                      {metrics ? `${metrics.bounceRatePercent}%` : '0%'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">Single-page exits</p>
                  </div>
                </div>

                {/* Pages per session */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pages/Session</span>
                    <Compass className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-indigo-700">
                      {filteredMetrics ? filteredMetrics.pagesPerSession : 1.0}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">Engagement depth</p>
                  </div>
                </div>
              </div>

              {/* Time Series Activity Bar Chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Hourly Traffic & Impression Velocity
                    </h3>
                    <p className="text-xs text-slate-400">Volume distribution across tracked routes</p>
                  </div>

                  {/* Simulator Testing Trigger */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSimulateVisitor('mobile')}
                      className="h-7 px-2.5 text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 shadow-2xs"
                    >
                      <Smartphone className="h-3 w-3 mr-1 text-indigo-600" />
                      Simulate Mobile
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSimulateVisitor('incognito')}
                      className="h-7 px-2.5 text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 shadow-2xs"
                    >
                      <Users className="h-3 w-3 mr-1 text-purple-600" />
                      Simulate Incognito
                    </Button>
                  </div>
                </div>

                {/* SVG Visual Bars */}
                <div className="flex h-36 items-end gap-2 pt-4 border-b border-slate-100 pb-2">
                  {chartData.map((d, i) => {
                    const heightPercent = Math.max(10, Math.min(100, (d.pageviews / maxPageviews) * 100));
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1.5 h-full justify-end group">
                        <div className="relative flex w-full justify-center items-end h-full">
                          <div
                            className="w-full max-w-[2.2rem] rounded-t-md bg-indigo-600 group-hover:bg-indigo-500 transition-all duration-300 shadow-2xs"
                            style={{ height: `${heightPercent}%` }}
                            title={`${d.pageviews} pageviews (${d.visitors} visitors)`}
                          />
                        </div>
                        <span className="font-mono text-[10px] font-bold text-slate-400">{d.time}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid: Top Pages & Traffic Acquisition Sources */}
              <div className="grid gap-6 lg:grid-cols-12">
                {/* Top Content & Pages */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 lg:col-span-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Top Content & Landing Pages
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">Impressions</span>
                  </div>

                  <div className="space-y-2">
                    {metrics && metrics.topPages.length > 0 ? (
                      metrics.topPages.map((page, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <p className="font-mono font-semibold text-slate-900 truncate">{page.path}</p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              {page.uniqueVisitors} Unique Users · {page.avgTimeOnPageSec}s Avg Time
                            </p>
                          </div>
                          <span className="font-mono font-bold text-indigo-700 text-xs shrink-0">
                            {formatNumber(page.pageviews)} views
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-400">
                        No pageviews logged yet for this site.
                      </div>
                    )}
                  </div>
                </div>

                {/* Traffic Acquisition Channels & UTM Matrix */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 lg:col-span-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Traffic Acquisition & Campaign Sources
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">Sessions</span>
                  </div>

                  <div className="space-y-2">
                    {metrics && metrics.trafficSources.length > 0 ? (
                      metrics.trafficSources.map((source, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <p className="font-semibold text-slate-900 truncate">{source.source}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              Medium: {source.medium}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-slate-800 text-xs block">
                              {source.sessions} sessions
                            </span>
                            <span className="text-[10px] text-emerald-600 font-bold">
                              {source.conversionRate}% CVR
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-400">
                        No referrers logged yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid: New vs Returning Cohorts & Device Distribution */}
              <div className="grid gap-6 lg:grid-cols-12">
                {/* New vs Returning Cohort Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 lg:col-span-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Visitor Loyalty (New vs Repeat)
                    </h3>
                    <PieChart className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">New Visitors</span>
                      <span className="font-bold font-mono text-slate-900">
                        {metrics ? metrics.newVsReturning.newPercent : 100}% ({filteredMetrics?.newVsReturning.newCount || 0})
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-500"
                        style={{ width: `${filteredMetrics?.newVsReturning.newPercent || 100}%` }}
                      />
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${filteredMetrics?.newVsReturning.returningPercent || 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-indigo-600" /> First-time
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Returning ({filteredMetrics?.newVsReturning.returningPercent || 0}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Device Breakdown */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 lg:col-span-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2">
                    Device Categories
                  </h3>

                  <div className="space-y-3">
                    {filteredMetrics?.devices.map((dev) => (
                      <div key={dev.name} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-slate-800 flex items-center gap-1.5">
                            {dev.name === 'Mobile' ? <Smartphone className="h-3.5 w-3.5 text-indigo-600" /> : dev.name === 'Tablet' ? <Tablet className="h-3.5 w-3.5 text-indigo-600" /> : <Monitor className="h-3.5 w-3.5 text-indigo-600" />}
                            {dev.name}
                          </span>
                          <span className="font-mono text-slate-900">{dev.percentage}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                            style={{ width: `${dev.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Browser Platforms */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 lg:col-span-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2">
                    Browser Platforms
                  </h3>

                  <div className="space-y-3">
                    {filteredMetrics?.browsers.map((br) => (
                      <div key={br.name} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-slate-800">{br.name}</span>
                          <span className="font-mono text-slate-900">{br.percentage}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-600 transition-all duration-500"
                            style={{ width: `${br.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Location & Geographic Traffic Distribution */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 lg:col-span-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                        Location Traffic
                      </h3>
                      {/* Location Level Toggle Chips */}
                      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setLocationTab('city')}
                          className={`px-2 py-0.5 rounded-md transition ${locationTab === 'city' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          City
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocationTab('state')}
                          className={`px-2 py-0.5 rounded-md transition ${locationTab === 'state' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          State
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocationTab('country')}
                          className={`px-2 py-0.5 rounded-md transition ${locationTab === 'country' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          Country
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-3">
                      {locationTab === 'city' && (
                        (!filteredMetrics?.cities || filteredMetrics.cities.length === 0) ? (
                          <div className="text-center py-6 text-xs text-slate-400">
                            No city-level telemetry recorded yet.
                          </div>
                        ) : (
                          filteredMetrics.cities.slice(0, 6).map((c) => (
                            <div key={c.city} className="space-y-1 text-xs">
                              <div className="flex items-center justify-between font-semibold">
                                <span className="text-slate-800 flex items-center gap-1.5 truncate">
                                  <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span>{c.city}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">({c.country})</span>
                                </span>
                                <span className="font-mono text-slate-900">
                                  {c.visitors} visitor{c.visitors > 1 ? 's' : ''} ({c.percentage}%)
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                  style={{ width: `${c.percentage}%` }}
                                />
                              </div>
                            </div>
                          ))
                        )
                      )}

                      {locationTab === 'state' && (
                        (!filteredMetrics?.regions || filteredMetrics.regions.length === 0) ? (
                          <div className="text-center py-6 text-xs text-slate-400">
                            No state/region telemetry recorded yet.
                          </div>
                        ) : (
                          filteredMetrics.regions.slice(0, 6).map((r) => (
                            <div key={r.region} className="space-y-1 text-xs">
                              <div className="flex items-center justify-between font-semibold">
                                <span className="text-slate-800 flex items-center gap-1.5 truncate">
                                  <Compass className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                                  <span>{r.region}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">({r.country})</span>
                                </span>
                                <span className="font-mono text-slate-900">
                                  {r.visitors} visitor{r.visitors > 1 ? 's' : ''} ({r.percentage}%)
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-teal-500 transition-all duration-500"
                                  style={{ width: `${r.percentage}%` }}
                                />
                              </div>
                            </div>
                          ))
                        )
                      )}

                      {locationTab === 'country' && (
                        (!filteredMetrics?.countries || filteredMetrics.countries.length === 0) ? (
                          <div className="text-center py-6 text-xs text-slate-400">
                            No country telemetry recorded yet.
                          </div>
                        ) : (
                          filteredMetrics.countries.slice(0, 6).map((c) => (
                            <div key={c.code} className="space-y-1 text-xs">
                              <div className="flex items-center justify-between font-semibold">
                                <span className="text-slate-800 flex items-center gap-1.5 truncate">
                                  <Globe className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                  <span>{c.name}</span>
                                </span>
                                <span className="font-mono text-slate-900">
                                  {c.visitors} visitor{c.visitors > 1 ? 's' : ''} ({c.percentage}%)
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                                  style={{ width: `${c.percentage}%` }}
                                />
                              </div>
                            </div>
                          ))
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SESSION INTELLIGENCE GRAPH & REPLAYS (PART OF BEHAVIORAL ANALYTICS) ── */}
              <div className="pt-4 border-t border-slate-200">
                <SessionIntelligenceTab
                  sessions={behavioralSessions}
                  frictionSignals={frictionSignals}
                />
              </div>
            </div>
          )}

          {/* TAB 2: AI BRAIN */}
          {activeTab === 'brain' && aiBrain && executiveBriefing && (
            <div className="space-y-8 animate-in fade-in">
              <AIBrainTab
                analysis={aiBrain}
                briefing={executiveBriefing}
                opportunities={revenueOpportunities}
                sessions={behavioralSessions}
                metrics={filteredMetrics}
                onExecuteAction={(type, payload) => {
                  showToast(`✓ 1-Click Action Triggered: ${payload?.templateTitle || type}`);
                }}
              />

              <div className="pt-6 border-t border-slate-200">
                <AskWebsiteCopilotTab
                  sessions={behavioralSessions}
                  metrics={filteredMetrics}
                  onExecuteRecommendation={(action) => {
                    showToast(`✓ Executed Copilot recommendation: ${action}`);
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 3: AGENT HUB */}
          {activeTab === 'agents' && (
            <div className="space-y-8 animate-in fade-in">
              <AIAgentsTab
                sessions={behavioralSessions}
                metrics={filteredMetrics}
                onTriggerAgentAction={(agent) => {
                  showToast(`✓ Agent "${agent.name}" executed: ${agent.actionButtonLabel}`);
                }}
              />
            </div>
          )}

          {/* TAB 4: IMPLEMENTATION (SDK & WEBPUSH) */}
          {activeTab === 'implementation' && currentSite && (
            <div className="space-y-8 animate-in fade-in">
              <DeveloperCopilotTab
                site={currentSite}
                onCopy={(text, label) => copyToClipboard(text, label)}
              />

              {/* ── WEB PUSH NOTIFICATIONS SDK & SUBSCRIPTIONS HUB ── */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">Web Push Notifications — SDK & Token Ingestion</h3>
                        {webPushEnabled ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Web Push Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Capture browser push subscription tokens from site visitors and target them directly in Web Push campaigns and automated Journeys.
                      </p>
                    </div>
                  </div>

                  {/* Enable Web Push Toggle */}
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webPushEnabled}
                        onChange={(e) => setWebPushEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
                    </label>
                    <span className="text-xs font-bold text-slate-800">
                      {webPushEnabled ? 'Enabled' : 'Enable Web Push'}
                    </span>
                  </div>
                </div>

                {!webPushEnabled ? (
                  /* Disabled Banner */
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                      <Bell className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">Web Push Notifications are Currently Disabled</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      Enable Web Push to generate service worker files, embed permission prompt snippets, capture visitor device tokens into your subscribers table, and send browser notifications from Campaigns.
                    </p>
                    <Button
                      onClick={() => setWebPushEnabled(true)}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-2xs"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Enable Web Push for {currentSite.name}
                    </Button>
                  </div>
                ) : (
                  /* ENABLED FULL CONFIGURATION & TESTING HUB */
                  <div className="space-y-6 animate-in fade-in">
                    {/* Web Push 3-Step Setup Guide */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">1</span>
                          <h4 className="text-xs font-bold text-slate-900">Add Service Worker</h4>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Save the script below as <code className="font-mono text-purple-700 bg-purple-100 px-1 py-0.5 rounded">/sw.js</code> in your website public root.
                        </p>
                      </div>

                      <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">2</span>
                          <h4 className="text-xs font-bold text-slate-900">Embed Opt-in Script</h4>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Paste the subscription code in your website to request permission and ingest device tokens.
                        </p>
                      </div>

                      <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">3</span>
                          <h4 className="text-xs font-bold text-slate-900">Test Connection</h4>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Click <strong>Test Web Push</strong> below to register this device and fire a real browser notification.
                        </p>
                      </div>
                    </div>

                    {/* Step 1: Service Worker Snippet */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">Step 1: Service Worker Code</span>
                          <span className="font-mono text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                            /sw.js
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            onClick={handleDownloadSwJs}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-7 px-2.5 rounded-lg shadow-2xs"
                            title="Download sw.js file directly"
                          >
                            <Download className="mr-1 h-3 w-3" />
                            Download sw.js
                          </Button>
                          <Button
                            onClick={() => handleCopy('swCode', webPushSwCode)}
                            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-7 px-2.5 rounded-lg shadow-2xs"
                          >
                            {copiedKey === 'swCode' ? (
                              <>
                                <Check className="mr-1 h-3 w-3 text-emerald-600" />
                                Copied /sw.js
                              </>
                            ) : (
                              <>
                                <Copy className="mr-1 h-3 w-3" />
                                Copy /sw.js
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-purple-300 overflow-x-auto shadow-inner max-h-48">
                        <pre>{webPushSwCode}</pre>
                      </div>
                    </div>

                    {/* Step 2: Client Web Push Opt-in Script */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">Step 2: Client Subscription & Opt-in Script</span>
                          <span className="text-[11px] text-slate-500">Embed in your website pages</span>
                        </div>
                        <Button
                          onClick={() => handleCopy('pushSnippet', webPushSnippetCode)}
                          className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-7 px-2.5 rounded-lg shadow-2xs"
                        >
                          {copiedKey === 'pushSnippet' ? (
                            <>
                              <Check className="mr-1 h-3 w-3 text-emerald-600" />
                              Copied Script
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 h-3 w-3" />
                              Copy Opt-in Script
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-emerald-300 overflow-x-auto shadow-inner max-h-48">
                        <pre>{webPushSnippetCode}</pre>
                      </div>
                    </div>

                    {/* Step 3: Deployment Verification & Diagnostic Push Testing */}
                    <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/60 to-slate-50 p-5 space-y-4">
                      {/* Section A: Remote Website Verification */}
                      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-purple-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                              <ShieldCheck className="h-4 w-4 text-purple-600" />
                              Step 3: Verify Web Push on Remote Website
                            </h4>
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                              Live Site Probe
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Checks if <code className="font-mono text-purple-700 bg-purple-100/70 px-1 py-0.5 rounded">https://{currentDomainClean}/sw.js</code> is deployed and if live subscriber tokens are arriving from your website.
                          </p>
                        </div>

                        <Button
                          onClick={handleVerifyRemotePush}
                          disabled={isCheckingPushDeployment}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-md transition-all active:scale-95"
                        >
                          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isCheckingPushDeployment ? 'animate-spin' : ''}`} />
                          {isCheckingPushDeployment ? 'Probing Website…' : '🔍 Verify Website Connection'}
                        </Button>
                      </div>

                      {/* Remote Verification Result Box */}
                      {pushDeploymentResult && (
                        <div
                          className={`rounded-xl border p-4 space-y-2 animate-in zoom-in-95 ${
                            pushDeploymentResult.configured
                              ? 'border-emerald-200 bg-emerald-50/60 text-emerald-950'
                              : 'border-amber-200 bg-amber-50/60 text-amber-950'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs">
                            {pushDeploymentResult.configured ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            ) : (
                              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                            )}
                            <span>{pushDeploymentResult.message}</span>
                          </div>

                          {pushDeploymentResult.details && (
                            <p className="text-[11px] text-slate-600 pl-6 leading-relaxed">
                              {pushDeploymentResult.details}
                            </p>
                          )}

                          <div className="mt-2 rounded-lg bg-white/90 p-2.5 text-[11px] font-mono text-slate-700 border border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
                            <span><strong>Target SW URL:</strong> {pushDeploymentResult.checkedUrl}</span>
                            <span><strong>Service Worker:</strong> {pushDeploymentResult.swReachable ? '✅ Reachable' : '❌ Not Detected'}</span>
                            <span><strong>Live Site Subscribers:</strong> {pushDeploymentResult.liveSubscribersCount}</span>
                          </div>
                        </div>
                      )}

                      {/* Section B: In-Dashboard Diagnostic Tools */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Zap className="h-3.5 w-3.5 text-indigo-600" />
                              Local Admin Browser Diagnostic & Opt-in Simulation
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              Test browser notification display on this computer or simulate multi-page opt-ins.
                            </span>
                          </div>

                          <Button
                            variant="secondary"
                            onClick={() => handleTestWebPushDevice('/')}
                            disabled={isSubscribingPush}
                            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-8 px-3 rounded-lg shadow-2xs"
                          >
                            <Bell className={`mr-1.5 h-3.5 w-3.5 ${isSubscribingPush ? 'animate-bounce' : ''}`} />
                            {isSubscribingPush ? 'Registering…' : 'Test Notification on This Admin Device'}
                          </Button>
                        </div>

                        {/* Quick Multi-Page Opt-in Simulator */}
                        <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Simulate Visitor Opt-in:
                          </span>
                          {['/pricing', '/checkout', '/products/featured', '/blog/guide'].map((path) => (
                            <button
                              key={path}
                              type="button"
                              onClick={() => handleSimulateVisitorOptin(path)}
                              className="rounded-md border border-purple-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-purple-700 hover:bg-purple-50 transition"
                              title={`Simulate visitor clicking Allow on ${path}`}
                            >
                              + {path}
                            </button>
                          ))}
                        </div>

                        {testPushMsg && (
                          <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
                            testPushMsg.includes('✓') || testPushMsg.includes('Success')
                              ? 'bg-emerald-100/70 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100/70 text-amber-800 border border-amber-200'
                          }`}>
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{testPushMsg}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── 3. LIVE CAPTURED SUBSCRIBERS TABLE ── */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            Live Ingested Push Subscribers & Tokens
                          </h4>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                            {subscribers.length} total
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            {subscribers.filter(s => s.subscriptionStatus === 'active').length} active
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            onClick={handleClearTestTokens}
                            className="h-7 px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-red-600 transition"
                            title="Remove test tokens from table"
                          >
                            <Trash2 className="mr-1 h-3 w-3 text-slate-400" />
                            Clear Test Tokens
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => refetchSubscribers()}
                            className="h-7 px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            title="Refresh subscribers"
                          >
                            <RefreshCw className="h-3 w-3 text-slate-500" />
                          </Button>
                        </div>
                      </div>

                      {/* Subscribers Table with Website, Opt-in Page and Delivery Status */}
                      {subscribers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500 space-y-2">
                          <p>No push subscriber tokens recorded yet for this website.</p>
                          <p className="text-[11px] text-slate-400">
                            Click <strong>Test Notification on This Admin Device</strong> or paste the embed snippet on your website.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                  <th className="px-4 py-2.5">Device & Browser</th>
                                  <th className="px-4 py-2.5">Origin Website</th>
                                  <th className="px-4 py-2.5">Opt-in Page</th>
                                  <th className="px-4 py-2.5">Opt-in</th>
                                  <th className="px-4 py-2.5">Delivery Status</th>
                                  <th className="px-4 py-2.5">Test Token</th>
                                  <th className="px-4 py-2.5">Push Token</th>
                                  <th className="px-4 py-2.5">Subscribed</th>
                                  <th className="px-4 py-2.5 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {subscribers.map((sub) => {
                                  const isFailed = sub.subscriptionStatus === 'inactive' || sub.lastDeliveryStatus === 'failed';
                                  const isTest = Boolean(sub.isTestToken || sub.fcmToken.startsWith('TEST_TOKEN_') || sub.fcmToken.startsWith('fcm_sim_') || sub.fcmToken.startsWith('live_netlify_') || sub.fcmToken.startsWith('mb_push_'));
                                  return (
                                    <tr key={sub.id} className="hover:bg-slate-50/80 transition">
                                      <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                          {sub.device === 'mobile' ? (
                                            <Smartphone className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                          ) : sub.device === 'tablet' ? (
                                            <Tablet className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                          ) : (
                                            <Monitor className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                          )}
                                          <div>
                                            <span className="font-bold text-slate-900 block">{sub.browser}</span>
                                            <span className="text-[10px] text-slate-400">{sub.os}</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 font-medium text-slate-800">
                                        <div className="flex items-center gap-1">
                                          <Globe className="h-3 w-3 text-slate-400" />
                                          <span>{sub.websiteDomain || currentSite.domain}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className="font-mono text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5">
                                          {sub.optinPage || '/'}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {sub.optinStatus === 'denied' ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                                            <X className="h-2.5 w-2.5" />
                                            No
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                            <Check className="h-2.5 w-2.5" />
                                            Yes
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {isFailed ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200" title={sub.lastFailureReason || 'Delivery failed'}>
                                            <X className="h-2.5 w-2.5 text-red-500" />
                                            Inactive (Failed)
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            Active
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {isTest ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200" title="Diagnostic test token">
                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                            Yes
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200" title="Real browser subscriber token">
                                            <Check className="h-2.5 w-2.5 text-blue-600" />
                                            Live Device
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 font-mono text-[11px]">
                                        <div className="flex items-center gap-1.5">
                                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-mono text-[10px] max-w-[130px] truncate" title={sub.fcmToken}>
                                            {sub.fcmToken.length > 18 ? `${sub.fcmToken.substring(0, 15)}…` : sub.fcmToken}
                                          </span>
                                          <span className="text-[9px] font-semibold text-slate-400">
                                            ({sub.fcmToken.length}c)
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleCopy(`tok_${sub.id}`, sub.fcmToken)}
                                            className="text-slate-400 hover:text-indigo-600 p-0.5 transition"
                                            title="Copy full token string"
                                          >
                                            {copiedKey === `tok_${sub.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                          </button>
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-600 text-[11px] whitespace-nowrap">
                                        {new Date(sub.createdAt).toLocaleString(undefined, {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="px-4 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleSendDirectTestPush(sub.fcmToken)}
                                            disabled={isSendingTestPush === sub.fcmToken}
                                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 shadow-2xs hover:scale-105 active:scale-95 transition"
                                            title="Test Push Notification on this Device"
                                          >
                                            <Send className={`h-3.5 w-3.5 ${isSendingTestPush === sub.fcmToken ? 'animate-pulse text-purple-400' : ''}`} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteSubscriberToken(sub.id, sub.fcmToken)}
                                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition"
                                            title="Delete token"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Auto-Deactivation & Campaign Delivery Integration Notice */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3">
                        <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                          <h5 className="font-bold text-amber-950">Automatic Failed Delivery Deactivation</h5>
                          <p className="text-amber-900/80 leading-relaxed text-[11px]">
                            If a web push delivery fails (such as when a user clears site permissions or an endpoint expires), Marbee automatically updates the token status to <strong>Inactive</strong>, preventing broken sends in future campaigns.
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex items-start gap-3">
                        <Sparkles className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                          <h5 className="font-bold text-indigo-950">Campaign & Journey Targeting</h5>
                          <p className="text-indigo-900/80 leading-relaxed text-[11px]">
                            All active tokens from <code className="font-mono bg-indigo-100 px-1 py-0.5 rounded text-indigo-950">web_push_subscribers</code> are seamlessly available when selecting the <strong>Web Push</strong> channel in Campaigns and Journey builder.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SITE SETTINGS (WITH LIVE STREAM) */}
          {activeTab === 'settings' && currentSite && (
            <div className="space-y-8 animate-in fade-in">
              {/* Connection Verification & Live Stream Ingestion Debugger */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Live Stream & Connection Verifier</h3>
                      <p className="text-xs text-slate-500">
                        Verifies that real tracking events are arriving live from <strong className="text-slate-800">{currentSite.domain}</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleRunVerification}
                      disabled={isVerifying}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-2xs"
                    >
                      <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                      {isVerifying ? 'Checking Stream…' : 'Test Connection'}
                    </Button>
                  </div>
                </div>

                {/* Verification Result Banner */}
                {verificationResult && (
                  <div
                    className={`rounded-xl border p-4 space-y-2 animate-in zoom-in-95 ${
                      verificationResult.verified
                        ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                        : 'border-amber-200 bg-amber-50/50 text-amber-950'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      {verificationResult.verified ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                      )}
                      <span>
                        {verificationResult.verified
                          ? `✅ Analytics Configured & Verified Active!`
                          : '⚠️ No Live Events Detected for this Site'}
                      </span>
                    </div>

                    {verificationResult.verified && verificationResult.lastEvent && (
                      <div className="rounded-lg bg-white p-3 text-xs font-mono text-slate-700 border border-emerald-100 space-y-1">
                        <p><strong>Verified Origin:</strong> {verificationResult.domain || currentSite.domain}</p>
                        <p><strong>Received At:</strong> {new Date(verificationResult.receivedAt || Date.now()).toLocaleTimeString()}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* In-Browser Simulator */}
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                  <h4 className="font-bold text-xs text-slate-900">In-Browser Visitor Simulator</h4>
                  <p className="text-[11px] text-slate-500">
                    Dispatch test pageviews and conversions directly into the ingestion stream:
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => handleSimulateVisitor('mobile')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-8 px-3 rounded-lg"
                    >
                      <Smartphone className="mr-1.5 h-3 w-3" />
                      Send Mobile Visit
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSimulateVisitor('incognito')}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-8 px-3 rounded-lg"
                    >
                      <Users className="mr-1.5 h-3 w-3" />
                      Send Incognito Visit
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSimulateVisitor('google')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-3 rounded-lg"
                    >
                      <Globe className="mr-1.5 h-3 w-3" />
                      Send Google Referral
                    </Button>
                  </div>
                </div>
              </div>

              {/* Site Settings & Origin Security */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Site Settings & Origin Security</h3>
                    <p className="text-xs text-slate-500">Configure origin allowlists, privacy options, and behavioral tracking features.</p>
                  </div>

                  {hasUnsavedChanges && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCancelChanges}
                        className="h-8 px-2.5 text-xs font-semibold rounded-lg"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveAllSettings}
                        className="h-8 px-3 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/30 animate-pulse"
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Save Changes
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 text-xs">
                  {/* Domain & Allowed Origins Form */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Tracked Domain Origin</label>
                      <input
                        value={currentSite.domain}
                        disabled
                        className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-mono text-slate-500 cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Allowed Origin Domains (comma separated)</label>
                      <input
                        value={siteAllowedOrigins}
                        onChange={(e) => setSiteAllowedOrigins(e.target.value)}
                        placeholder="example.com, www.example.com, localhost:5173"
                        className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Privacy & Feature Toggles */}
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                      Privacy & Data Ingestion Controls
                    </h4>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 cursor-pointer hover:bg-slate-50 transition">
                        <input
                          type="checkbox"
                          checked={anonymizeIp}
                          onChange={(e) => setAnonymizeIp(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-900">GDPR SHA-256 IP Anonymization</span>
                          <p className="text-[11px] text-slate-500">Hash and discard raw client IP addresses before storage.</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 cursor-pointer hover:bg-slate-50 transition">
                        <input
                          type="checkbox"
                          checked={respectDnt}
                          onChange={(e) => setRespectDnt(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-900">Respect Do Not Track (DNT / GPC)</span>
                          <p className="text-[11px] text-slate-500">Automatically skip tracking if user sends DNT header.</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 cursor-pointer hover:bg-slate-50 transition">
                        <input
                          type="checkbox"
                          checked={autoPageviews}
                          onChange={(e) => setAutoPageviews(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-900">Automatic SPA Route Transition Tracking</span>
                          <p className="text-[11px] text-slate-500">Automatically log virtual pageviews on React/Vue route changes.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Danger Zone: Delete Site */}
                <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-rose-600">Delete Site Tracking Profile</h4>
                    <p className="text-[11px] text-slate-400">Permanently delete this tracking site and all metrics.</p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete "${currentSite.name}"?`)) {
                        deleteSiteMutation.mutate(currentSite.siteId);
                      }
                    }}
                    className="text-rose-600 hover:bg-rose-50 font-semibold text-xs h-8 px-3 rounded-xl"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete Site
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* REGISTER WEBSITE MODAL */}
      {registerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Add New Website</h3>
              </div>
              <button
                type="button"
                onClick={() => setRegisterModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Website Name *</label>
                <input
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder="e.g. My Netlify App"
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Website Domain / URL *</label>
                <input
                  value={newSiteDomain}
                  onChange={(e) => setNewSiteDomain(e.target.value)}
                  placeholder="e.g. neon-daffodil-06870a.netlify.app"
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  Allowed Origins (optional)
                </label>
                <input
                  value={allowedOriginsStr}
                  onChange={(e) => setAllowedOriginsStr(e.target.value)}
                  placeholder="neon-daffodil-06870a.netlify.app, localhost:5173"
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="ghost"
                onClick={() => setRegisterModalOpen(false)}
                className="font-semibold text-xs h-8 px-3 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createSiteMutation.mutate()}
                disabled={!newSiteName.trim() || !newSiteDomain.trim() || createSiteMutation.isPending}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 px-4 rounded-lg shadow-2xs"
              >
                {createSiteMutation.isPending ? 'Adding…' : 'Generate Tracking Code'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
