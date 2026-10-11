import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  PhoneOff,
  PhoneCall,
  Mic,
  MicOff,
  Sparkles,
  Send,
  Paperclip,
  Check,
  Copy,
  ArrowRight,
  RefreshCw,
  Cpu,
  Sliders,
  X,
  FileText,
  Edit3,
  Lightbulb,
  Layers,
  Database,
  Mail,
  Zap,
  ChevronDown,
  Plus,
  CheckSquare,
  Users,
  Radio,
  Volume2,
  VolumeX,
  Monitor,
  Minimize2,
  Maximize2,
  HelpCircle,
  Compass,
  TrendingUp,
  Bot,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeUserQuery, type DiagnosticResult } from './knowledgeBase';
import { executeIntelligentReasoning } from '@/lib/ai-crm-context';
import {
  fetchAiModelsConfig,
  saveChatSession,
  fetchVoiceAvatarAdapters,
  fetchVoiceAgentsConfig,
  fetchBuddyAgentsConfig,
  type VoiceAgentConfig,
  type BuddyCustomAgentConfig,
} from '@/lib/ai-engine-config';
import {
  SUPPORTED_LANGUAGES,
  getLanguageByCode,
  type SupportedLanguage,
} from '@/lib/ai-languages';
import { playBuddySpeech, stopBuddySpeech } from '@/lib/ai-voice-engine';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft } from 'lucide-react';
import type { BuddyAgent } from './AiAgentSidebar';
import { AiBrandIcon } from '@/components/ai/AiBrandLogos';

type ChatMessage = {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  agentName?: string;
  agentImageUrl?: string;
  agentRole?: string;
  modelUsed?: string;
  latencyMs?: number;
  tokens?: number;
  attachment?: { name: string; type: string; previewUrl?: string };
  diagnostic?: DiagnosticResult;
  toolCall?: { name: string; status: string; path?: string };
};

export interface AiProfessionalAgentProps {
  activeSpecialist: BuddyAgent;
  onOpenAgentPicker: () => void;
  handoverEvent?: {
    fromAgent: BuddyAgent;
    toAgent: BuddyAgent;
    mode: 'continue' | 'fresh';
    timestamp: number;
  } | null;
  onHandoverHandled?: () => void;
  isBackgroundChatMinimized?: boolean;
  onToggleMinimizeBackgroundChat?: () => void;
  onLiveCallStateChange?: (isActive: boolean) => void;
}

const PROMPT_SUGGESTIONS = [
  {
    category: 'Projects & Sprint Tasks',
    icon: CheckSquare,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    prompts: [
      'What are the active tasks and projects in our workspace right now?',
      'Break down a high-converting Ramadan campaign launch into 6 tasks with subtasks.',
      'Show me all tasks assigned to Naman Sharma across our marketing sprints.',
    ],
  },
  {
    category: 'Campaigns & Automations',
    icon: Mail,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    prompts: [
      'How do I create an abandoned cart 3-stage recovery journey?',
      'How many delivery templates do we currently have in this workspace?',
      'What are the best practices for WhatsApp Meta Business template approvals?',
    ],
  },
  {
    category: 'PostgreSQL & Audience SQL',
    icon: Database,
    color: 'text-sky-600 bg-sky-50 border-sky-200',
    prompts: [
      'Generate an SQL query for high-value VIP customers (RFM Champions).',
      'How do I deduplicate customer targeting query with 1-to-many orders join?',
      'Show me the database schema for the customers and campaigns tables.',
    ],
  },
  {
    category: 'Deliverability & Infrastructure',
    icon: Zap,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    prompts: [
      'How do I configure Web Push VAPID keys and service worker scope?',
      'Why is my SMTP delivery failing with authentication code 535?',
      'How does the 410 Gone FCM push token pruning worker operate?',
    ],
  },
  {
    category: 'Workspace & Authorized Team',
    icon: Layers,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    prompts: [
      'Who are the authorized workspace users with access to this CRM?',
      'What is the difference between tenant_users and customer records in Marbee?',
      'Show live database platform health and customer counts.',
    ],
  },
];

export function AiProfessionalAgent({
  activeSpecialist,
  onOpenAgentPicker,
  handoverEvent,
  onHandoverHandled,
  isBackgroundChatMinimized = false,
  onToggleMinimizeBackgroundChat,
  onLiveCallStateChange,
}: AiProfessionalAgentProps) {
  const navigate = useNavigate();
  const { tenantId, environment } = useAuth();
  const [isLiveSessionActive, setIsLiveSessionActive] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSpeech, setCurrentSpeech] = useState('');
  const [input, setInput] = useState('');
  const [callInput, setCallInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; type: string; previewUrl?: string } | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [audioWave, setAudioWave] = useState<number[]>([20, 50, 80, 30, 90, 40, 70, 25, 85, 35]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live Call & Screen Sharing Copilot States
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCallFloating, setIsCallFloating] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Dynamic AI Models loaded from Settings > AI Engine
  const [availableModels, setAvailableModels] = useState<AiModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini_default');

  // Dynamic Voice Adapters, Outbound Gateways, and Buddy Agent Configurations
  const [voiceAvatarAdapters, setVoiceAvatarAdapters] = useState<VoiceAvatarAiAdapter[]>([]);
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgentConfig[]>([]);
  const [buddyAgents, setBuddyAgents] = useState<BuddyCustomAgentConfig[]>([]);
  const [isListeningUserVoice, setIsListeningUserVoice] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetchAiModelsConfig(tenantId, environment).then((models) => {
      if (models && models.length > 0) {
        setAvailableModels(models);
        const configured = models.filter((m) => Boolean(m.apiKey && m.apiKey.trim().length > 0));
        if (configured.length > 0) {
          setSelectedModelId(configured[0].id);
        } else {
          setSelectedModelId(models[0].id);
        }
      }
    });

    fetchVoiceAvatarAdapters(tenantId, environment).then((data) => {
      if (data) setVoiceAvatarAdapters(data);
    });

    fetchVoiceAgentsConfig(tenantId, environment).then((data) => {
      if (data) setVoiceAgents(data);
    });

    fetchBuddyAgentsConfig(tenantId, environment).then((data) => {
      if (data) setBuddyAgents(data);
    });

    return () => {
      stopBuddySpeech();
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
    };
  }, [tenantId, environment]);

  // Sync Live Call active state to parent
  useEffect(() => {
    onLiveCallStateChange?.(isLiveSessionActive);
  }, [isLiveSessionActive, onLiveCallStateChange]);

  // Stop any active speech immediately when user switches active specialist
  useEffect(() => {
    stopBuddySpeech();
    setIsSpeaking(false);
    setCurrentSpeech('');
  }, [activeSpecialist?.id]);

  // Compute live agent specialist merging prop with customized database voice configurations
  const effectiveSpecialist: BuddyAgent = React.useMemo(() => {
    if (!activeSpecialist) return activeSpecialist;
    const latest = buddyAgents.find((b) => b.id === activeSpecialist.id);
    if (latest) {
      return {
        ...activeSpecialist,
        ...latest,
        voiceAdapterId: latest.voiceAdapterId || activeSpecialist.voiceAdapterId,
        voiceId: latest.voiceId || activeSpecialist.voiceId,
        voiceProvider: latest.voiceProvider || activeSpecialist.voiceProvider,
        voiceLabel: latest.voiceLabel || activeSpecialist.voiceLabel,
        gender: latest.gender || activeSpecialist.gender,
      };
    }
    return activeSpecialist;
  }, [activeSpecialist, buddyAgents]);

  // Keep ONLY configured models (with API key or default engine) in dropdown
  const configuredModels = availableModels.filter((m) => Boolean(m.apiKey && m.apiKey.trim().length > 0));
  const displayModels = configuredModels.length > 0 ? configuredModels : (
    availableModels.length > 0 ? availableModels.slice(0, 1) : [
      {
        id: 'gemini_default',
        provider: 'gemini' as const,
        providerName: 'Google Gemini',
        modelName: 'gemini-2.0-flash',
        apiKey: '',
        isDefault: true,
        status: 'connected' as const,
        latencyMs: 180,
        tokensUsedThisMonth: 0,
        temperature: 0.7,
        maxTokens: 2048,
        enabledFeatures: { decisionEngine: true, copywriting: true, rfmAnalysis: true, voiceAgents: true, autonomousTasks: true },
        iconBg: 'bg-emerald-500/10',
        iconColor: 'text-emerald-500',
      }
    ]
  );

  const activeModel = displayModels.find((m) => m.id === selectedModelId) || displayModels[0];

  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      const active = localStorage.getItem('marbee_ai_active_session');
      if (active) {
        const parsed = JSON.parse(active);
        if (parsed && parsed.id) return parsed.id;
      }
    } catch {}
    return `sess-${Date.now()}`;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const active = localStorage.getItem('marbee_ai_active_session');
      if (active) {
        const parsed = JSON.parse(active);
        if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          return parsed.messages;
        }
      }
    } catch {}
    return [
      {
        id: 'm-welcome',
        sender: 'agent',
        text: activeSpecialist.greeting,
        timestamp: 'Just now',
        modelUsed: activeModel ? `${activeModel.providerName}` : 'Marbee AI Engine',
      },
    ];
  });

  const handleStartNewChat = () => {
    const newSessId = `sess-${Date.now()}`;
    setSessionId(newSessId);
    localStorage.removeItem('marbee_ai_active_session');
    setMessages([
      {
        id: 'm-welcome',
        sender: 'agent',
        text: activeSpecialist.greeting,
        timestamp: 'Just now',
        modelUsed: activeModel ? `${activeModel.providerName}` : 'Marbee AI Engine',
      },
    ]);
  };

  // Handle Specialist Handover (Continue in Same Chat vs Start Fresh)
  useEffect(() => {
    if (handoverEvent) {
      if (handoverEvent.mode === 'continue') {
        const transferMsg: ChatMessage = {
          id: `sys-transfer-${Date.now()}`,
          sender: 'system',
          text: `Chat transferred to ${handoverEvent.toAgent.name} (${handoverEvent.toAgent.role}).`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        const greetingMsg: ChatMessage = {
          id: `agent-greet-${Date.now()}`,
          sender: 'agent',
          agentName: handoverEvent.toAgent.name,
          agentImageUrl: handoverEvent.toAgent.imageUrl,
          agentRole: handoverEvent.toAgent.role,
          text: `Hello! I'm ${handoverEvent.toAgent.name}, ${handoverEvent.toAgent.role}. I've taken over this session and have full context of our conversation above. How can I assist you?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: activeModel ? `${activeModel.providerName}` : 'Marbee AI Engine',
        };
        setMessages((prev) => [...prev, transferMsg, greetingMsg]);
        speakText(`Hello! I am ${handoverEvent.toAgent.name}, ${handoverEvent.toAgent.role}. I've taken over this session.`);
      } else {
        handleStartNewChat();
      }
      onHandoverHandled?.();
    }
  }, [handoverEvent]);

  // Update Welcome Message whenever active specialist changes on first start
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'm-welcome') {
        return [
          {
            id: 'm-welcome',
            sender: 'agent',
            agentName: activeSpecialist.name,
            agentImageUrl: activeSpecialist.imageUrl,
            agentRole: activeSpecialist.role,
            text: activeSpecialist.greeting,
            timestamp: 'Just now',
            modelUsed: activeModel ? `${activeModel.providerName}` : 'Marbee AI Engine',
          },
        ];
      }
      return prev;
    });
  }, [activeSpecialist, activeModel]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSpeaking, isGenerating]);

  // Save session to SaaS Database (Supabase) with 7-DAY ROLLING RETENTION
  useEffect(() => {
    if (messages.length > 1) {
      try {
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const expiresAtIso = new Date(now + SEVEN_DAYS_MS).toISOString();

        const sessionSummary = {
          id: sessionId,
          updatedAt: nowIso,
          createdAt: nowIso,
          expiresAt: expiresAtIso,
          title: messages[1]?.text?.slice(0, 60) || 'Diagnostic Session',
          messageCount: messages.length,
          messages,
        };

        const existingRaw = localStorage.getItem('marbee_ai_saved_sessions');
        const list = existingRaw ? JSON.parse(existingRaw) : [];
        
        const validUnexpired = (Array.isArray(list) ? list : []).filter((s: any) => {
          if (!s.updatedAt && !s.createdAt) return false;
          const time = new Date(s.updatedAt || s.createdAt).getTime();
          return now - time < SEVEN_DAYS_MS;
        });

        const filtered = validUnexpired.filter((s: any) => s.id !== sessionId);
        filtered.unshift(sessionSummary);

        // Call database upsert + local fallback update
        saveChatSession(tenantId, environment, sessionSummary, filtered);
      } catch {}
    }
  }, [messages, sessionId, tenantId, environment]);

  // Audio wave animation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSpeaking || isLiveSessionActive) {
      timer = setInterval(() => {
        setAudioWave(Array.from({ length: 12 }, () => Math.floor(15 + Math.random() * 75)));
      }, 130);
    }
    return () => clearInterval(timer);
  }, [isSpeaking, isLiveSessionActive]);

  // Continuous speech recognition for hands-free live calls (Supports Hindi, Marathi, Bengali, Tamil, Telugu, English, etc.)
  const [callLanguage, setCallLanguage] = useState<string>('en-US');
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close language dropdown on outside click
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isLiveSessionActive && !isMicMuted && !isSpeaking) {
      try {
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = false;

        recog.lang = callLanguage || 'en-US';

        recog.onstart = () => setIsListeningUserVoice(true);
        recog.onend = () => setIsListeningUserVoice(false);
        recog.onerror = () => setIsListeningUserVoice(false);

        recog.onresult = (event: any) => {
          const transcript = event.results?.[0]?.[0]?.transcript;
          if (transcript && transcript.trim().length > 1) {
            handleSendMessage(transcript.trim());
          }
        };

        recog.start();
        recognitionRef.current = recog;
      } catch {}
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      setIsListeningUserVoice(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isLiveSessionActive, isMicMuted, isSpeaking, callLanguage, effectiveSpecialist]);

  // Speech Synthesis Helper using the configured voice adapter / neural voice profile
  const speakText = async (text: string) => {
    setIsSpeaking(true);
    await playBuddySpeech(
      text,
      effectiveSpecialist,
      voiceAvatarAdapters,
      voiceAgents,
      () => setIsSpeaking(false),
      () => setIsSpeaking(false)
    );
  };

  // Immediate voice confirmation when user switches language in live call
  const handleSwitchCallLanguage = (langCode: string) => {
    setCallLanguage(langCode);
    setIsLangDropdownOpen(false);
    stopBuddySpeech();
    const langMeta = getLanguageByCode(langCode);
    const ackText = langMeta.ackGreeting || `Language set to ${langMeta.name}. How can I assist you today?`;
    setCurrentSpeech(ackText);
    speakText(ackText);
  };

  // Screen Share Toggle & Floating Copilot Mode Trigger
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      const stopMsg = "Screen sharing stopped. I'm right here to continue assisting you.";
      setCurrentSpeech(stopMsg);
      speakText(stopMsg);
    } else {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' } as any,
            audio: false,
          });
          screenStreamRef.current = stream;
          setIsScreenSharing(true);
          setIsCallFloating(true); // Automatically dock to bottom-right floating copilot!
          
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = stream;
          }

          stream.getVideoTracks()[0].onended = () => {
            setIsScreenSharing(false);
            screenStreamRef.current = null;
          };

          const screenStartMsg = `Screen sharing active! I'm now floating in copilot mode at the bottom right. Ask me where to click, how to setup workflows, or to analyze live trends!`;
          setCurrentSpeech(screenStartMsg);
          speakText(screenStartMsg);
        }
      } catch (err) {
        console.warn('Screen share cancelled or not allowed:', err);
      }
    }
  };

  // Start Live Voice / Video Session
  const handleStartLiveSession = () => {
    setIsLiveSessionActive(true);
    setIsCallFloating(true);
    let greetingToSpeak = effectiveSpecialist.greeting || `Hi there! I am ${effectiveSpecialist.name}. How can I help you today?`;

    // Only use regional greeting if user has explicitly picked non-English language
    if (callLanguage && callLanguage !== 'en-US' && callLanguage !== 'en-IN') {
      const langMeta = getLanguageByCode(callLanguage);
      if (langMeta?.ackGreeting) {
        greetingToSpeak = langMeta.ackGreeting;
      }
    }

    setCurrentSpeech(greetingToSpeak);
    speakText(greetingToSpeak);
  };

  // End Live Voice / Video Session
  const handleEndLiveSession = () => {
    stopBuddySpeech();
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    setIsCallFloating(false);
    setIsLiveSessionActive(false);
    setIsSpeaking(false);
    setCurrentSpeech('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  };

  // Send Message / Execute AI Query using configured agent
  const handleSendMessage = async (customPrompt?: string) => {
    const text = (customPrompt || input).trim();
    if (!text && !attachedFile) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachment: attachedFile || undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setCallInput('');
    setAttachedFile(null);
    setIsGenerating(true);
    setIsSpeaking(true);
    setIsSuggestionsOpen(false);

    const diag = analyzeUserQuery(text);
    const cmdLower = text.toLowerCase();
    
    // Strict Hindi detection only when text contains Devanagari or starts with conversational Hindi
    const isHindi =
      /[\u0900-\u097F]/.test(text) ||
      cmdLower.startsWith('namaste') ||
      cmdLower.startsWith('kaise ho') ||
      cmdLower.startsWith('batao') ||
      cmdLower.startsWith('kya hal');

    let replyText = '';
    let toolCall: { name: string; status: string; path?: string } | undefined = undefined;
    let modelNameUsed = activeModel ? `${activeModel.providerName}` : 'Marbee AI Engine';
    let latencyMs = 0;
    let tokens = 0;

    // Interactive Screen Copilot Navigation & Setup Shortcuts
    if (
      cmdLower.includes('campaign') &&
      (cmdLower.includes('go to') || cmdLower.includes('open') || cmdLower.includes('take me') || cmdLower.includes('how to setup') || cmdLower.includes('where to') || cmdLower.includes('kholo'))
    ) {
      toolCall = { name: 'client.navigateRoute', status: 'Navigated to Campaigns', path: '/campaigns' };
      replyText = isHindi
        ? "मैं आपको **कैंपेन (Campaigns)** मॉड्यूल में ले जा रहा हूँ। यहाँ ऊपर दाईं ओर '+ New Campaign' बटन पर क्लिक करके आप WhatsApp, Email या SMS कैंपेन शुरू कर सकते हैं।"
        : "Taking you directly to the **Campaigns** module. Click the '+ New Campaign' button in the top right to start a multi-channel campaign (WhatsApp, Email, SMS, Web Push).";
      navigate('/campaigns');
    } else if (
      (cmdLower.includes('journey') || cmdLower.includes('automation')) &&
      (cmdLower.includes('go to') || cmdLower.includes('open') || cmdLower.includes('take me') || cmdLower.includes('how to setup') || cmdLower.includes('where to') || cmdLower.includes('kholo'))
    ) {
      toolCall = { name: 'client.navigateRoute', status: 'Navigated to Journeys', path: '/journeys' };
      replyText = isHindi
        ? "आपके लिए **जर्नी कैनवास (Journeys)** खोला जा रहा है। यहाँ आप ड्रैग-एंड-ड्रॉप नोड्स के साथ कार्ट रिकवरी और वेलकम फ्लो बना सकते हैं।"
        : "Opening the **Journeys & Automation Canvas**. Here you can design visual multi-step event triggers, cart abandonment win-backs, and retention sequences.";
      navigate('/journeys');
    } else if (
      (cmdLower.includes('trend') || cmdLower.includes('analytic') || cmdLower.includes('insight') || cmdLower.includes('metric')) &&
      (cmdLower.includes('show') || cmdLower.includes('analyze') || cmdLower.includes('tell') || cmdLower.includes('open') || cmdLower.includes('where'))
    ) {
      toolCall = { name: 'client.navigateRoute', status: 'Navigated to Web Analytics', path: '/analytics/web' };
      replyText = isHindi
        ? "यहाँ आपका **वेब एनालिटिक्स और कस्टमर ट्रेंड्स** डैशबोर्ड है। आप लाइव विजिटर एक्टिविटी, फनल ड्रॉप-ऑफ और कन्वर्जन ट्रेंड्स देख सकते हैं।"
        : "Opening your **Web Analytics & Customer Trends** dashboard. Here you can inspect real-time visitor sessions, conversion funnel drop-offs, and behavioral trends.";
      navigate('/analytics/web');
    } else if (
      (cmdLower.includes('audience') || cmdLower.includes('segment') || cmdLower.includes('rfm')) &&
      (cmdLower.includes('go to') || cmdLower.includes('open') || cmdLower.includes('take me') || cmdLower.includes('where') || cmdLower.includes('kholo'))
    ) {
      toolCall = { name: 'client.navigateRoute', status: 'Navigated to Audiences', path: '/customers/audiences' };
      replyText = isHindi
        ? "आपके लिए **कस्टमर ऑडियंस और RFM सेगमेंटेशन** पेज खोला जा रहा है। यहाँ आप VIP चैंपियंस और चर्न रिस्क वाले ग्राहकों को फिल्टर कर सकते हैं।"
        : "Navigating to **Customer Audiences & RFM Segmentation**. Here you can filter high-value Champions, loyal cohorts, and at-risk customers.";
      navigate('/customers/audiences');
    } else if (
      (cmdLower.includes('task') || cmdLower.includes('project') || cmdLower.includes('sprint')) &&
      (cmdLower.includes('go to') || cmdLower.includes('open') || cmdLower.includes('take me') || cmdLower.includes('kholo'))
    ) {
      toolCall = { name: 'client.navigateRoute', status: 'Navigated to Tasks & Projects', path: '/tasks' };
      replyText = isHindi
        ? "आपके लिए **टास्क और प्रोजेक्ट पोर्टल (/tasks)** खोला जा रहा है। यहाँ आप अपनी टीम के सभी असाइनमेंट्स ट्रैक कर सकते हैं।"
        : "Opening the **Task & Project Management Portal** (/tasks). Here you can manage sprint deliverables, assignees, and checklist milestones.";
      navigate('/tasks');
    } else if (
      (cmdLower.includes('channel') || cmdLower.includes('whatsapp setup') || cmdLower.includes('sms setup') || cmdLower.includes('gateway')) &&
      (cmdLower.includes('go to') || cmdLower.includes('open') || cmdLower.includes('setting') || cmdLower.includes('how to'))
    ) {
      toolCall = { name: 'client.navigateRoute', status: 'Navigated to Channels Settings', path: '/settings/channels' };
      replyText = isHindi
        ? "आपके लिए **चैनल और गेटवे सेटिंग्स (/settings/channels)** खोली जा रही हैं। यहाँ आप WhatsApp Business API, AWS SES, और Twilio SMS कनेक्ट कर सकते हैं।"
        : "Opening **Channel & Gateway Settings** (/settings/channels). Here you can configure WhatsApp Cloud API, AWS SES Email, Twilio SMS, and Web Push VAPID keys.";
      navigate('/settings/channels');
    } else {
      try {
        const reasoningRes = await executeIntelligentReasoning(
          text,
          activeModel?.apiKey,
          activeModel?.modelName || 'gemini-2.0-flash',
          activeModel?.provider || 'gemini',
          activeModel?.baseUrl,
          isHindi ? 'hi-IN' : 'en-US'
        );
        replyText = reasoningRes.text;
        latencyMs = reasoningRes.latencyMs;
        tokens = reasoningRes.tokens;
        const isLive = (reasoningRes as any).isLive;
        toolCall = {
          name: isLive ? 'buddy.live_inference' : 'buddy.platform_engine',
          status: isLive
            ? `${activeModel?.providerName || 'AI Engine'} (${latencyMs}ms)`
            : 'Marbee Platform Engine',
        };
      } catch (err: any) {
        replyText = `Error evaluating prompt: ${err?.message || 'Inference error'}`;
      }
    }

    setIsGenerating(false);

    const agentMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      sender: 'agent',
      agentName: activeSpecialist.name,
      agentImageUrl: activeSpecialist.imageUrl,
      agentRole: activeSpecialist.role,
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: modelNameUsed,
      latencyMs,
      tokens,
      diagnostic: diag,
      toolCall,
    };

    setMessages((prev) => [...prev, agentMsg]);
    setCurrentSpeech(replyText.replace(/###|\*\*|```sql|```/g, '').slice(0, 180));

    if (isLiveSessionActive) {
      speakText(replyText);
    } else {
      setIsSpeaking(false);
    }
  };

  // Regenerate Response for a specific USER message prompt
  const handleRegenerateFromUserMsg = async (userPromptText: string) => {
    if (!userPromptText) return;

    setIsGenerating(true);
    setIsSpeaking(true);

    try {
      const res = await executeIntelligentReasoning(
        userPromptText,
        activeModel?.apiKey,
        activeModel?.modelName || 'gemini-2.0-flash',
        activeModel?.provider || 'gemini'
      );

      const agentReply: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: 'agent',
        text: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: activeModel ? `${activeModel.providerName}` : 'Marbee AI Engine',
        latencyMs: res.latencyMs,
        tokens: res.tokens,
      };

      setMessages((prev) => [...prev, agentReply]);
      setCurrentSpeech(res.text.replace(/###|\*\*|```sql|```/g, '').slice(0, 180));

      if (isLiveSessionActive) {
        speakText(res.text);
      }
    } catch {}

    setIsGenerating(false);
    setIsSpeaking(false);
  };

  // Edit User Message and Submit
  const handleSaveEditedMessage = (msgId: string) => {
    if (!editingText.trim()) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, text: editingText.trim() } : m))
    );
    const promptToRun = editingText.trim();
    setEditingMsgId(null);
    setEditingText('');
    handleRegenerateFromUserMsg(promptToRun);
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  return (
    <>
      {/* ── BACKGROUND CHAT WORKSPACE (Can be minimized/cancelled during live call) ── */}
      <div
        className={cn(
          'flex flex-col h-full w-full bg-white text-slate-900 overflow-hidden font-sans relative transition-all duration-200',
          isBackgroundChatMinimized && 'hidden pointer-events-none opacity-0'
        )}
      >
      {/* 1. ULTRA-CLEAN HUMAN HEADER */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200/80 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenAgentPicker}
            className="relative group cursor-pointer"
            title="Click to Switch Specialist"
          >
            <img
              src={activeSpecialist.imageUrl}
              alt={activeSpecialist.name}
              className="h-10 w-10 rounded-full object-cover border-2 border-purple-200 group-hover:border-purple-600 transition shadow-2xs"
            />
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black text-slate-900 tracking-tight">
                {activeSpecialist.name}
              </h1>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Active now
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              {activeSpecialist.role}
            </p>
          </div>
        </div>

        {/* AI Engine Model Selection with Brand Logo & Powered by */}
        <div className="flex items-center gap-2.5">
          <div className="relative" ref={modelDropdownRef}>
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-2xl px-3 py-1.5 shadow-2xs transition cursor-pointer"
            >
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Powered by
              </span>
              <div className="flex items-center gap-1.5">
                <AiBrandIcon provider={activeModel?.provider || 'gemini'} className="h-4 w-4 shrink-0" />
                <span className="text-xs font-bold text-slate-800">
                  {activeModel?.providerName} &bull; {activeModel?.modelName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-0.5" />
              </div>
            </button>

            {/* Custom Rounded Floating Dropdown */}
            {isModelDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white border border-slate-200/90 shadow-2xl p-1.5 z-50 ring-1 ring-purple-500/10 animate-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Active Reasoning Engine
                  </span>
                </div>
                <div className="space-y-1">
                  {displayModels.map((m) => {
                    const isSelected = m.id === selectedModelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedModelId(m.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between p-2.5 rounded-xl text-left transition cursor-pointer',
                          isSelected
                            ? 'bg-purple-50 text-purple-950 font-bold border border-purple-200/80 shadow-2xs'
                            : 'hover:bg-slate-50 text-slate-700'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AiBrandIcon provider={m.provider} className="h-4 w-4 shrink-0" />
                          <div className="min-w-0">
                            <span className="block text-xs font-bold truncate">
                              {m.providerName}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono truncate">
                              {m.modelName}
                            </span>
                          </div>
                        </div>

                        {isSelected && <Check className="h-4 w-4 text-purple-600 shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* New Chat Button */}
          <button
            type="button"
            onClick={handleStartNewChat}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
            title="Start a fresh conversation"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </button>

          {/* Voice / Video Call Button */}
          {!isLiveSessionActive ? (
            <button
              type="button"
              onClick={handleStartLiveSession}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
            >
              <Video className="h-3.5 w-3.5" />
              <span>Voice Call</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleMinimizeBackgroundChat?.()}
                className="flex items-center gap-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer"
                title="Hide/Minimize background chat to keep video call floating in bottom right"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Minimize Chat</span>
              </button>

              <button
                type="button"
                onClick={handleEndLiveSession}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span>End Call</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. PROFESSIONAL CONVERSATION FEED */}
      <div className="flex-1 flex flex-col bg-slate-50/20 overflow-hidden relative">
        {/* Full-width scroll container so vertical scrollbar is on extreme right */}
        <div className="flex-1 w-full overflow-y-auto [scrollbar-width:thin] scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className="max-w-3xl w-full mx-auto p-6 space-y-6">
          {messages.map((m) => {
            if (m.sender === 'system') {
              return (
                <div key={m.id} className="flex items-center justify-center my-4 animate-in fade-in">
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-purple-50/90 border border-purple-200/90 text-purple-800 text-xs font-bold shadow-xs backdrop-blur-md ring-2 ring-purple-400/20">
                    <ArrowRightLeft className="h-4 w-4 text-purple-600 shrink-0" />
                    <span>{m.text}</span>
                  </div>
                </div>
              );
            }

            const isUser = m.sender === 'user';
            const isEditing = editingMsgId === m.id;
            const senderName = isUser ? 'You' : (m.agentName || activeSpecialist.name);
            const avatarUrl = isUser ? undefined : (m.agentImageUrl || activeSpecialist.imageUrl);

            return (
              <div
                key={m.id}
                className={cn(
                  'flex gap-3.5 animate-in fade-in duration-150 group',
                  isUser ? 'justify-end' : 'justify-start'
                )}
              >
                {/* Agent Avatar on left */}
                {!isUser && (
                  <img
                    src={avatarUrl}
                    alt={senderName}
                    className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5 border border-purple-200 shadow-2xs"
                  />
                )}

                <div className={cn('flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start', 'max-w-[85%]')}>
                  {/* Sender Name & Timestamp Header */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
                    <span className="font-bold text-slate-700">{senderName}</span>
                    <span>&bull;</span>
                    <span>{m.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={cn(
                      'rounded-2xl p-4 text-[13px] leading-relaxed font-sans shadow-2xs',
                      isUser
                        ? 'bg-purple-600 text-white rounded-tr-xs font-medium'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-xs'
                    )}
                  >
                    {/* Attached file preview */}
                    {m.attachment && (
                      <div className="mb-2.5 rounded-xl bg-purple-50 p-2 flex items-center gap-2 border border-purple-100">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <span className="font-bold text-xs text-purple-900 truncate">{m.attachment.name}</span>
                      </div>
                    )}

                    {/* Inline Message Edit Box */}
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full rounded-xl bg-purple-700/80 border border-purple-400/60 p-2.5 text-xs text-white placeholder-purple-200 focus:outline-hidden"
                          rows={2}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMsgId(null);
                              setEditingText('');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-800 hover:bg-purple-900 text-purple-200 transition cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditedMessage(m.id)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white text-purple-700 hover:bg-purple-50 transition shadow-xs cursor-pointer"
                          >
                            Save &amp; Submit
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Text content formatted */
                      <div className="leading-relaxed space-y-1">
                        {renderMarkdownText(m.text)}
                      </div>
                    )}

                    {/* Tool Call Notification Pill */}
                    {m.toolCall && (
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-mono font-bold">
                          <Check className="h-3.5 w-3.5" />
                          <span>{m.toolCall.name}</span>
                          <span className="text-slate-400 font-normal">&bull; {m.toolCall.status}</span>
                        </div>

                        {m.toolCall.path && (
                          <button
                            type="button"
                            onClick={() => navigate(m.toolCall!.path!)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:underline"
                          >
                            Open <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar Below Bubble */}
                  <div className="flex items-center gap-3 px-1 text-[11px] text-slate-400">
                    {/* USER ACTIONS: EDIT & REGENERATE */}
                    {isUser && !isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsgId(m.id);
                            setEditingText(m.text);
                          }}
                          className="hover:text-purple-600 transition cursor-pointer font-medium"
                        >
                          Edit
                        </button>
                        <span>&bull;</span>
                        <button
                          type="button"
                          onClick={() => handleRegenerateFromUserMsg(m.text)}
                          disabled={isGenerating}
                          className="hover:text-purple-600 transition cursor-pointer font-medium disabled:opacity-40"
                        >
                          Regenerate
                        </button>
                      </>
                    )}

                    {/* AGENT ACTIONS: LISTEN, COPY & LATENCY */}
                    {!isUser && (
                      <>
                        <button
                          type="button"
                          onClick={() => (isSpeaking ? stopBuddySpeech() : speakText(m.text))}
                          className="hover:text-purple-600 transition cursor-pointer font-medium flex items-center gap-1 text-slate-500"
                          title="Listen to this response out loud"
                        >
                          <Volume2 className="h-3 w-3 text-purple-600" />
                          <span>Listen</span>
                        </button>

                        <span>&bull;</span>

                        <button
                          type="button"
                          onClick={() => handleCopyText(m.text, m.id)}
                          className="hover:text-slate-700 transition cursor-pointer font-medium flex items-center gap-1"
                        >
                          {copiedMsgId === m.id ? (
                            <span className="text-emerald-600 font-bold">✓ Copied</span>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        {m.latencyMs !== undefined && m.latencyMs > 0 && (
                          <>
                            <span>&bull;</span>
                            <span className="text-slate-400 font-mono text-[10px]">{m.latencyMs}ms</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isGenerating && (
            <div className="flex items-center gap-3.5 animate-in fade-in duration-150">
              <img
                src={activeSpecialist.imageUrl}
                alt={activeSpecialist.name}
                className="h-8 w-8 rounded-full object-cover shrink-0 border border-slate-200"
              />
              <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-2xl rounded-tl-xs px-4 py-2.5 shadow-2xs">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" />
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {activeSpecialist.name.split(' ')[0]} is typing…
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 3. INPUT BAR */}
        <div className="p-4 border-t border-slate-200/90 bg-white">
          <div className="max-w-3xl mx-auto space-y-2">
            {attachedFile && (
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 rounded-xl text-xs font-bold text-purple-900 border border-purple-200">
                <FileText className="h-3.5 w-3.5 text-purple-600" />
                <span>{attachedFile.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="text-slate-400 hover:text-rose-600 transition ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 bg-slate-50/80 border border-slate-200 rounded-2xl p-1.5 focus-within:border-purple-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-500/10 transition shadow-2xs">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAttachedFile({ name: file.name, type: file.type });
                  }
                }}
                className="hidden"
              />

              {/* Suggestions Side Modal Button */}
              <button
                type="button"
                onClick={() => setIsSuggestionsOpen(!isSuggestionsOpen)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border',
                  isSuggestionsOpen
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:text-purple-700'
                )}
                title="Open Prompt Suggestions Modal"
              >
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden sm:inline">Suggestions</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-purple-600 transition rounded-xl hover:bg-slate-100 cursor-pointer"
                title="Attach SQL script, schema, or error log"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={`Message ${activeSpecialist.name.split(' ')[0]}…`}
                rows={1}
                className="flex-1 bg-transparent px-2 py-1 text-[13px] text-slate-900 placeholder-slate-400 focus:outline-hidden resize-none font-medium max-h-24"
              />

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!input.trim() && !attachedFile}
                className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:hover:bg-purple-600 text-white rounded-xl transition shadow-sm active:scale-95 cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. GLASSMORPHIC SUGGESTIONS SIDE MODAL */}
      {isSuggestionsOpen && (
        <div className="absolute inset-y-0 right-0 z-40 w-full sm:w-96 bg-white/95 backdrop-blur-xl border-l border-slate-200/90 shadow-2xl p-6 flex flex-col justify-between animate-in slide-in-from-right duration-200">
          <div className="space-y-5 overflow-y-auto pr-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Suggestions</h3>
                  <p className="text-[11px] text-slate-500">Quick CRM workflow queries</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSuggestionsOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {PROMPT_SUGGESTIONS.map((cat, cIdx) => {
                const Icon = cat.icon;
                return (
                  <div key={cIdx} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                      <span className={cn('p-1 rounded-lg border flex items-center justify-center', cat.color)}>
                        <Icon className="h-3 w-3" />
                      </span>
                      <span>{cat.category}</span>
                    </div>

                    <div className="space-y-1.5">
                      {cat.prompts.map((p, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => handleSendMessage(p)}
                          className="w-full text-left p-2.5 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 text-xs font-medium text-slate-700 hover:text-purple-900 transition flex items-start gap-2 cursor-pointer shadow-2xs group"
                        >
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-purple-600 shrink-0 mt-0.5" />
                          <span className="leading-snug">{p}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-medium">Click any suggestion to message {activeSpecialist.name.split(' ')[0]}</p>
          </div>
        </div>
      )}
      </div>

      {/* =========================================================================
          5. ULTRA-CLEAN STREAMLINED FLOATING AI COPILOT DOCK
         ========================================================================= */}
      {isLiveSessionActive && (
        <div
          className={cn(
            'z-[999] pointer-events-auto transition-all duration-300 font-sans shadow-2xl animate-in zoom-in-95',
            'fixed bottom-6 right-6 w-84 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-950/95 backdrop-blur-2xl border border-white/15 p-3.5 ring-1 ring-purple-500/30 text-white space-y-2.5'
          )}
        >
          {/* Header Row: Agent Info & Minimal Controls */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={effectiveSpecialist.imageUrl}
                  alt={effectiveSpecialist.name}
                  className="h-7 w-7 rounded-full object-cover border border-purple-400/80 shadow-xs"
                />
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                  <span>{effectiveSpecialist.name}</span>
                  {isScreenSharing ? (
                    <span className="text-[9px] text-rose-300 font-bold bg-rose-500/20 px-1.5 py-0.2 rounded-full border border-rose-400/40 shrink-0">
                      Screen Sharing
                    </span>
                  ) : (
                    <span className="text-[9px] text-purple-300 font-medium truncate opacity-80">
                      {isSpeaking ? 'Speaking…' : isListeningUserVoice ? 'Listening…' : 'Live Copilot'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Control Icons in one tight clean cluster */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Language Selector Icon */}
              <div className="relative" ref={langDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  className={cn(
                    'p-1.5 rounded-lg text-xs transition border cursor-pointer',
                    callLanguage !== 'en-US'
                      ? 'bg-purple-600 text-white border-purple-400'
                      : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/10'
                  )}
                  title={`Language: ${activeLangMeta?.name || 'English'}`}
                >
                  <Globe className="h-3.5 w-3.5" />
                </button>

                {/* Popover Language Dropdown */}
                {isLangDropdownOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-56 z-60 rounded-xl bg-slate-900/98 backdrop-blur-xl border border-white/20 p-2 shadow-2xl space-y-1.5 max-h-56 overflow-y-auto [scrollbar-width:thin] ring-1 ring-purple-500/40 animate-in fade-in zoom-in-95">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-1.5 py-0.5">
                      Select Spoken Language
                    </div>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          handleSwitchCallLanguage(lang.code);
                          setIsLangDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1 rounded-lg text-left text-[11px] font-medium transition cursor-pointer',
                          callLanguage === lang.code
                            ? 'bg-purple-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span>{lang.flag}</span>
                          <span className="truncate">{lang.name}</span>
                        </span>
                        {callLanguage === lang.code && <Check className="h-3 w-3 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Screen Share Toggle */}
              <button
                type="button"
                onClick={handleToggleScreenShare}
                className={cn(
                  'p-1.5 rounded-lg text-xs transition border cursor-pointer',
                  isScreenSharing
                    ? 'bg-rose-500/30 text-rose-300 border-rose-500/40 shadow-xs'
                    : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/10'
                )}
                title={isScreenSharing ? 'Stop Screen Sharing' : 'Share My Screen (AI Copilot Guidance)'}
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>

              {/* Full Chat Toggle */}
              <button
                type="button"
                onClick={() => onToggleMinimizeBackgroundChat?.()}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 border border-white/10 transition cursor-pointer"
                title={isBackgroundChatMinimized ? 'Open Full Chat Workspace' : 'Minimize Background Chat'}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>

              {/* Mic Mute / Unmute */}
              <button
                type="button"
                onClick={() => setIsMicMuted(!isMicMuted)}
                className={cn(
                  'p-1.5 rounded-lg text-xs transition border cursor-pointer',
                  isMicMuted
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/10'
                )}
                title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMicMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={handleEndLiveSession}
                className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition shadow-xs cursor-pointer"
                title="End Call"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Screen Share Preview (Only shown when sharing screen) */}
          {isScreenSharing && (
            <div className="relative rounded-xl overflow-hidden border border-white/20 bg-black/60 shadow-inner h-28">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1.5 left-1.5 bg-rose-500/90 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-bold text-white flex items-center gap-1 shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                <span>Live Screen</span>
              </div>
            </div>
          )}

          {/* Sleek Voice Waveform & Status Bar (When not sharing screen) */}
          {!isScreenSharing && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    isSpeaking
                      ? 'bg-purple-400 animate-ping'
                      : isListeningUserVoice
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-slate-400'
                  )}
                />
                <span className="text-[11px] font-semibold text-slate-300">
                  {isSpeaking
                    ? `${effectiveSpecialist.name.split(' ')[0]} speaking`
                    : isListeningUserVoice
                    ? 'Listening…'
                    : isMicMuted
                    ? 'Mic Muted'
                    : 'Ready to assist'}
                </span>
              </div>

              {/* Animated soundwaves */}
              <div className="flex items-center gap-0.5">
                {audioWave.slice(0, 8).map((h, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-gradient-to-t from-purple-400 to-emerald-400 rounded-full transition-all duration-100"
                    style={{
                      height: isSpeaking ? `${Math.max(4, Math.min(14, h * 0.22))}px` : '4px',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Real-Time Subtitle / Captions (Clean, max 2 lines) */}
          {currentSpeech && (
            <div className="text-[11px] text-slate-200 leading-snug font-medium bg-purple-950/40 p-2 rounded-xl border border-purple-500/20 italic line-clamp-2">
              "{currentSpeech.replace(/###|\*\*|```/g, '')}"
            </div>
          )}

          {/* Quick Guidance Chips */}
          <div className="flex items-center gap-1">
            {[
              { label: '🧭 Guide Me', prompt: 'Where do I click to create a new multi-channel campaign?' },
              { label: '⚡ WhatsApp', prompt: 'How do I configure WhatsApp Cloud API in channel settings?' },
              { label: '📊 Trends', prompt: 'Analyze our customer trends and conversion benchmarks.' },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(chip.prompt)}
                className="flex-1 text-[9px] bg-white/5 hover:bg-purple-600/50 text-purple-200 hover:text-white font-medium py-1 px-1.5 rounded-lg border border-white/10 transition cursor-pointer text-center truncate"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Compact Input */}
          <div className="flex items-center gap-1 bg-white/10 border border-white/15 rounded-xl px-2 py-1 focus-within:border-purple-400 transition">
            <input
              type="text"
              value={callInput}
              onChange={(e) => setCallInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (callInput.trim()) {
                    handleSendMessage(callInput);
                  }
                }
              }}
              placeholder={`Ask ${effectiveSpecialist.name.split(' ')[0]} anything…`}
              className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-hidden font-medium py-0.5"
            />
            <button
              type="button"
              onClick={() => {
                if (callInput.trim()) {
                  handleSendMessage(callInput);
                }
              }}
              disabled={!callInput.trim()}
              className="p-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white rounded-lg transition cursor-pointer shrink-0"
              title="Send to live agent"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function renderMarkdownText(text: string) {
  if (!text) return null;

  // Split text by lines
  const lines = text.split('\n');

  return lines.map((line, idx) => {
    let content = line;

    // Check if line is a header
    if (content.startsWith('### ')) {
      return (
        <h3 key={idx} className="text-xs font-black text-slate-900 mt-2 mb-1.5 flex items-center gap-1.5">
          {parseInlineMarkdown(content.slice(4))}
        </h3>
      );
    }
    if (content.startsWith('## ')) {
      return (
        <h2 key={idx} className="text-sm font-black text-slate-950 mt-3 mb-2">
          {parseInlineMarkdown(content.slice(3))}
        </h2>
      );
    }
    if (content.startsWith('# ')) {
      return (
        <h1 key={idx} className="text-base font-black text-slate-950 mt-4 mb-2.5">
          {parseInlineMarkdown(content.slice(2))}
        </h1>
      );
    }

    // Check if line is a list item
    const isBullet = content.trim().startsWith('- ') || content.trim().startsWith('* ');
    if (isBullet) {
      const rawLine = content.trim().slice(2);
      return (
        <div key={idx} className="flex gap-2 ml-3.5 my-1 items-start">
          <span className="text-purple-600 select-none font-black mt-0.5">•</span>
          <span className="text-[13px] text-slate-700">{parseInlineMarkdown(rawLine)}</span>
        </div>
      );
    }

    // Standard paragraph line
    return (
      <p key={idx} className="min-h-[1.25rem] text-[13px] text-slate-700 leading-relaxed my-0.5">
        {parseInlineMarkdown(content)}
      </p>
    );
  });
}

function parseInlineMarkdown(text: string) {
  const parts = [];
  let currentIdx = 0;

  const regex = /(\*\*|`)(.*?)\1/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;
    const marker = match[1];
    const innerContent = match[2];

    if (matchStart > currentIdx) {
      parts.push(text.slice(currentIdx, matchStart));
    }

    if (marker === '**') {
      parts.push(
        <strong key={matchStart} className="font-extrabold text-slate-950">
          {innerContent}
        </strong>
      );
    } else if (marker === '`') {
      parts.push(
        <code key={matchStart} className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-100">
          {innerContent}
        </code>
      );
    }

    currentIdx = matchEnd;
  }

  if (currentIdx < text.length) {
    parts.push(text.slice(currentIdx));
  }

  return parts.length > 0 ? parts : text;
}
