import {
  type BuddyCustomAgentConfig,
  type VoiceAvatarAiAdapter,
  type VoiceAgentConfig,
  type CustomVoiceConfig,
} from './ai-engine-config';
import { getSavedAiApiKey } from './ai-crm-context';

export type VoiceOption = {
  id: string;
  label: string;
  category: 'avatar_adapter' | 'voice_gateway' | 'neural_profile';
  provider: 'gemini' | 'google' | 'elevenlabs' | 'runwayml' | 'heygen' | 'tavus' | 'did' | 'vapi' | 'browser';
  voiceId?: string;
  gender: 'female' | 'male';
  description: string;
  isConfigured?: boolean;
};

/**
 * Official Google Gemini 2.0 & Google Cloud Multilingual Neural Voices
 * Uses your existing Google Gemini API Key (Zero ElevenLabs dependency needed)
 */
export const GEMINI_OFFICIAL_VOICES: Record<
  string,
  { name: string; voiceName: string; gender: 'female' | 'male'; accent: string; description: string; langCode: string }
> = {
  aoede: {
    name: 'Aoede',
    voiceName: 'Aoede',
    gender: 'female',
    accent: 'Global Multilingual',
    description: 'Warm, expressive, natural studio female (Gemini 2.0)',
    langCode: 'en-US',
  },
  kore: {
    name: 'Kore',
    voiceName: 'Kore',
    gender: 'female',
    accent: 'Global Multilingual',
    description: 'Friendly, bright, empathetic female (Gemini 2.0)',
    langCode: 'en-US',
  },
  puck: {
    name: 'Puck',
    voiceName: 'Puck',
    gender: 'male',
    accent: 'Global Multilingual',
    description: 'Clear, engaging, upbeat male (Gemini 2.0)',
    langCode: 'en-US',
  },
  fenrir: {
    name: 'Fenrir',
    voiceName: 'Fenrir',
    gender: 'male',
    accent: 'Global Multilingual',
    description: 'Calm, authoritative, executive male (Gemini 2.0)',
    langCode: 'en-US',
  },
  charon: {
    name: 'Charon',
    voiceName: 'Charon',
    gender: 'male',
    accent: 'Global Multilingual',
    description: 'Deep, resonant, consultative male (Gemini 2.0)',
    langCode: 'en-US',
  },
  swara_hi: {
    name: 'Swara (Hindi)',
    voiceName: 'hi-IN-Neural2-A',
    gender: 'female',
    accent: 'Hindi (Devanagari)',
    description: 'Native Indian Hindi studio female (Google Neural2)',
    langCode: 'hi-IN',
  },
  madhur_hi: {
    name: 'Madhur (Hindi)',
    voiceName: 'hi-IN-Neural2-B',
    gender: 'male',
    accent: 'Hindi (Devanagari)',
    description: 'Native Indian Hindi studio male (Google Neural2)',
    langCode: 'hi-IN',
  },
  neerja_in: {
    name: 'Neerja (Indian English)',
    voiceName: 'en-IN-Neural2-A',
    gender: 'female',
    accent: 'Indian English / Hinglish',
    description: 'Professional Indian English female (Google Neural2)',
    langCode: 'en-IN',
  },
  prabhat_in: {
    name: 'Prabhat (Indian English)',
    voiceName: 'en-IN-Neural2-B',
    gender: 'male',
    accent: 'Indian English / Hinglish',
    description: 'Executive Indian English male (Google Neural2)',
    langCode: 'en-IN',
  },
  marathi_female: {
    name: 'Aarohi (Marathi)',
    voiceName: 'mr-IN-Wavenet-A',
    gender: 'female',
    accent: 'Marathi (मराठी)',
    description: 'Native Marathi studio female (Google Wavenet)',
    langCode: 'mr-IN',
  },
  bengali_female: {
    name: 'Tanushree (Bengali)',
    voiceName: 'bn-IN-Wavenet-A',
    gender: 'female',
    accent: 'Bengali (বাংলা)',
    description: 'Native Bengali studio female (Google Wavenet)',
    langCode: 'bn-IN',
  },
  tamil_female: {
    name: 'Kavitha (Tamil)',
    voiceName: 'ta-IN-Wavenet-A',
    gender: 'female',
    accent: 'Tamil (தமிழ்)',
    description: 'Native Tamil studio female (Google Wavenet)',
    langCode: 'ta-IN',
  },
  telugu_female: {
    name: 'Sravani (Telugu)',
    voiceName: 'te-IN-Standard-A',
    gender: 'female',
    accent: 'Telugu (తెలుగు)',
    description: 'Native Telugu studio female (Google Standard)',
    langCode: 'te-IN',
  },
};

/**
 * Complete Official ElevenLabs Standard Premade Voices with Authentic Voice IDs
 * Reference: https://elevenlabs.io/docs/api-reference/voices
 */
export const ELEVENLABS_OFFICIAL_VOICES: Record<
  string,
  { name: string; voiceId: string; gender: 'female' | 'male'; accent: string; description: string }
> = {
  rachel: {
    name: 'Rachel',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    gender: 'female',
    accent: 'American',
    description: 'Calm, clear, natural North American female',
  },
  adam: {
    name: 'Adam',
    voiceId: 'pNInz6obpgDQGcFmaJgB',
    gender: 'male',
    accent: 'American',
    description: 'Deep, warm, conversational North American male',
  },
  antoni: {
    name: 'Antoni',
    voiceId: 'ErXwobaYiN019PkySvjV',
    gender: 'male',
    accent: 'American',
    description: 'Balanced, pleasant, well-rounded American male',
  },
  bella: {
    name: 'Bella',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    gender: 'female',
    accent: 'American',
    description: 'Soft, bright, expressive multilingual female',
  },
  josh: {
    name: 'Josh',
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',
    gender: 'male',
    accent: 'American',
    description: 'Young, energetic, engaging American male',
  },
  arnold: {
    name: 'Arnold',
    voiceId: 'VR6AewLTigWG4xSOukaG',
    gender: 'male',
    accent: 'American',
    description: 'Crisp, authoritative, confident male',
  },
  domi: {
    name: 'Domi',
    voiceId: 'AZnzlk1XvdvUeBnXmlld',
    gender: 'female',
    accent: 'American',
    description: 'Strong, emphatic, confident female',
  },
  elli: {
    name: 'Elli',
    voiceId: 'MF3mGyEYCl7XYWbV9V6O',
    gender: 'female',
    accent: 'American',
    description: 'Young, emotional, warm female',
  },
  sam: {
    name: 'Sam',
    voiceId: 'yoZ06aMxZJJ28mfd3POQ',
    gender: 'male',
    accent: 'American',
    description: 'Dynamic, raspy, energetic male',
  },
  george: {
    name: 'George',
    voiceId: 'JBFqnCBsd6RMkjVDRZzb',
    gender: 'male',
    accent: 'British',
    description: 'Warm, raspy British storyteller male',
  },
  sarah: {
    name: 'Sarah',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    gender: 'female',
    accent: 'American',
    description: 'Soft, bright, news presenter female',
  },
  charlie: {
    name: 'Charlie',
    voiceId: 'IKne3meq5aSn9XLyUdCD',
    gender: 'male',
    accent: 'Australian',
    description: 'Casual, conversational Australian male',
  },
  charlotte: {
    name: 'Charlotte',
    voiceId: 'XB0fDUnXU5powFXDhCwa',
    gender: 'female',
    accent: 'Swedish/English',
    description: 'Seductive, expressive female',
  },
  callum: {
    name: 'Callum',
    voiceId: 'N2lVS1w4EtoT3dr4eOWO',
    gender: 'male',
    accent: 'Transatlantic',
    description: 'Intense, edgy male character',
  },
  clyde: {
    name: 'Clyde',
    voiceId: '2EiwWnXFnvU5JabPnv8n',
    gender: 'male',
    accent: 'American',
    description: 'War veteran, gritty American male',
  },
  daniel: {
    name: 'Daniel',
    voiceId: 'onwK4e9ZLuTAKqWW03F9',
    gender: 'male',
    accent: 'British',
    description: 'Authoritative, clear British male',
  },
  emily: {
    name: 'Emily',
    voiceId: 'LcfcDJNUP1GQjkzn1xUU',
    gender: 'female',
    accent: 'American',
    description: 'Calm, meditative female',
  },
  eric: {
    name: 'Eric',
    voiceId: 'cjVigY5qzO86Huf0OWal',
    gender: 'male',
    accent: 'American',
    description: 'Conversational, friendly American male',
  },
  freya: {
    name: 'Freya',
    voiceId: 'jsCqWAovK2LkecY7zXl4',
    gender: 'female',
    accent: 'American',
    description: 'Expressive, pleasant female',
  },
  jessica: {
    name: 'Jessica',
    voiceId: 'cgSgspJ2msm6clMCkdW9',
    gender: 'female',
    accent: 'American',
    description: 'Playful, bright young female',
  },
  liam: {
    name: 'Liam',
    voiceId: 'TX3LPaxmHKxFdv7VOQHJ',
    gender: 'male',
    accent: 'American',
    description: 'Articulate, neutral young male',
  },
  matilda: {
    name: 'Matilda',
    voiceId: 'XrExE9yKIg1WjnnlVkGX',
    gender: 'female',
    accent: 'American',
    description: 'Warm, expressive female',
  },
  michael: {
    name: 'Michael',
    voiceId: 'flq6f7yk4E4fJM5XTYuZ',
    gender: 'male',
    accent: 'American',
    description: 'Natural, mature male',
  },
  nicole: {
    name: 'Nicole',
    voiceId: 'piTKgcLEGmPE4e6mEKli',
    gender: 'female',
    accent: 'American',
    description: 'Gentle, whispering female',
  },
  paul: {
    name: 'Paul',
    voiceId: '5Q0t7uMcjvnagumLfvZi',
    gender: 'male',
    accent: 'American',
    description: 'Authoritative ground reporter male',
  },
  river: {
    name: 'River',
    voiceId: 'SAz9YHcvj6GT2YYXdXww',
    gender: 'female',
    accent: 'American',
    description: 'Confident, neutral tone',
  },
  roger: {
    name: 'Roger',
    voiceId: 'CwhRBWXzGAHq8TQ4Fs17',
    gender: 'male',
    accent: 'American',
    description: 'Confident, casual male',
  },
  will: {
    name: 'Will',
    voiceId: 'bIHbv24MWmeRgasZH58o',
    gender: 'male',
    accent: 'American',
    description: 'Friendly, warm male',
  },
  bill: {
    name: 'Bill',
    voiceId: 'pqHfZKP75CvOlQylNhV4',
    gender: 'male',
    accent: 'American',
    description: 'Trustworthy, warm narrator male',
  },
};

/**
 * Resolves Gemini/Google voice identifier
 */
/**
 * Resolves Gemini/Google voice identifier with strict gender enforcement
 */
export function resolveGeminiVoice(input?: string, gender: 'female' | 'male' = 'female'): { voiceName: string; langCode: string } {
  const isMale = gender === 'male';
  if (!input) return { voiceName: isMale ? 'Puck' : 'Aoede', langCode: 'en-US' };
  const clean = input.toLowerCase().trim();

  for (const [key, val] of Object.entries(GEMINI_OFFICIAL_VOICES)) {
    if (clean.includes(key) || clean.includes(val.name.toLowerCase()) || clean.includes(val.voiceName.toLowerCase())) {
      // If voice gender matches the requested agent gender, use it
      if (val.gender === gender) {
        return { voiceName: val.voiceName, langCode: val.langCode };
      }
    }
  }

  if (clean.includes('swara') || clean.includes('hindi') || clean.includes('devanagari')) {
    return { voiceName: isMale ? 'hi-IN-Neural2-B' : 'hi-IN-Neural2-A', langCode: 'hi-IN' };
  }
  if (clean.includes('madhur')) {
    return { voiceName: isMale ? 'hi-IN-Neural2-B' : 'hi-IN-Neural2-A', langCode: 'hi-IN' };
  }
  if (clean.includes('prabhat') || clean.includes('neerja') || clean.includes('indian') || clean.includes('hinglish')) {
    return { voiceName: isMale ? 'en-IN-Neural2-B' : 'en-IN-Neural2-A', langCode: 'en-IN' };
  }
  if (clean.includes('marathi')) {
    return { voiceName: isMale ? 'hi-IN-Neural2-B' : 'mr-IN-Wavenet-A', langCode: isMale ? 'hi-IN' : 'mr-IN' };
  }
  if (clean.includes('bengali')) {
    return { voiceName: isMale ? 'en-IN-Neural2-B' : 'bn-IN-Wavenet-A', langCode: isMale ? 'en-IN' : 'bn-IN' };
  }
  if (clean.includes('tamil')) {
    return { voiceName: isMale ? 'en-IN-Neural2-B' : 'ta-IN-Wavenet-A', langCode: isMale ? 'en-IN' : 'ta-IN' };
  }
  if (clean.includes('telugu')) {
    return { voiceName: isMale ? 'en-IN-Neural2-B' : 'te-IN-Standard-A', langCode: isMale ? 'en-IN' : 'te-IN' };
  }

  return { voiceName: isMale ? 'Puck' : 'Aoede', langCode: 'en-US' };
}

/**
 * Resolves any input to a valid ElevenLabs Voice ID with strict gender enforcement
 */
export function resolveElevenLabsVoiceId(input?: string, gender: 'female' | 'male' = 'female'): string {
  const isMale = gender === 'male';
  if (!input) return isMale ? 'pNInz6obpgDQGcFmaJgB' : '21m00Tcm4TlvDq8ikWAM';
  const clean = input.trim();

  // If already a valid 20-character ElevenLabs ID
  if (/^[a-zA-Z0-9]{20}$/.test(clean)) {
    return clean;
  }

  const lower = clean.toLowerCase();
  for (const [key, voice] of Object.entries(ELEVENLABS_OFFICIAL_VOICES)) {
    if (lower.includes(key) || lower.includes(voice.name.toLowerCase())) {
      if (voice.gender === gender) {
        return voice.voiceId;
      }
    }
  }

  if (isMale) {
    return 'pNInz6obpgDQGcFmaJgB'; // Adam (Male)
  }

  return '21m00Tcm4TlvDq8ikWAM'; // Rachel (Female)
}

/**
 * Fallback Web Speech Neural Profiles
 */
export const NEURAL_VOICE_PROFILES: VoiceOption[] = [
  {
    id: 'neural_in_female_1',
    label: 'Indian English — Neerja (Female Neural)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'female',
    description: 'Clear, articulate Indian English business persona with warm cadence.',
  },
  {
    id: 'neural_in_male_1',
    label: 'Indian English — Prabhat (Male Neural)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'male',
    description: 'Confident, authoritative Indian English technical consultant tone.',
  },
  {
    id: 'neural_hi_female_1',
    label: 'Hindi — Swara (Female Devanagari)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'female',
    description: 'Expressive, native Hindi & Hinglish conversational specialist.',
  },
  {
    id: 'neural_hi_male_1',
    label: 'Hindi — Madhur (Male Devanagari)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'male',
    description: 'Polite, clear Hindi & Hinglish customer advisor persona.',
  },
  {
    id: 'neural_us_female_1',
    label: 'US English — Samantha (Female Neural)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'female',
    description: 'Polished Silicon Valley support executive tone.',
  },
  {
    id: 'neural_us_male_1',
    label: 'US English — David (Male Neural)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'male',
    description: 'Deep, engaging SaaS consultant tone.',
  },
  {
    id: 'neural_uk_female_1',
    label: 'UK English — Victoria (Female Neural)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'female',
    description: 'Crisp British executive advisory accent.',
  },
  {
    id: 'neural_uk_male_1',
    label: 'UK English — George (Male Neural)',
    category: 'neural_profile',
    provider: 'browser',
    gender: 'male',
    description: 'Articulate British technical advisor accent.',
  },
];

/**
 * Returns available voices categorized by provider (Gemini, ElevenLabs, Web Speech)
 */
export function getAvailableBuddyVoices(
  voiceAvatarAdapters: VoiceAvatarAiAdapter[] = [],
  voiceAgents: VoiceAgentConfig[] = [],
  customVoices: CustomVoiceConfig[] = [],
  onlyConfigured: boolean = false
): VoiceOption[] {
  const result: VoiceOption[] = [];

  // 1. Google Gemini & Google Cloud Speech Voices
  Object.entries(GEMINI_OFFICIAL_VOICES).forEach(([key, v]) => {
    result.push({
      id: `gemini_${key}`,
      label: `Gemini / Google — ${v.name} (${v.accent})`,
      category: 'avatar_adapter',
      provider: 'gemini',
      voiceId: v.voiceName,
      gender: v.gender,
      description: `Google Native Speech • ${v.description}`,
      isConfigured: true,
    });
  });

  // 2. Custom ElevenLabs Voice Configs
  if (Array.isArray(customVoices)) {
    customVoices.forEach((c) => {
      if (!c) return;
      result.push({
        id: c.id,
        label: `${c.name} (${c.language || c.accent || 'ElevenLabs'})`,
        category: 'avatar_adapter',
        provider: 'elevenlabs',
        voiceId: c.voiceId,
        gender: c.gender,
        description: c.description || `ElevenLabs custom voice profile (${c.voiceId})`,
        isConfigured: true,
      });
    });
  }

  // 3. Official ElevenLabs Voice Profiles
  const popularVoices = ['rachel', 'adam', 'antoni', 'bella', 'josh', 'arnold', 'domi', 'elli', 'sam', 'george'];
  popularVoices.forEach((key) => {
    const v = ELEVENLABS_OFFICIAL_VOICES[key];
    if (v) {
      result.push({
        id: `eleven_${key}`,
        label: `ElevenLabs — ${v.name} (${v.accent} ${v.gender === 'female' ? 'Female' : 'Male'})`,
        category: 'avatar_adapter',
        provider: 'elevenlabs',
        voiceId: v.voiceId,
        gender: v.gender,
        description: `ElevenLabs Studio Neural Voice • ${v.description}`,
        isConfigured: true,
      });
    }
  });

  // 4. In-Browser Neural Native Voices
  NEURAL_VOICE_PROFILES.forEach((vp) => {
    result.push({
      ...vp,
      isConfigured: true,
    });
  });

  return result;
}

let activeAudioElement: HTMLAudioElement | null = null;
let activeSpeechHeartbeat: any = null;

/**
 * Stops any active ElevenLabs, Gemini, or Browser Web Speech playback immediately
 */
export function stopBuddySpeech(): void {
  if (activeSpeechHeartbeat) {
    clearInterval(activeSpeechHeartbeat);
    activeSpeechHeartbeat = null;
  }

  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
      activeAudioElement.src = '';
    } catch {}
    activeAudioElement = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.pause();
    } catch {}
  }
}

/**
 * Synthesizes speech using Google Gemini / Google Cloud Text-to-Speech API with your Gemini API key
 */
async function playGeminiSpeech(
  text: string,
  geminiApiKey: string,
  voiceName: string,
  langCode: string = 'en-US',
  onEnd?: () => void,
  onError?: (err: any) => void
): Promise<boolean> {
  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: langCode,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0.0,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.audioContent) {
        const audioUrl = `data:audio/mp3;base64,${data.audioContent}`;
        const audio = new Audio(audioUrl);
        activeAudioElement = audio;

        audio.onended = () => {
          activeAudioElement = null;
          onEnd?.();
        };

        audio.onerror = (e) => {
          console.warn('Gemini audio playback error:', e);
          activeAudioElement = null;
          onError?.(e);
        };

        await audio.play();
        return true;
      }
    }
  } catch (err) {
    console.warn('Gemini TTS API call failed:', err);
  }
  return false;
}

/**
 * Speaks text using the Buddy Agent's configured voice:
 * - Option A: Google Gemini / Google Speech API (using your existing Gemini API key)
 * - Option B: ElevenLabs Studio Voice (using ElevenLabs key)
 * - Option C: High-Fidelity Web Speech API
 */
export async function playBuddySpeech(
  text: string,
  agent: Partial<BuddyCustomAgentConfig>,
  voiceAvatarAdapters: VoiceAvatarAiAdapter[] = [],
  voiceAgents: VoiceAgentConfig[] = [],
  onEnd?: () => void,
  onError?: (err: any) => void
): Promise<void> {
  stopBuddySpeech();

  const cleanText = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/###|\*\*|`|_/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();

  if (!cleanText) {
    onEnd?.();
    return;
  }

  // 1. Resolve Gemini Key & Voice
  const resolvedAi = getSavedAiApiKey();
  let geminiKey = resolvedAi?.apiKey && resolvedAi.apiKey.startsWith('AIza') ? resolvedAi.apiKey : null;

  if (!geminiKey && typeof localStorage !== 'undefined') {
    const rawAi = localStorage.getItem('marbee_ai_models_config');
    if (rawAi) {
      try {
        const parsed = JSON.parse(rawAi);
        if (Array.isArray(parsed)) {
          const gem = parsed.find((m: any) => m.apiKey && String(m.apiKey).startsWith('AIza'));
          if (gem) geminiKey = gem.apiKey;
        }
      } catch {}
    }
  }

  const voiceIdOrLabel = String(agent.voiceId || agent.voiceAdapterId || agent.voiceLabel || '').toLowerCase();
  const isExplicitGeminiVoice = voiceIdOrLabel.includes('gemini') || voiceIdOrLabel.includes('google') || voiceIdOrLabel.includes('aoede') || voiceIdOrLabel.includes('puck') || voiceIdOrLabel.includes('kore') || voiceIdOrLabel.includes('fenrir') || voiceIdOrLabel.includes('charon');

  // If Gemini voice or Gemini key is configured and user chose Gemini:
  if (geminiKey && isExplicitGeminiVoice) {
    const geminiVoiceMeta = resolveGeminiVoice(agent.voiceId || agent.voiceLabel, agent.gender || 'female');
    const success = await playGeminiSpeech(cleanText, geminiKey, geminiVoiceMeta.voiceName, geminiVoiceMeta.langCode, onEnd, onError);
    if (success) return;
  }

  // 2. Resolve ElevenLabs API key:
  let elevenLabsKey: string | null = null;

  const matchingAdapter = voiceAvatarAdapters.find(
    (a) => a && (a.id === agent.voiceAdapterId || (agent.voiceAdapterId && agent.voiceAdapterId.includes(a.id)))
  );

  const matchingVoiceAgent = voiceAgents.find(
    (va) => va && (va.id === agent.voiceAdapterId || (agent.voiceAdapterId && agent.voiceAdapterId.includes(va.id)))
  );

  if (matchingAdapter && matchingAdapter.provider === 'elevenlabs' && matchingAdapter.apiKey) {
    elevenLabsKey = matchingAdapter.apiKey.trim();
  } else if (matchingVoiceAgent && matchingVoiceAgent.provider === 'elevenlabs' && matchingVoiceAgent.apiKey) {
    elevenLabsKey = matchingVoiceAgent.apiKey.trim();
  }

  // Auto-discover ElevenLabs API Key from workspace adapter if not explicitly assigned
  if (!elevenLabsKey && Array.isArray(voiceAvatarAdapters)) {
    const anyElevenAdapter = voiceAvatarAdapters.find((a) => a && a.provider === 'elevenlabs' && a.apiKey && a.apiKey.trim().length > 0);
    if (anyElevenAdapter && anyElevenAdapter.apiKey) {
      elevenLabsKey = anyElevenAdapter.apiKey.trim();
    }
  }

  // Auto-discover ElevenLabs API Key from localStorage
  if (!elevenLabsKey && typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes('voice_avatar_adapters') || k.includes('custom_voice') || k.includes('elevenlabs'))) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const el = parsed.find((x: any) => (x.provider === 'elevenlabs' || x.id?.includes('eleven')) && x.apiKey && String(x.apiKey).trim().length > 0);
              if (el && el.apiKey) {
                elevenLabsKey = String(el.apiKey).trim();
                break;
              }
            }
          }
        } catch {}
      }
    }
  }

  // If ElevenLabs key is available, execute ElevenLabs TTS
  if (elevenLabsKey && !isExplicitGeminiVoice) {
    const targetVoiceId = resolveElevenLabsVoiceId(
      agent.voiceId || agent.voiceAdapterId || matchingAdapter?.voiceId || matchingVoiceAgent?.voiceId || agent.voiceLabel || agent.name,
      agent.gender || 'female'
    );

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: matchingAdapter?.model || 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        activeAudioElement = audio;

        audio.onended = () => {
          activeAudioElement = null;
          URL.revokeObjectURL(audioUrl);
          onEnd?.();
        };

        audio.onerror = (err) => {
          activeAudioElement = null;
          URL.revokeObjectURL(audioUrl);
          onError?.(err);
        };

        await audio.play();
        return;
      }
    } catch (err) {
      console.warn('ElevenLabs speech synthesis failed, falling back to Web Speech:', err);
    }
  }

  // 3. High-Fidelity Web Speech Fallback
  playWebSpeechFallback(cleanText, agent, onEnd, onError);
}

/**
 * Enhanced Web Speech API Fallback with Gender and Language targeting
 */
function playWebSpeechFallback(
  text: string,
  agent: { name?: string; gender?: 'female' | 'male'; voiceLabel?: string; voiceAdapterId?: string },
  onEnd?: () => void,
  onError?: (err: any) => void
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onError?.('SpeechSynthesis not supported');
    return;
  }

  stopBuddySpeech();

  const executeSpeech = () => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      const isFemale = agent.gender !== 'male';
      const voiceLabel = (agent.voiceLabel || '').toLowerCase();
      const voiceAdapterId = (agent.voiceAdapterId || '').toLowerCase();
      const voices = window.speechSynthesis.getVoices();

      // Script detection
      const hasDevanagari = /[\u0900-\u097F]/.test(text);
      const hasBengali = /[\u0980-\u09FF]/.test(text);
      const hasTelugu = /[\u0C00-\u0C7F]/.test(text);
      const hasTamil = /[\u0B80-\u0BFF]/.test(text);
      const hasKannada = /[\u0C80-\u0CFF]/.test(text);
      const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
      const hasGujarati = /[\u0A80-\u0AFF]/.test(text);
      const hasPunjabi = /[\u0A00-\u0A7F]/.test(text);
      const hasArabic = /[\u0600-\u06FF]/.test(text);
      const hasOdia = /[\u0B00-\u0B7F]/.test(text);
      const hasJapanese = /[\u3040-\u30FF\u4E00-\u9FAF]/.test(text);
      const hasChinese = /[\u4E00-\u9FFF]/.test(text);

      if (hasBengali) {
        utter.lang = 'bn-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('bn'));
        if (v) utter.voice = v;
      } else if (hasTelugu) {
        utter.lang = 'te-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('te'));
        if (v) utter.voice = v;
      } else if (hasTamil) {
        utter.lang = 'ta-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('ta'));
        if (v) utter.voice = v;
      } else if (hasKannada) {
        utter.lang = 'kn-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('kn'));
        if (v) utter.voice = v;
      } else if (hasMalayalam) {
        utter.lang = 'ml-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('ml'));
        if (v) utter.voice = v;
      } else if (hasGujarati) {
        utter.lang = 'gu-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('gu'));
        if (v) utter.voice = v;
      } else if (hasPunjabi) {
        utter.lang = 'pa-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('pa'));
        if (v) utter.voice = v;
      } else if (hasArabic) {
        utter.lang = 'ur-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('ur') || (x?.lang || '').startsWith('ar'));
        if (v) utter.voice = v;
      } else if (hasOdia) {
        utter.lang = 'or-IN';
        const v = voices.find((x) => (x?.lang || '').startsWith('or'));
        if (v) utter.voice = v;
      } else if (hasJapanese) {
        utter.lang = 'ja-JP';
        const v = voices.find((x) => (x?.lang || '').startsWith('ja'));
        if (v) utter.voice = v;
      } else if (hasChinese) {
        utter.lang = 'zh-CN';
        const v = voices.find((x) => (x?.lang || '').startsWith('zh'));
        if (v) utter.voice = v;
      } else if (hasDevanagari || voiceLabel.includes('swara') || voiceLabel.includes('madhur') || (voiceLabel.includes('hindi') && hasDevanagari)) {
        // High-Fidelity Native Hindi / Marathi
        utter.lang = voiceLabel.includes('marathi') ? 'mr-IN' : 'hi-IN';
        let hindiVoice: SpeechSynthesisVoice | undefined;

        if (isFemale) {
          hindiVoice = voices.find(
            (v) =>
              ((v?.name || '').toLowerCase().includes('swara') ||
                (v?.name || '').toLowerCase().includes('female') ||
                (v?.name || '').toLowerCase().includes('kalpana') ||
                (v?.name || '').toLowerCase().includes('neerja') ||
                (v?.name || '').toLowerCase().includes('zira') ||
                (v?.name || '').toLowerCase().includes('samantha')) &&
              ((v?.lang || '').toLowerCase().startsWith('hi') || (v?.lang || '').toLowerCase().startsWith('mr') || (v?.lang || '').toLowerCase().startsWith('en'))
          ) || voices.find((v) => (v?.lang || '').toLowerCase().startsWith('hi'));
        } else {
          // Strictly Male Voice for Hindi
          hindiVoice = voices.find(
            (v) =>
              ((v?.name || '').toLowerCase().includes('madhur') ||
                (v?.name || '').toLowerCase().includes('ravi') ||
                (v?.name || '').toLowerCase().includes('hemant') ||
                (v?.name || '').toLowerCase().includes('prabhat') ||
                (v?.name || '').toLowerCase().includes('david') ||
                (v?.name || '').toLowerCase().includes('george') ||
                (v?.name || '').toLowerCase().includes('guy') ||
                (v?.name || '').toLowerCase().includes('mark') ||
                (v?.name || '').toLowerCase().includes('male'))
          );
        }

        if (hindiVoice) utter.voice = hindiVoice;
        utter.pitch = isFemale ? 1.05 : 0.80;
        utter.rate = 0.95;
      } else if (voiceLabel.includes('uk') || voiceAdapterId.includes('uk')) {
        utter.lang = 'en-GB';
        const ukVoice =
          voices.find(
            (v) =>
              (v?.lang || '').startsWith('en-GB') &&
              (isFemale
                ? (v?.name || '').toLowerCase().includes('female') ||
                  (v?.name || '').toLowerCase().includes('victoria') ||
                  (v?.name || '').toLowerCase().includes('sonia') ||
                  (v?.name || '').toLowerCase().includes('libby') ||
                  (v?.name || '').toLowerCase().includes('hazel')
                : (v?.name || '').toLowerCase().includes('male') ||
                  (v?.name || '').toLowerCase().includes('george') ||
                  (v?.name || '').toLowerCase().includes('ryan') ||
                  (v?.name || '').toLowerCase().includes('oliver'))
          ) ||
          voices.find(
            (v) =>
              (isFemale
                ? (v?.name || '').toLowerCase().includes('female') || (v?.name || '').toLowerCase().includes('zira')
                : (v?.name || '').toLowerCase().includes('male') || (v?.name || '').toLowerCase().includes('david') || (v?.name || '').toLowerCase().includes('george'))
          );
        if (ukVoice) utter.voice = ukVoice;
        utter.pitch = isFemale ? 1.05 : 0.82;
        utter.rate = 1.0;
      } else if (voiceLabel.includes('us') || voiceAdapterId.includes('us')) {
        utter.lang = 'en-US';
        const usVoice =
          voices.find(
            (v) =>
              (v?.lang || '').startsWith('en-US') &&
              (isFemale
                ? (v?.name || '').toLowerCase().includes('zira') ||
                  (v?.name || '').toLowerCase().includes('samantha') ||
                  (v?.name || '').toLowerCase().includes('jenny') ||
                  (v?.name || '').toLowerCase().includes('aria') ||
                  (v?.name || '').toLowerCase().includes('female')
                : (v?.name || '').toLowerCase().includes('david') ||
                  (v?.name || '').toLowerCase().includes('guy') ||
                  (v?.name || '').toLowerCase().includes('mark') ||
                  (v?.name || '').toLowerCase().includes('male'))
          ) ||
          voices.find(
            (v) =>
              (isFemale
                ? (v?.name || '').toLowerCase().includes('female') || (v?.name || '').toLowerCase().includes('zira') || (v?.name || '').toLowerCase().includes('samantha')
                : (v?.name || '').toLowerCase().includes('male') || (v?.name || '').toLowerCase().includes('david') || (v?.name || '').toLowerCase().includes('george') || (v?.name || '').toLowerCase().includes('mark'))
          );
        if (usVoice) utter.voice = usVoice;
        utter.pitch = isFemale ? 1.08 : 0.82;
        utter.rate = 1.0;
      } else {
        // High-Fidelity Indian English / General English Profile
        utter.lang = 'en-IN';
        let matchVoice = voices.find(
          (v) =>
            (v?.lang || '').startsWith('en-IN') &&
            (isFemale
              ? (v?.name || '').toLowerCase().includes('neerja') || (v?.name || '').toLowerCase().includes('heera') || (v?.name || '').toLowerCase().includes('female')
              : (v?.name || '').toLowerCase().includes('prabhat') || (v?.name || '').toLowerCase().includes('ravi') || (v?.name || '').toLowerCase().includes('male'))
        );

        if (!matchVoice) {
          matchVoice = voices.find(
            (v) =>
              (isFemale
                ? (v?.name || '').toLowerCase().includes('female') ||
                  (v?.name || '').toLowerCase().includes('neerja') ||
                  (v?.name || '').toLowerCase().includes('samantha') ||
                  (v?.name || '').toLowerCase().includes('zira') ||
                  (v?.name || '').toLowerCase().includes('victoria')
                : (v?.name || '').toLowerCase().includes('male') ||
                  (v?.name || '').toLowerCase().includes('david') ||
                  (v?.name || '').toLowerCase().includes('george') ||
                  (v?.name || '').toLowerCase().includes('guy') ||
                  (v?.name || '').toLowerCase().includes('prabhat') ||
                  (v?.name || '').toLowerCase().includes('madhur') ||
                  (v?.name || '').toLowerCase().includes('mark'))
          );
        }

        if (matchVoice) utter.voice = matchVoice;
        utter.pitch = isFemale ? 1.08 : 0.80;
        utter.rate = 0.98;
      }

      // Chromium speech synthesis bug workaround: keep synthesis active for long answers
      if (activeSpeechHeartbeat) clearInterval(activeSpeechHeartbeat);
      activeSpeechHeartbeat = setInterval(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          if (activeSpeechHeartbeat) {
            clearInterval(activeSpeechHeartbeat);
            activeSpeechHeartbeat = null;
          }
        }
      }, 5000);

      utter.onend = () => {
        if (activeSpeechHeartbeat) {
          clearInterval(activeSpeechHeartbeat);
          activeSpeechHeartbeat = null;
        }
        onEnd?.();
      };
      utter.onerror = (err) => {
        if (activeSpeechHeartbeat) {
          clearInterval(activeSpeechHeartbeat);
          activeSpeechHeartbeat = null;
        }
        onError?.(err);
      };

      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('SpeechSynthesis execution error:', e);
      onError?.(e);
    }
  };

  if (window.speechSynthesis.getVoices().length > 0) {
    executeSpeech();
  } else {
    window.speechSynthesis.onvoiceschanged = executeSpeech;
  }
}

/**
 * Direct tester for ElevenLabs connection with latency calculation and live audio playback
 */
export async function testElevenLabsVoice(
  apiKey: string,
  voiceId: string,
  sampleText: string,
  stability: number = 0.5,
  similarityBoost: number = 0.75,
  modelId: string = 'eleven_multilingual_v2',
  onEnd?: () => void,
  onError?: (err: any) => void
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  stopBuddySpeech();
  const startTime = Date.now();

  if (!apiKey || !apiKey.trim()) {
    const err = 'ElevenLabs API key is missing. Please provide a valid xi-api-key.';
    onError?.(new Error(err));
    return { success: false, latencyMs: 0, error: err };
  }

  const cleanVoiceId = resolveElevenLabsVoiceId(voiceId);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cleanVoiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: sampleText || 'Hello! Testing your configured ElevenLabs voice connection.',
        model_id: modelId || 'eleven_multilingual_v2',
        voice_settings: {
          stability: Math.max(0, Math.min(1, stability)),
          similarity_boost: Math.max(0, Math.min(1, similarityBoost)),
        },
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({ detail: { message: `HTTP ${res.status}` } }));
      const errMsg = errJson?.detail?.message || errJson?.message || `API error: ${res.statusText} (${res.status})`;
      onError?.(new Error(errMsg));
      return { success: false, latencyMs, error: errMsg };
    }

    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    activeAudioElement = audio;

    audio.onended = () => {
      activeAudioElement = null;
      URL.revokeObjectURL(audioUrl);
      onEnd?.();
    };

    audio.onerror = (err) => {
      activeAudioElement = null;
      URL.revokeObjectURL(audioUrl);
      onError?.(err);
    };

    await audio.play();
    return { success: true, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errMsg = err?.message || 'Network error connecting to ElevenLabs API.';
    onError?.(err);
    return { success: false, latencyMs, error: errMsg };
  }
}

/**
 * Previews speech using the exact voice settings
 */
export async function previewVoiceById(
  voiceId: string,
  label: string,
  gender: 'female' | 'male' = 'female',
  onEnd?: () => void,
  voiceAvatarAdapters: VoiceAvatarAiAdapter[] = [],
  customText?: string,
  customApiKey?: string
): Promise<void> {
  const isHindi = label.toLowerCase().includes('hindi') || label.toLowerCase().includes('swara') || label.toLowerCase().includes('madhur');
  const sampleText =
    customText && customText.trim().length > 0
      ? customText
      : isHindi
      ? 'नमस्ते! मैं आपकी AI स्पेशलिस्ट हूँ। आपकी क्या मदद करूँ?'
      : 'Hello! I am your AI assistant. How can I help you optimize your workflows today?';

  await playBuddySpeech(
    sampleText,
    {
      name: label,
      gender,
      voiceId,
      voiceLabel: label,
    },
    voiceAvatarAdapters,
    [],
    onEnd,
    onEnd
  );
}
