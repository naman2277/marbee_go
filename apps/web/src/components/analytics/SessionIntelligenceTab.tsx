import { useState, useMemo } from 'react';
import {
  Play,
  Flame,
  AlertTriangle,
  Sparkles,
  Search,
  Clock,
  Smartphone,
  Laptop,
  X,
  ChevronRight,
  ChevronLeft,
  Code2,
  Copy,
  Check,
  Activity,
  Download,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import type { BehavioralSession, FrictionSignal } from '@/lib/web-analytics-types';

interface SessionIntelligenceTabProps {
  sessions: BehavioralSession[];
  frictionSignals: FrictionSignal[];
}

export function SessionIntelligenceTab({
  sessions,
}: SessionIntelligenceTabProps) {
  const [selectedSession, setSelectedSession] = useState<BehavioralSession | null>(null);
  const [modalTab, setModalTab] = useState<'replay' | 'json'>('replay');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedJsonId, setCopiedJsonId] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filterType === 'friction' && s.frictionSignals.length === 0) return false;
      if (filterType === 'high_intent' && s.intentScore < 70) return false;
      if (filterType === 'converted' && !s.converted) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.id.toLowerCase().includes(q) ||
          s.persona.toLowerCase().includes(q) ||
          s.attribution.source.toLowerCase().includes(q) ||
          s.aiSummary.toLowerCase().includes(q) ||
          s.pagesVisited.some((p) => p.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [sessions, filterType, searchQuery]);

  // Reset page when filter changes
  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedSessions = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, safePage, pageSize]);

  const totalFrictionSessions = sessions.filter((s) => s.frictionSignals.length > 0).length;
  const rageClicksCount = sessions.reduce(
    (acc, s) => acc + s.frictionSignals.filter((f) => f.type === 'rage_click').length,
    0
  );
  const deadClicksCount = sessions.reduce(
    (acc, s) => acc + s.frictionSignals.filter((f) => f.type === 'dead_click' || f.type === 'error_click').length,
    0
  );

  const handleCopyJson = (session: BehavioralSession) => {
    const jsonStr = JSON.stringify(session, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJsonId(session.id);
    setTimeout(() => setCopiedJsonId(null), 2000);
  };

  const handleDownloadJson = (session: BehavioralSession) => {
    const jsonStr = JSON.stringify(session, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ── 1. FRICTION DETECTION HIGHLIGHT REEL BANNER ── */}
      <div className="rounded-3xl bg-gradient-to-r from-red-950/40 via-amber-950/20 to-slate-900 border border-red-900/40 p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
              <Flame className="w-4 h-4 animate-bounce" />
            </span>
            <span className="text-xs font-bold text-red-300 uppercase tracking-wider">
              AI Session Replay & Friction Highlight Reel
            </span>
          </div>
          <h3 className="text-lg md:text-xl font-bold text-white">
            {totalFrictionSessions > 0
              ? `AI Discovered ${totalFrictionSessions} Session(s) with Client-Side Friction Signals`
              : `All ${sessions.length} Recorded Session(s) Running With Optimal UX`}
          </h3>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            {totalFrictionSessions > 0
              ? `Synthesized quantified session telemetry: ${rageClicksCount} repeated rage click burst(s) and ${deadClicksCount} dead click target(s) impacting conversion velocity.`
              : `Zero rage clicks, dead clicks, or form validation hurdles detected across recorded browser sessions.`}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-center">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Rage Click Bursts</div>
            <div className="text-xl font-black text-amber-400 mt-0.5">{rageClicksCount}</div>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-center">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Dead Click Targets</div>
            <div className="text-xl font-black text-red-400 mt-0.5">{deadClicksCount}</div>
          </div>
        </div>
      </div>

      {/* ── 2. SESSION EXPLORER CONTROLS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by session ID, page, source, persona, or intent..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
          />
        </div>

        {/* Filter Chips & Page Size */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'all', label: `All (${sessions.length})` },
              { id: 'friction', label: `🔥 Friction (${totalFrictionSessions})` },
              { id: 'high_intent', label: `🎯 High Intent (≥70)` },
              { id: 'converted', label: `✓ Converted` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilterType(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition ${
                  filterType === tab.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-medium">
            <span className="text-slate-400 text-[11px] px-1.5">Show:</span>
            {[10, 25, 50].map((size) => (
              <button
                key={size}
                onClick={() => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  pageSize === size
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 3. SESSION BEHAVIORAL GRAPH TABLE ── */}
      <div className="space-y-3">
        {filteredSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center space-y-3">
            <Search className="h-8 w-8 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Sessions Recorded</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || filterType !== 'all'
                ? 'No sessions match your search or filter query. Clear filters to view all sessions.'
                : 'Awaiting visitor sessions. Ingest telemetry or visit your tracked domain to see live session replays.'}
            </p>
          </div>
        ) : (
          paginatedSessions.map((s) => (
            <Card
              key={s.id}
              className="p-5 rounded-2xl border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all space-y-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left: Device & Source Info */}
                <div className="flex items-start gap-3.5">
                  <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shrink-0">
                    {s.device.type === 'mobile' ? (
                      <Smartphone className="h-5 w-5" />
                    ) : (
                      <Laptop className="h-5 w-5" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {s.id}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {s.persona}
                      </span>
                      {s.frictionSignals.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          {s.frictionSignals.length} Friction Signals
                        </span>
                      )}
                      {s.converted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          Converted
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                      {(s.geo.city || s.geo.country) && (
                        <span>{[s.geo.city, s.geo.country].filter(Boolean).join(', ')}</span>
                      )}
                      {(s.geo.city || s.geo.country) && <span>•</span>}
                      <span>{s.attribution.source} ({s.attribution.medium})</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {s.durationSec}s duration ({s.activeTimeSec}s active)
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-indigo-500" />
                        {s.activities?.length || s.eventsCount} activities
                      </span>
                    </div>
                  </div>
                </div>

                {/* Middle: Intent & Attention Gauge */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Intent Score
                    </div>
                    <div
                      className={`text-lg font-black ${
                        s.intentScore >= 80
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : s.intentScore >= 60
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-600'
                      }`}
                    >
                      {s.intentScore}/100
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Scroll Depth
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {s.attention.maxScrollDepth}%
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSession(s);
                        setModalTab('json');
                      }}
                      className="rounded-xl text-xs font-bold border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                    >
                      <Code2 className="w-3 h-3 mr-1.5 text-slate-600 dark:text-slate-400" />
                      JSON
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSession(s);
                        setModalTab('replay');
                      }}
                      className="rounded-xl text-xs font-bold border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                    >
                      <Play className="w-3 h-3 mr-1.5 text-indigo-600" />
                      Replay
                    </Button>
                  </div>
                </div>
              </div>

              {/* Bottom: Journey Flow & Real-Time AI Summary */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                {/* Journey Step Flow */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-[11px] font-bold uppercase text-slate-400 mr-1">Journey:</span>
                  {s.pagesVisited.map((page, pIdx) => (
                    <span key={pIdx} className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        {page}
                      </span>
                      {pIdx < s.pagesVisited.length - 1 && (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </span>
                  ))}
                </div>

                {/* AI Summary Interpretation */}
                <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-950 dark:text-indigo-200 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>AI Interpretation:</strong> {s.aiSummary}
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* ── 4. PAGINATION CONTROLS (10 / 25 / 50) ── */}
      {filteredSessions.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 font-medium">
          <div>
            Showing{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {(safePage - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {Math.min(safePage * pageSize, filteredSessions.length)}
            </strong>{' '}
            of{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {filteredSessions.length}
            </strong>{' '}
            recorded sessions
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-xl text-xs font-semibold gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5 && safePage > 3) {
                  pageNum = safePage - 2 + i;
                  if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-xl text-xs font-bold transition ${
                      safePage === pageNum
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl text-xs font-semibold gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── 5. SESSION DETAIL & JSON TELEMETRY MODAL ── */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                  {modalTab === 'replay' ? (
                    <Play className="h-5 w-5" />
                  ) : (
                    <Code2 className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Session Telemetry: {selectedSession.id}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {[selectedSession.geo.city, selectedSession.geo.country].filter(Boolean).join(', ')}
                    {(selectedSession.geo.city || selectedSession.geo.country) ? ' • ' : ''}
                    {selectedSession.device.os} ({selectedSession.device.browser}) •{' '}
                    {selectedSession.durationSec}s duration
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Modal View Tabs */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
                  <button
                    onClick={() => setModalTab('replay')}
                    className={`px-3 py-1 rounded-lg transition ${
                      modalTab === 'replay'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Visual Replay
                  </button>
                  <button
                    onClick={() => setModalTab('json')}
                    className={`px-3 py-1 rounded-lg transition ${
                      modalTab === 'json'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Raw JSON Telemetry
                  </button>
                </div>

                <button
                  onClick={() => setSelectedSession(null)}
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* TAB 1: VISUAL REPLAY SIMULATION */}
            {modalTab === 'replay' ? (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col justify-between p-6 text-white shadow-inner">
                  <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-3">
                    <span className="font-mono text-emerald-400">● LIVE REPLAY SIMULATION</span>
                    <span>Active Dwell: {selectedSession.activeTimeSec}s</span>
                  </div>

                  {/* Center Wireframe Display */}
                  <div className="text-center space-y-3 max-w-md mx-auto my-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-xs font-mono">
                      Current View: {selectedSession.attribution.exitPage}
                    </div>
                    <h4 className="text-lg font-bold text-white">
                      {selectedSession.aiSummary}
                    </h4>
                    {selectedSession.frictionSignals.map((f, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-medium text-left flex items-start gap-2"
                      >
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <span>
                          <strong>{f.type.toUpperCase()}:</strong> {f.details}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Video Timeline Control */}
                  <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs">
                      <Play className="w-3.5 h-3.5 mr-1" /> Replay
                    </Button>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                      <div className="h-full bg-indigo-500 w-3/4 rounded-full" />
                    </div>
                    <span className="text-xs font-mono text-slate-400 shrink-0">
                      {selectedSession.durationSec}s
                    </span>
                  </div>
                </div>

                {/* Activity Trail Timeline */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Chronological Activity Trail ({selectedSession.activities?.length || 0} events)
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-2xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-200 dark:border-slate-800">
                    {selectedSession.activities && selectedSession.activities.length > 0 ? (
                      selectedSession.activities.map((act, actIdx) => (
                        <div
                          key={actIdx}
                          className="flex items-center justify-between text-xs p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {act.eventName}
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">{act.path}</span>
                          </div>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {new Date(act.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-400 text-center py-3">
                        Session created via direct pageview traversal.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* TAB 2: RAW JSON TELEMETRY */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Full structured JSON payload of this visitor session with all telemetry attributes and activity log.
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyJson(selectedSession)}
                      className="rounded-xl text-xs font-bold gap-1.5"
                    >
                      {copiedJsonId === selectedSession.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy JSON
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadJson(selectedSession)}
                      className="rounded-xl text-xs font-bold gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Export .json
                    </Button>
                  </div>
                </div>

                <div className="relative rounded-2xl bg-slate-950 p-4 border border-slate-800 overflow-x-auto max-h-[500px]">
                  <pre className="text-xs font-mono text-emerald-400 leading-relaxed">
                    {JSON.stringify(selectedSession, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                onClick={() => setSelectedSession(null)}
                className="bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Close Window
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
