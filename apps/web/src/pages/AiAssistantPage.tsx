import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUDDY_AGENTS, type BuddyAgent } from '@/components/ai/AiAgentSidebar';
import { fetchBuddyAgentsConfig, type BuddyCustomAgentConfig } from '@/lib/ai-engine-config';
import { useAuth } from '@/contexts/AuthContext';
import { AiProfessionalAgent } from '@/components/ai/AiProfessionalAgent';
import { AiAgentChatsTab } from '@/components/ai/AiAgentChatsTab';
import { AiAgentSettingsTab } from '@/components/ai/AiAgentSettingsTab';
import {
  Bot,
  MessageSquare,
  Settings,
  Sparkles,
  UserCheck,
  X,
  Check,
  AlertCircle,
  History,
  ArrowRight,
  ArrowRightLeft,
  RefreshCw,
  Zap,
  Database,
  Layers,
  CheckSquare,
  Mail,
  Users,
  Radio,
  Clock,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type BuddyTabType = 'chat' | 'conversations' | 'configuration';

export interface AiAssistantPortalProps {
  isOpen?: boolean;
  onClose?: () => void;
  isEmbedded?: boolean;
}

export function AiAssistantPortal({
  isOpen = true,
  onClose,
  isEmbedded = false,
}: AiAssistantPortalProps) {
  const navigate = useNavigate();
  const { tenantId, environment } = useAuth();
  const [activeTab, setActiveTab] = useState<BuddyTabType>('chat');
  const [agentsList, setAgentsList] = useState<BuddyAgent[]>(BUDDY_AGENTS);
  const [activeSpecialist, setActiveSpecialist] = useState<BuddyAgent | null>(null);
  const [hasStartedChat, setHasStartedChat] = useState<boolean>(false);
  const [isRailCollapsed, setIsRailCollapsed] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [isChatMinimizedToCopilot, setIsChatMinimizedToCopilot] = useState<boolean>(false);
  const [isLiveCallActive, setIsLiveCallActive] = useState<boolean>(false);

  const isMinimized = isChatMinimizedToCopilot || (!isOpen && isLiveCallActive);

  const handleMinimizeToCopilot = () => {
    setIsChatMinimizedToCopilot(true);
    if (isEmbedded) {
      navigate('/dashboard');
    }
  };

  // Handover state when switching specialists during active chat
  const [pendingHandover, setPendingHandover] = useState<{ targetAgent: BuddyAgent; initialPrompt?: string } | null>(null);
  const [handoverEvent, setHandoverEvent] = useState<{
    fromAgent: BuddyAgent;
    toAgent: BuddyAgent;
    mode: 'continue' | 'fresh';
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    fetchBuddyAgentsConfig(tenantId, environment).then((loaded) => {
      if (loaded && loaded.length > 0) {
        setAgentsList(loaded as BuddyAgent[]);
        setActiveSpecialist((current) => {
          if (!current) return (loaded.find((a) => a.status === 'online') || loaded[0]) as BuddyAgent;
          const fresh = loaded.find((a) => a.id === current.id);
          return fresh ? (fresh as BuddyAgent) : ((loaded.find((a) => a.status === 'online') || loaded[0]) as BuddyAgent);
        });
      }
    });
  }, [tenantId, environment]);

  // Keyboard Escape listener to close or minimize modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLiveCallActive) {
          handleMinimizeToCopilot();
        } else if (onClose && isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isOpen, isLiveCallActive, isEmbedded]);

  if (!isOpen && !isEmbedded && !isLiveCallActive) return null;

  const handleSelectAgent = (agent: BuddyAgent, initialPrompt?: string) => {
    if (agent.status === 'offline') {
      setOfflineNotice(`${agent.name} is currently offline for scheduled infrastructure maintenance. Please select an online specialist.`);
      setTimeout(() => setOfflineNotice(null), 4000);
      return;
    }

    // If ALREADY in active chat with another agent, trigger the handover dialog!
    if (hasStartedChat && activeSpecialist && activeSpecialist.id !== agent.id) {
      setPendingHandover({ targetAgent: agent, initialPrompt });
      setIsAgentPickerOpen(false);
      return;
    }

    // First time selection or same agent
    setActiveSpecialist(agent);
    setHasStartedChat(true);
    setActiveTab('chat');
    setIsAgentPickerOpen(false);

    if (initialPrompt) {
      const newSession = {
        id: `sess-${Date.now()}`,
        updatedAt: new Date().toISOString(),
        title: initialPrompt.slice(0, 60),
        messageCount: 0,
        messages: [],
      };
      try {
        localStorage.setItem('marbee_ai_active_session', JSON.stringify(newSession));
      } catch {}
    }
  };

  const handleConfirmHandover = (mode: 'continue' | 'fresh') => {
    if (!pendingHandover || !activeSpecialist) return;
    const target = pendingHandover.targetAgent;

    setHandoverEvent({
      fromAgent: activeSpecialist,
      toAgent: target,
      mode,
      timestamp: Date.now(),
    });

    setActiveSpecialist(target);
    setPendingHandover(null);
    setHasStartedChat(true);
    setActiveTab('chat');
  };

  const onlineAgentsCount = agentsList.filter((a) => a.status === 'online').length;

  const content = (
    <div
      className={cn(
        'flex flex-col font-sans text-slate-900 relative transition-all duration-200',
        isMinimized
          ? 'w-0 h-0 p-0 m-0 border-0 bg-transparent shadow-none pointer-events-none overflow-visible'
          : isFullscreen
          ? 'w-screen h-screen rounded-none border-0 bg-slate-950 shadow-2xl overflow-hidden'
          : isEmbedded
          ? 'h-full w-full bg-slate-900/5 rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden'
          : 'w-full max-w-[96vw] xl:max-w-[1450px] h-[92vh] max-h-[950px] rounded-3xl border border-white/20 shadow-2xl ring-1 ring-purple-500/20 bg-slate-950 overflow-hidden'
      )}
    >
      {/* ── MODAL TOP HEADER BAR (Only in Modal Mode) ── */}
      {!isEmbedded && !isMinimized && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/95 px-5 select-none z-20 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Foldable Rail Toggle */}
            <button
              type="button"
              onClick={() => setIsRailCollapsed(!isRailCollapsed)}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer border border-white/10"
              title={isRailCollapsed ? 'Expand Left Bar' : 'Collapse Left Bar'}
            >
              {isRailCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-sm font-black text-white tracking-wide">Marbee AI Assistant</span>
              <span className="text-[10px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-md">
                We are Buddy
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Pill */}
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live RAG Synced
            </span>

            {/* Minimize to Floating Copilot Button (When live call is active) */}
            {isLiveCallActive && (
              <button
                type="button"
                onClick={handleMinimizeToCopilot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-400/40 text-xs font-bold transition cursor-pointer shadow-xs"
                title="Cancel/Minimize background chat modal and keep live video/voice copilot running"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Minimize to Copilot</span>
              </button>
            )}

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer border border-white/10"
              title={isFullscreen ? 'Exit Full Screen' : 'Open Full Screen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* Close / Minimize Modal Button */}
            {onClose && (
              <button
                type="button"
                onClick={() => {
                  if (isLiveCallActive) {
                    handleMinimizeToCopilot();
                  } else {
                    onClose();
                  }
                }}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer border border-white/10"
                title={isLiveCallActive ? "Minimize Chat Modal (Keep Video Running in Bottom Right)" : "Close AI Assistant (Esc)"}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── INNER BODY (LEFT RAIL + MAIN WORKSPACE) ── */}
      <div
        className={cn(
          'flex flex-1 min-h-0 w-full relative',
          isMinimized
            ? 'overflow-visible pointer-events-none bg-transparent w-0 h-0 p-0 m-0 border-0'
            : 'overflow-hidden'
        )}
      >
        {/* =========================================================================
            FOLDABLE COMPACT ICON-ONLY LEFT RAIL (Dark Theme Matching Obsidian Modal)
           ========================================================================= */}
        {!isMinimized && (
          <aside
            className={cn(
              'shrink-0 border-r border-white/10 bg-slate-900/90 flex flex-col justify-between items-center py-4 select-none font-sans z-10 shadow-2xs transition-all duration-300 overflow-hidden backdrop-blur-xl',
              isRailCollapsed ? 'w-0 p-0 border-0 opacity-0 pointer-events-none' : 'w-16 opacity-100'
            )}
          >
          {/* Top: Emblem & Navigation Icons */}
          <div className="flex flex-col items-center gap-6">
            {/* Logo Emblem / Reset to Welcome Screen */}
            <button
              type="button"
              onClick={() => {
                setHasStartedChat(false);
                setActiveTab('chat');
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-xs hover:scale-105 hover:bg-purple-500/30 transition cursor-pointer"
              title="We are Buddy · Welcome Screen"
            >
              <Sparkles className="h-4.5 w-4.5" />
            </button>

            {/* Navigation Icon Buttons */}
            <nav className="flex flex-col items-center gap-2.5">
              {/* 1. Chat Workspace Icon */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('chat');
                }}
                className={cn(
                  'group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200 cursor-pointer',
                  activeTab === 'chat'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 ring-2 ring-purple-400/50'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                )}
                title="Let's Discuss (Chat Workspace)"
              >
                <Bot className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                <span className="pointer-events-none absolute left-full ml-3 hidden rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg whitespace-nowrap group-hover:block z-50 border border-white/10">
                  Let's Discuss
                </span>
              </button>

              {/* 2. Conversations / History Icon */}
              <button
                type="button"
                onClick={() => setActiveTab('conversations')}
                className={cn(
                  'group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200 cursor-pointer',
                  activeTab === 'conversations'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 ring-2 ring-purple-400/50'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                )}
                title="Conversations & Saved Sessions"
              >
                <History className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                <span className="pointer-events-none absolute left-full ml-3 hidden rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg whitespace-nowrap group-hover:block z-50 border border-white/10">
                  Conversations
                </span>
              </button>
            </nav>
          </div>

          {/* Bottom: Active Agent Avatar & Settings */}
          <div className="flex flex-col items-center gap-3 pt-3 border-t border-white/10">
            {/* 3. Active Specialist Avatar - BLURRED UNTIL SELECTED */}
            {activeSpecialist ? (
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen(true)}
                className="group relative flex flex-col items-center cursor-pointer"
                title={`Switch Specialist (Current: ${activeSpecialist.name})`}
              >
                <div className="relative">
                  <img
                    src={activeSpecialist.imageUrl}
                    alt={activeSpecialist.name}
                    className="h-9 w-9 rounded-full object-cover border-2 border-purple-400/80 group-hover:border-purple-300 shadow-xs transition-transform group-hover:scale-105"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950 animate-pulse" />
                </div>

                <span className="pointer-events-none absolute left-full ml-3 hidden rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg whitespace-nowrap group-hover:block z-50 border border-white/10">
                  {activeSpecialist.name} &bull; Switch Specialist
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen(true)}
                className="group relative flex flex-col items-center cursor-pointer"
                title="No specialist selected · Click to choose an agent"
              >
                <div className="relative h-9 w-9 rounded-full bg-purple-950/40 border-2 border-dashed border-purple-400/40 flex items-center justify-center filter blur-[1.5px] group-hover:blur-none opacity-40 group-hover:opacity-90 transition">
                  <Bot className="h-4 w-4 text-purple-300" />
                </div>

                <span className="pointer-events-none absolute left-full ml-3 hidden rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-purple-300 shadow-lg whitespace-nowrap group-hover:block z-50 border border-purple-500/30">
                  Select Specialist to begin
                </span>
              </button>
            )}

            {/* 4. Settings / Config Icon */}
            <button
              type="button"
              onClick={() => setActiveTab('configuration')}
              className={cn(
                'group relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200 cursor-pointer',
                activeTab === 'configuration'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              )}
              title="AI Engine Configuration"
            >
              <Settings className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110" />
              <span className="pointer-events-none absolute left-full ml-3 hidden rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg whitespace-nowrap group-hover:block z-50 border border-white/10">
                Configuration
              </span>
            </button>
          </div>
        </aside>
      )}

        {/* =========================================================================
            RIGHT MAIN WORKSPACE: SINGLE-SCREEN FIT (ZERO SCROLL) WELCOME SCREEN
           ========================================================================= */}
        <main
          className={cn(
            'flex-1 flex flex-col relative',
            isMinimized
              ? 'bg-transparent overflow-visible pointer-events-none w-0 h-0 p-0 m-0 border-0'
              : 'h-full overflow-hidden bg-slate-950'
          )}
        >
          {/* Tab 1: Live AI Chat Workspace or Single-Screen Executive Welcome Deck */}
          {activeTab === 'chat' && (
            <div
              className={cn(
                isMinimized
                  ? 'w-0 h-0 p-0 m-0 bg-transparent overflow-visible pointer-events-none'
                  : 'w-full h-full'
              )}
            >
              {!hasStartedChat || !activeSpecialist ? (
                /* ── 🌟 SINGLE-SCREEN FIT EXECUTIVE WELCOME DECK (COMPACT & BALANCED) ── */
                <div className="relative w-full h-full p-6 lg:p-8 flex flex-col items-center justify-center select-none bg-gradient-to-b from-slate-950 via-[#0B0F19] to-[#070A12] text-slate-100 font-sans overflow-hidden">
                  {/* Subtle Ambient Background Glow Orbs */}
                  <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-purple-600/15 blur-[120px]" />
                  <div className="pointer-events-none absolute top-1/2 -right-20 h-72 w-72 rounded-full bg-indigo-600/15 blur-[120px]" />
                  <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-pink-600/10 blur-[120px]" />

                  {/* Subtle Geometric Background Grid Texture */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.03]"
                    style={{
                      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)`,
                      backgroundSize: '24px 24px',
                    }}
                  />

                  {/* Centered Inner Wrapper */}
                  <div className="relative z-10 max-w-5xl w-full flex flex-col items-center gap-6 my-auto">
                    {/* 1. HERO STATEMENT & GREETING */}
                    <div className="w-full text-center space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1 backdrop-blur-md shadow-xs">
                        <Sparkles className="h-3.5 w-3.5 text-purple-300" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-200">
                          Autonomous Customer Engagement Squad
                        </span>
                      </div>

                      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
                        How may I help you?{' '}
                        <span className="bg-gradient-to-r from-purple-400 via-pink-300 to-indigo-300 bg-clip-text text-transparent">
                          We are Buddy.
                        </span>
                      </h1>

                      <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto font-normal leading-relaxed">
                        Select your dedicated AI specialist to start a conversation. Each copilot is equipped with full platform schema awareness, live telemetry, and marketing workflow intelligence.
                      </p>
                    </div>

                    {offlineNotice && (
                      <div className="max-w-xl w-full flex items-center gap-2 bg-rose-950/80 border border-rose-500/40 text-rose-200 p-2.5 rounded-2xl text-xs font-medium backdrop-blur-md shadow-lg animate-in fade-in shrink-0">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>{offlineNotice}</span>
                      </div>
                    )}

                    {/* 2. SPECIALISTS SHOWCASE - COMPACT, ELEGANT PROPORTIONS */}
                    <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {agentsList.map((agent) => {
                        const isOnline = agent.status === 'online';

                        return (
                          <div
                            key={agent.id}
                            onClick={() => isOnline && handleSelectAgent(agent)}
                            className={cn(
                              'group relative rounded-2xl p-4 border transition-all duration-300 flex flex-col justify-between backdrop-blur-2xl shadow-xl overflow-hidden',
                              isOnline
                                ? 'bg-slate-900/80 border-white/10 hover:bg-slate-900/95 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/20 hover:-translate-y-1 cursor-pointer ring-1 ring-white/5'
                                : 'bg-black/40 border-white/[0.04] opacity-50 cursor-not-allowed'
                            )}
                          >
                            <div>
                              {/* Avatar & Availability Header */}
                              <div className="flex items-center justify-between gap-2 mb-2.5">
                                <div className="relative shrink-0">
                                  <img
                                    src={agent.imageUrl}
                                    alt={agent.name}
                                    className={cn(
                                      'h-11 w-11 rounded-xl object-cover border-2 shadow-md transition-transform duration-300 group-hover:scale-105',
                                      isOnline ? 'border-purple-400/80 ring-2 ring-purple-500/20' : 'border-slate-700 grayscale'
                                    )}
                                  />
                                  {isOnline ? (
                                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-950 animate-pulse" />
                                  ) : (
                                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-slate-950" />
                                  )}
                                </div>

                                <span
                                  className={cn(
                                    'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border backdrop-blur-md flex items-center gap-1 shrink-0',
                                    isOnline
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  )}
                                >
                                  <span className={cn('h-1.5 w-1.5 rounded-full', isOnline ? 'bg-emerald-400' : 'bg-slate-400')} />
                                  {isOnline ? 'Available' : 'Offline'}
                                </span>
                              </div>

                              {/* Identity & Role */}
                              <div className="space-y-0.5 mb-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h3 className="text-sm font-black text-white group-hover:text-purple-200 transition">
                                    {agent.name}
                                  </h3>
                                  {agent.indicName && (
                                    <span className="text-[8.5px] font-bold text-purple-300 bg-purple-950/80 border border-purple-500/30 px-1 py-0.2 rounded-md">
                                      {agent.indicName}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-purple-300/90 font-semibold line-clamp-1">{agent.role}</p>
                                <span className="inline-block text-[8.5px] text-slate-400 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.2 rounded-md font-mono mt-0.5">
                                  {agent.voiceLabel}
                                </span>
                              </div>

                              {/* Executive Bio */}
                              <p className="text-[11px] text-slate-300 leading-snug line-clamp-2 mb-3">
                                {agent.description || agent.greeting}
                              </p>
                            </div>

                            {/* Card Action Button */}
                            <div className="pt-2.5 border-t border-white/[0.08]">
                              {isOnline ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectAgent(agent);
                                  }}
                                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-[11px] shadow-lg border border-purple-400/30 flex items-center justify-center gap-1.5 transition cursor-pointer group-hover:shadow-purple-500/30"
                                >
                                  <span>Start Conversation</span>
                                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                                </button>
                              ) : (
                                <div className="w-full py-1.5 text-center text-[10px] font-bold text-slate-400 bg-slate-900/60 rounded-xl border border-white/[0.06]">
                                  Maintenance Window
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 3. COMPACT HORIZONTAL QUICK-LAUNCH COMMAND BAR */}
                    <div className="w-full">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {[
                          {
                            title: 'Audience SQL',
                            agentId: 'agent_dev',
                            icon: Database,
                            color: 'border-sky-500/30 bg-sky-950/20 text-sky-300 hover:bg-sky-900/40',
                            prompt: 'Generate an SQL query for high-value VIP customers (RFM Champions) with order counts and lifetime value.',
                          },
                          {
                            title: 'Journey Flow',
                            agentId: 'agent_pooja',
                            icon: Radio,
                            color: 'border-purple-500/30 bg-purple-950/20 text-purple-300 hover:bg-purple-900/40',
                            prompt: 'How do I create an abandoned cart 3-stage recovery journey with WhatsApp, Email, and Web Push fallback?',
                          },
                          {
                            title: 'Tasks & Sprints',
                            agentId: 'agent_aanya',
                            icon: CheckSquare,
                            color: 'border-indigo-500/30 bg-indigo-950/20 text-indigo-300 hover:bg-indigo-900/40',
                            prompt: 'Break down a high-converting Ramadan campaign launch into 6 structured tasks with subtasks and assignees.',
                          },
                          {
                            title: 'Deliverability',
                            agentId: 'agent_dev',
                            icon: ShieldCheck,
                            color: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-900/40',
                            prompt: 'How do I configure Web Push VAPID keys and troubleshoot SMTP delivery authentication issues?',
                          },
                        ].map((item) => {
                          const IconComp = item.icon;
                          return (
                            <button
                              key={item.title}
                              type="button"
                              onClick={() => {
                                const targetAgent =
                                  agentsList.find((a) => a.id === item.agentId && a.status === 'online') ||
                                  agentsList.find((a) => a.status === 'online') ||
                                  agentsList[0];
                                handleSelectAgent(targetAgent, item.prompt);
                              }}
                              className={cn(
                                'py-2 px-3 rounded-xl border text-left transition-all duration-200 backdrop-blur-xl flex items-center justify-between cursor-pointer hover:shadow-md hover:-translate-y-0.5',
                                item.color
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <IconComp className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-[11px] font-black text-white truncate">{item.title}</span>
                              </div>
                              <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── 💬 ACTIVE CONVERSATION WORKSPACE ── */
                <div
                  className={cn(
                    'flex flex-col',
                    isMinimized
                      ? 'w-0 h-0 p-0 m-0 bg-transparent overflow-visible pointer-events-none border-0'
                      : 'w-full h-full bg-white'
                  )}
                >
                  <AiProfessionalAgent
                    activeSpecialist={activeSpecialist}
                    onOpenAgentPicker={() => setIsAgentPickerOpen(true)}
                    handoverEvent={handoverEvent}
                    onHandoverHandled={() => setHandoverEvent(null)}
                    isBackgroundChatMinimized={isMinimized}
                    onToggleMinimizeBackgroundChat={() => setIsChatMinimizedToCopilot((prev) => !prev)}
                    onLiveCallStateChange={(isActive) => {
                      setIsLiveCallActive(isActive);
                      if (!isActive) setIsChatMinimizedToCopilot(false);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Saved Conversations History */}
          {activeTab === 'conversations' && (
            <div className="w-full h-full overflow-y-auto p-6 bg-white">
              <AiAgentChatsTab
                onSelectChat={(sessOrPrompt) => {
                  if (typeof sessOrPrompt === 'string') {
                    const newSession = {
                      id: `sess-${Date.now()}`,
                      updatedAt: new Date().toISOString(),
                      title: sessOrPrompt.slice(0, 60),
                      messageCount: 0,
                      messages: [],
                    };
                    localStorage.setItem('marbee_ai_active_session', JSON.stringify(newSession));
                  } else {
                    localStorage.setItem('marbee_ai_active_session', JSON.stringify(sessOrPrompt));
                  }
                  setHasStartedChat(true);
                  setActiveTab('chat');
                }}
              />
            </div>
          )}

          {/* Tab 3: Configuration (Settings & Model Routing) */}
          {activeTab === 'configuration' && (
            <div className="w-full h-full overflow-y-auto p-6 bg-white">
              <AiAgentSettingsTab />
            </div>
          )}
        </main>
      </div>

      {/* =========================================================================
          AGENT SWITCH HANDOVER CONFIRMATION DIALOG
         ========================================================================= */}
      {pendingHandover && activeSpecialist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-5 text-white animate-in zoom-in-95 ring-1 ring-purple-500/20">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <ArrowRightLeft className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Switch Specialist Handover</h3>
                  <p className="text-[11px] text-slate-400">Transfer conversation context</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingHandover(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Handover Visual Transfer Banner */}
            <div className="flex items-center justify-between bg-black/40 border border-white/10 p-3.5 rounded-2xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <img src={activeSpecialist.imageUrl} alt={activeSpecialist.name} className="h-10 w-10 rounded-full object-cover border border-slate-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-300 truncate">{activeSpecialist.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{activeSpecialist.role}</p>
                </div>
              </div>

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600/30 text-purple-300 border border-purple-500/40 shrink-0 mx-2">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>

              <div className="flex items-center gap-2.5 min-w-0 text-right justify-end">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{pendingHandover.targetAgent.name}</p>
                  <p className="text-[10px] text-purple-300 truncate">{pendingHandover.targetAgent.role}</p>
                </div>
                <img src={pendingHandover.targetAgent.imageUrl} alt={pendingHandover.targetAgent.name} className="h-10 w-10 rounded-full object-cover border-2 border-purple-400 shrink-0" />
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You are switching to <strong className="text-white">{pendingHandover.targetAgent.name}</strong> ({pendingHandover.targetAgent.role}). How would you like to continue?
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmHandover('fresh')}
                className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold border border-white/10 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Start New Chat</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmHandover('continue')}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg border border-purple-400/30 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Continue in Same Chat</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          QUICK SWITCH SPECIALIST MODAL (Glassmorphism Modal Popup)
         ========================================================================= */}
      {isAgentPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-900/95 p-6 shadow-2xl border border-white/10 space-y-4 animate-in zoom-in-95 duration-200 ring-1 ring-purple-500/30 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Select Buddy Specialist</h3>
                  <p className="text-[11px] text-slate-400">{onlineAgentsCount} Specialists Available Now</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAgentPickerOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {agentsList.map((sp) => {
                const isSelected = activeSpecialist?.id === sp.id;
                const isOnline = sp.status === 'online';

                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => handleSelectAgent(sp)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-2xl border text-left transition cursor-pointer',
                      isSelected
                        ? 'bg-purple-950/60 border-purple-500 ring-1 ring-purple-500/40 shadow-xs'
                        : isOnline
                        ? 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] hover:border-purple-500/30'
                        : 'bg-black/40 border-white/[0.04] opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={sp.imageUrl}
                          alt={sp.name}
                          className={cn(
                            'h-11 w-11 rounded-full object-cover border shrink-0 shadow-xs',
                            isOnline ? 'border-purple-400/80' : 'border-slate-700 grayscale'
                          )}
                        />
                        {isOnline ? (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-950 animate-pulse" />
                        ) : (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-slate-950" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-white">{sp.name}</span>
                          <span className="text-[10px] font-bold text-purple-300 bg-purple-950/80 border border-purple-500/30 px-1.5 py-0.2 rounded-md">
                            {sp.indicName}
                          </span>
                        </div>
                        <span className="block text-[11px] text-purple-300/80 truncate font-medium">{sp.role}</span>
                        <span className="block text-[10px] text-slate-400 font-mono">{sp.voiceLabel}</span>
                      </div>
                    </div>

                    {isSelected ? (
                      <Check className="h-4 w-4 text-purple-400 shrink-0 ml-2" />
                    ) : (
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          isOnline ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                        )}
                      >
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // If embedded in a page route (unless minimized to floating copilot)
  if (isEmbedded && !isMinimized) {
    return content;
  }

  // Full Screen & Glassmorphic Modal Overlay
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center select-none transition-all duration-200',
        isMinimized
          ? 'pointer-events-none bg-transparent p-0 border-0 shadow-none'
          : 'p-2 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-md'
      )}
    >
      {content}
    </div>
  );
}

export function AiAssistantPage() {
  return <AiAssistantPortal isEmbedded={true} />;
}

