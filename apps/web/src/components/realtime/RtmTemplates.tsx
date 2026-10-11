import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Bell, Check, ChevronRight, ClipboardCopy,
  Copy, Eye, EyeOff, Folder, FolderPlus, Globe, Lock,
  Play, Plus, Search, Shield, TestTube2,
  Trash2, X, Zap,
} from 'lucide-react';
import { Badge, Button, EmptyState } from '@/components/ui';
import { CHANNELS, STATUS_TONE, listDefinitions, type DefinitionSummary } from '@/lib/rtm';
import { RtmWizard } from './RtmWizard';
import { RtmDefinitionDrawer } from './RtmDefinitionDrawer';

function genId() { return crypto.randomUUID().slice(0, 8); }

type TemplateFolder = { id: string; name: string; parentId: string | null; locked?: boolean };

const SYSTEM_FOLDERS: TemplateFolder[] = [
  { id: 'all', name: 'All Templates', parentId: null, locked: true },
  { id: 'transactional-rt', name: 'Transactional ( RT )', parentId: null, locked: true },
  { id: 'txn-orders', name: 'Orders', parentId: 'transactional-rt' },
  { id: 'txn-payments', name: 'Payments', parentId: 'transactional-rt' },
  { id: 'txn-account', name: 'Account', parentId: 'transactional-rt' },
  { id: 'txn-otp', name: 'OTP & Verification', parentId: 'transactional-rt' },
  { id: 'txn-notifications', name: 'Notifications', parentId: 'transactional-rt' },
  { id: 'triggers', name: 'Triggers', parentId: null, locked: true },
  { id: 'trg-cart', name: 'Cart Abandonment', parentId: 'triggers' },
  { id: 'trg-browse', name: 'Browse Abandonment', parentId: 'triggers' },
  { id: 'trg-search', name: 'Search Abandonment', parentId: 'triggers' },
  { id: 'trg-wishlist', name: 'Wishlist Alerts', parentId: 'triggers' },
  { id: 'trg-price', name: 'Price Drop', parentId: 'triggers' },
  { id: 'trg-back-in-stock', name: 'Back in Stock', parentId: 'triggers' },
  { id: 'trg-reorder', name: 'Reorder Reminder', parentId: 'triggers' },
  { id: 'custom', name: 'Custom', parentId: null },
];

const LOCKED_IDS = new Set(SYSTEM_FOLDERS.filter((f) => f.locked).map((f) => f.id));

type TemplateStatus = 'draft' | 'testing' | 'approved' | 'active' | 'paused' | 'archived';
const LIFECYCLE: { key: TemplateStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'testing', label: 'Testing' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Published' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
];

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'rtm_';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function ApiUrlBlock({ label, url, apiKey, icon, accent }: { label: string; url: string; apiKey: string; icon: React.ReactNode; accent: string }) {
  const [copied, setCopied] = useState<'url' | 'key' | null>(null);
  const [showKey, setShowKey] = useState(false);

  const copy = (text: string, what: 'url' | 'key') => {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={`rounded-xl border ${accent} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-slate-800">{label}</span>
      </div>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Endpoint</p>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <code className="flex-1 truncate text-xs text-slate-700">{url}</code>
            <button type="button" onClick={() => copy(url, 'url')} className="shrink-0 text-slate-400 hover:text-slate-600">
              {copied === 'url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">API Key</p>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <code className="flex-1 truncate text-xs text-slate-700">{showKey ? apiKey : apiKey.slice(0, 8) + '••••••••••••••••••••••••'}</code>
            <button type="button" onClick={() => setShowKey(!showKey)} className="shrink-0 text-slate-400 hover:text-slate-600">
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => copy(apiKey, 'key')} className="shrink-0 text-slate-400 hover:text-slate-600">
              {copied === 'key' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RtmTemplates({ tenantId, environment }: { tenantId: string; environment: string }) {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selected, setSelected] = useState<DefinitionSummary | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [activeFolder, setActiveFolder] = useState('all');
  const [folders, setFolders] = useState<TemplateFolder[]>(() => {
    try { const s = localStorage.getItem('rtm_folders_v2'); return s ? JSON.parse(s) : SYSTEM_FOLDERS; } catch { return SYSTEM_FOLDERS; }
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(['transactional-rt', 'triggers']));
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [templateApiView, setTemplateApiView] = useState<DefinitionSummary | null>(null);

  const defs = useQuery({
    queryKey: ['rtm-definitions', tenantId, environment],
    queryFn: () => listDefinitions(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const saveFolders = useCallback((f: TemplateFolder[]) => {
    setFolders(f);
    localStorage.setItem('rtm_folders_v2', JSON.stringify(f));
  }, []);

  const addFolder = () => {
    if (!newFolderName.trim()) return;
    saveFolders([...folders, { id: `folder-${genId()}`, name: newFolderName.trim(), parentId: newFolderParent ?? null }]);
    setNewFolderName('');
    setNewFolderParent(undefined);
  };

  const removeFolder = (id: string) => {
    if (LOCKED_IDS.has(id)) return;
    saveFolders(folders.filter((f) => f.id !== id && f.parentId !== id));
    if (activeFolder === id) setActiveFolder('all');
  };

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const list = useMemo(() => {
    let result = defs.data ?? [];
    if (search) { const q = search.toLowerCase(); result = result.filter((d) => d.name.toLowerCase().includes(q) || d.event_type.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q)); }
    if (statusFilter) result = result.filter((d) => d.status === statusFilter);
    if (channelFilter) result = result.filter((d) => d.default_channel === channelFilter);
    return result;
  }, [defs.data, search, statusFilter, channelFilter]);

  const rootFolders = folders.filter((f) => f.parentId === null);
  const statusCounts = useMemo(() => {
    const all = defs.data ?? [];
    return {
      draft: all.filter((d) => d.status === 'draft').length,
      testing: all.filter((d) => (d as unknown as { status: string }).status === 'testing').length,
      active: all.filter((d) => d.status === 'active').length,
      paused: all.filter((d) => d.status === 'paused').length,
      archived: all.filter((d) => (d as unknown as { status: string }).status === 'archived').length,
    };
  }, [defs.data]);

  const baseUrl = `https://api.marbee.io/v1/rtm/${tenantId}`;
  const testBaseUrl = `https://api.marbee.io/v1/rtm/${tenantId}/test`;
  const testApiKey = useMemo(() => {
    try { const s = localStorage.getItem('rtm_test_api_key'); if (s) return s; const k = generateApiKey(); localStorage.setItem('rtm_test_api_key', k); return k; } catch { return generateApiKey(); }
  }, []);
  const prodApiKey = useMemo(() => {
    try { const s = localStorage.getItem('rtm_prod_api_key'); if (s) return s; const k = generateApiKey(); localStorage.setItem('rtm_prod_api_key', k); return k; } catch { return generateApiKey(); }
  }, []);

  return (
    <div className="flex gap-6">
      {/* Folder sidebar */}
      <div className="hidden w-56 shrink-0 lg:block">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Folders</h4>
          <button type="button" onClick={() => setNewFolderParent(null)} title="New folder" className="text-slate-400 hover:text-slate-600"><FolderPlus className="h-4 w-4" /></button>
        </div>

        {newFolderParent !== undefined && (
          <div className="mb-2 space-y-1">
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name"
              onKeyDown={(e) => e.key === 'Enter' && addFolder()}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none" autoFocus />
            <div className="flex items-center gap-1">
              <select value={newFolderParent ?? ''} onChange={(e) => setNewFolderParent(e.target.value || null)}
                className="flex-1 rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-600 focus:border-brand-500 focus:outline-none">
                <option value="">Root level</option>
                {folders.filter((f) => f.parentId === null && f.id !== 'all').map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <button type="button" onClick={addFolder} className="text-brand-600"><Plus className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setNewFolderParent(undefined)} className="text-slate-400"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          {rootFolders.map((f) => {
            const children = folders.filter((c) => c.parentId === f.id);
            const isExpanded = expandedFolders.has(f.id);
            const isLocked = LOCKED_IDS.has(f.id);
            return (
              <div key={f.id}>
                <button type="button" onClick={() => { setActiveFolder(f.id); if (children.length) toggleExpand(f.id); }}
                  className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${activeFolder === f.id ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {children.length > 0 ? <ChevronRight className={`h-3 w-3 shrink-0 transition ${isExpanded ? 'rotate-90' : ''}`} /> : <span className="w-3" />}
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate text-left">{f.name}</span>
                  {isLocked && f.id !== 'all' && <Lock className="h-2.5 w-2.5 shrink-0 text-slate-300" />}
                  {!isLocked && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeFolder(f.id); }} className="invisible text-slate-400 hover:text-red-500 group-hover:visible"><Trash2 className="h-3 w-3" /></button>
                  )}
                </button>
                {isExpanded && children.length > 0 && (
                  <div className="ml-5 space-y-0.5">
                    {children.map((c) => (
                      <button key={c.id} type="button" onClick={() => setActiveFolder(c.id)}
                        className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition ${activeFolder === c.id ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <Folder className="h-3 w-3 shrink-0" />
                        <span className="flex-1 truncate text-left">{c.name}</span>
                        {!LOCKED_IDS.has(c.id) && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeFolder(c.id); }} className="invisible text-slate-400 hover:text-red-500 group-hover:visible"><Trash2 className="h-3 w-3" /></button>
                        )}
                      </button>
                    ))}
                    <button type="button" onClick={() => { setNewFolderParent(f.id); setNewFolderName(''); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                      <Plus className="h-2.5 w-2.5" /> Add subfolder
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1 border-t border-slate-100 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">By Status</p>
          {[
            { key: 'active', label: 'Published', count: statusCounts.active, color: 'bg-emerald-500' },
            { key: 'testing', label: 'Testing', count: statusCounts.testing, color: 'bg-blue-500' },
            { key: 'draft', label: 'Draft', count: statusCounts.draft, color: 'bg-slate-400' },
            { key: 'paused', label: 'Paused', count: statusCounts.paused, color: 'bg-amber-500' },
            { key: 'archived', label: 'Archived', count: statusCounts.archived, color: 'bg-slate-300' },
          ].map((s) => (
            <button key={s.key} type="button" onClick={() => setStatusFilter(statusFilter === s.key ? '' : s.key)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition ${statusFilter === s.key ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
              <span className={`h-2 w-2 rounded-full ${s.color}`} /><span className="flex-1 text-left">{s.label}</span><span className="tabular-nums">{s.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates by name, event, or slug..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
          </div>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
            <option value="">All channels</option>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <Button onClick={() => setWizardOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New template</Button>
        </div>

        {/* Lifecycle bar */}
        <div className="mb-4 flex items-center gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lifecycle:</span>
          {LIFECYCLE.map((s, i, a) => (
            <span key={s.key} className="flex items-center gap-1 text-xs text-slate-500">
              {s.label} {i < a.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
            </span>
          ))}
        </div>

        {defs.isLoading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading templates...</div>
        ) : list.length === 0 ? (
          <EmptyState title="No message templates yet" description="Create your first template to start sending event-driven messages."
            action={<Button onClick={() => setWizardOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New template</Button>} />
        ) : (
          <div className="space-y-2">
            {list.map((d) => {
              const channel = CHANNELS.find((c) => c.value === d.default_channel);
              const rate = d.sent_7d > 0 ? Math.round((d.delivered_7d / d.sent_7d) * 100) : null;
              const isPublished = d.status === 'active';
              const isTesting = (d as unknown as { status: string }).status === 'testing';
              return (
                <div key={d.id} className="group rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow">
                  <button type="button" onClick={() => setSelected(d)} className="flex w-full items-center gap-4 p-4 text-left">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Bell className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-900">{d.name}</h3>
                        <Badge variant={STATUS_TONE[d.status]}>{d.status === 'active' ? 'published' : d.status}</Badge>
                        {d.latency_class === 'hot' && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"><Zap className="h-2.5 w-2.5" /> hot</span>}
                        {d.is_transactional && <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">txn</span>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        <code className="rounded bg-slate-100 px-1">{d.event_type}</code> → {channel?.label ?? d.default_channel}
                      </p>
                    </div>
                    <div className="hidden shrink-0 gap-6 text-right sm:flex">
                      <div><p className="text-sm font-semibold tabular-nums text-slate-900">{d.accepted_7d.toLocaleString()}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">accepted</p></div>
                      <div><p className="text-sm font-semibold tabular-nums text-slate-900">{d.delivered_7d.toLocaleString()}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">delivered</p></div>
                      <div><p className="text-sm font-semibold tabular-nums text-slate-900">{rate === null ? '—' : `${rate}%`}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">rate</p></div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>

                  {/* API URLs inline - show for testing or published */}
                  {(isPublished || isTesting) && (
                    <div className="border-t border-slate-100 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isTesting && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600">
                              <TestTube2 className="h-3 w-3" /> Test Mode
                            </span>
                          )}
                          {isPublished && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">
                              <Globe className="h-3 w-3" /> Live
                            </span>
                          )}
                          <code className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            POST {isPublished ? baseUrl : testBaseUrl}/events/{d.event_type}
                          </code>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setTemplateApiView(d); }}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700">
                          View API details
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {wizardOpen && (
        <RtmWizard
          folders={folders.filter((f) => f.id !== 'all')}
          existingEventNames={(defs.data ?? []).map((d) => d.event_type)}
          onClose={() => { setWizardOpen(false); void queryClient.invalidateQueries({ queryKey: ['rtm-definitions'] }); }}
        />
      )}
      {selected && <RtmDefinitionDrawer summary={selected} onClose={() => setSelected(null)} />}

      {/* API Detail Drawer */}
      {templateApiView && (
        <TemplateApiDrawer
          template={templateApiView}
          tenantId={tenantId}
          baseUrl={baseUrl}
          testBaseUrl={testBaseUrl}
          testApiKey={testApiKey}
          prodApiKey={prodApiKey}
          onClose={() => setTemplateApiView(null)}
        />
      )}
    </div>
  );
}

// ─── API Detail Drawer ─────────────────────────────────────────────────────

function TemplateApiDrawer({ template, tenantId, baseUrl, testBaseUrl, testApiKey, prodApiKey, onClose }: {
  template: DefinitionSummary; tenantId: string; baseUrl: string; testBaseUrl: string; testApiKey: string; prodApiKey: string; onClose: () => void;
}) {
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null);
  const isPublished = template.status === 'active';

  const defaultSamplePayload = useMemo(() => JSON.stringify({
    event: template.event_type,
    customer: { id: 'cust_12345', email: 'user@example.com', mobile: '+919876543210' },
    data: { order_id: 'ORD-98765', amount: 1299.00, currency: 'INR', items: [{ name: 'Sample Product', qty: 1 }] },
    idempotency_key: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }, null, 2), [template.event_type]);

  const [payloadText, setPayloadText] = useState(defaultSamplePayload);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const getParsedPayload = () => {
    try {
      return JSON.parse(payloadText);
    } catch {
      return {
        customer: { id: 'cust_12345', email: 'user@example.com' },
        data: { order_id: 'ORD-98765', amount: 1299.00 },
      };
    }
  };

  const triggerApiCall = (isTest: boolean) => {
    const parsed = getParsedPayload();
    dispatchRealTimeEvent({
      eventName: template.event_type,
      isTestMode: isTest,
      tenantId,
      customer: (parsed.customer as { id?: string; email?: string; mobile?: string }) || { email: 'user@example.com' },
      templateName: template.name,
      channel: template.default_channel,
      payload: (parsed.data as Record<string, unknown>) || parsed,
    });
    setTriggerSuccess(`Successfully dispatched ${isTest ? 'Test' : 'Live'} API event for '${template.event_type}' with custom payload! Switch to Real-Time Events tab to view trace.`);
    setTimeout(() => setTriggerSuccess(null), 5000);
  };

  const parsed = getParsedPayload();
  const curlTest = `curl -X POST '${testBaseUrl}/events/${template.event_type}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${testApiKey}' \\
  -H 'X-Tenant-Id: ${tenantId}' \\
  -H 'X-Idempotency-Key: $(uuidgen)' \\
  -d '${JSON.stringify(parsed, null, 2)}'`;

  const curlProd = `curl -X POST '${baseUrl}/events/${template.event_type}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${prodApiKey}' \\
  -H 'X-Tenant-Id: ${tenantId}' \\
  -H 'X-Idempotency-Key: $(uuidgen)' \\
  -d '${JSON.stringify(parsed, null, 2)}'`;

  const copySnippet = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">API Configuration</h2>
            <p className="text-sm text-slate-500">{template.name} · <code className="rounded bg-slate-100 px-1.5 text-xs">{template.event_type}</code></p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-6 p-6">
          {triggerSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{triggerSuccess}</span>
            </div>
          )}

          {/* Trigger API interactive action bar */}
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Interactive API Trigger</p>
                <p className="text-xs text-slate-500">Send an event payload now to see it stream live in Real-Time Events.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => triggerApiCall(true)} className="bg-blue-600 hover:bg-blue-700">
                  <TestTube2 className="mr-1.5 h-3.5 w-3.5" /> Trigger Test API
                </Button>
                {isPublished && (
                  <Button size="sm" onClick={() => triggerApiCall(false)} className="bg-emerald-600 hover:bg-emerald-700">
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Trigger Prod API
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Security notice */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Security Requirements</p>
              <ul className="mt-1 space-y-1 text-xs text-amber-700">
                <li>All API calls require Bearer token authentication</li>
                <li>Include <code className="rounded bg-amber-100 px-1">X-Idempotency-Key</code> header to prevent duplicate processing</li>
                <li>Test mode events are isolated — they never reach production customers</li>
                <li>Rate limited: 10,000 events/min (test), 100,000 events/min (prod)</li>
                <li>TLS 1.2+ required — plain HTTP requests are rejected</li>
              </ul>
            </div>
          </div>

          {/* Test API */}
          <ApiUrlBlock
            label="Test Environment"
            url={`${testBaseUrl}/events/${template.event_type}`}
            apiKey={testApiKey}
            icon={<TestTube2 className="h-4 w-4 text-blue-600" />}
            accent="border-blue-200 bg-blue-50/30"
          />

          {/* Production API - only if published */}
          {isPublished ? (
            <ApiUrlBlock
              label="Production (Live)"
              url={`${baseUrl}/events/${template.event_type}`}
              apiKey={prodApiKey}
              icon={<Globe className="h-4 w-4 text-emerald-600" />}
              accent="border-emerald-200 bg-emerald-50/30"
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
              <Lock className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Production URL available after publishing</p>
              <p className="text-xs text-slate-400">Complete testing → approve → publish to get live API access</p>
            </div>
          )}

          {/* Sample payload - EDITABLE */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-900">Sample Event Payload</h4>
                <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">EDITABLE</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setPayloadText(defaultSamplePayload); setPayloadError(null); }} className="text-xs text-slate-400 hover:text-slate-600">
                  Reset Default
                </button>
                <button type="button" onClick={() => copySnippet(payloadText)} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                  {copiedSnippet ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy JSON
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">Edit the sample payload below. cURL code snippets and Interactive API Trigger update dynamically in real time.</p>
            <textarea
              value={payloadText}
              onChange={(e) => {
                const val = e.target.value;
                setPayloadText(val);
                try {
                  JSON.parse(val);
                  setPayloadError(null);
                } catch (err: any) {
                  setPayloadError(err.message);
                }
              }}
              rows={9}
              className="w-full rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed shadow-inner"
            />
            {payloadError && (
              <p className="mt-1 text-xs font-semibold text-red-600">Invalid JSON Syntax: {payloadError}</p>
            )}
          </div>

          {/* cURL snippets */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">cURL — Test</h4>
            <div className="relative">
              <pre className="max-h-48 overflow-auto rounded-xl bg-slate-900 p-4 pr-12 font-mono text-[11px] leading-relaxed text-emerald-300">
                {curlTest}
              </pre>
              <button type="button" onClick={() => copySnippet(curlTest)} className="absolute right-3 top-3 rounded bg-slate-700 p-1.5 text-slate-300 hover:bg-slate-600 hover:text-white">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {isPublished && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">cURL — Production</h4>
              <div className="relative">
                <pre className="max-h-48 overflow-auto rounded-xl bg-slate-900 p-4 pr-12 font-mono text-[11px] leading-relaxed text-emerald-300">
                  {curlProd}
                </pre>
                <button type="button" onClick={() => copySnippet(curlProd)} className="absolute right-3 top-3 rounded bg-slate-700 p-1.5 text-slate-300 hover:bg-slate-600 hover:text-white">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* How events flow */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-900">How Events Flow</h4>
            <div className="space-y-2">
              {[
                { step: '1', label: 'API receives event', desc: 'Validated against schema, idempotency checked' },
                { step: '2', label: 'Identity resolved', desc: 'Customer matched via ID / email / phone' },
                { step: '3', label: 'Triggers evaluated', desc: 'Conditions, frequency caps, quiet hours checked' },
                { step: '4', label: 'Message rendered', desc: 'Template merged with event payload data' },
                { step: '5', label: 'Delivered', desc: 'Sent via configured provider with fallback chain' },
                { step: '6', label: 'Visible in Real-Time Events', desc: 'Full trace available within seconds' },
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">{s.step}</span>
                  <div>
                    <p className="text-xs font-medium text-slate-800">{s.label}</p>
                    <p className="text-[10px] text-slate-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
