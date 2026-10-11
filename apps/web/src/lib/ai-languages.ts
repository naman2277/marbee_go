export type SupportedLanguage = {
  code: string;
  name: string;
  nativeName: string;
  region: 'Indian Regional' | 'Global';
  flag: string;
  ackGreeting: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  // ── Indian Regional Languages ──
  {
    code: 'hi-IN',
    name: 'Hindi',
    nativeName: 'हिंदी',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'नमस्ते! मैं अब हिंदी में बात कर रही हूँ। आप अपना सवाल पूछ सकते हैं।',
  },
  {
    code: 'en-IN',
    name: 'Hinglish',
    nativeName: 'Hinglish / Indian Eng',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'Switched to Hinglish mode. Let me know what you need help with!',
  },
  {
    code: 'mr-IN',
    name: 'Marathi',
    nativeName: 'मराठी',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'नमस्कार! मी आता मराठीत बोलत आहे. मी तुम्हाला कशी मदत करू शकते?',
  },
  {
    code: 'bn-IN',
    name: 'Bengali',
    nativeName: 'বাংলা',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'নমস্কার! আমি এখন বাংলায় কথা বলছি। আমি আপনাকে কিভাবে সাহায্য করতে পারি?',
  },
  {
    code: 'te-IN',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'నమస్కారం! నేను ఇప్పుడు తెలుగులో మాట్లాడుతున్నాను. నేను మీకు ఎలా సహాయం చేయగలను?',
  },
  {
    code: 'ta-IN',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'வணக்கம்! நான் இப்போது தமிழில் பேசுகிறேன். உங்களுக்கு எப்படி உதவ முடியும்?',
  },
  {
    code: 'kn-IN',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'ನಮಸ್ಕಾರ! ನಾನು ಈಗ ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
  },
  {
    code: 'ml-IN',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'നമസ്കാരം! ഞാൻ ഇപ്പോൾ മലയാളത്തിൽ സംസാരിക്കുന്നു. ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കും?',
  },
  {
    code: 'gu-IN',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'નમસ્તે! હું હવે ગુજરાતીમાં વાત કરી રહ્યો છું. હું તમારી કેવી રીતે મદદ કરી શકું?',
  },
  {
    code: 'pa-IN',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਹੁਣ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਰਿਹਾ ਹਾਂ। ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?',
  },
  {
    code: 'ur-IN',
    name: 'Urdu',
    nativeName: 'اردو',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'السلام علیکم! میں اب اردو میں بات کر رہا ہوں۔ میں آپ کی کیسے مدد کر سکتا ہوں؟',
  },
  {
    code: 'or-IN',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    region: 'Indian Regional',
    flag: '🇮🇳',
    ackGreeting: 'ନମସ୍କାର! ମୁଁ ଏବେ ଓଡ଼ିଆରେ କଥା ହେଉଛି। ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?',
  },

  // ── Global Languages ──
  {
    code: 'en-US',
    name: 'English',
    nativeName: 'Global English',
    region: 'Global',
    flag: '🇺🇸',
    ackGreeting: 'Switched to English mode. How can I assist you today?',
  },
  {
    code: 'es-ES',
    name: 'Spanish',
    nativeName: 'Español',
    region: 'Global',
    flag: '🇪🇸',
    ackGreeting: '¡Hola! Ahora estoy hablando en español. ¿Cómo te puedo ayudar hoy?',
  },
  {
    code: 'fr-FR',
    name: 'French',
    nativeName: 'Français',
    region: 'Global',
    flag: '🇫🇷',
    ackGreeting: 'Bonjour ! Je parle maintenant en français. Comment puis-je vous aider aujourd’hui ?',
  },
  {
    code: 'de-DE',
    name: 'German',
    nativeName: 'Deutsch',
    region: 'Global',
    flag: '🇩🇪',
    ackGreeting: 'Hallo! Ich spreche jetzt auf Deutsch. Wie kann ich Ihnen heute helfen?',
  },
  {
    code: 'ar-SA',
    name: 'Arabic',
    nativeName: 'العربية',
    region: 'Global',
    flag: '🇸🇦',
    ackGreeting: 'مرحباً! أنا أتحدث الآن باللغة العربية. كيف يمكنني مساعدتك اليوم؟',
  },
  {
    code: 'ja-JP',
    name: 'Japanese',
    nativeName: '日本語',
    region: 'Global',
    flag: '🇯🇵',
    ackGreeting: 'こんにちは！日本語でお話ししています。どのようなご用件でしょうか？',
  },
  {
    code: 'zh-CN',
    name: 'Mandarin Chinese',
    nativeName: '中文 (普通话)',
    region: 'Global',
    flag: '🇨🇳',
    ackGreeting: '您好！我现在用中文为您服务。请问今天有什么可以帮助您的？',
  },
];

export function getLanguageByCode(code: string): SupportedLanguage {
  const cleanCode = (code || 'en-US').toLowerCase();
  const match = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === cleanCode || l.name.toLowerCase() === cleanCode
  );
  return match || SUPPORTED_LANGUAGES.find((l) => l.code === 'en-US')!;
}
