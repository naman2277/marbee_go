import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Sparkles,
  Volume2,
  Terminal,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Copy,
  Code2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { SUPPORTED_LANGUAGES, getLanguageByCode } from '@/lib/ai-languages';
import { playBuddySpeech, stopBuddySpeech } from '@/lib/ai-voice-engine';

export type RunwayAvatarProfile = {
  id: string;
  name: string;
  role: string;
  voice: string;
  avatarUrl: string;
  initialGreeting: string;
  systemPersonality: string;
};

export const RUNWAY_AVATARS: RunwayAvatarProfile[] = [
  {
    id: 'char_nova_support',
    name: 'Nova',
    role: 'CRM Support & Insights Specialist',
    voice: 'US Female (Friendly Support)',
    avatarUrl: '👩‍💼',
    initialGreeting: "Hi, I'm Nova. I can explore the dashboard, explain insights, and help with tickets. Share your screen if you want help diagnosing what you see.",
    systemPersonality: 'Helpful, concise, capable of screen diagnostics and CRM troubleshooting.',
  },
  {
    id: 'char_alex_crm',
    name: 'Alex',
    role: 'Enterprise CRM Implementation Consultant',
    voice: 'US Male (Consultative & Calm)',
    avatarUrl: '👨‍💼',
    initialGreeting: "Hey! Alex here. I can trace your campaign errors, optimize targeting queries, and guide your journey architecture.",
    systemPersonality: 'Technical, deep reasoning, SQL & API expert.',
  },
  {
    id: 'char_sunny_clone',
    name: 'Sunny',
    role: 'AI Tech Lead (Digital Clone)',
    voice: 'US Male (Casual & Upbeat)',
    avatarUrl: '🧑‍💻',
    initialGreeting: "What's up! Let's explore your revenue trends, compare time periods, and triage your open tickets.",
    systemPersonality: 'Energetic, fast-paced, demonstrates live tool calls and page actions.',
  },
];

type ToolExecutionEvent = {
  id: string;
  timestamp: string;
  type: 'client' | 'server';
  name: string;
  args: Record<string, unknown>;
  result: string;
};

export function AiRunwayVideoCall() {
  const navigate = useNavigate();
  const [selectedAvatar, setSelectedAvatar] = useState<RunwayAvatarProfile>(RUNWAY_AVATARS[0]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const [currentSpeechText, setCurrentSpeechText] = useState('');
  const [toolEvents, setToolEvents] = useState<ToolExecutionEvent[]>([]);
  const [transcript, setTranscript] = useState<{ sender: 'user' | 'avatar'; text: string; time: string }[]>([]);
  const [voiceVolume, setVoiceVolume] = useState<number[]>([20, 45, 75, 30, 85, 40, 60, 25, 90, 35]);
  const [activeTab, setActiveTab] = useState<'video' | 'tools' | 'embed'>('video');
  const [copiedCode, setCopiedCode] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [callLanguage, setCallLanguage] = useState<string>('en-US');
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLangMeta = getLanguageByCode(callLanguage);

  const handleSwitchCallLanguage = (langCode: string) => {
    setCallLanguage(langCode);
    setIsLangDropdownOpen(false);
    const langMeta = getLanguageByCode(langCode);
    const ackText = langMeta.ackGreeting || `Switched to ${langMeta.name}. How can I assist you today?`;
    setCurrentSpeechText(ackText);
    setIsAvatarSpeaking(true);
    setTranscript((prev) => [
      ...prev,
      {
        sender: 'avatar',
        text: ackText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    playBuddySpeech(
      ackText,
      {
        name: selectedAvatar.name,
        gender: selectedAvatar.id.includes('nova') ? 'female' : 'male',
        voiceLabel: langCode,
      },
      [],
      [],
      () => setIsAvatarSpeaking(false),
      () => setIsAvatarSpeaking(false)
    );
  };

  // Audio wave animation when avatar is speaking or mic is listening
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCallActive) {
      interval = setInterval(() => {
        setVoiceVolume(Array.from({ length: 12 }, () => Math.floor(15 + Math.random() * 75)));
      }, 150);
    }
    return () => clearInterval(interval);
  }, [isCallActive]);

  // Clean up speech on component unmount
  useEffect(() => {
    return () => {
      stopBuddySpeech();
    };
  }, []);

  // Start Call Sequence
  const handleStartCall = () => {
    setIsCallActive(true);
    setIsAvatarSpeaking(true);
    const greeting = activeLangMeta.code !== 'en-US' ? activeLangMeta.ackGreeting : selectedAvatar.initialGreeting;
    setCurrentSpeechText(greeting);
    setTranscript([
      {
        sender: 'avatar',
        text: greeting,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    playBuddySpeech(
      greeting,
      {
        name: selectedAvatar.name,
        gender: selectedAvatar.id.includes('nova') ? 'female' : 'male',
        voiceLabel: callLanguage,
      },
      [],
      [],
      () => setIsAvatarSpeaking(false),
      () => setIsAvatarSpeaking(false)
    );
  };

  // End Call
  const handleEndCall = () => {
    stopBuddySpeech();
    setIsCallActive(false);
    setIsAvatarSpeaking(false);
    setIsScreenSharing(false);
    setCurrentSpeechText('');
  };

  // Simulate Voice Interaction with Tool Calling
  const handleVoiceCommand = (command: string) => {
    if (!isCallActive) return;

    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTranscript((prev) => [...prev, { sender: 'user', text: command, time: userTime }]);

    setIsAvatarSpeaking(true);
    const cmdLower = String(command || '').toLowerCase();

    // 1. Screen Share / Revenue Dip Query (Matching the video transcript)
    if (cmdLower.includes('revenue') || cmdLower.includes('dip') || cmdLower.includes('july 10')) {
      const toolEv: ToolExecutionEvent = {
        id: `tool_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'server',
        name: 'crm.queryRevenueMetrics',
        args: { range: '90_days', compare: '30_days', targetDate: '2025-07-10' },
        result: 'Revenue: $349,783 | 30d: $123,000 | Dip Reason: $2,850 Refund transaction',
      };
      setToolEvents((prev) => [toolEv, ...prev]);

      setTimeout(() => {
        const reply = "That dip on July 10th was due to a refund for $2,850. The last 90 days had $349,783 in revenue, which is about $227K higher than the 30-day total.";
        setCurrentSpeechText(reply);
        setTranscript((prev) => [...prev, { sender: 'avatar', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        setIsAvatarSpeaking(false);
      }, 1800);
    }
    // 2. Ticket Triage Command
    else if (cmdLower.includes('ticket') || cmdLower.includes('close')) {
      const toolEv: ToolExecutionEvent = {
        id: `tool_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'client',
        name: 'pageActions.updateTicketStatus',
        args: { ticketId: '#489', newStatus: 'closed', assignedTeam: 'Product' },
        result: 'Ticket #489 updated to CLOSED successfully',
      };
      setToolEvents((prev) => [toolEv, ...prev]);

      setTimeout(() => {
        const reply = "I've closed ticket #489 for you. The support team now has only 1 remaining open ticket.";
        setCurrentSpeechText(reply);
        setTranscript((prev) => [...prev, { sender: 'avatar', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        setIsAvatarSpeaking(false);
      }, 1500);
    }
    // 3. Navigation Command
    else if (cmdLower.includes('campaign') || cmdLower.includes('take me to')) {
      const toolEv: ToolExecutionEvent = {
        id: `tool_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'client',
        name: 'pageActions.navigateRoute',
        args: { route: '/campaigns', highlightSelector: 'data-avatar-target="campaigns"' },
        result: 'Navigated to /campaigns',
      };
      setToolEvents((prev) => [toolEv, ...prev]);

      setTimeout(() => {
        const reply = "Taking you right over to the Campaigns module now.";
        setCurrentSpeechText(reply);
        setTranscript((prev) => [...prev, { sender: 'avatar', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        setIsAvatarSpeaking(false);
      }, 1200);
    }
    // 4. Default Assistant Answer
    else {
      setTimeout(() => {
        const reply = "I understand. I'm actively monitoring your CRM events and can execute database queries or UI actions whenever you're ready.";
        setCurrentSpeechText(reply);
        setTranscript((prev) => [...prev, { sender: 'avatar', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        setIsAvatarSpeaking(false);
      }, 1400);
    }
  };

  const sampleEmbedSnippet = `<!-- Runway Characters Embed Script -->
<script 
  src="https://embed.runwayml.com/v1/character.js" 
  data-avatar-id="${selectedAvatar.id}"
  data-model="gwm1-avatars"
  data-voice="${selectedAvatar.voice}"
  data-allowed-origins="https://app.marbee.io"
  async>
</script>

<!-- React SDK Initializer -->
<RunwayAvatarProvider apiKey={RUNWAY_KEY} avatarId="${selectedAvatar.id}">
  <AvatarCall 
    clientTools={[pageActionTools, crmEventTools]}
    onToolExecute={(event) => console.log('Runway Tool Executed:', event)}
  />
</RunwayAvatarProvider>`;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-white rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', isCallActive ? 'bg-emerald-400' : 'bg-slate-500')} />
            <span className={cn('relative inline-flex rounded-full h-3 w-3', isCallActive ? 'bg-emerald-500' : 'bg-slate-600')} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-tight text-white">{selectedAvatar.name}</span>
              <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[9px] font-black text-purple-300 border border-purple-500/30">
                Runway GWM1 Real-Time Video
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">{selectedAvatar.role} • Latency: &lt; 1.8s</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Language Switcher */}
          <div className="relative" ref={langDropdownRef}>
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSwitchCallLanguage('en-US')}
                className={cn(
                  'px-2.5 py-1 rounded-xl transition cursor-pointer text-[11px]',
                  callLanguage === 'en-US' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                )}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => handleSwitchCallLanguage('en-IN')}
                className={cn(
                  'px-2.5 py-1 rounded-xl transition cursor-pointer text-[11px]',
                  callLanguage === 'en-IN' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                )}
              >
                Hinglish
              </button>
              <button
                type="button"
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className={cn(
                  'px-2.5 py-1 rounded-xl transition cursor-pointer text-[11px] flex items-center gap-1',
                  callLanguage !== 'en-US' && callLanguage !== 'en-IN'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <span>{callLanguage !== 'en-US' && callLanguage !== 'en-IN' ? `${activeLangMeta.flag} ${activeLangMeta.name}` : 'Select your Language'}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            {/* Dropdown Menu */}
            {isLangDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 z-50 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700 p-2 shadow-2xl space-y-2 max-h-64 overflow-y-auto [scrollbar-width:thin] ring-1 ring-purple-500/40 animate-in fade-in zoom-in-95">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300 px-2 py-1">
                    🇮🇳 Indian Regional Languages
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {SUPPORTED_LANGUAGES.filter((l) => l.region === 'Indian Regional').map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleSwitchCallLanguage(lang.code)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-[11px] font-medium transition cursor-pointer',
                          callLanguage === lang.code
                            ? 'bg-purple-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <span>{lang.flag}</span>
                        <span className="truncate">{lang.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1.5 border-t border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300 px-2 py-1">
                    🌐 Global Languages
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {SUPPORTED_LANGUAGES.filter((l) => l.region === 'Global' && l.code !== 'en-US').map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleSwitchCallLanguage(lang.code)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-[11px] font-medium transition cursor-pointer',
                          callLanguage === lang.code
                            ? 'bg-purple-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <span>{lang.flag}</span>
                        <span className="truncate">{lang.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* View Switcher Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('video')}
              className={cn('px-3 py-1 rounded-xl transition', activeTab === 'video' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white')}
            >
              Video Call
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tools')}
              className={cn('px-3 py-1 rounded-xl transition flex items-center gap-1.5', activeTab === 'tools' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white')}
            >
              <Terminal className="h-3 w-3" />
              Tool Calls ({toolEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('embed')}
              className={cn('px-3 py-1 rounded-xl transition flex items-center gap-1.5', activeTab === 'embed' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white')}
            >
              <Code2 className="h-3 w-3" />
              SDK Embed
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Stage */}
      <div className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* =========================================================================
            TAB 1: LIVE VIDEO & SCREEN SHARE CALL STAGE
           ========================================================================= */}
        {activeTab === 'video' && (
          <div className="flex-1 relative flex flex-col items-center justify-between p-6 bg-gradient-to-b from-slate-900 via-slate-950 to-black">
            {/* Screen Share Overlay (If active) */}
            {isScreenSharing && (
              <div className="absolute top-4 left-6 right-6 h-48 rounded-2xl bg-slate-800/90 border border-slate-700 shadow-2xl p-4 flex flex-col justify-between backdrop-blur-md z-15 animate-in fade-in slide-in-from-top-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <Monitor className="h-4 w-4 text-purple-400" />
                    <span>Live Screen Share Feed (Analyzing Dashboard &amp; July 10 Revenue Dip)</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30 animate-pulse">
                    Vision Diagnostic Live
                  </span>
                </div>

                {/* Simulated Chart on Screen Share */}
                <div className="flex items-end gap-2 h-20 px-4">
                  <div className="w-8 bg-purple-500/60 h-12 rounded-t" />
                  <div className="w-8 bg-purple-500/60 h-16 rounded-t" />
                  <div className="w-8 bg-rose-500/80 h-6 rounded-t relative">
                    <span className="absolute -top-5 -left-2 text-[8px] bg-rose-900 text-rose-200 px-1 rounded font-bold">
                      -$2.8k
                    </span>
                  </div>
                  <div className="w-8 bg-purple-500/60 h-14 rounded-t" />
                  <div className="w-8 bg-purple-500/60 h-18 rounded-t" />
                  <div className="w-8 bg-emerald-500/80 h-20 rounded-t" />
                </div>

                <div className="text-[10px] text-slate-400 flex justify-between">
                  <span>Target: `data-avatar-target="revenue-chart"`</span>
                  <span className="text-purple-300 font-bold">Diagnosed: 1 refunded transaction on July 10</span>
                </div>
              </div>
            )}

            {/* Central Avatar Visualizer & Lip-Sync Face */}
            <div className="relative flex flex-col items-center justify-center my-auto">
              {/* Outer Glow Halo */}
              <div
                className={cn(
                  'absolute w-64 h-64 rounded-full transition-all duration-500 blur-3xl',
                  isAvatarSpeaking ? 'bg-purple-500/30 scale-125' : 'bg-purple-600/10 scale-100'
                )}
              />

              {/* Character Video Portal Card */}
              <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-gradient-to-tr from-purple-900 via-slate-800 to-indigo-900 border-4 border-purple-500/60 shadow-2xl flex items-center justify-center overflow-hidden">
                {/* Simulated 3D Video Stream / Face */}
                <div className={cn('text-7xl transition-transform duration-200', isAvatarSpeaking && 'scale-110 animate-pulse')}>
                  {selectedAvatar.avatarUrl}
                </div>

                {/* Live Speaking Indicator Overlay */}
                {isAvatarSpeaking && (
                  <div className="absolute bottom-3 inset-x-0 flex justify-center items-center gap-1 px-4">
                    {voiceVolume.map((vol, i) => (
                      <span
                        key={i}
                        className="w-1 bg-purple-400 rounded-full transition-all duration-100"
                        style={{ height: `${Math.max(4, vol / 3)}px` }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Subtitle / Current Speech Bubble */}
              {currentSpeechText && (
                <div className="mt-4 max-w-lg rounded-2xl bg-slate-900/90 px-4 py-2.5 text-center text-xs font-medium text-slate-200 border border-purple-500/30 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95">
                  <span className="text-purple-400 font-bold">{selectedAvatar.name}: </span>
                  {currentSpeechText}
                </div>
              )}
            </div>

            {/* Bottom Call Controls & Quick Action Voice Prompts */}
            <div className="w-full flex flex-col items-center gap-3">
              {/* Suggested Voice Triggers (Matching the video transcript) */}
              {isCallActive && (
                <div className="flex flex-wrap justify-center items-center gap-2 max-w-2xl">
                  <button
                    type="button"
                    onClick={() => handleVoiceCommand("What happened on July 10th revenue dip?")}
                    className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-bold text-slate-300 border border-slate-700 hover:bg-purple-600 hover:text-white transition"
                  >
                    🎙️ "What happened on July 10th revenue dip?"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVoiceCommand("Can you close ticket #489 for me?")}
                    className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-bold text-slate-300 border border-slate-700 hover:bg-purple-600 hover:text-white transition"
                  >
                    🎙️ "Can you close ticket #489 for me?"
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVoiceCommand("Take me to the Campaigns screen")}
                    className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-bold text-slate-300 border border-slate-700 hover:bg-purple-600 hover:text-white transition"
                  >
                    🎙️ "Take me to Campaigns"
                  </button>
                </div>
              )}

              {/* Main Call Action Buttons */}
              <div className="flex items-center gap-3 bg-slate-900/90 p-2 rounded-3xl border border-slate-800 shadow-2xl">
                {!isCallActive ? (
                  <button
                    type="button"
                    onClick={handleStartCall}
                    className="flex items-center gap-2 rounded-2xl bg-purple-600 px-6 py-3 text-xs font-black text-white shadow-lg shadow-purple-600/40 hover:bg-purple-500 active:scale-95 transition"
                  >
                    <Video className="h-4 w-4" />
                    Start Runway Live Video Call
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsMicMuted(!isMicMuted)}
                      className={cn(
                        'rounded-2xl p-3 transition',
                        isMicMuted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      )}
                      title="Toggle Microphone"
                    >
                      {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsScreenSharing(!isScreenSharing)}
                      className={cn(
                        'rounded-2xl p-3 transition flex items-center gap-1.5 text-xs font-bold',
                        isScreenSharing ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      )}
                      title="Share Screen for Vision Diagnosis"
                    >
                      <Monitor className="h-4 w-4" />
                      <span>{isScreenSharing ? 'Sharing Screen' : 'Share Screen'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEndCall}
                      className="flex items-center gap-1.5 rounded-2xl bg-rose-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 active:scale-95 transition"
                    >
                      <PhoneOff className="h-4 w-4" />
                      <span>End Call</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: RUNWAY CLIENT & SERVER TOOL CALLS LOG
           ========================================================================= */}
        {activeTab === 'tools' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-purple-400" />
                  Live Tool Execution Inspector (Runway GWM1 RPC)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inspect client page actions, navigation triggers, and secure server database tools executed by the avatar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToolEvents([])}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear Events
              </button>
            </div>

            {toolEvents.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-500 text-xs">
                No tool calls executed yet. Start the video call and ask to navigate, check revenue, or close tickets!
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                {toolEvents.map((ev) => (
                  <div key={ev.id} className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold uppercase', ev.type === 'client' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-purple-500/20 text-purple-300')}>
                          {ev.type} Tool
                        </span>
                        <span className="font-bold text-white">{ev.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{ev.timestamp}</span>
                    </div>

                    <div className="rounded-xl bg-slate-950 p-2.5 text-slate-300 text-[11px]">
                      <span className="text-slate-500 block mb-1">Payload:</span>
                      <pre className="text-emerald-400">{JSON.stringify(ev.args, null, 2)}</pre>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      <span className="text-slate-500 font-bold">Result: </span>
                      <span className="text-white">{ev.result}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 3: RUNWAY EMBED WIDGET CODE GENERATOR
           ========================================================================= */}
        {activeTab === 'embed' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-purple-400" />
                  Runway Characters Embed Snippet &amp; React SDK
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Embed this live character into your marketing landing pages, support portal, or SaaS onboarding flow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(sampleEmbedSnippet);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(null as any), 2000);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-purple-500 transition"
              >
                {copiedCode ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedCode ? 'Copied SDK' : 'Copy Snippet'}</span>
              </button>
            </div>

            <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 font-mono text-[11px]">
              <pre className="overflow-x-auto text-purple-300 leading-relaxed whitespace-pre">
                {sampleEmbedSnippet}
              </pre>
            </div>
          </div>
        )}

        {/* Right Side Avatar Picker & Settings Column */}
        <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-slate-800/80 bg-slate-900/50 p-4 flex flex-col justify-between gap-4">
          <div>
            <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider mb-2.5">
              Select Character Avatar
            </h4>
            <div className="space-y-2">
              {RUNWAY_AVATARS.map((av) => (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => {
                    setSelectedAvatar(av);
                    if (isCallActive) {
                      setCurrentSpeechText(av.initialGreeting);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 p-2.5 rounded-2xl border text-left transition',
                    selectedAvatar.id === av.id
                      ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm'
                      : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  )}
                >
                  <span className="text-2xl">{av.avatarUrl}</span>
                  <div className="truncate">
                    <span className="block text-xs font-bold text-white truncate">{av.name}</span>
                    <span className="block text-[10px] text-slate-400 truncate">{av.role}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950 p-3 border border-slate-800 space-y-1.5 text-[11px]">
            <span className="font-bold text-slate-300 block">GWM1 Vision Diagnostics</span>
            <p className="text-slate-400 text-[10px] leading-relaxed">
              Runway Characters use live multimodal vision to read your active CRM screen, inspect SQL queries, and diagnose anomalies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
