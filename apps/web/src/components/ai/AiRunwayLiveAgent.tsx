import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  PhoneOff,
  Mic,
  MicOff,
  Monitor,
  Sparkles,
  Volume2,
  Terminal,
  TrendingUp,
  DollarSign,
  Ticket,
  Settings,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sun,
  Moon,
  Filter,
  Check,
  RotateCcw,
  Code2,
  Copy,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_AVATARS,
  INITIAL_TICKETS,
  REVENUE_METRICS,
  type CrmTicket,
  type RunwayAvatarConfig,
} from '@/lib/runway-avatar';
import { stopBuddySpeech } from '@/lib/ai-voice-engine';

export function AiRunwayLiveAgent() {
  const [selectedAvatarKey, setSelectedAvatarKey] = useState<string>('nova');
  const avatar = DEFAULT_AVATARS[selectedAvatarKey] || DEFAULT_AVATARS.nova;

  const [isCallActive, setIsCallActive] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const [currentSpeech, setCurrentSpeech] = useState<string>('');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'overview' | 'tickets' | 'settings'>('overview');
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [tickets, setTickets] = useState<CrmTicket[]>(INITIAL_TICKETS);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const [toolLogs, setToolLogs] = useState<{ id: string; name: string; type: 'client' | 'server'; args: string; result: string; time: string }[]>([]);
  const [audioWave, setAudioWave] = useState<number[]>([20, 50, 80, 30, 90, 40, 70, 25, 85, 35]);
  const [customAvatarModal, setCustomAvatarModal] = useState(false);
  const [copiedSdk, setCopiedSdk] = useState(false);

  // Audio wave animation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAvatarSpeaking || isCallActive) {
      timer = setInterval(() => {
        setAudioWave(Array.from({ length: 12 }, () => Math.floor(15 + Math.random() * 75)));
      }, 140);
    }
    return () => clearInterval(timer);
  }, [isAvatarSpeaking, isCallActive]);

  // Clean up speech on component unmount
  useEffect(() => {
    return () => {
      stopBuddySpeech();
    };
  }, []);

  // Highlight flash helper
  const triggerHighlight = (targetName: string) => {
    setHighlightTarget(targetName);
    setTimeout(() => setHighlightTarget(null), 3000);
  };

  // Start Call
  const handleStartCall = () => {
    setIsCallActive(true);
    setIsAvatarSpeaking(true);
    setCurrentSpeech(avatar.startScript);

    // Speak aloud using Web Speech API if supported
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(avatar.startScript);
      utter.rate = 1.05;
      utter.pitch = avatar.name === 'Nova' ? 1.15 : 0.95;
      utter.onend = () => setIsAvatarSpeaking(false);
      window.speechSynthesis.speak(utter);
    } else {
      setTimeout(() => setIsAvatarSpeaking(false), 4500);
    }
  };

  // End Call
  const handleEndCall = () => {
    setIsCallActive(false);
    setIsAvatarSpeaking(false);
    setIsScreenSharing(false);
    setCurrentSpeech('');
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Voice command execution (Mirrors the exact conversation from the transcript)
  const executeVoiceCommand = (commandText: string) => {
    if (!isCallActive) return;

    setIsAvatarSpeaking(true);
    const cmd = String(commandText || '').toLowerCase();

    const addTool = (name: string, type: 'client' | 'server', args: Record<string, unknown>, result: string) => {
      setToolLogs((prev) => [
        {
          id: `tool_${Date.now()}`,
          name,
          type,
          args: JSON.stringify(args, null, 2),
          result,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ]);
    };

    let replyText = '';

    // 1. Initial screen share diagnosis
    if (cmd.includes('see my screen') || cmd.includes('what can you see')) {
      setIsScreenSharing(true);
      triggerHighlight('revenue-overview');
      addTool('client.visionAnalyze', 'client', { target: 'viewport', ocr: true }, 'Detected: $123K 30d revenue, 6 open tickets, 1 refund');
      replyText = "I see your screen now. For the last 30 days, you had about 123K in revenue, six open tickets, and one refund.";
    }
    // 2. Revenue dip on July 10
    else if (cmd.includes('july 10') || cmd.includes('dip') || cmd.includes('refund')) {
      setActiveWorkspaceTab('overview');
      triggerHighlight('revenue-chart');
      addTool('server.queryRefundTransaction', 'server', { date: '2025-07-10', threshold: 1000 }, 'Found refund: $2,850 on order #ORD-9821');
      replyText = "That dip on July 10th was due to a refund for $2,850.";
    }
    // 3. 90-day vs 30-day revenue comparison
    else if (cmd.includes('90 days and 30 days') || cmd.includes('revenue difference')) {
      triggerHighlight('revenue-cards');
      addTool('server.comparePeriods', 'server', { period1: '90d', period2: '30d' }, '$349,783 vs $123,000 | Difference: $226,783');
      replyText = "The last 90 days had 349,783 in revenue. The difference between that and the 30-day total is about $227K.";
    }
    // 4. 90 days vs 7 days comparison
    else if (cmd.includes('7 days') || cmd.includes('compare 90 days to 7')) {
      triggerHighlight('revenue-cards');
      addTool('server.comparePeriods', 'server', { period1: '90d', period2: '7d' }, '$349,783 vs $31,656 | Difference: -$318,127');
      replyText = "The last 7 days brought in $31,656, which is about $318k less than the last 90 days.";
    }
    // 5. Open tickets count
    else if (cmd.includes('how many tickets') || cmd.includes('support team tickets')) {
      setActiveWorkspaceTab('tickets');
      triggerHighlight('tickets-table');
      addTool('server.countTeamTickets', 'server', { team: 'Support', status: 'open' }, 'Count: 2 open tickets');
      replyText = "The support team currently has two open tickets.";
    }
    // 6. Navigate to tickets screen
    else if (cmd.includes('take me to the ticket screen') || cmd.includes('go to tickets')) {
      setActiveWorkspaceTab('tickets');
      triggerHighlight('tickets-table');
      addTool('client.navigateTab', 'client', { tab: 'tickets', selector: 'data-avatar-target="tickets"' }, 'Navigated to Tickets tab');
      replyText = "Taking you to the tickets screen now.";
    }
    // 7. Filter only open tickets
    else if (cmd.includes('only the open tickets') || cmd.includes('show open')) {
      setActiveWorkspaceTab('tickets');
      setTicketFilter('open');
      triggerHighlight('ticket-filter');
      addTool('client.filterTableView', 'client', { filter: 'open' }, 'Table filtered to OPEN tickets');
      replyText = "Showing only open tickets now.";
    }
    // 8. Info on Ticket #489
    else if (cmd.includes('ticket #489') || cmd.includes('tell me about this ticket')) {
      setActiveWorkspaceTab('tickets');
      triggerHighlight('ticket-489');
      addTool('server.fetchTicketDetails', 'server', { ticketId: '#489' }, 'Title: SMTP Relay Timeout | Team: Product | Status: Open');
      replyText = "This ticket #489 is open with the product team.";
    }
    // 9. Close Ticket #489
    else if (cmd.includes('close that for me') || cmd.includes('close ticket')) {
      setActiveWorkspaceTab('tickets');
      setTickets((prev) =>
        prev.map((t) => (t.id === '#489' ? { ...t, status: 'closed' } : t))
      );
      triggerHighlight('ticket-489');
      addTool('client.updateTicketStatus', 'client', { ticketId: '#489', status: 'closed' }, 'Ticket #489 status set to CLOSED');
      replyText = "I've gone ahead and closed ticket #489 for you.";
    }
    // 10. Navigate to Settings
    else if (cmd.includes('take me to the settings') || cmd.includes('settings screen')) {
      setActiveWorkspaceTab('settings');
      triggerHighlight('settings-panel');
      addTool('client.navigateTab', 'client', { tab: 'settings' }, 'Navigated to Settings tab');
      replyText = "Taking you to the settings screen.";
    }
    // 11. Switch to Dark Mode
    else if (cmd.includes('dark mode') || cmd.includes('switch to dark')) {
      setIsDarkMode(true);
      triggerHighlight('settings-panel');
      addTool('client.setThemeMode', 'client', { theme: 'dark' }, 'Dark mode applied');
      replyText = "Switched to dark mode. Much easier on the eyes!";
    }
    // 12. Fallback
    else {
      addTool('server.queryGeneralKnowledge', 'server', { prompt: commandText }, 'Query resolved via CRM Knowledge Base');
      replyText = "I'm on it. I've analyzed your CRM event stream and can execute any page actions or queries whenever you're ready.";
    }

    setCurrentSpeech(replyText);

    // Speak reply
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(replyText);
      utter.rate = 1.05;
      utter.pitch = avatar.name === 'Nova' ? 1.15 : 0.95;
      utter.onend = () => setIsAvatarSpeaking(false);
      window.speechSynthesis.speak(utter);
    } else {
      setTimeout(() => setIsAvatarSpeaking(false), 3500);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (ticketFilter === 'all') return true;
    return t.status === ticketFilter;
  });

  return (
    <div
      className={cn(
        'relative flex flex-col h-full w-full select-none overflow-hidden rounded-3xl border transition-colors duration-500 shadow-2xl font-sans',
        isDarkMode
          ? 'bg-slate-950 text-slate-100 border-slate-800'
          : 'bg-slate-50 text-slate-900 border-slate-200'
      )}
    >
      {/* 1. TOP HEADER & WORKSPACE NAVIGATION */}
      <header
        className={cn(
          'flex items-center justify-between px-6 py-4 border-b shrink-0 transition-colors',
          isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200/90'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-md shadow-purple-600/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-tight">Marbee CRM Dashboard &amp; Runway AI Assistant</h1>
              <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[9px] font-black text-purple-600 border border-purple-300">
                GWM1 Live Agent
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Real-Time Voice, Screen Vision Diagnostics &amp; Client Page Actions</p>
          </div>
        </div>

        {/* Tab Navigation (Overview, Tickets, Settings) */}
        <div
          data-avatar-target="navigation-tabs"
          className={cn(
            'flex items-center gap-1 p-1 rounded-2xl border transition-all text-xs font-bold',
            isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200',
            highlightTarget === 'navigation-tabs' && 'ring-4 ring-purple-500 ring-offset-2 animate-pulse'
          )}
        >
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('overview')}
            className={cn(
              'px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5',
              activeWorkspaceTab === 'overview'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Revenue
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('tickets')}
            className={cn(
              'px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5',
              activeWorkspaceTab === 'tickets'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <Ticket className="h-3.5 w-3.5" />
            Tickets ({tickets.filter((t) => t.status === 'open').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('settings')}
            className={cn(
              'px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5',
              activeWorkspaceTab === 'settings'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </header>

      {/* 2. MAIN DASHBOARD CONTENT (REVENUE, TICKETS, SETTINGS) */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
        {/* =========================================================================
            TAB A: REVENUE & ANALYTICS OVERVIEW (Tagged for Avatar Vision Diagnostics)
           ========================================================================= */}
        {activeWorkspaceTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* KPI Cards Row */}
            <div
              data-avatar-target="revenue-cards"
              className={cn(
                'grid grid-cols-1 sm:grid-cols-3 gap-4 transition-all rounded-3xl p-1',
                highlightTarget === 'revenue-cards' && 'ring-4 ring-purple-500 ring-offset-2 bg-purple-500/10'
              )}
            >
              {/* 7-Day Revenue Card */}
              <div className={cn('p-5 rounded-3xl border shadow-2xs space-y-1', isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')}>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">7-Day Revenue</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">$31,656</span>
                  <span className="text-xs font-bold text-rose-500 flex items-center gap-0.5">
                    <ArrowDownRight className="h-3.5 w-3.5" /> -318k vs 90d
                  </span>
                </div>
              </div>

              {/* 30-Day Revenue Card */}
              <div className={cn('p-5 rounded-3xl border shadow-2xs space-y-1', isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')}>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">30-Day Revenue</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">$123,000</span>
                  <span className="text-xs font-bold text-emerald-500 flex items-center gap-0.5">
                    <ArrowUpRight className="h-3.5 w-3.5" /> +14.2%
                  </span>
                </div>
              </div>

              {/* 90-Day Revenue Card */}
              <div className={cn('p-5 rounded-3xl border shadow-2xs space-y-1', isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')}>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">90-Day Revenue</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-purple-600">$349,783</span>
                  <span className="text-xs font-bold text-emerald-500 flex items-center gap-0.5">
                    <ArrowUpRight className="h-3.5 w-3.5" /> +227k vs 30d
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Daily Revenue Chart with the July 10 Dip */}
            <div
              data-avatar-target="revenue-chart"
              className={cn(
                'rounded-3xl p-6 border shadow-2xs space-y-4 transition-all',
                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200',
                highlightTarget === 'revenue-chart' && 'ring-4 ring-purple-500 ring-offset-2 animate-pulse'
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black tracking-tight">Daily Revenue Trend (July Cohort)</h3>
                  <p className="text-[11px] text-slate-400">Click on July 10th or ask the avatar to diagnose anomalies</p>
                </div>
                <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-500 border border-rose-500/20 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  July 10 Refund Anomaly ($2,850)
                </span>
              </div>

              {/* Visual Bar Chart */}
              <div className="h-44 flex items-end justify-between gap-3 pt-6 px-4">
                {REVENUE_METRICS.dailyChart.map((point) => (
                  <div
                    key={point.date}
                    onClick={() => {
                      if (point.isDip) {
                        executeVoiceCommand("What happened on July 10th revenue dip?");
                      }
                    }}
                    className="group relative flex-1 flex flex-col items-center cursor-pointer"
                  >
                    {/* Tooltip on Dip */}
                    {point.isDip && (
                      <div className="absolute -top-12 z-10 rounded-xl bg-rose-900 text-rose-100 px-2.5 py-1 text-[10px] font-bold shadow-lg border border-rose-700 whitespace-nowrap animate-bounce">
                        ⚠️ Refund -$2,850
                      </div>
                    )}

                    {/* Bar */}
                    <div
                      className={cn(
                        'w-full rounded-t-xl transition-all duration-300 group-hover:opacity-80',
                        point.isDip
                          ? 'bg-rose-500 ring-2 ring-rose-400'
                          : 'bg-purple-600/80 group-hover:bg-purple-600'
                      )}
                      style={{ height: `${(point.revenue / 30000) * 100}%` }}
                    />
                    <span className="text-[10px] font-bold text-slate-400 mt-2">{point.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB B: SUPPORT TICKETS CONSOLE (Triage & Close Ticket #489)
           ========================================================================= */}
        {activeWorkspaceTab === 'tickets' && (
          <div
            data-avatar-target="tickets-table"
            className={cn(
              'rounded-3xl p-6 border shadow-2xs space-y-4 transition-all animate-in fade-in duration-200',
              isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200',
              highlightTarget === 'tickets-table' && 'ring-4 ring-purple-500 ring-offset-2'
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-black tracking-tight">Team Support Tickets</h3>
                <p className="text-[11px] text-slate-400">Ask the avatar: "Close ticket #489 for me" or "Show only open tickets"</p>
              </div>

              {/* Status Filter Buttons */}
              <div
                data-avatar-target="ticket-filter"
                className={cn(
                  'flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold',
                  highlightTarget === 'ticket-filter' && 'ring-2 ring-purple-500'
                )}
              >
                {(['all', 'open', 'closed'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setTicketFilter(filter)}
                    className={cn(
                      'px-3 py-1 rounded-lg capitalize transition',
                      ticketFilter === filter ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Tickets Table */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTickets.map((t) => (
                <div
                  key={t.id}
                  data-avatar-target={`ticket-${t.id.replace('#', '')}`}
                  className={cn(
                    'py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all rounded-2xl px-2',
                    highlightTarget === `ticket-${t.id.replace('#', '')}` && 'bg-purple-500/15 ring-2 ring-purple-500'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xs font-black text-purple-600">{t.id}</span>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">{t.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{t.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      {t.team}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
                        t.status === 'open'
                          ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                          : 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                      )}
                    >
                      {t.status}
                    </span>

                    {t.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTickets((prev) =>
                            prev.map((item) => (item.id === t.id ? { ...item, status: 'closed' } : item))
                          );
                        }}
                        className="rounded-xl bg-purple-50 dark:bg-purple-900/30 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-300 hover:bg-purple-100 transition"
                      >
                        Close Ticket
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB C: SETTINGS & THEME TOGGLE (Switch to Dark Mode)
           ========================================================================= */}
        {activeWorkspaceTab === 'settings' && (
          <div
            data-avatar-target="settings-panel"
            className={cn(
              'rounded-3xl p-6 border shadow-2xs space-y-5 transition-all animate-in fade-in duration-200',
              isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200',
              highlightTarget === 'settings-panel' && 'ring-4 ring-purple-500 ring-offset-2'
            )}
          >
            <div>
              <h3 className="text-sm font-black tracking-tight">Platform &amp; Agent Settings</h3>
              <p className="text-[11px] text-slate-400">Ask the avatar: "Switch to dark mode" or customize Runway GWM1 model parameters</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  {isDarkMode ? <Moon className="h-5 w-5 text-purple-400" /> : <Sun className="h-5 w-5 text-amber-500" />}
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Theme Mode</span>
                    <span className="text-[11px] text-slate-400">{isDarkMode ? 'Dark Mode Active' : 'Light Mode Active'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-500 transition"
                >
                  Toggle Theme
                </button>
              </div>

              {/* Runway API Key & Model Configuration */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">Runway Characters Model</span>
                  <span className="text-[10px] font-bold text-purple-600 uppercase">GWM1 Real-Time</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Sub-2s latency conversational video model powered by Runway Gen-World Model 1, LiveKit audio stream, and client page actions.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TOOL EXECUTION LOGS (Live RPC & Client Actions Inspector)
           ========================================================================= */}
        {toolLogs.length > 0 && (
          <div className="rounded-3xl p-5 bg-slate-900 text-slate-200 border border-slate-800 font-mono text-xs space-y-2 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-purple-400 flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                Live Tool Calling Stream (Runway Characters GWM1)
              </span>
              <button type="button" onClick={() => setToolLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300">
                Clear
              </button>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {toolLogs.map((log) => (
                <div key={log.id} className="text-[11px] flex items-center gap-2">
                  <span className="text-slate-500">[{log.time}]</span>
                  <span className={cn('font-bold', log.type === 'client' ? 'text-cyan-400' : 'text-purple-400')}>
                    {log.name}
                  </span>
                  <span className="text-slate-400">➔ {log.result}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          3. FLOATING RUNWAY CHARACTER AVATAR WIDGET (Bottom-Right / Active Call)
         ========================================================================= */}
      <div className="absolute bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {/* Active Call Video Modal / Card */}
        {isCallActive ? (
          <div className="w-80 sm:w-96 rounded-3xl bg-slate-950/95 text-white border-2 border-purple-500/60 shadow-2xl p-4 flex flex-col gap-3 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{avatar.avatarIcon}</span>
                <div>
                  <h4 className="text-xs font-black text-white">{avatar.name}</h4>
                  <p className="text-[10px] text-slate-400">GWM1 Real-Time Live Call</p>
                </div>
              </div>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            </div>

            {/* Avatar Video & Lip-Sync Visualizer */}
            <div className="relative h-36 w-full rounded-2xl bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center overflow-hidden border border-slate-800">
              <div className={cn('text-5xl transition-transform duration-150', isAvatarSpeaking && 'scale-110 animate-pulse')}>
                {avatar.avatarIcon}
              </div>

              {/* Real-time speech subtitle */}
              {currentSpeech && (
                <div className="absolute bottom-2 inset-x-2 rounded-xl bg-black/80 px-2.5 py-1 text-[10px] text-center font-medium text-slate-200 backdrop-blur-xs">
                  {currentSpeech}
                </div>
              )}
            </div>

            {/* Voice Prompts Quick Triggers (Transcript Scenarios) */}
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Voice Prompt Scenarios:</span>
              <div className="flex flex-col gap-1 max-h-28 overflow-y-auto text-[10px]">
                <button
                  type="button"
                  onClick={() => executeVoiceCommand("Can you see my screen now?")}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-left hover:bg-purple-600 transition font-medium truncate"
                >
                  🎙️ "Can you see my screen now?"
                </button>
                <button
                  type="button"
                  onClick={() => executeVoiceCommand("What happened on July 10th revenue dip?")}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-left hover:bg-purple-600 transition font-medium truncate"
                >
                  🎙️ "What happened on July 10th revenue dip?"
                </button>
                <button
                  type="button"
                  onClick={() => executeVoiceCommand("What is the revenue difference between 90 days and 30 days?")}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-left hover:bg-purple-600 transition font-medium truncate"
                >
                  🎙️ "Compare 90 days vs 30 days revenue"
                </button>
                <button
                  type="button"
                  onClick={() => executeVoiceCommand("Can you take me to the ticket screen?")}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-left hover:bg-purple-600 transition font-medium truncate"
                >
                  🎙️ "Take me to the ticket screen"
                </button>
                <button
                  type="button"
                  onClick={() => executeVoiceCommand("Can you close ticket #489 for me?")}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-left hover:bg-purple-600 transition font-medium truncate"
                >
                  🎙️ "Can you close ticket #489 for me?"
                </button>
                <button
                  type="button"
                  onClick={() => executeVoiceCommand("Can you switch it to dark mode?")}
                  className="rounded-lg bg-slate-900 px-2 py-1 text-left hover:bg-purple-600 transition font-medium truncate"
                >
                  🎙️ "Switch it to dark mode"
                </button>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsMicMuted(!isMicMuted)}
                  className={cn(
                    'p-2 rounded-xl text-xs font-bold transition',
                    isMicMuted ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-300'
                  )}
                >
                  {isMicMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsScreenSharing(!isScreenSharing);
                    if (!isScreenSharing) {
                      executeVoiceCommand("Can you see my screen now?");
                    }
                  }}
                  className={cn(
                    'p-2 rounded-xl text-xs font-bold transition',
                    isScreenSharing ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'
                  )}
                  title="Toggle Screen Sharing"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleEndCall}
                className="flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 transition shadow-md"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                End Call
              </button>
            </div>
          </div>
        ) : (
          /* Minimized Launch Button (Bottom Right Floating Agent) */
          <div className="flex items-center gap-2">
            {/* Avatar Switcher */}
            <select
              value={selectedAvatarKey}
              onChange={(e) => setSelectedAvatarKey(e.target.value)}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xl focus:outline-hidden"
            >
              <option value="nova">👩‍💼 Nova (Support)</option>
              <option value="alex">👨‍💼 Alex (CRM Consultant)</option>
              <option value="sunny">🧑‍💻 Sunny (Clone)</option>
            </select>

            <button
              type="button"
              onClick={handleStartCall}
              className="flex items-center gap-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white px-5 py-3 shadow-2xl shadow-purple-600/40 font-black text-xs transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <Video className="h-4 w-4" />
              <span>Talk with {avatar.name}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
