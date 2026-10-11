import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Play, Pause, MoreVertical, Clock, Zap, Globe,
  FileInput, CreditCard, Mail, ArrowRight, Trash2, Copy,
  CheckCircle2, XCircle, ChevronDown,
  Filter, LayoutGrid, List, Cpu, Settings2, Link2, Unlink,
} from 'lucide-react';
import type { AutomationWorkflow, ConnectionCredential } from '../../lib/automations';
import { getWorkflows, saveWorkflows, getConnections } from '../../lib/automations';

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  Webhook: <Globe className="w-3.5 h-3.5" />,
  Schedule: <Clock className="w-3.5 h-3.5" />,
  'Form Submit': <FileInput className="w-3.5 h-3.5" />,
  Event: <Zap className="w-3.5 h-3.5" />,
  Stripe: <CreditCard className="w-3.5 h-3.5" />,
  'Email Received': <Mail className="w-3.5 h-3.5" />,
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  paused: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  error: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export default function AutomationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'workflows' | 'connections'>('workflows');
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>(getWorkflows);
  const [connections] = useState<ConnectionCredential[]>(getConnections);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = workflows;
    if (search) list = list.filter((w) => w.title.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') list = list.filter((w) => w.status === statusFilter);
    return list;
  }, [workflows, search, statusFilter]);

  const stats = useMemo(() => ({
    total: workflows.length,
    active: workflows.filter((w) => w.status === 'active').length,
    totalRuns: workflows.reduce((s, w) => s + w.runsCount, 0),
    successRate: (() => {
      const t = workflows.reduce((s, w) => s + (w.successCount || 0), 0);
      const f = workflows.reduce((s, w) => s + (w.failCount || 0), 0);
      return t + f > 0 ? Math.round((t / (t + f)) * 100) : 100;
    })(),
  }), [workflows]);

  function createWorkflow() {
    const id = `flow-${Date.now().toString(36)}`;
    const wf: AutomationWorkflow = {
      id, title: 'Untitled Workflow', description: '', status: 'draft', version: 1,
      triggerType: 'Webhook', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      nodes: [], edges: [], runsCount: 0, tags: [],
    };
    const list = [wf, ...workflows];
    setWorkflows(list);
    saveWorkflows(list);
    navigate(`/data/automations/${id}`);
  }

  function duplicateWorkflow(wf: AutomationWorkflow) {
    const id = `flow-${Date.now().toString(36)}`;
    const copy: AutomationWorkflow = { ...wf, id, title: `${wf.title} (Copy)`, status: 'draft', runsCount: 0, updatedAt: new Date().toISOString() };
    const list = [copy, ...workflows];
    setWorkflows(list);
    saveWorkflows(list);
    setMenuOpen(null);
  }

  function deleteWorkflow(id: string) {
    const list = workflows.filter((w) => w.id !== id);
    setWorkflows(list);
    saveWorkflows(list);
    setMenuOpen(null);
  }

  function toggleStatus(wf: AutomationWorkflow) {
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    const list = workflows.map((w) => w.id === wf.id ? { ...w, status: newStatus as AutomationWorkflow['status'], updatedAt: new Date().toISOString() } : w);
    setWorkflows(list);
    saveWorkflows(list);
    setMenuOpen(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600" />
              <h1 className="text-xl font-semibold text-gray-900">Automations</h1>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Visual workflow builder with AI-powered nodes</p>
          </div>
          <button onClick={createWorkflow} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> New Workflow
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Workflows', value: stats.total, sub: `${stats.active} active` },
            { label: 'Active', value: stats.active, sub: 'running now' },
            { label: 'Total Runs', value: stats.totalRuns.toLocaleString(), sub: 'all time' },
            { label: 'Success Rate', value: `${stats.successRate}%`, sub: 'last 30 days' },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-semibold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['workflows', 'connections'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'workflows' ? 'Workflows' : 'Connections'}
            </button>
          ))}
        </div>
        {tab === 'workflows' && (
          <>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workflows…" className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
            </div>
            <div className="relative">
              <button onClick={() => setStatusFilter(statusFilter === 'all' ? 'active' : statusFilter === 'active' ? 'paused' : statusFilter === 'paused' ? 'draft' : 'all')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                <Filter className="w-3.5 h-3.5" /> {statusFilter === 'all' ? 'All' : statusFilter} <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setView('grid')} className={`p-1.5 ${view === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}><LayoutGrid className="w-4 h-4 text-gray-500" /></button>
              <button onClick={() => setView('list')} className={`p-1.5 ${view === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}><List className="w-4 h-4 text-gray-500" /></button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {tab === 'workflows' ? (
          filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Cpu className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No workflows found</p>
              <p className="text-sm mt-1">Create your first workflow to get started</p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((wf) => {
                const st = STATUS_STYLES[wf.status] || STATUS_STYLES.draft;
                return (
                  <div key={wf.id} onClick={() => navigate(`/data/automations/${wf.id}`)} className="bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group relative">
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate group-hover:text-indigo-600 transition-colors">{wf.title}</h3>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{wf.description || 'No description'}</p>
                        </div>
                        <div className="relative ml-2">
                          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === wf.id ? null : wf.id); }} className="p-1 rounded hover:bg-gray-100">
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </button>
                          {menuOpen === wf.id && (
                            <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => toggleStatus(wf)} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 w-full text-left">
                                {wf.status === 'active' ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Activate</>}
                              </button>
                              <button onClick={() => duplicateWorkflow(wf)} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 w-full text-left"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
                              <button onClick={() => deleteWorkflow(wf.id)} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 w-full text-left text-red-600"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                          {TRIGGER_ICONS[wf.triggerType] || <Zap className="w-3 h-3" />} {wf.triggerType}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {wf.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 mb-3 overflow-hidden">
                        {wf.nodes.slice(0, 5).map((n, i) => (
                          <React.Fragment key={n.id}>
                            {i > 0 && <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
                            <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600 truncate flex-shrink-0 max-w-[80px]">{n.title}</span>
                          </React.Fragment>
                        ))}
                        {wf.nodes.length > 5 && <span className="text-[11px] text-gray-400 flex-shrink-0">+{wf.nodes.length - 5}</span>}
                      </div>

                      {wf.tags && wf.tags.length > 0 && (
                        <div className="flex gap-1 mb-3">
                          {wf.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-600">{t}</span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                        <span className="flex items-center gap-1">
                          {wf.lastRunStatus === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          {wf.lastRunStatus === 'failed' && <XCircle className="w-3 h-3 text-red-500" />}
                          {wf.runsCount} runs
                        </span>
                        <span>{wf.lastRunAt || 'Never run'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Trigger</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium">Runs</th>
                    <th className="text-left px-4 py-2.5 font-medium">Last Run</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((wf) => {
                    const st = STATUS_STYLES[wf.status] || STATUS_STYLES.draft;
                    return (
                      <tr key={wf.id} onClick={() => navigate(`/data/automations/${wf.id}`)} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{wf.title}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[300px]">{wf.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600">{TRIGGER_ICONS[wf.triggerType]} {wf.triggerType}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${st.bg} ${st.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {wf.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{wf.runsCount}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{wf.lastRunAt || '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((conn) => (
              <div key={conn.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Settings2 className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 text-sm">{conn.name}</h3>
                      <p className="text-xs text-gray-400">{conn.provider}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs ${conn.status === 'connected' ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {conn.status === 'connected' ? <Link2 className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                    {conn.status}
                  </span>
                </div>
                {conn.apiKey && <p className="text-xs text-gray-400 font-mono mt-1">{conn.apiKey}</p>}
                <p className="text-xs text-gray-400 mt-1">Updated {conn.updatedAt}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />}
    </div>
  );
}
