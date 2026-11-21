import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Brain,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  PhoneCall,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
  Radio,
  Sliders,
  AlertTriangle,
  Video,
  ExternalLink,
  RefreshCw,
  UserPlus,
  Edit3,
  Plus,
  X,
  Users,
  XCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAiModelsConfig,
  saveAiModelsConfig,
  fetchVoiceAgentsConfig,
  fetchBuddyAgentsConfig,
  saveBuddyAgentsConfig,
  fetchVoiceAvatarAdapters,
  saveVoiceAvatarAdapters,
  fetchCustomVoiceConfigs,
  saveCustomVoiceConfigs,
  testVoiceAvatarConnection,
  runAiModelTestPrompt,
  type AiModelConfig,
  type BuddyCustomAgentConfig,
  type VoiceAvatarAiAdapter,
  type CustomVoiceConfig,
} from '@/lib/ai-engine-config';
import { AiBrandIcon, VoicePlatformIcon } from '@/components/ai/AiBrandLogos';
import { getSavedAiApiKey } from '@/lib/ai-crm-context';
import {
  getAvailableBuddyVoices,
  playBuddySpeech,
  stopBuddySpeech,
  previewVoiceById,
  testElevenLabsVoice,
  ELEVENLABS_OFFICIAL_VOICES,
} from '@/lib/ai-voice-engine';
import { cn } from '@/lib/utils';

export function AiEngineSettingsPage() {
  const { tenantId, environment } = useAuth();

  const [activeTab, setActiveTab] = useState<'models' | 'voice_avatar' | 'voice_agents' | 'buddy_agents' | 'sandbox'>('models');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [modelFormData, setModelFormData] = useState<Partial<AiModelConfig>>({
    provider: 'openai',
    providerName: 'OpenAI',
    modelName: '',
    apiKey: '',
    baseUrl: '',
    isDefault: false,
    temperature: 0.7,
    maxTokens: 2048,
    enabledFeatures: {
      decisionEngine: true,
      copywriting: true,
      rfmAnalysis: true,
      voiceAgents: false,
      autonomousTasks: true,
    },
  });
  const [editingModel, setEditingModel] = useState<AiModelConfig | null>(null);
  const [modelTestStatus, setModelTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [modelTestError, setModelTestError] = useState<string | null>(null);
  const [testedLatency, setTestedLatency] = useState<number>(0);
  const [showModalKey, setShowModalKey] = useState(false);
  const [isBuddyModalOpen, setIsBuddyModalOpen] = useState(false);
  const [editingBuddyAgent, setEditingBuddyAgent] = useState<BuddyCustomAgentConfig | null>(null);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [buddyFormData, setBuddyFormData] = useState<Partial<BuddyCustomAgentConfig>>({
    name: '',
    indicName: '',
    role: '',
    gender: 'female',
    voiceLabel: 'Aanya / Pooja — Indian English & Hindi (Warm & Professional)',
    voiceAdapterId: 'voice_hi_female_neural',
    voiceProvider: 'browser',
    status: 'online',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop',
    greeting: '',
    contextScope: '',
    isSystem: false,
  });
  const [testingAdapterId, setTestingAdapterId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs: number; message: string }>>({});
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Custom Voice Configurations state & modal
  const [isCustomVoiceModalOpen, setIsCustomVoiceModalOpen] = useState(false);
  const [, setEditingCustomVoice] = useState<CustomVoiceConfig | null>(null);
  const [customVoiceFormData, setCustomVoiceFormData] = useState<Partial<CustomVoiceConfig>>({
    name: '',
    voiceId: '',
    gender: 'female',
    language: 'Hindi & English (Multilingual)',
    accent: 'Indian / Multilingual',
    model: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.85,
    style: 0.0,
    speakerBoost: true,
    description: '',
  });
  const [customVoiceTestText, setCustomVoiceTestText] = useState('Hello! I am your configured ElevenLabs voice assistant. Testing audio connection.');
  const [customVoiceTestStatus, setCustomVoiceTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [customVoiceTestLatency, setCustomVoiceTestLatency] = useState(0);
  const [customVoiceTestError, setCustomVoiceTestError] = useState<string | null>(null);
  const [isPlayingCustomVoiceTest, setIsPlayingCustomVoiceTest] = useState(false);

  // Buddy Agent Voice Engine Selection & Sample
  const [buddyVoiceProvider, setBuddyVoiceProvider] = useState<'gemini' | 'elevenlabs' | 'browser'>('gemini');
  const [buddyVoiceSampleText, setBuddyVoiceSampleText] = useState('Hello! I am your AI Specialist. How can I help you optimize your workflows today?');

  const [dirtyCustomVoices, setDirtyCustomVoices] = useState<Record<string, boolean>>({});
  const [dirtyElevenLabsAdapter, setDirtyElevenLabsAdapter] = useState(false);

  // Inline card test state (per model ID)
  const [testingCardId, setTestingCardId] = useState<string | null>(null);
  const [cardTestResults, setCardTestResults] = useState<Record<string, { success: boolean; latencyMs: number; error?: string }>>({});
  const [expandedKeyCardId, setExpandedKeyCardId] = useState<string | null>(null);
  const [inlineKeyDraft, setInlineKeyDraft] = useState<Record<string, string>>({});

  // Prompt Sandbox state
  const [testModelId, setTestModelId] = useState('ai_openai');
  const [testPrompt, setTestPrompt] = useState('Analyze user cart value of ₹3,400 with high RFM score and recommend the optimal discount incentive.');
  const [testResult, setTestResult] = useState<{ text: string; latencyMs: number; tokens: number } | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Stop any playing voice preview immediately on unmount or tab switch
  useEffect(() => {
    return () => {
      stopBuddySpeech();
    };
  }, [activeTab]);

  const { data: models = [], refetch: refetchModels } = useQuery({
    queryKey: ['ai-models-config', tenantId, environment],
    queryFn: () => fetchAiModelsConfig(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: voiceAvatarAdapters = [], refetch: refetchVoiceAvatars } = useQuery({
    queryKey: ['voice-avatar-adapters-config', tenantId, environment],
    queryFn: () => fetchVoiceAvatarAdapters(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: voiceAgents = [], refetch: refetchVoice } = useQuery({
    queryKey: ['voice-agents-config', tenantId, environment],
    queryFn: () => fetchVoiceAgentsConfig(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: buddyAgents = [], refetch: refetchBuddyAgents } = useQuery({
    queryKey: ['buddy-agents-config', tenantId, environment],
    queryFn: () => fetchBuddyAgentsConfig(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const { data: customVoiceConfigs = [], refetch: refetchCustomVoices } = useQuery({
    queryKey: ['custom-voice-configs', tenantId, environment],
    queryFn: () => fetchCustomVoiceConfigs(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  // ONLY show configured and setup voices in Buddy Agent selection

  const saveModelsMutation = useMutation({
    mutationFn: (updated: AiModelConfig[]) => saveAiModelsConfig(tenantId, environment, updated),
    onSuccess: () => {
      showToast('Saved AI Provider settings');
      refetchModels();
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Could not save AI Provider settings');
      refetchModels();
    },
  });

  const saveVoiceAvatarsMutation = useMutation({
    mutationFn: (updated: VoiceAvatarAiAdapter[]) => saveVoiceAvatarAdapters(tenantId, environment, updated),
    onSuccess: () => {
      showToast('Saved ElevenLabs Studio settings');
      refetchVoiceAvatars();
    },
  });

  const saveCustomVoicesMutation = useMutation({
    mutationFn: (updated: CustomVoiceConfig[]) => saveCustomVoiceConfigs(tenantId, environment, updated),
    onSuccess: () => {
      showToast('Saved Custom Voice Configurations');
      refetchCustomVoices();
    },
  });


  const saveBuddyMutation = useMutation({
    mutationFn: (updated: BuddyCustomAgentConfig[]) => saveBuddyAgentsConfig(tenantId, environment, updated),
    onSuccess: () => {
      showToast('Saved AI Buddy Agents configuration');
      refetchBuddyAgents();
    },
  });

  const handleOpenCreateBuddyAgent = () => {
    stopBuddySpeech();
    setIsPreviewingVoice(false);
    setEditingBuddyAgent(null);
    setBuddyVoiceProvider('gemini');
    setBuddyVoiceSampleText('Hi there! I am ready to assist you with your customer campaigns and data workflows.');
    setBuddyFormData({
      name: '',
      indicName: '',
      role: '',
      gender: 'female',
      voiceLabel: 'Gemini Aoede — Warm & Expressive Studio Female',
      voiceAdapterId: 'gemini_aoede',
      voiceId: 'Aoede',
      voiceProvider: 'gemini',
      status: 'online',
      imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop',
      greeting: "Hi there! I'm ready to assist you with your customer campaigns and data workflows.",
      contextScope: "Specializes in customer engagement campaigns, retention workflows, and analytics.",
      isSystem: false,
    });
    setIsBuddyModalOpen(true);
  };

  const handleOpenEditBuddyAgent = (agent: BuddyCustomAgentConfig) => {
    stopBuddySpeech();
    setIsPreviewingVoice(false);
    setEditingBuddyAgent(agent);
    const prov =
      agent.voiceProvider === 'elevenlabs' || (agent.voiceAdapterId && agent.voiceAdapterId.includes('eleven'))
        ? 'elevenlabs'
        : agent.voiceProvider === 'browser' || (agent.voiceAdapterId && agent.voiceAdapterId.startsWith('neural_'))
        ? 'browser'
        : 'gemini';
    setBuddyVoiceProvider(prov);
    setBuddyVoiceSampleText(agent.greeting || `Hello! I am ${agent.name}. How can I assist you today?`);
    setBuddyFormData({ ...agent, voiceProvider: prov });
    setIsBuddyModalOpen(true);
  };

  const handlePreviewVoice = async () => {
    if (isPreviewingVoice) {
      stopBuddySpeech();
      setIsPreviewingVoice(false);
      return;
    }
    setIsPreviewingVoice(true);
    const sampleText =
      buddyVoiceSampleText ||
      buddyFormData.greeting ||
      `Hello! I am ${buddyFormData.name || 'your AI Specialist'}. I am fully configured with this voice profile.`;

    await playBuddySpeech(
      sampleText,
      buddyFormData,
      voiceAvatarAdapters,
      voiceAgents,
      () => setIsPreviewingVoice(false),
      () => setIsPreviewingVoice(false)
    );
  };

  const handleSaveBuddyAgent = () => {
    stopBuddySpeech();
    setIsPreviewingVoice(false);
    if (!buddyFormData.name?.trim() || !buddyFormData.role?.trim()) {
      showToast('Please enter both Agent Name and Role.');
      return;
    }

    let updatedList: BuddyCustomAgentConfig[];
    if (editingBuddyAgent) {
      updatedList = buddyAgents.map((a) =>
        a.id === editingBuddyAgent.id ? ({ ...a, ...buddyFormData } as BuddyCustomAgentConfig) : a
      );
    } else {
      const newAgent: BuddyCustomAgentConfig = {
        id: `agent_custom_${Date.now()}`,
        name: buddyFormData.name!.trim(),
        indicName: buddyFormData.indicName?.trim() || '',
        role: buddyFormData.role!.trim(),
        gender: buddyFormData.gender || 'female',
        voiceLabel: buddyFormData.voiceLabel || 'Indian Female Voice',
        voiceAdapterId: buddyFormData.voiceAdapterId || 'voice_hi_female_neural',
        voiceId: buddyFormData.voiceId,
        voiceProvider: buddyFormData.voiceProvider || 'browser',
        status: buddyFormData.status || 'online',
        imageUrl: buddyFormData.imageUrl?.trim() || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop',
        greeting: buddyFormData.greeting?.trim() || `Hi! I am ${buddyFormData.name!.trim()}, your specialized assistant.`,
        contextScope: buddyFormData.contextScope?.trim() || 'Specialized CRM assistant.',
        isSystem: false,
        createdAt: new Date().toISOString(),
      };
      updatedList = [...buddyAgents, newAgent];
    }

    saveBuddyMutation.mutate(updatedList);
    setIsBuddyModalOpen(false);
  };

  const handleDeleteBuddyAgent = (agentId: string) => {
    const agentToDelete = buddyAgents.find((a) => a.id === agentId);
    if (agentToDelete?.isSystem) {
      showToast('System created Buddy Agents cannot be deleted.');
      return;
    }
    const updated = buddyAgents.filter((a) => a.id !== agentId);
    saveBuddyMutation.mutate(updated);
    showToast('Removed custom Buddy Agent.');
  };

  const handleToggleKeyVisibility = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUpdateApiKey = (modelId: string, apiKey: string) => {
    const isConfigured = apiKey.trim().length > 0;
    const updated = models.map((m) =>
      m.id === modelId
        ? {
            ...m,
            apiKey: apiKey.trim(),
            status: isConfigured ? ('unverified' as const) : ('unconfigured' as const),
            latencyMs: 0,
          }
        : m
    );
    saveModelsMutation.mutate(updated);
  };


  const handleOpenCreateModel = () => {
    setEditingModel(null);
    setModelTestStatus('idle');
    setModelTestError(null);
    setTestedLatency(0);
    setShowModalKey(false);
    setModelFormData({
      provider: 'openai',
      providerName: 'OpenAI',
      modelName: '',
      apiKey: '',
      baseUrl: '',
      isDefault: false,
      temperature: 0.7,
      maxTokens: 2048,
      enabledFeatures: {
        decisionEngine: true,
        copywriting: true,
        rfmAnalysis: true,
        voiceAgents: false,
        autonomousTasks: true,
      },
    });
    setIsModelModalOpen(true);
  };

  const handleOpenConfigureModel = (model: AiModelConfig) => {
    setEditingModel(model);
    setModelFormData({ ...model });
    setModelTestStatus(model.status === 'connected' ? 'success' : model.status === 'error' ? 'failed' : 'idle');
    setModelTestError(null);
    setTestedLatency(model.status === 'connected' ? model.latencyMs : 0);
    setShowModalKey(false);
    setIsModelModalOpen(true);
  };

  const handleSaveCustomModel = () => {
    if (!modelFormData.modelName?.trim() || !modelFormData.providerName?.trim()) {
      showToast('Please enter both Provider Name and Model Name.');
      return;
    }

    const providerCode = modelFormData.provider || 'gemini';
    const isKeyProvided = (modelFormData.apiKey || '').trim().length > 0;
    const computedStatus: AiModelConfig['status'] = !isKeyProvided
      ? 'unconfigured'
      : modelTestStatus === 'success'
      ? 'connected'
      : modelTestStatus === 'failed'
      ? 'error'
      : editingModel?.status === 'connected'
      ? 'connected'
      : editingModel?.status === 'error'
      ? 'error'
      : 'unverified';

    const computedLatency = computedStatus === 'connected' ? (testedLatency || editingModel?.latencyMs || 180) : 0;

    if (editingModel) {
      // Editing existing model configuration
      const updatedList = models.map((m) =>
        m.id === editingModel.id
          ? {
              ...m,
              provider: providerCode,
              providerName: modelFormData.providerName!.trim(),
              modelName: modelFormData.modelName!.trim(),
              apiKey: modelFormData.apiKey?.trim() || '',
              baseUrl: modelFormData.baseUrl?.trim() || undefined,
              isDefault: modelFormData.isDefault || m.isDefault,
              status: computedStatus,
              latencyMs: computedLatency,
              temperature: modelFormData.temperature || 0.7,
              maxTokens: modelFormData.maxTokens || 2048,
              enabledFeatures: modelFormData.enabledFeatures || m.enabledFeatures,
            }
          : m
      );

      let finalUpdate = updatedList;
      if (modelFormData.isDefault && !editingModel.isDefault) {
        finalUpdate = updatedList.map((m) => ({
          ...m,
          isDefault: m.id === editingModel.id,
        }));
      }

      saveModelsMutation.mutate(finalUpdate);
      showToast(`Updated config for ${modelFormData.modelName}`);
    } else {
      // Creating a new custom model configuration
      const newModel: AiModelConfig = {
        id: `ai_custom_${Date.now()}`,
        provider: providerCode,
        providerName: modelFormData.providerName!.trim(),
        modelName: modelFormData.modelName!.trim(),
        apiKey: modelFormData.apiKey?.trim() || '',
        baseUrl: modelFormData.baseUrl?.trim() || undefined,
        isDefault: modelFormData.isDefault || false,
        status: computedStatus,
        latencyMs: computedLatency,
        tokensUsedThisMonth: 0,
        temperature: modelFormData.temperature || 0.7,
        maxTokens: modelFormData.maxTokens || 2048,
        enabledFeatures: modelFormData.enabledFeatures || {
          decisionEngine: true,
          copywriting: true,
          rfmAnalysis: true,
          voiceAgents: false,
          autonomousTasks: true,
        },
        iconBg: providerCode === 'openai' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-800 border-slate-300',
        iconColor: providerCode === 'openai' ? '#10a37f' : '#0f172a',
      };

      let updatedList = [...models];
      if (newModel.isDefault) {
        updatedList = updatedList.map((m) => ({ ...m, isDefault: false }));
      }
      updatedList.push(newModel);

      saveModelsMutation.mutate(updatedList);
      showToast(`Added custom LLM Model ${newModel.modelName}`);
    }

    setIsModelModalOpen(false);
    setEditingModel(null);
  };

  const handleTestModalConnection = async () => {
    if (!modelFormData.apiKey?.trim()) {
      showToast('Please enter an API Key to test connection.');
      return;
    }
    setModelTestStatus('testing');
    setModelTestError(null);

    const prov = modelFormData.provider || 'gemini';
    const defaultModel =
      prov === 'gemini' ? 'gemini-2.0-flash' :
      prov === 'openai' ? 'gpt-4o' :
      prov === 'claude' ? 'claude-3-7-sonnet-20250219' :
      prov === 'grok' ? 'grok-2' :
      prov === 'deepseek' ? 'deepseek-v3' :
      'llama-3.3-70b-versatile';

    try {
      const res = await runAiModelTestPrompt(
        {
          id: modelFormData.id || 'ai_test',
          provider: prov,
          providerName: modelFormData.providerName || 'Google Gemini',
          modelName: modelFormData.modelName || defaultModel,
          apiKey: modelFormData.apiKey.trim(),
          baseUrl: modelFormData.baseUrl?.trim(),
          isDefault: false,
          status: 'connected',
          latencyMs: 0,
          tokensUsedThisMonth: 0,
          temperature: modelFormData.temperature || 0.7,
          maxTokens: modelFormData.maxTokens || 2048,
          enableReasoning: modelFormData.enableReasoning ?? true,
          enabledFeatures: modelFormData.enabledFeatures as any,
          iconBg: '',
          iconColor: '',
        },
        'Hello! Return connection confirmed in one sentence.'
      );
      if (res.text && !res.text.includes('⚠️')) {
        setModelTestStatus('success');
        setTestedLatency(res.latencyMs || 180);
        setModelTestError(null);
        showToast(`Connection verified (${res.latencyMs}ms)!`);
      } else {
        setModelTestStatus('failed');
        setTestedLatency(0);
        const cleanErr = res.text.replace(/⚠️/g, '').trim();
        setModelTestError(cleanErr);
        showToast(cleanErr.slice(0, 100));
      }
    } catch (e: any) {
      setModelTestStatus('failed');
      setTestedLatency(0);
      setModelTestError(e?.message || 'Handshake failed. Unable to reach provider endpoint.');
      showToast('Handshake failed.');
    }
  };

  const handleDeleteCustomModel = (modelId: string) => {
    const target = models.find((m) => m.id === modelId);
    if (target && ['ai_openai', 'ai_gemini', 'ai_claude', 'ai_grok', 'ai_deepseek', 'ai_groq', 'ai_jev'].includes(target.id)) {
      showToast('Core system reasoning engines cannot be deleted.');
      return;
    }
    const updated = models.filter((m) => m.id !== modelId);
    saveModelsMutation.mutate(updated);
    showToast('Removed custom model configuration.');
  };

  const handleSetDefaultModel = (modelId: string) => {
    const updated = models.map((m) => ({
      ...m,
      isDefault: m.id === modelId,
    }));
    saveModelsMutation.mutate(updated);
    showToast(`Set primary AI model to ${models.find((m) => m.id === modelId)?.modelName}`);
  };

  const handleDisconnectModel = (modelId: string) => {
    const updated = models.map((m) =>
      m.id === modelId
        ? { ...m, apiKey: '', status: 'unconfigured' as const, latencyMs: 0, tokensUsedThisMonth: 0 }
        : m
    );
    saveModelsMutation.mutate(updated);
    showToast(`Disconnected ${models.find((m) => m.id === modelId)?.providerName}`);
  };

  const handleUpdateAvatarField = (adapterId: string, field: keyof VoiceAvatarAiAdapter, value: any) => {
    setDirtyElevenLabsAdapter(true);
    const updated = voiceAvatarAdapters.map((a) =>
      a.id === adapterId ? { ...a, [field]: value } : a
    );
    saveVoiceAvatarsMutation.mutate(updated);
  };

  const handleSaveElevenLabsMaster = (_adapter: VoiceAvatarAiAdapter) => {
    saveVoiceAvatarsMutation.mutate(voiceAvatarAdapters);
    setDirtyElevenLabsAdapter(false);
    showToast('Saved ElevenLabs Studio configuration & active voice engine!');
  };

  const handleUpdateCustomVoiceCardField = (id: string, field: keyof CustomVoiceConfig, value: any) => {
    setDirtyCustomVoices((prev) => ({ ...prev, [id]: true }));
    const updated = customVoiceConfigs.map((c) =>
      c.id === id ? { ...c, [field]: value } : c
    );
    // Optimistically update locally
    saveCustomVoicesMutation.mutate(updated);
  };

  const handleSaveCustomVoiceCard = (voiceId: string) => {
    saveCustomVoicesMutation.mutate(customVoiceConfigs);
    setDirtyCustomVoices((prev) => ({ ...prev, [voiceId]: false }));
    showToast('Saved voice profile configuration!');
  };

  const handleDeleteCustomVoice = (id: string) => {
    const updated = customVoiceConfigs.filter((c) => c.id !== id);
    saveCustomVoicesMutation.mutate(updated);
    showToast('Removed custom voice profile.');
  };

  const handleOpenCreateCustomVoice = () => {
    stopBuddySpeech();
    setEditingCustomVoice(null);
    setCustomVoiceTestStatus('idle');
    setCustomVoiceTestError(null);
    setCustomVoiceTestLatency(0);
    setIsPlayingCustomVoiceTest(false);
    setCustomVoiceTestText('Hello! I am your configured ElevenLabs voice assistant. Testing audio connection.');
    setCustomVoiceFormData({
      name: '',
      voiceId: '',
      gender: 'female',
      language: 'Hindi & English (Multilingual)',
      accent: 'Indian / Multilingual',
      model: 'eleven_multilingual_v2',
      stability: 0.5,
      similarityBoost: 0.85,
      style: 0.0,
      speakerBoost: true,
      description: '',
    });
    setIsCustomVoiceModalOpen(true);
  };

  const handleTestCustomVoiceInModal = async () => {
    if (!customVoiceFormData.voiceId?.trim()) {
      showToast('Please select a preset voice or enter an ElevenLabs Voice ID first.');
      return;
    }

    const elevenAdapter = voiceAvatarAdapters.find((a) => a.provider === 'elevenlabs');
    const effectiveKey = elevenAdapter?.apiKey || '';

    if (!effectiveKey || !effectiveKey.trim()) {
      setCustomVoiceTestStatus('failed');
      setCustomVoiceTestError('ElevenLabs API Key not configured. Please paste your xi-api-key in the ElevenLabs card above and click Save.');
      showToast('Please configure your ElevenLabs API Key in the settings first.');
      return;
    }

    setCustomVoiceTestStatus('testing');
    setCustomVoiceTestError(null);
    setIsPlayingCustomVoiceTest(true);

    const result = await testElevenLabsVoice(
      effectiveKey,
      customVoiceFormData.voiceId.trim(),
      customVoiceTestText || 'Hello! Testing your configured ElevenLabs voice connection.',
      customVoiceFormData.stability ?? 0.5,
      customVoiceFormData.similarityBoost ?? 0.75,
      customVoiceFormData.model || 'eleven_multilingual_v2',
      () => {
        setIsPlayingCustomVoiceTest(false);
      },
      (_err) => {
        setIsPlayingCustomVoiceTest(false);
      }
    );

    if (result.success) {
      setCustomVoiceTestStatus('success');
      setCustomVoiceTestLatency(result.latencyMs);
      showToast(`Audio playing! (${result.latencyMs}ms latency)`);
    } else {
      setCustomVoiceTestStatus('failed');
      setCustomVoiceTestLatency(result.latencyMs);
      setCustomVoiceTestError(result.error || 'Failed to synthesize audio from ElevenLabs.');
      showToast('Voice test failed. Check API key and Voice ID.');
    }
  };

  const handleStopCustomVoiceInModal = () => {
    stopBuddySpeech();
    setIsPlayingCustomVoiceTest(false);
    showToast('Stopped audio playback.');
  };

  const handleSaveNewCustomVoiceModal = () => {
    if (!customVoiceFormData.name?.trim() || !customVoiceFormData.voiceId?.trim()) {
      showToast('Please enter both Voice Name and ElevenLabs Voice ID.');
      return;
    }

    const newVoice: CustomVoiceConfig = {
      id: `voice_custom_${Date.now()}`,
      name: customVoiceFormData.name.trim(),
      voiceId: customVoiceFormData.voiceId.trim(),
      gender: customVoiceFormData.gender || 'female',
      language: customVoiceFormData.language?.trim() || 'Hindi & English',
      accent: customVoiceFormData.accent?.trim() || 'Neutral',
      model: customVoiceFormData.model || 'eleven_multilingual_v2',
      stability: Number(customVoiceFormData.stability ?? 0.5),
      similarityBoost: Number(customVoiceFormData.similarityBoost ?? 0.85),
      style: Number(customVoiceFormData.style ?? 0.0),
      speakerBoost: Boolean(customVoiceFormData.speakerBoost ?? true),
      description: customVoiceFormData.description?.trim() || 'Custom ElevenLabs voice profile.',
      isSystem: false,
      createdAt: new Date().toISOString(),
    };

    const updated = [newVoice, ...customVoiceConfigs];
    saveCustomVoicesMutation.mutate(updated);
    setIsCustomVoiceModalOpen(false);
    showToast(`Added custom voice: ${newVoice.name}`);
  };

  const handleTestAvatarConnection = async (adapter: VoiceAvatarAiAdapter) => {
    setTestingAdapterId(adapter.id);
    try {
      const res = await testVoiceAvatarConnection(adapter);
      setTestResults((prev) => ({ ...prev, [adapter.id]: res }));
      if (res.success) {
        showToast(`Verified ${adapter.name} (${res.latencyMs}ms)`);
        const updated = voiceAvatarAdapters.map((a) =>
          a.id === adapter.id
            ? { ...a, status: 'connected' as const, latencyMs: res.latencyMs }
            : a
        );
        saveVoiceAvatarsMutation.mutate(updated);
      } else {
        showToast(res.message);
      }
    } catch {
      showToast('Connection test failed.');
    } finally {
      setTestingAdapterId(null);
    }
  };

  const handlePlayVoicePreview = async (
    id: string,
    voiceName: string,
    voiceId?: string,
    _provider?: string,
    gender?: 'female' | 'male',
    apiKey?: string
  ) => {
    if (playingVoiceId === id) {
      stopBuddySpeech();
      setPlayingVoiceId(null);
      return;
    }
    stopBuddySpeech();
    if (!voiceId) {
      showToast('This voice has no voice ID configured yet.');
      return;
    }
    setPlayingVoiceId(id);

    const elevenLabsAdapter = voiceAvatarAdapters.find((a) => a.provider === 'elevenlabs');
    const effectiveKey = apiKey || elevenLabsAdapter?.apiKey || '';

    if (!effectiveKey || !effectiveKey.trim()) {
      showToast('Please enter and click "Save Configuration" on the ElevenLabs card to hear live voices.');
      setPlayingVoiceId(null);
      return;
    }

    try {
      await previewVoiceById(
        voiceId,
        voiceName,
        gender,
        () => setPlayingVoiceId(null),
        voiceAvatarAdapters,
        undefined,
        effectiveKey
      );
    } catch (e: any) {
      setPlayingVoiceId(null);
      showToast(e?.message || 'Audio playback error.');
    }
  };


  const handleResetAllAiSettings = () => {
    try {
      localStorage.removeItem(`marbee_ai_models_config_v2_${tenantId}_${environment}`);
      localStorage.removeItem(`marbee_ai_models_config_v1_${tenantId}_${environment}`);
      localStorage.removeItem(`marbee_voice_avatar_adapters_v2_${tenantId}_${environment}`);
      localStorage.removeItem(`marbee_voice_agents_config_v2_${tenantId}_${environment}`);
      // NOTE: Custom Buddy Agents are preserved so user agents are never deleted when resetting models
    } catch {}
    refetchModels();
    refetchVoiceAvatars();
    refetchVoice();
    showToast('Reset AI model engines to default unconfigured state (Buddy Agents preserved)');
  };

  /** Inline per-card connection test — no modal required */
  const handleInlineCardTest = async (model: AiModelConfig) => {
    const keyToUse = (inlineKeyDraft[model.id] !== undefined ? inlineKeyDraft[model.id] : model.apiKey || '').trim();
    if (!keyToUse) {
      showToast('Enter an API key to test this connection.');
      setExpandedKeyCardId(model.id);
      return;
    }
    setTestingCardId(model.id);
    try {
      const res = await runAiModelTestPrompt(
        { ...model, apiKey: keyToUse },
        'Hello! Confirm connection in one sentence.'
      );
      const success = Boolean(res.text && !res.text.includes('⚠️'));
      setCardTestResults((prev) => ({
        ...prev,
        [model.id]: {
          success,
          latencyMs: res.latencyMs,
          error: success ? undefined : res.text.replace(/⚠️/g, '').trim().slice(0, 200),
        },
      }));
      if (success) {
        // Auto-save verified key and status
        const updated = models.map((m) =>
          m.id === model.id
            ? { ...m, apiKey: keyToUse, status: 'connected' as const, latencyMs: res.latencyMs }
            : m
        );
        saveModelsMutation.mutate(updated);
        setInlineKeyDraft((prev) => { const n = { ...prev }; delete n[model.id]; return n; });
        showToast(`✓ ${model.providerName} connected (${res.latencyMs}ms)`);
      } else {
        showToast(`✗ ${model.providerName} handshake failed`);
      }
    } catch (e: any) {
      setCardTestResults((prev) => ({
        ...prev,
        [model.id]: { success: false, latencyMs: 0, error: e?.message || 'Network error' },
      }));
      showToast('Connection test failed.');
    } finally {
      setTestingCardId(null);
    }
  };

  /** Save inline key draft to the model config */
  const handleSaveInlineKey = (modelId: string) => {
    const draft = inlineKeyDraft[modelId];
    if (draft === undefined) return;
    handleUpdateApiKey(modelId, draft);
    setInlineKeyDraft((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
    showToast('API key saved.');
  };

  const handleRunSandboxPrompt = async () => {
    const selectedModel = models.find((m) => m.id === testModelId) || models[0];
    if (!selectedModel) return;

    let effectiveModelToRun: AiModelConfig = { ...selectedModel };
    if (!effectiveModelToRun.apiKey || effectiveModelToRun.apiKey.trim().length === 0) {
      const matchingConfigured = models.find(
        (m) => m.provider === selectedModel.provider && m.apiKey && m.apiKey.trim().length > 0
      );
      if (matchingConfigured?.apiKey) {
        effectiveModelToRun.apiKey = matchingConfigured.apiKey;
      } else {
        const saved = getSavedAiApiKey();
        if (saved.apiKey && (saved.provider === selectedModel.provider || !selectedModel.apiKey)) {
          effectiveModelToRun.apiKey = saved.apiKey;
        }
      }
    }

    setIsRunningTest(true);
    try {
      const res = await runAiModelTestPrompt(effectiveModelToRun, testPrompt);
      setTestResult(res);
      if (res.text.includes('⚠️')) {
        showToast('AI Model returned a warning/error notice.');
      } else {
        showToast('AI Model responded with live model knowledge!');
      }
    } catch {
      showToast('Evaluation failed.');
    } finally {
      setIsRunningTest(false);
    }
  };

  const getPresetsForProvider = (provider: string): string[] => {
    switch (provider) {
      case 'gemini':
        return ['gemini-2.0-flash', 'gemini-2.0-pro-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
      case 'openai':
        return ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview', 'gpt-4-turbo'];
      case 'claude':
        return ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'];
      case 'grok':
        return ['grok-2', 'grok-beta'];
      case 'deepseek':
        return ['deepseek-v3', 'deepseek-reasoner'];
      case 'groq':
        return ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
      case 'openrouter':
        return ['openrouter/auto', 'openrouter/free', '~anthropic/claude-sonnet-latest', '~openai/gpt-sol-latest', 'google/gemini-2.0-flash-001'];
      case 'jev':
        return ['jev-latest', 'jev-1.13.0'];
      default:
        return ['custom-model-id'];
    }
  };


  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-2xl border border-purple-300/40 bg-slate-950/95 backdrop-blur-md px-5 py-3.5 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5 ring-1 ring-white/10">
          <CheckCircle2 className="h-4 w-4 text-purple-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Futuristic Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/80 bg-gradient-to-r from-slate-950 via-purple-950 to-indigo-950 p-6 sm:p-8 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300 backdrop-blur-md">
              <Zap className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
              <span>Multi-LLM &amp; Voice/Avatar Agent Platform</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>AI Engine &amp; Intelligence Hub</span>
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-purple-200/80 leading-relaxed">
              Connect foundation LLM models (OpenAI, Gemini, Claude, Grok, DeepSeek), deploy Voice &amp; Avatar AIs (Runway GWM-1, ElevenLabs, HeyGen, Tavus, D-ID), and configure custom AI Buddy Agents.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <Button
              onClick={handleResetAllAiSettings}
              variant="ghost"
              className="text-purple-300 hover:bg-white/10 font-bold text-xs h-9 px-3.5 rounded-xl border border-purple-400/30"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset All
            </Button>
            <Button
              onClick={() => setActiveTab('sandbox')}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg h-9 px-4 rounded-xl ring-1 ring-white/20"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Test in Sandbox
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200/90 pb-2 overflow-x-auto">
        {[
          { id: 'models', label: `LLM Reasoning Engines (${models.length})`, icon: Brain },
          { id: 'voice_avatar', label: `Voice & Avatar AI (${voiceAvatarAdapters.length})`, icon: Video },
          { id: 'voice_agents', label: `Outbound Call Agents (${voiceAgents.length})`, icon: PhoneCall },
          { id: 'buddy_agents', label: `Setup AI Buddy Agents (${buddyAgents.length})`, icon: Users },
          { id: 'sandbox', label: 'Live Model Sandbox', icon: Terminal },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shrink-0 ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          TAB 1: LLM REASONING ENGINES
         ========================================================================= */}
      {activeTab === 'models' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Header Card */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                  <Brain className="h-4 w-4" />
                </div>
                <h3 className="text-base font-black text-slate-900">LLM Reasoning Engines</h3>
              </div>
              <p className="text-xs text-slate-500 max-w-xl">
                Connect your API keys for OpenAI, Gemini, Claude, Grok, DeepSeek, and Groq. Use the inline <strong>Test Connection</strong> on each card to verify in one click — no page reload needed.
              </p>
              {/* Connection Health Summary */}
              {models.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status:</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {models.filter((m) => m.status === 'connected').length} Connected
                  </span>
                  {models.filter((m) => m.status === 'unverified' || (m.apiKey && m.status !== 'connected' && m.status !== 'error')).length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {models.filter((m) => m.status === 'unverified' || (m.apiKey && m.status !== 'connected' && m.status !== 'error')).length} Unverified
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    {models.filter((m) => !m.apiKey || m.status === 'unconfigured').length} Not Configured
                  </span>
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={handleOpenCreateModel}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add Custom Engine</span>
            </Button>
          </div>

          {/* Model Cards */}
          <div className="grid gap-3">
            {models.map((model) => {
              const isKeyPresent = Boolean(model.apiKey && model.apiKey.trim().length > 0);
              const isConnected = model.status === 'connected';
              const isFailed = model.status === 'error';
              const isUnverified = model.status === 'unverified' || (isKeyPresent && !isConnected && !isFailed);
              const isTestingThis = testingCardId === model.id;
              const cardResult = cardTestResults[model.id];
              const isKeyExpanded = expandedKeyCardId === model.id;
              const draftKey = inlineKeyDraft[model.id] ?? model.apiKey ?? '';
              const isSystemModel = ['ai_openai', 'ai_gemini', 'ai_claude', 'ai_grok', 'ai_deepseek', 'ai_groq', 'ai_jev'].includes(model.id);

              return (
                <div
                  key={model.id}
                  className={cn(
                    'rounded-2xl border bg-white transition-all duration-200',
                    isConnected
                      ? 'border-emerald-200 ring-1 ring-emerald-500/10 shadow-sm shadow-emerald-50'
                      : isFailed
                      ? 'border-rose-200 ring-1 ring-rose-500/10'
                      : isUnverified
                      ? 'border-amber-200 ring-1 ring-amber-400/10'
                      : 'border-slate-200/90 hover:border-slate-300'
                  )}
                >
                  {/* Card Main Row */}
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Left: Icon + Info */}
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white p-2 shadow-2xs">
                        <AiBrandIcon provider={model.provider} className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-sm text-slate-900">{model.providerName}</h4>
                          <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200 shrink-0">
                            {model.modelName}
                          </span>
                          {/* Status Badge */}
                          {isConnected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 border border-emerald-200 shrink-0">
                              <Check className="h-2.5 w-2.5" />
                              Connected · {model.latencyMs}ms
                            </span>
                          ) : isFailed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 border border-rose-200 shrink-0">
                              <XCircle className="h-2.5 w-2.5" />
                              Handshake Failed
                            </span>
                          ) : isUnverified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 shrink-0">
                              <AlertCircle className="h-2.5 w-2.5" />
                              Key Saved — Unverified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400 border border-slate-200 shrink-0">
                              ○ Not Configured
                            </span>
                          )}
                          {model.isDefault && isConnected && (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.2 text-[10px] font-black text-indigo-800 uppercase shrink-0">
                              ★ Primary
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                      {/* Quick Test Button */}
                      <button
                        type="button"
                        onClick={() => handleInlineCardTest(model)}
                        disabled={isTestingThis}
                        className={cn(
                          'h-8 px-3 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60',
                          isConnected
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-slate-900 hover:bg-slate-800 text-white border-transparent'
                        )}
                        title="Test connection handshake"
                      >
                        {isTestingThis ? (
                          <><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" /><span>Testing…</span></>
                        ) : (
                          <><Zap className="h-3 w-3" /><span>{isConnected ? 'Re-test' : 'Test'}</span></>
                        )}
                      </button>

                      {/* Key Input Toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedKeyCardId(isKeyExpanded ? null : model.id)}
                        className="h-8 px-3 text-xs font-bold rounded-xl border bg-white hover:bg-slate-50 border-slate-200 text-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                        title={isKeyPresent ? 'Edit API Key' : 'Enter API Key'}
                      >
                        <Key className="h-3 w-3" />
                        <span>{isKeyPresent ? 'Edit Key' : 'Enter Key'}</span>
                        {isKeyExpanded ? <ChevronRight className="h-3 w-3 rotate-90" /> : <ChevronRight className="h-3 w-3" />}
                      </button>

                      {/* Advanced Config */}
                      <button
                        type="button"
                        onClick={() => handleOpenConfigureModel(model)}
                        className="h-8 w-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
                        title="Advanced configuration"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                      </button>

                      {/* Sandbox shortcut */}
                      {isConnected && (
                        <button
                          type="button"
                          onClick={() => { setTestModelId(model.id); setActiveTab('sandbox'); }}
                          className="h-8 w-8 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-600 flex items-center justify-center transition cursor-pointer"
                          title="Open in Sandbox"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Make Default */}
                      {isKeyPresent && !model.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultModel(model.id)}
                          className="h-8 px-2.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer"
                        >
                          Set Primary
                        </button>
                      )}

                      {/* Disconnect */}
                      {isKeyPresent && (
                        <button
                          type="button"
                          onClick={() => handleDisconnectModel(model.id)}
                          className="h-8 px-2 text-[11px] font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                        >
                          Disconnect
                        </button>
                      )}

                      {/* Delete (custom only) */}
                      {!isSystemModel && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomModel(model.id)}
                          className="h-8 w-8 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer"
                          title="Delete custom engine"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Key Input Expander */}
                  {isKeyExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2 animate-in fade-in duration-150">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Key className="h-3 w-3" />
                        {model.providerName} API Key
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showKeys[model.id] ? 'text' : 'password'}
                            value={draftKey}
                            onChange={(e) => setInlineKeyDraft((prev) => ({ ...prev, [model.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleInlineCardTest(model);
                            }}
                            placeholder={`Paste your ${model.providerName} API key here…`}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-xs font-mono focus:bg-white focus:border-purple-400 focus:outline-none transition"
                          />
                          <button
                            type="button"
                            onClick={() => handleToggleKeyVisibility(model.id)}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showKeys[model.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveInlineKey(model.id)}
                          disabled={inlineKeyDraft[model.id] === undefined}
                          className="h-9 px-3 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer disabled:opacity-40 flex items-center gap-1.5 transition"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInlineCardTest(model)}
                          disabled={isTestingThis}
                          className="h-9 px-3 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition"
                        >
                          {isTestingThis ? (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                          Test
                        </button>
                      </div>

                      {/* Provider-specific API Console link */}
                      {(() => {
                        const portalMap: Record<string, { name: string; url: string }> = {
                          gemini: { name: 'Google AI Studio', url: 'https://aistudio.google.com/app/apikey' },
                          openai: { name: 'OpenAI Platform', url: 'https://platform.openai.com/api-keys' },
                          claude: { name: 'Anthropic Console', url: 'https://console.anthropic.com/settings/keys' },
                          grok: { name: 'xAI Console', url: 'https://console.x.ai' },
                          deepseek: { name: 'DeepSeek Platform', url: 'https://platform.deepseek.com/api_keys' },
                          groq: { name: 'GroqCloud Console', url: 'https://console.groq.com/keys' },
                          jev: { name: 'TypeSafe AI', url: 'https://jevtypesafeai.com' },
                        };
                        const portal = portalMap[model.provider];
                        if (!portal) return null;
                        return (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
                            Get your key from{' '}
                            <a href={portal.url} target="_blank" rel="noopener noreferrer" className="font-bold text-purple-600 hover:underline">
                              {portal.name}
                            </a>
                            {model.provider === 'claude' && (
                              <span className="text-amber-600"> · Requires CORS header for browser access</span>
                            )}
                            {model.provider === 'grok' && (
                              <span className="text-amber-600"> · May require a server proxy for CORS</span>
                            )}
                          </p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Inline Test Result Banner */}
                  {cardResult && (
                    <div
                      className={cn(
                        'mx-4 mb-4 p-3 rounded-xl text-xs font-medium flex items-start gap-2 animate-in fade-in duration-200 border',
                        cardResult.success
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      )}
                    >
                      {cardResult.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        {cardResult.success ? (
                          <span className="font-bold">Connection verified! Latency: {cardResult.latencyMs}ms</span>
                        ) : (
                          <>
                            <span className="font-bold block">Handshake failed</span>
                            {cardResult.error && (
                              <span className="text-[11px] font-mono text-rose-700 break-words whitespace-pre-wrap block mt-1">{cardResult.error}</span>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCardTestResults((prev) => { const n = { ...prev }; delete n[model.id]; return n; })}
                        className="shrink-0 text-current opacity-60 hover:opacity-100 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: ELEVENLABS AI VOICE STUDIO & CUSTOM CLONED VOICES
         ========================================================================= */}
      {activeTab === 'voice_avatar' && (() => {
        const elevenLabsAdapter = voiceAvatarAdapters.find((a) => a.provider === 'elevenlabs') || {
          id: 'elevenlabs_livekit',
          name: 'ElevenLabs Conversational AI',
          provider: 'elevenlabs' as const,
          category: 'voice_speech' as const,
          status: 'unconfigured' as const,
          apiKey: '',
          avatarId: 'agent_elevenlabs_crm',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          model: 'eleven_multilingual_v2',
          systemPrompt: 'You are an ultra-realistic conversational voice agent with LiveKit WebRTC audio streaming.',
          initialGreeting: 'Hello! I am your ElevenLabs voice intelligence assistant. How can I help you today?',
          latencyMs: 0,
          docsUrl: 'https://elevenlabs.io/docs/conversational-ai',
          integrationGuide: {
            overview: 'ElevenLabs studio voice models stream ultra-realistic human speech over low-latency APIs.',
            prerequisites: ['ElevenLabs Account with API Key from elevenlabs.io'],
            stepByStep: ['Copy your API Key from elevenlabs.io', 'Paste and click Save Configuration', 'Preview any Voice ID'],
            toolCallArchitecture: 'Audio Stream ➔ ElevenLabs Neural TTS ➔ Web Audio Output',
            sampleSdkCode: `// ElevenLabs API\nconst res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', { headers: { 'xi-api-key': ELEVEN_KEY } });`,
          },
        };

        const isConfigured = Boolean(elevenLabsAdapter.apiKey && elevenLabsAdapter.apiKey.trim().length > 0);
        const testResult = testResults[elevenLabsAdapter.id];
        const isTesting = testingAdapterId === elevenLabsAdapter.id;

        return (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold text-xs">
                    11
                  </span>
                  ElevenLabs AI Voice Studio &amp; Custom Cloned Voices
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure studio-grade ElevenLabs neural voice models, manage custom cloned voice IDs, and customize emotional cadence for your Buddy AI Specialists.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  onClick={handleOpenCreateCustomVoice}
                  className="h-9 px-4 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>+ Create Custom Voice Config</span>
                </Button>
              </div>
            </div>

            {/* ElevenLabs Master Engine Card */}
            <div
              className={cn(
                'rounded-3xl border bg-white p-6 shadow-2xs space-y-5 transition',
                isConfigured ? 'border-purple-300 ring-2 ring-purple-500/10' : 'border-slate-200/90'
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-purple-200 bg-purple-50 text-purple-700 shadow-2xs font-extrabold text-sm">
                    11Labs
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-slate-900">ElevenLabs Master Connection</h4>
                      <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                        PRIMARY VOICE ENGINE
                      </span>
                      {isConfigured ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Ready &amp; Verified ({elevenLabsAdapter.latencyMs > 0 ? `${elevenLabsAdapter.latencyMs}ms` : 'Active'})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                          ○ Needs API Key (Enter below and click Save)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Powers high-fidelity TTS streaming for live calls, Buddy voice previews, and outbound campaigns.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => handleSaveElevenLabsMaster(elevenLabsAdapter)}
                    className={cn(
                      'h-8 px-3.5 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer',
                      dirtyElevenLabsAdapter
                        ? 'bg-purple-600 hover:bg-purple-500 text-white animate-pulse ring-2 ring-purple-400'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    )}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    <span>{dirtyElevenLabsAdapter ? 'Save Configuration *' : 'Save Configuration'}</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleTestAvatarConnection(elevenLabsAdapter)}
                    disabled={isTesting || !isConfigured}
                    className="h-8 px-3 text-xs font-bold bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl"
                  >
                    {isTesting ? (
                      <>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Testing…
                      </>
                    ) : (
                      <>
                        <Radio className="mr-1.5 h-3.5 w-3.5 text-purple-600" />
                        Test Handshake
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      handlePlayVoicePreview(
                        elevenLabsAdapter.id,
                        'Rachel',
                        elevenLabsAdapter.voiceId || '21m00Tcm4TlvDq8ikWAM',
                        'elevenlabs',
                        'female',
                        elevenLabsAdapter.apiKey
                      )
                    }
                    className={cn(
                      'h-8 px-3 text-xs font-bold rounded-xl border transition',
                      playingVoiceId === elevenLabsAdapter.id
                        ? 'bg-purple-600 text-white border-purple-600 animate-pulse'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                    )}
                  >
                    {playingVoiceId === elevenLabsAdapter.id ? (
                      <>
                        <Radio className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        <span>Playing Studio Audio…</span>
                      </>
                    ) : (
                      <>
                        <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                        <span>Hear Voice Preview</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Feedback Banner */}
              {testResult && (
                <div
                  className={cn(
                    'p-3 rounded-2xl text-xs flex items-center justify-between border animate-in fade-in duration-200',
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-rose-600" />}
                    <span className="font-medium">{testResult.message}</span>
                  </div>
                  {testResult.latencyMs > 0 && (
                    <span className="font-mono font-bold text-[11px] bg-white/80 px-2 py-0.5 rounded-lg border border-current">
                      {testResult.latencyMs}ms Latency
                    </span>
                  )}
                </div>
              )}

              {/* Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                {/* API Key */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>ElevenLabs API Key (xi-api-key) *</span>
                    <button
                      type="button"
                      onClick={() => handleToggleKeyVisibility(elevenLabsAdapter.id)}
                      className="text-purple-600 hover:underline text-[10px] lowercase"
                    >
                      {showKeys[elevenLabsAdapter.id] ? 'hide' : 'show'}
                    </button>
                  </label>
                  <input
                    type={showKeys[elevenLabsAdapter.id] ? 'text' : 'password'}
                    value={elevenLabsAdapter.apiKey}
                    onChange={(e) => handleUpdateAvatarField(elevenLabsAdapter.id, 'apiKey', e.target.value)}
                    placeholder="e.g. sk_11labs_xxxxxxxxxxxx"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-mono focus:bg-white focus:border-purple-400 focus:outline-hidden"
                  />
                </div>

                {/* Synthesis Model */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Default Synthesis Model *
                  </label>
                  <select
                    value={elevenLabsAdapter.model || 'eleven_multilingual_v2'}
                    onChange={(e) => handleUpdateAvatarField(elevenLabsAdapter.id, 'model', e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs focus:bg-white focus:border-purple-400 focus:outline-hidden"
                  >
                    <option value="eleven_multilingual_v2">eleven_multilingual_v2 (Recommended: Hindi, English &amp; Global)</option>
                    <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (Low-latency streaming)</option>
                    <option value="eleven_flash_v2_5">eleven_flash_v2_5 (Ultra-fast real-time speech)</option>
                  </select>
                </div>

                {/* Default Voice ID */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Default Master Voice ID
                  </label>
                  <input
                    type="text"
                    value={elevenLabsAdapter.voiceId}
                    onChange={(e) => handleUpdateAvatarField(elevenLabsAdapter.id, 'voiceId', e.target.value)}
                    placeholder="e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-mono focus:bg-white focus:border-purple-400 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Custom Voice Configurations & Cloned Voices Section */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-200/90 pb-3">
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    Custom Voice Configurations &amp; Cloned Voices Library
                  </h4>
                  <p className="text-xs text-slate-500">
                    Custom tuned ElevenLabs voice profiles with personalized stability, similarity boost, and language accents.
                  </p>
                </div>

                <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
                  {customVoiceConfigs.length} Configured Voices
                </span>
              </div>

              {/* Grid of Custom Voices */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customVoiceConfigs.map((voice) => {
                  const isDirty = Boolean(dirtyCustomVoices[voice.id]);
                  const isPlaying = playingVoiceId === voice.id;

                  return (
                    <div
                      key={voice.id}
                      className={cn(
                        'rounded-3xl border bg-white p-5 shadow-2xs space-y-4 transition flex flex-col justify-between',
                        isDirty ? 'border-purple-400 ring-2 ring-purple-500/10' : 'border-slate-200/90 hover:border-slate-300'
                      )}
                    >
                      <div className="space-y-3.5">
                        {/* Voice Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-200 bg-purple-50 text-purple-700 font-bold text-xs shadow-2xs">
                              {voice.gender === 'female' ? '♀' : '♂'}
                            </div>
                            <div>
                              <h5 className="font-bold text-sm text-slate-900">{voice.name}</h5>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                                  {voice.voiceId}
                                </span>
                                <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                  {voice.language}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {!voice.isSystem && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomVoice(voice.id)}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Delete custom voice profile"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Editable Settings */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">Voice Profile Name</label>
                            <input
                              type="text"
                              value={voice.name}
                              onChange={(e) => handleUpdateCustomVoiceCardField(voice.id, 'name', e.target.value)}
                              className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 text-xs font-semibold focus:bg-white focus:border-purple-400 focus:outline-hidden"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">ElevenLabs Voice ID / Clone ID</label>
                            <input
                              type="text"
                              value={voice.voiceId}
                              onChange={(e) => handleUpdateCustomVoiceCardField(voice.id, 'voiceId', e.target.value)}
                              className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 text-xs font-mono focus:bg-white focus:border-purple-400 focus:outline-hidden"
                            />
                          </div>
                        </div>

                        {/* Sliders: Stability & Similarity */}
                        <div className="grid grid-cols-2 gap-3 pt-1 bg-slate-50/70 p-3 rounded-2xl border border-slate-200/60">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                              <span>Stability</span>
                              <span className="font-mono">{Math.round(voice.stability * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={voice.stability}
                              onChange={(e) => handleUpdateCustomVoiceCardField(voice.id, 'stability', parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                              <span>Similarity Boost</span>
                              <span className="font-mono">{Math.round(voice.similarityBoost * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={voice.similarityBoost}
                              onChange={(e) => handleUpdateCustomVoiceCardField(voice.id, 'similarityBoost', parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                          </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">Persona &amp; Voice Description</label>
                          <input
                            type="text"
                            value={voice.description || ''}
                            onChange={(e) => handleUpdateCustomVoiceCardField(voice.id, 'description', e.target.value)}
                            placeholder="Description of persona and accent..."
                            className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 text-[11px] focus:bg-white focus:border-purple-400 focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 mt-3">
                        <Button
                          size="sm"
                          onClick={() => handleSaveCustomVoiceCard(voice.id)}
                          className={cn(
                            'h-8 px-3 text-xs font-bold rounded-xl transition cursor-pointer',
                            isDirty
                              ? 'bg-purple-600 hover:bg-purple-700 text-white animate-pulse'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          )}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          <span>{isDirty ? 'Save Changes *' : 'Save Changes'}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            handlePlayVoicePreview(
                              voice.id,
                              voice.name,
                              voice.voiceId,
                              'elevenlabs',
                              voice.gender,
                              elevenLabsAdapter.apiKey
                            )
                          }
                          className={cn(
                            'h-8 px-3 text-xs font-bold rounded-xl border transition cursor-pointer',
                            isPlaying
                              ? 'bg-purple-600 text-white border-purple-600 animate-pulse'
                              : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                          )}
                        >
                          {isPlaying ? (
                            <>
                              <Radio className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              <span>Playing…</span>
                            </>
                          ) : (
                            <>
                              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                              <span>Hear Voice</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* =========================================================================
                REVAMPED ELEVENLABS CUSTOM VOICE CONFIG & LIVE TEST MODAL
               ========================================================================= */}
            {isCustomVoiceModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
                <div className="w-full max-w-xl rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95 font-sans max-h-[90vh] overflow-y-auto">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 shadow-2xs">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">Add &amp; Configure ElevenLabs Voice</h3>
                        <p className="text-[11px] text-slate-500">
                          Configure premade or cloned voice profiles, test connection, and verify multilingual speech.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        stopBuddySpeech();
                        setIsCustomVoiceModalOpen(false);
                      }}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 text-xs">
                    {/* Quick Preset Voice Template Picker */}
                    <div className="rounded-2xl bg-purple-50/50 p-3.5 border border-purple-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-purple-900 flex items-center gap-1.5">
                          <Radio className="h-3.5 w-3.5 text-purple-600" />
                          <span>Quick Template / Preset ElevenLabs Voice:</span>
                        </label>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                          Auto-Fills Details
                        </span>
                      </div>
                      <select
                        value={
                          Object.entries(ELEVENLABS_OFFICIAL_VOICES).find(
                            ([_, v]) => v.voiceId === customVoiceFormData.voiceId
                          )?.[0] || 'custom'
                        }
                        onChange={(e) => {
                          const key = e.target.value;
                          if (key !== 'custom') {
                            const preset = ELEVENLABS_OFFICIAL_VOICES[key];
                            if (preset) {
                              setCustomVoiceFormData((prev) => ({
                                ...prev,
                                name: `${preset.name} (${preset.accent} ${preset.gender === 'female' ? 'Female' : 'Male'})`,
                                voiceId: preset.voiceId,
                                gender: preset.gender,
                                language: `${preset.accent} & Multilingual (29+ Languages)`,
                                accent: preset.accent,
                                description: preset.description,
                                stability: 0.5,
                                similarityBoost: 0.75,
                              }));
                            }
                          } else {
                            setCustomVoiceFormData((prev) => ({
                              ...prev,
                              name: 'Custom Cloned Voice',
                              voiceId: '',
                              language: 'Hindi & English (Multilingual)',
                            }));
                          }
                        }}
                        className="h-9 w-full rounded-xl border border-purple-200 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-purple-500 focus:outline-hidden cursor-pointer"
                      >
                        <option value="custom">✍️ Custom Cloned Voice ID (Paste your Voice ID below)</option>
                        <optgroup label="👩 Official ElevenLabs Female Studio Voices">
                          <option value="rachel">Rachel — Calm &amp; Natural American (21m00Tcm4TlvDq8ikWAM)</option>
                          <option value="bella">Bella — Soft &amp; Expressive American (EXAVITQu4vr4xnSDxMaL)</option>
                          <option value="domi">Domi — Strong &amp; Confident American (AZnzlk1XvdvUeBnXmlld)</option>
                          <option value="elli">Elli — Young &amp; Emotional American (MF3mGyEYCl7XYWbV9V6O)</option>
                          <option value="emily">Emily — Calm &amp; Meditative American (LcfcDJNUP1GQjkzn1xUU)</option>
                          <option value="freya">Freya — Expressive &amp; Warm American (jsCqWAovK2LkecY7zXl4)</option>
                          <option value="jessica">Jessica — Playful &amp; Bright Young Female (cgSgspJ2msm6clMCkdW9)</option>
                          <option value="matilda">Matilda — Warm &amp; Friendly American (XrExE9yKIg1WjnnlVkGX)</option>
                        </optgroup>
                        <optgroup label="👨 Official ElevenLabs Male Studio Voices">
                          <option value="adam">Adam — Deep &amp; Conversational American (pNInz6obpgDQGcFmaJgB)</option>
                          <option value="antoni">Antoni — Balanced &amp; Well-Rounded American (ErXwobaYiN019PkySvjV)</option>
                          <option value="josh">Josh — Young, Dynamic &amp; Casual American (TxGEqnHWrfWFTfGW9XjX)</option>
                          <option value="arnold">Arnold — Crisp &amp; Authoritative American (VR6AewLTigWG4xSOukaG)</option>
                          <option value="sam">Sam — Energetic &amp; Upbeat American (yoZ06aMxZJJ28mfd3POQ)</option>
                          <option value="george">George — Warm &amp; Articulate British (JBFqnCBsd6RMkjVDRZzb)</option>
                          <option value="charlie">Charlie — Casual &amp; Down-to-Earth Australian (IKne3meq5aSn9XLyUdCD)</option>
                          <option value="callum">Callum — Intense &amp; Direct Transatlantic (N2lVS1w4EtoT3dr4eOWO)</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Display Name & Voice ID */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700">Voice Profile Display Name *</label>
                        <input
                          type="text"
                          value={customVoiceFormData.name || ''}
                          onChange={(e) => setCustomVoiceFormData((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Rachel — CRM Concierge"
                          className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-purple-500 focus:outline-hidden font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                          <span>ElevenLabs Voice ID *</span>
                          <span className="font-mono text-[10px] text-purple-600 font-semibold">20 chars</span>
                        </label>
                        <input
                          type="text"
                          value={customVoiceFormData.voiceId || ''}
                          onChange={(e) => setCustomVoiceFormData((prev) => ({ ...prev, voiceId: e.target.value }))}
                          placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                          className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono focus:border-purple-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    {/* Gender & Primary Language */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700">Gender *</label>
                        <select
                          value={customVoiceFormData.gender || 'female'}
                          onChange={(e) => setCustomVoiceFormData((prev) => ({ ...prev, gender: e.target.value as any }))}
                          className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-purple-500 focus:outline-hidden bg-white font-semibold"
                        >
                          <option value="female">👩 Female Voice Profile</option>
                          <option value="male">👨 Male Voice Profile</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700">Primary Language / Accent *</label>
                        <input
                          type="text"
                          value={customVoiceFormData.language || ''}
                          onChange={(e) => setCustomVoiceFormData((prev) => ({ ...prev, language: e.target.value }))}
                          placeholder="e.g. Hindi &amp; Indian English"
                          className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-purple-500 focus:outline-hidden font-medium"
                        />
                      </div>
                    </div>

                    {/* Supported Languages Interactive Badges */}
                    <div className="rounded-2xl bg-slate-50/80 p-3 border border-slate-200/70 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <span>🌐 Supported Languages:</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          Eleven Multilingual v2 (29+ Languages)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {[
                          { label: 'Hindi (हिन्दी)', val: 'Hindi & Indian English' },
                          { label: 'Indian English', val: 'Indian English (Hinglish)' },
                          { label: 'English (US)', val: 'English (US)' },
                          { label: 'English (UK)', val: 'English (UK)' },
                          { label: 'Marathi (मराठी)', val: 'Marathi & Hindi' },
                          { label: 'Bengali (বাংলা)', val: 'Bengali & English' },
                          { label: 'Tamil (தமிழ்)', val: 'Tamil & English' },
                          { label: 'Telugu (తెలుగు)', val: 'Telugu & English' },
                          { label: 'Spanish (Español)', val: 'Spanish (Multilingual)' },
                          { label: 'French (Français)', val: 'French (Multilingual)' },
                          { label: 'German (Deutsch)', val: 'German (Multilingual)' },
                          { label: 'Arabic (العربية)', val: 'Arabic (Multilingual)' },
                          { label: 'Japanese (日本語)', val: 'Japanese (Multilingual)' },
                        ].map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setCustomVoiceFormData((prev) => ({ ...prev, language: item.val }))}
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-lg border font-medium transition cursor-pointer',
                              customVoiceFormData.language?.includes(item.val.split(' ')[0])
                                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/50'
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stability & Similarity Sliders */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                          <span>Stability</span>
                          <span className="font-mono text-purple-700">{Math.round((customVoiceFormData.stability ?? 0.5) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={customVoiceFormData.stability ?? 0.5}
                          onChange={(e) => setCustomVoiceFormData((prev) => ({ ...prev, stability: parseFloat(e.target.value) }))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                          <span>Similarity Boost</span>
                          <span className="font-mono text-purple-700">{Math.round((customVoiceFormData.similarityBoost ?? 0.75) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={customVoiceFormData.similarityBoost ?? 0.75}
                          onChange={(e) => setCustomVoiceFormData((prev) => ({ ...prev, similarityBoost: parseFloat(e.target.value) }))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                      </div>
                    </div>

                    {/* =========================================================================
                        INTERACTIVE LIVE VOICE & CONNECTION TESTER
                       ========================================================================= */}
                    <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-purple-900 font-black text-xs">
                          <Radio className="h-4 w-4 text-purple-600 animate-pulse" />
                          <span>Interactive Live Voice &amp; Connection Tester</span>
                        </div>

                        {customVoiceTestLatency > 0 && (
                          <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">
                            {customVoiceTestLatency}ms Roundtrip
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          Sample Text to Voice Test:
                        </label>
                        <textarea
                          rows={2}
                          value={customVoiceTestText}
                          onChange={(e) => setCustomVoiceTestText(e.target.value)}
                          placeholder="Type any custom sentence in English, Hindi, or any language to test..."
                          className="w-full rounded-xl border border-purple-200/90 bg-white p-2.5 text-xs text-slate-800 focus:outline-hidden focus:border-purple-500 font-medium"
                        />
                      </div>

                      {/* Quick starter phrase chips */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400">Quick Test Phrases:</span>
                        {[
                          { label: 'English Greeting', text: 'Hello! I am your AI Specialist. How can I help you optimize your workflows today?' },
                          { label: 'Hindi Namaste', text: 'नमस्ते! मैं आपकी AI स्पेशलिस्ट हूँ। आपकी मार्केटिंग और कैंपेन में क्या सहायता करूँ?' },
                          { label: 'CRM Alert', text: 'Alert: Customer abandoned cart value of ₹4,500 detected in high engagement cohort.' },
                        ].map((ph, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setCustomVoiceTestText(ph.text)}
                            className="text-[10px] bg-white hover:bg-purple-100 text-purple-800 font-medium px-2 py-0.5 rounded-lg border border-purple-200 transition cursor-pointer"
                          >
                            {ph.label}
                          </button>
                        ))}
                      </div>

                      {/* Live Feedback Banner */}
                      {customVoiceTestStatus === 'testing' && (
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-100 text-purple-900 text-xs font-semibold animate-pulse">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-700 shrink-0" />
                          <span>Contacting ElevenLabs API &amp; synthesizing audio stream…</span>
                        </div>
                      )}

                      {customVoiceTestStatus === 'success' && (
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span className="font-bold">Connection Verified &amp; Audio Playing!</span>
                          </div>
                          <span className="font-mono text-[10px] font-bold bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                            {customVoiceTestLatency}ms Latency
                          </span>
                        </div>
                      )}

                      {customVoiceTestStatus === 'failed' && (
                        <div className="space-y-1 p-2.5 rounded-xl bg-rose-50 text-rose-800 text-xs border border-rose-200">
                          <div className="flex items-center gap-2 font-bold">
                            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                            <span>Voice Test Failed</span>
                          </div>
                          {customVoiceTestError && (
                            <p className="text-[11px] text-rose-700 font-mono pl-6 leading-relaxed">
                              {customVoiceTestError}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Test Connection Button */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          onClick={handleTestCustomVoiceInModal}
                          disabled={isPlayingCustomVoiceTest || !customVoiceFormData.voiceId}
                          className={cn(
                            'h-9 px-4 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm',
                            isPlayingCustomVoiceTest
                              ? 'bg-purple-700 text-white animate-pulse'
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          )}
                        >
                          {isPlayingCustomVoiceTest ? (
                            <>
                              <Radio className="h-3.5 w-3.5 animate-spin" />
                              <span>Playing Studio Audio…</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5 fill-current" />
                              <span>Test Connection &amp; Hear Voice</span>
                            </>
                          )}
                        </Button>

                        {isPlayingCustomVoiceTest && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleStopCustomVoiceInModal}
                            className="h-9 px-3 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-300"
                          >
                            ⏹️ Stop Audio
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-3.5">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        stopBuddySpeech();
                        setIsCustomVoiceModalOpen(false);
                      }}
                      className="h-9 px-4 text-xs font-bold rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveNewCustomVoiceModal}
                      className="h-9 px-5 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs cursor-pointer"
                    >
                      Save &amp; Add Voice Config
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* =========================================================================
          TAB 3: OUTBOUND CALL AGENTS
         ========================================================================= */}
      {activeTab === 'voice_agents' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="grid gap-4 md:grid-cols-2">
            {voiceAgents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4 hover:border-indigo-300 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2 shadow-2xs">
                        <VoicePlatformIcon platform={agent.platform} className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{agent.agentName}</h4>
                        <p className="text-[11px] text-slate-500 font-mono">{agent.platformName}</p>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                      agent.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {agent.status === 'active' ? '● Active Line' : '○ Standby'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Voice: <strong className="text-slate-900">{agent.voiceName}</strong> · Use Case: <strong className="text-purple-700">{agent.useCase.replace(/_/g, ' ')}</strong>
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      handlePlayVoicePreview(
                        agent.id,
                        agent.voiceName || agent.agentName,
                        agent.voiceId,
                        agent.platform,
                        String(agent.voiceName || '').toLowerCase().includes('male') ? 'male' : 'female',
                        (agent as any).apiKey
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition border cursor-pointer shrink-0',
                      playingVoiceId === agent.id
                        ? 'bg-purple-600 text-white border-purple-600 animate-pulse'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                    )}
                    title={`Hear ${agent.voiceName} voice profile`}
                  >
                    {playingVoiceId === agent.id ? (
                      <>
                        <Radio className="h-3.5 w-3.5 animate-spin" />
                        <span>Playing…</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Hear Voice</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3 space-y-1 text-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agent Persona Prompt:</p>
                  <p className="text-slate-700 font-mono text-[11px] line-clamp-2">{agent.systemPrompt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: SETUP AI BUDDY AGENTS
         ========================================================================= */}
      {activeTab === 'buddy_agents' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Header Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                  <Users className="h-4 w-4" />
                </div>
                <h3 className="text-base font-black text-slate-900">Setup AI Buddy Agents</h3>
              </div>
              <p className="text-xs text-slate-500 max-w-xl">
                Define the specialized role, contextual reasoning boundaries, answer expertise, and welcome greeting for each Buddy Specialist. Includes 4 System Personas and unlimited Custom Agents.
              </p>
            </div>

            <Button
              type="button"
              onClick={handleOpenCreateBuddyAgent}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Create Custom Buddy Agent</span>
            </Button>
          </div>

          {/* Agents Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {buddyAgents.map((agent) => {
              const isOnline = agent.status === 'online';
              return (
                <div
                  key={agent.id}
                  className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4 hover:border-purple-300 hover:shadow-sm transition flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className="relative shrink-0">
                          <img
                            src={agent.imageUrl}
                            alt={agent.name}
                            className={cn(
                              'h-12 w-12 rounded-2xl object-cover border shadow-xs',
                              isOnline ? 'border-purple-200' : 'border-slate-300 grayscale'
                            )}
                          />
                          {isOnline ? (
                            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
                          ) : (
                            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 ring-2 ring-white" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-sm text-slate-900">{agent.name}</h4>
                            {agent.indicName && (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-100/70 px-1.5 py-0.2 rounded-md">
                                {agent.indicName}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium">{agent.role}</p>
                          <p className="text-[10px] text-purple-700 font-medium">{agent.voiceLabel}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {agent.isSystem ? (
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-slate-500" />
                            System Agent
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-purple-600" />
                            Custom
                          </span>
                        )}

                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            isOnline
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          )}
                        >
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    {/* Context & Answers Definition */}
                    <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-100 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Role Scope &amp; Answers in Context:
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {agent.contextScope}
                      </p>
                    </div>

                    {/* Welcome Greeting */}
                    <div className="rounded-2xl bg-purple-50/40 p-3 border border-purple-100/60 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800/70 block">
                        Welcome Greeting:
                      </span>
                      <p className="text-xs text-slate-600 italic leading-relaxed">
                        "{agent.greeting}"
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleOpenEditBuddyAgent(agent)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 transition cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit Configuration</span>
                    </button>

                    {!agent.isSystem && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBuddyAgent(agent.id)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: LIVE MODEL SANDBOX
         ========================================================================= */}
      {activeTab === 'sandbox' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">LLM Prompt Evaluation Sandbox</h3>
                <p className="text-xs text-slate-500">
                  Test live natural language reasoning, database queries, and CRM workflow generation.
                </p>
              </div>

              {/* Status Badge */}
              {(() => {
                const currentM = models.find((m) => m.id === testModelId);
                const hasKey = Boolean(currentM?.apiKey && currentM.apiKey.trim().length > 0);
                return hasKey ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live {currentM?.providerName} API Key Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 border border-purple-200">
                    <Zap className="h-3.5 w-3.5 text-purple-600" />
                    Local CRM Intelligence &amp; Live Database Mode
                  </span>
                );
              })()}
            </div>

            {/* Model Selector & Inline API Key */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Selected Reasoning Engine</label>
                <select
                  value={testModelId}
                  onChange={(e) => setTestModelId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-purple-400"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.providerName} ({m.modelName}) {m.apiKey ? '✓ Configured' : '(No API Key)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Inline API Key Input */}
              {(() => {
                const currentM = models.find((m) => m.id === testModelId);
                if (!currentM) return null;
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">{currentM.providerName} API Key</label>
                      <button
                        type="button"
                        onClick={() => handleToggleKeyVisibility(currentM.id)}
                        className="text-[11px] font-bold text-purple-600 hover:underline"
                      >
                        {showKeys[currentM.id] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      type={showKeys[currentM.id] ? 'text' : 'password'}
                      value={currentM.apiKey}
                      onChange={(e) => handleUpdateApiKey(currentM.id, e.target.value)}
                      placeholder={`Paste ${currentM.providerName} API Key for live external inference`}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-mono focus:bg-white focus:border-purple-400 focus:outline-hidden"
                    />
                  </div>
                );
              })()}
            </div>

            {/* Prompt Payload */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Prompt Payload</label>
              <textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                rows={3}
                placeholder="Ask any CRM question, request a SQL query, check delivery templates count, or describe a journey..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs font-mono focus:outline-hidden focus:bg-white focus:border-purple-400"
              />
            </div>

            {/* Quick Test Prompt Starters */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Test Prompts:</span>
              {[
                'how many delivery templates we have now',
                'how many users in customer table, dont write query give me result',
                'write a query to select all table',
                'create an abandoned cart recovery journey workflow',
              ].map((qp, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTestPrompt(qp)}
                  className="rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-800 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition"
                >
                  "{qp}"
                </button>
              ))}
            </div>

            <Button
              onClick={handleRunSandboxPrompt}
              disabled={isRunningTest}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl h-10 px-5 shadow-sm"
            >
              {isRunningTest ? (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Running Inference…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-3.5 w-3.5" />
                  Execute Inference Test
                </>
              )}
            </Button>

            {testResult && (
              <div className="rounded-2xl bg-slate-950 p-5 font-mono text-xs text-emerald-400 space-y-2.5 border border-slate-800 shadow-lg animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2 text-[11px]">
                  <span className="flex items-center gap-1.5 text-purple-400 font-bold">
                    <Terminal className="h-3.5 w-3.5" />
                    Inference Output
                  </span>
                  <div className="flex items-center gap-3">
                    <span>Latency: <strong className="text-white">{testResult.latencyMs}ms</strong></span>
                    <span>Tokens: <strong className="text-white">{testResult.tokens}</strong></span>
                  </div>
                </div>
                <div className="whitespace-pre-line leading-relaxed text-slate-200 text-xs">
                  {testResult.text}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE / EDIT BUDDY AGENT
         ========================================================================= */}
      {isBuddyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingBuddyAgent ? 'Edit Buddy Agent' : 'Create Custom Buddy Agent'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Configure persona, context specialization, voice, and greetings</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBuddyModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              {/* Name & Indic Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Agent Name (English) *</label>
                  <input
                    type="text"
                    value={buddyFormData.name || ''}
                    onChange={(e) => setBuddyFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Anand Rao"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Indic / Regional Name</label>
                  <input
                    type="text"
                    value={buddyFormData.indicName || ''}
                    onChange={(e) => setBuddyFormData((prev) => ({ ...prev, indicName: e.target.value }))}
                    placeholder="e.g. आनंद राव"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Role / Specialization *</label>
                <input
                  type="text"
                  value={buddyFormData.role || ''}
                  onChange={(e) => setBuddyFormData((prev) => ({ ...prev, role: e.target.value }))}
                  placeholder="e.g. WhatsApp & Retention Strategist"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                />
              </div>

              {/* Voice Configuration & Engine Selector */}
              <div className="space-y-3 rounded-2xl bg-purple-50/40 p-4 border border-purple-100/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-purple-600 animate-pulse" />
                    <h4 className="text-xs font-black text-slate-900">Voice Engine &amp; Speech Profile Setup</h4>
                  </div>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                    Interactive Live Speech
                  </span>
                </div>

                {/* Dropdown 1: Select Voice Engine / Provider */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    1. Select Voice Engine / Provider *
                  </label>
                  <select
                    value={buddyVoiceProvider}
                    onChange={(e) => {
                      const prov = e.target.value as 'gemini' | 'elevenlabs' | 'browser';
                      setBuddyVoiceProvider(prov);
                      stopBuddySpeech();

                      // Automatically pick the first appropriate default voice for this provider
                      if (prov === 'gemini') {
                        setBuddyFormData((prev) => ({
                          ...prev,
                          voiceProvider: 'gemini',
                          voiceAdapterId: 'gemini_aoede',
                          voiceId: 'Aoede',
                          voiceLabel: 'Gemini Aoede — Warm & Expressive Studio Female',
                          gender: 'female',
                        }));
                      } else if (prov === 'elevenlabs') {
                        const firstEleven = customVoiceConfigs[0];
                        if (firstEleven) {
                          setBuddyFormData((prev) => ({
                            ...prev,
                            voiceProvider: 'elevenlabs',
                            voiceAdapterId: firstEleven.id,
                            voiceId: firstEleven.voiceId,
                            voiceLabel: `${firstEleven.name} (${firstEleven.language || 'ElevenLabs'})`,
                            gender: firstEleven.gender,
                          }));
                        } else {
                          setBuddyFormData((prev) => ({
                            ...prev,
                            voiceProvider: 'elevenlabs',
                            voiceAdapterId: 'eleven_rachel',
                            voiceId: '21m00Tcm4TlvDq8ikWAM',
                            voiceLabel: 'ElevenLabs — Rachel (American Female)',
                            gender: 'female',
                          }));
                        }
                      } else {
                        setBuddyFormData((prev) => ({
                          ...prev,
                          voiceProvider: 'browser',
                          voiceAdapterId: 'neural_us_female_1',
                          voiceId: 'Samantha',
                          voiceLabel: 'US English — Samantha (Female Neural)',
                          gender: 'female',
                        }));
                      }
                    }}
                    className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-purple-500 focus:outline-hidden cursor-pointer shadow-2xs"
                  >
                    <option value="gemini">🌟 Google Gemini &amp; Google Cloud Speech (Recommended with Gemini Key)</option>
                    <option value="elevenlabs">💎 ElevenLabs Configured Studio &amp; Custom Cloned Voices</option>
                    <option value="browser">🌐 Default Web Speech In-Browser Engine (Zero Key Required)</option>
                  </select>
                </div>

                {/* Dropdown 2: Dynamic Voice Profile based on Provider */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    2. Choose Voice Profile (
                    {buddyVoiceProvider === 'gemini'
                      ? 'Google Gemini Studio Voices'
                      : buddyVoiceProvider === 'elevenlabs'
                      ? 'ElevenLabs Configured & Library Voices'
                      : 'Web In-Browser Voices'}
                    ) *
                  </label>

                  <select
                    value={buddyFormData.voiceAdapterId || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      stopBuddySpeech();

                      // Match from available voices
                      const allVoices = getAvailableBuddyVoices(voiceAvatarAdapters, voiceAgents, customVoiceConfigs);
                      const matched = allVoices.find((v) => v.id === selectedId);

                      if (matched) {
                        setBuddyFormData((prev) => ({
                          ...prev,
                          voiceAdapterId: matched.id,
                          voiceLabel: matched.label,
                          voiceProvider: matched.provider,
                          voiceId: matched.voiceId,
                          gender: matched.gender,
                        }));
                      }
                    }}
                    className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-purple-500 focus:outline-hidden cursor-pointer shadow-2xs truncate"
                  >
                    {/* Female Voices for this Provider */}
                    <optgroup label="👩 Female Voice Profiles">
                      {getAvailableBuddyVoices(voiceAvatarAdapters, voiceAgents, customVoiceConfigs)
                        .filter((v) => v.provider === buddyVoiceProvider && v.gender === 'female')
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                    </optgroup>

                    {/* Male Voices for this Provider */}
                    <optgroup label="👨 Male Voice Profiles">
                      {getAvailableBuddyVoices(voiceAvatarAdapters, voiceAgents, customVoiceConfigs)
                        .filter((v) => v.provider === buddyVoiceProvider && v.gender === 'male')
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                {/* Sample Text & Interactive Hear Voice Preview */}
                <div className="rounded-xl bg-white p-3 border border-purple-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Sample Preview Phrase:
                    </label>
                    <button
                      type="button"
                      onClick={handlePreviewVoice}
                      className={cn(
                        'text-xs font-bold px-3 py-1 rounded-xl border flex items-center gap-1.5 transition cursor-pointer shadow-2xs',
                        isPreviewingVoice
                          ? 'bg-purple-600 text-white border-purple-600 animate-pulse'
                          : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                      )}
                      title="Listen to this voice profile"
                    >
                      {isPreviewingVoice ? (
                        <>
                          <Radio className="h-3.5 w-3.5 animate-spin" />
                          <span>Playing Voice…</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Hear Voice Preview</span>
                        </>
                      )}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={buddyVoiceSampleText}
                    onChange={(e) => setBuddyVoiceSampleText(e.target.value)}
                    placeholder="Type sample text to preview..."
                    className="w-full h-8 rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 text-xs text-slate-800 focus:bg-white focus:border-purple-400 focus:outline-hidden font-medium"
                  />

                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400">Quick Phrases:</span>
                    {[
                      { label: 'English Intro', text: `Hi! I am ${buddyFormData.name || 'your Specialist'}. How can I assist you today?` },
                      { label: 'Hindi Namaste', text: `नमस्ते! मैं ${buddyFormData.name || 'आपकी AI स्पेशलिस्ट'} हूँ। आपकी क्या सहायता करूँ?` },
                      { label: 'Campaign Tips', text: 'Analyzing your customer engagement metrics and conversion benchmarks.' },
                    ].map((ph, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setBuddyVoiceSampleText(ph.text)}
                        className="text-[10px] text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200 transition cursor-pointer font-medium"
                      >
                        {ph.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status & Avatar URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Status</label>
                  <select
                    value={buddyFormData.status || 'online'}
                    onChange={(e) => setBuddyFormData((prev) => ({ ...prev, status: e.target.value as 'online' | 'offline' }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden bg-white"
                  >
                    <option value="online">Online (Available for chat &amp; calls)</option>
                    <option value="offline">Offline (Maintenance window)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Avatar Image URL</label>
                  <input
                    type="text"
                    value={buddyFormData.imageUrl || ''}
                    onChange={(e) => setBuddyFormData((prev) => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Context Scope & Answers Definition */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">
                  Role in Context &amp; Knowledge Scope (What kind of answers they provide) *
                </label>
                <textarea
                  value={buddyFormData.contextScope || ''}
                  onChange={(e) => setBuddyFormData((prev) => ({ ...prev, contextScope: e.target.value }))}
                  rows={3}
                  placeholder="e.g. Specializes in WhatsApp Business API interactive templates, Web Push VAPID hygiene, rich cards, and abandoned cart win-back automations."
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden leading-relaxed"
                />
              </div>

              {/* Welcome Greeting */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Welcome Greeting Message *</label>
                <textarea
                  value={buddyFormData.greeting || ''}
                  onChange={(e) => setBuddyFormData((prev) => ({ ...prev, greeting: e.target.value }))}
                  rows={2}
                  placeholder="e.g. Hi there! I'm Anand. How can I help you optimize your messaging flows today?"
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden leading-relaxed"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBuddyModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBuddyAgent}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition cursor-pointer"
              >
                Save Buddy Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / CONFIGURE LLM MODEL MODAL */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="relative w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                  <Brain className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingModel ? `Configure ${editingModel.providerName}` : 'Add Custom LLM Model Engine'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {editingModel ? 'Update connection endpoints, keys, and model parameters.' : 'Configure credentials, URL routes, and parameter thresholds.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModelModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Provider Type *</label>
                  <select
                    disabled={!!editingModel && !editingModel.id.startsWith('ai_custom_')}
                    value={modelFormData.provider || 'gemini'}
                    onChange={(e) => {
                      const prov = e.target.value;
                      const mappedNames: Record<string, string> = {
                        gemini: 'Google Gemini AI',
                        openai: 'OpenAI Compatible',
                        claude: 'Anthropic Claude',
                        grok: 'xAI Grok',
                        deepseek: 'DeepSeek',
                        groq: 'Groq Cloud',
                        openrouter: 'OpenRouter',
                        jev: 'TypeSafe AI Jev',
                      };
                      setModelFormData((prev) => ({
                        ...prev,
                        provider: prov as any,
                        providerName: mappedNames[prov] || prov,
                        modelName:
                          prov === 'gemini'
                            ? 'gemini-2.0-flash'
                            : prov === 'openai'
                            ? 'gpt-4o'
                            : prov === 'claude'
                            ? 'claude-3-7-sonnet'
                            : prov === 'openrouter'
                            ? 'openrouter/auto'
                            : prov === 'jev'
                            ? 'jev-latest'
                            : prev.modelName,
                        baseUrl: prev.baseUrl,
                      }));
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    <option value="gemini">Google Gemini AI</option>
                    <option value="openai">OpenAI Compatible Gateway</option>
                    <option value="claude">Anthropic Claude API</option>
                    <option value="grok">xAI Grok API</option>
                    <option value="deepseek">DeepSeek AI Platform</option>
                    <option value="groq">Groq Cloud Speed Engines</option>
                    <option value="openrouter">OpenRouter (200+ Models)</option>
                    <option value="jev">TypeSafe AI Jev (Decision Engine)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Provider Label Name *</label>
                  <input
                    disabled={!!editingModel && !editingModel.id.startsWith('ai_custom_')}
                    type="text"
                    value={modelFormData.providerName || ''}
                    onChange={(e) => setModelFormData((prev) => ({ ...prev, providerName: e.target.value }))}
                    placeholder="e.g. My Private OpenAI Gateway"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
              </div>

              {/* Model Selector / Custom Name input */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">
                  Model Identifier / Preset Selection
                </label>
                <div className="flex gap-2">
                  <select
                    value={
                      getPresetsForProvider(modelFormData.provider || 'openai').includes(modelFormData.modelName || '')
                        ? modelFormData.modelName
                        : 'custom'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== 'custom') {
                        setModelFormData((prev) => ({ ...prev, modelName: val }));
                      } else {
                        setModelFormData((prev) => ({ ...prev, modelName: 'custom-model-id' }));
                      }
                    }}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden cursor-pointer shrink-0"
                  >
                    {getPresetsForProvider(modelFormData.provider || 'openai').map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                    <option value="custom">✍️ Custom Model...</option>
                  </select>

                  {(!getPresetsForProvider(modelFormData.provider || 'openai').includes(modelFormData.modelName || '') ||
                    modelFormData.modelName === 'custom-model-id') && (
                    <input
                      type="text"
                      value={modelFormData.modelName || ''}
                      onChange={(e) => setModelFormData((prev) => ({ ...prev, modelName: e.target.value }))}
                      placeholder="Type Model ID..."
                      className="h-9 flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-mono focus:border-purple-500 focus:outline-hidden"
                    />
                  )}
                </div>
              </div>

              {/* API Key Vault Input with Test Connection */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">API Authentication Key / Token</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showModalKey ? 'text' : 'password'}
                      value={modelFormData.apiKey || ''}
                      onChange={(e) => setModelFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                      placeholder="Enter API authentication key"
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 pr-9 text-xs font-mono focus:border-purple-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModalKey((prev) => !prev)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showModalKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestModalConnection}
                    disabled={modelTestStatus === 'testing'}
                    className="h-9 px-4 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 transition"
                  >
                    {modelTestStatus === 'testing' && (
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    )}
                    <span>Test</span>
                  </button>
                </div>
              </div>

              {/* Test Status feedback */}
              {modelTestStatus !== 'idle' && (
                <div className="pt-1">
                  {modelTestStatus === 'testing' && (
                    <div className="flex items-center gap-2 text-slate-600 bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 rounded-2xl text-xs font-medium">
                      <span className="h-4 w-4 rounded-full border-2 border-purple-600 border-t-transparent animate-spin shrink-0" />
                      <span>Sending handshake query to verify endpoint...</span>
                    </div>
                  )}

                  {modelTestStatus === 'success' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 px-3.5 py-3 rounded-2xl">
                      <div className="flex items-center gap-2.5 text-emerald-800 text-xs font-bold">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] shrink-0 shadow-xs">
                          ✓
                        </div>
                        <span>Response received. Connection verified!</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTestModelId(editingModel?.id || `ai_custom_${Date.now()}`);
                          setIsModelModalOpen(false);
                          setActiveTab('sandbox');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3.5 py-1.5 rounded-xl transition cursor-pointer self-start sm:self-auto"
                      >
                        <Terminal className="h-3.5 w-3.5" />
                        <span>Try in Sandbox</span>
                      </button>
                    </div>
                  )}

                  {modelTestStatus === 'failed' && (
                    <div className="space-y-2 bg-rose-50 border border-rose-200 p-3.5 rounded-2xl text-xs">
                      <div className="flex items-center gap-2 text-rose-800 font-bold">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white text-[10px] shrink-0 shadow-xs">
                          ✗
                        </div>
                        <span>Connection Verification Failed</span>
                      </div>
                      {modelTestError && (
                        <p className="text-[11px] text-rose-700 leading-relaxed font-mono bg-white/80 p-2.5 rounded-xl border border-rose-200 break-words whitespace-pre-wrap">
                          {modelTestError}
                        </p>
                      )}
                      {(() => {
                        const prov = modelFormData.provider || 'gemini';
                        const portalMap: Record<string, { name: string; url: string; label: string }> = {
                          gemini: { name: 'Google AI Studio', url: 'https://aistudio.google.com/app/apikey', label: 'Google Gemini' },
                          openai: { name: 'OpenAI API Keys', url: 'https://platform.openai.com/api-keys', label: 'OpenAI' },
                          claude: { name: 'Anthropic Console', url: 'https://console.anthropic.com/settings/keys', label: 'Anthropic Claude' },
                          grok: { name: 'xAI Console', url: 'https://console.x.ai', label: 'xAI Grok' },
                          deepseek: { name: 'DeepSeek Platform', url: 'https://platform.deepseek.com/api_keys', label: 'DeepSeek' },
                          groq: { name: 'GroqCloud Console', url: 'https://console.groq.com/keys', label: 'Groq Cloud' },
                          jev: { name: 'TypeSafe AI', url: 'https://jevtypesafeai.com', label: 'TypeSafe AI Jev' },
                        };
                        const portal = portalMap[prov];
                        if (!portal) return null;
                        return (
                          <div className="pt-0.5 text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                            <span>Get or verify your {portal.label} API key:</span>
                            <a
                              href={portal.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 font-bold hover:underline inline-flex items-center gap-1"
                            >
                              {portal.name} <ExternalLink className="h-3 w-3 inline" />
                            </a>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Custom Base API URL (Optional)</label>
                <input
                  type="text"
                  value={modelFormData.baseUrl || ''}
                  onChange={(e) => setModelFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="e.g. https://api.openai.com/v1"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Temperature (0.0 to 1.5)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1.5"
                    value={modelFormData.temperature || 0.7}
                    onChange={(e) => setModelFormData((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Max Tokens</label>
                  <input
                    type="number"
                    step="256"
                    min="256"
                    max="16384"
                    value={modelFormData.maxTokens || 4096}
                    onChange={(e) => setModelFormData((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  id="makeDefault"
                  checked={modelFormData.isDefault || false}
                  onChange={(e) => setModelFormData((prev) => ({ ...prev, isDefault: e.target.checked }))}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer h-4 w-4"
                />
                <label htmlFor="makeDefault" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  Set as Primary Default Reasoning Model
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModelModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomModel}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition cursor-pointer"
              >
                Save Model Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
