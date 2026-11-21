import { executeIntelligentReasoning } from './ai-crm-context';
import { getTimeOfDayGreeting } from './user-avatar';

export type PersonalizedGreeting = {
  greeting: string;
  tagline: string;
  subtitle: string;
  weatherBadge: string;
  vibeBadge: string;
  aiTip?: string;
  isAiGenerated: boolean;
  generatedAt: number;
};

const STORAGE_KEY = 'marbee_personalized_greeting_cache';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Approximate real-time weather based on user timezone or Open-Meteo free public endpoint
 */
async function getApproximateWeather(): Promise<{ weatherText: string; icon: string; temp: number; condition: string }> {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    
    let lat = 28.6139;
    let lon = 77.2090;

    if (timeZone.includes('New_York') || timeZone.includes('Eastern')) {
      lat = 40.7128; lon = -74.0060;
    } else if (timeZone.includes('Los_Angeles') || timeZone.includes('Pacific')) {
      lat = 34.0522; lon = -118.2437;
    } else if (timeZone.includes('London')) {
      lat = 51.5074; lon = -0.1278;
    } else if (timeZone.includes('Dubai')) {
      lat = 25.2048; lon = 55.2708;
    } else if (timeZone.includes('Singapore')) {
      lat = 1.3521; lon = 103.8198;
    } else if (timeZone.includes('Tokyo')) {
      lat = 35.6762; lon = 139.6503;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&_t=${Date.now()}`,
      { signal: controller.signal, cache: 'no-store' }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const temp = Math.round(data?.current_weather?.temperature ?? 28);
      const code = data?.current_weather?.weathercode ?? 0;
      
      let condition = 'Sunny Skies';
      let icon = '☀️';
      if (code >= 1 && code <= 3) { condition = 'Pleasant Clouds'; icon = '⛅'; }
      else if (code >= 45 && code <= 48) { condition = 'Misty Breeze'; icon = '🌫️'; }
      else if (code >= 51 && code <= 67) { condition = 'Gentle Rain'; icon = '🌧️'; }
      else if (code >= 71 && code <= 86) { condition = 'Crisp Snow'; icon = '❄️'; }
      else if (code >= 95) { condition = 'Rainy Thunder'; icon = '⚡'; }

      return { weatherText: `${icon} ${temp}°C · ${condition}`, icon, temp, condition };
    }
  } catch {
    // Fallback based on hour of day
  }

  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { weatherText: '🌅 24°C · Fresh Morning', icon: '🌅', temp: 24, condition: 'Fresh Morning' };
  if (hour >= 12 && hour < 17) return { weatherText: '☀️ 29°C · Warm Afternoon', icon: '☀️', temp: 29, condition: 'Warm Afternoon' };
  if (hour >= 17 && hour < 21) return { weatherText: '🌆 25°C · Golden Evening', icon: '🌆', temp: 25, condition: 'Golden Evening' };
  return { weatherText: '🌙 22°C · Peaceful Night', icon: '🌙', temp: 22, condition: 'Peaceful Night' };
}

/**
 * Returns static fallback greeting
 */
export function getFallbackGreeting(displayName: string = 'Naman'): PersonalizedGreeting {
  const greeting = getTimeOfDayGreeting();
  return {
    greeting: `${greeting}, ${displayName} 😊`,
    tagline: 'Your real-time engagement heartbeat',
    subtitle: 'Messages, delivery, and conversions across every channel today.',
    weatherBadge: 'Live · Operational',
    vibeBadge: 'Production',
    isAiGenerated: false,
    generatedAt: Date.now(),
  };
}

const SMILEYS = ['😊', '✨', '☕', '🌟', '🌸', '💫', '🌻', '🌿'];

const AFTERNOON_TAGLINES = [
  "Keep shining, you're doing amazing today! ✨",
  "A warm cup of coffee and boundless creative energy! ☕",
  "Halfway through the day and you're unstoppable! 🚀",
  "Breathe in calm, exhale stress — your workspace is in harmony. 🌿",
  "Let your curiosity and creativity lead the way this afternoon! 💡",
  "Great ideas happen when you work with joy and ease. 🌻",
  "Stay curious, stay inspired, and enjoy every small moment! 🌈",
];

const AFTERNOON_SUBTITLES = [
  (day: string, temp: number) => `Enjoy the warmth of this ${day} afternoon (${temp}°C). Everything in your workspace is running in harmony so you can create with peace of mind.`,
  (_day: string, temp: number) => `The afternoon breeze is calm (${temp}°C). Take your time, trust your journey, and celebrate how much you've accomplished today.`,
  (day: string, temp: number) => `A pleasant ${day} afternoon (${temp}°C). Your AI assistants are quietly handling the background work so your day stays effortless.`,
  (day: string, temp: number) => `Sending warm positive vibes your way this ${day} (${temp}°C). Remember to celebrate small steps toward your big dreams!`,
];

const MINDFUL_TIPS = [
  "Take a quick 5-minute stretch or look out the window — your mind deserves a gentle pause! 🌿",
  "Don't forget to take a sip of water and relax your shoulders. You've got this! 💧",
  "Small daily progress creates massive long-term magic. Be proud of your momentum! ⭐",
  "Take a deep breath in, hold for three seconds, and let it out with a smile. 😊",
  "The best way to get things done is with a calm, happy mind. Enjoy the journey! 🌈",
  "Give yourself permission to pause and appreciate how far you've come today. 🌻",
  "Creativity flows best when you feel relaxed and joyful. Treat yourself kindly! ☕",
];

const VIBE_BADGES = [
  "☕ Cozy Afternoon Vibe",
  "✨ Positive Energy Hub",
  "🌸 Calm & Productive Flow",
  "🌿 Mindful Focus Mode",
  "💫 Creative Spark Sanctuary",
  "🌈 Joyful Momentum",
];

/**
 * Generates wholesome, cute, structured feel-good personalized messages with randomized fresh variety
 */
function buildFeelGoodGreeting(
  displayName: string,
  timeGreeting: string,
  dayOfWeek: string,
  weatherInfo: { weatherText: string; icon: string; temp: number; condition: string }
): PersonalizedGreeting {
  const hour = new Date().getHours();
  const smiley = SMILEYS[Math.floor(Math.random() * SMILEYS.length)];
  const greeting = `${timeGreeting}, ${displayName} ${smiley}`;

  if (hour >= 5 && hour < 12) {
    // Morning Vibes
    const morningTaglines = [
      "A fresh day full of endless possibilities. 🌸",
      "Morning sunshine, fresh coffee, and inspired ideas! ☀️",
      "Wake up with determination, go to bed with satisfaction! 🌟",
    ];
    return {
      greeting,
      tagline: morningTaglines[Math.floor(Math.random() * morningTaglines.length)],
      subtitle: `The morning air is fresh (${weatherInfo.temp}°C). Take a sip of coffee, smile, and let's make today wonderful and rewarding.`,
      weatherBadge: weatherInfo.weatherText,
      vibeBadge: "🌸 Fresh Morning Energy",
      aiTip: MINDFUL_TIPS[Math.floor(Math.random() * MINDFUL_TIPS.length)],
      isAiGenerated: true,
      generatedAt: Date.now(),
    };
  } else if (hour >= 12 && hour < 17) {
    // Afternoon Cozy Energy
    const tagline = AFTERNOON_TAGLINES[Math.floor(Math.random() * AFTERNOON_TAGLINES.length)];
    const subtitleFn = AFTERNOON_SUBTITLES[Math.floor(Math.random() * AFTERNOON_SUBTITLES.length)];
    const vibeBadge = VIBE_BADGES[Math.floor(Math.random() * VIBE_BADGES.length)];
    const aiTip = MINDFUL_TIPS[Math.floor(Math.random() * MINDFUL_TIPS.length)];

    return {
      greeting,
      tagline,
      subtitle: subtitleFn(dayOfWeek, weatherInfo.temp),
      weatherBadge: weatherInfo.weatherText,
      vibeBadge,
      aiTip,
      isAiGenerated: true,
      generatedAt: Date.now(),
    };
  } else if (hour >= 17 && hour < 22) {
    // Golden Hour Evening
    const eveningTaglines = [
      "Unwinding into a calm, golden evening. 🌆",
      "The sun is setting on a wonderful and productive day. ✨",
      "Peaceful evening breeze and cozy thoughts. 🌙",
    ];
    return {
      greeting,
      tagline: eveningTaglines[Math.floor(Math.random() * eveningTaglines.length)],
      subtitle: `The sun is setting on a productive ${dayOfWeek} (${weatherInfo.temp}°C). You've accomplished great things today — take time to breathe and relax.`,
      weatherBadge: weatherInfo.weatherText,
      vibeBadge: "🌆 Golden Hour Peace",
      aiTip: MINDFUL_TIPS[Math.floor(Math.random() * MINDFUL_TIPS.length)],
      isAiGenerated: true,
      generatedAt: Date.now(),
    };
  } else {
    // Cozy Night Vibes
    const nightTaglines = [
      "Quiet hours, cozy thoughts, and peaceful vibes. 🌙",
      "Rest well tonight, tomorrow brings fresh magic! ✨",
      "The workspace is peaceful and all is well. 💫",
    ];
    return {
      greeting,
      tagline: nightTaglines[Math.floor(Math.random() * nightTaglines.length)],
      subtitle: `The night is calm (${weatherInfo.temp}°C). Your automated assistants have everything covered while you rest. Sleep well and recharge!`,
      weatherBadge: weatherInfo.weatherText,
      vibeBadge: "🌙 Peaceful Sanctuary",
      aiTip: "Tomorrow is a fresh canvas waiting for your bright ideas. Sweet dreams! 🌟",
      isAiGenerated: true,
      generatedAt: Date.now(),
    };
  }
}

/**
 * Generates a hyper-personalized welcome greeting using AI with structured cute, feel-good vibes.
 */
export async function getHyperPersonalizedGreeting(
  _tenantId?: string,
  _environment?: string,
  displayName: string = 'Naman',
  forceRefresh: boolean = false
): Promise<PersonalizedGreeting> {
  // If not forcing refresh, check cached session
  if (!forceRefresh && typeof sessionStorage !== 'undefined') {
    try {
      const cached = sessionStorage.getItem(`${STORAGE_KEY}_${displayName}`);
      if (cached) {
        const parsed = JSON.parse(cached) as PersonalizedGreeting;
        if (Date.now() - parsed.generatedAt < CACHE_TTL_MS) {
          return parsed;
        }
      }
    } catch {}
  }

  try {
    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[now.getDay()];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeGreeting = getTimeOfDayGreeting();
    
    // Fetch live real-time weather (no-cache)
    const weatherInfo = await getApproximateWeather();

    // Generate guaranteed rich fresh feel-good greeting
    const feelGoodGreeting = buildFeelGoodGreeting(
      displayName,
      timeGreeting,
      dayOfWeek,
      weatherInfo
    );

    // Random seed to instruct LLM to write a distinct unique creative greeting each time
    const seed = Math.floor(Math.random() * 10000);

    const prompt = `You are Marbee's warm, cheerful, and wholesome AI companion. Generate a fresh, unique, cute, and heart-warming personalized welcome greeting for ${displayName} opening their dashboard. (Variation seed: ${seed})

Context:
- Name: ${displayName}
- Time: ${timeStr} (${dayOfWeek}, ${timeGreeting})
- Real-time Weather: ${weatherInfo.weatherText}

RULES:
- Include a cute smiley with a space after ${displayName}, e.g. "${timeGreeting}, ${displayName} 😊" or "${timeGreeting}, ${displayName} ✨"!
- DO NOT talk about campaigns, delivery rates, marketing metrics, conversions, or corporate buzzwords!
- Make tagline, subtitle, and mindful reminder completely fresh, cozy, inspiring, and cheerful!
- Output ONLY valid JSON in this exact structure:
{
  "greeting": "${timeGreeting}, ${displayName} 😊",
  "tagline": "[A fresh cute inspiring phrase with 1 emoji, e.g. 'Keep shining, you are doing amazing today! ✨']",
  "subtitle": "[1-2 fresh cozy, comforting sentences giving good vibes]",
  "weatherBadge": "${weatherInfo.weatherText}",
  "vibeBadge": "[Short cute vibe badge, e.g. '☕ Cozy Afternoon Vibe']",
  "aiTip": "[1 brief mindful reminder or cute quote without quotes]"
}`;

    const res = await executeIntelligentReasoning(prompt);
    
    if (res && res.text) {
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.greeting && parsed.tagline && parsed.subtitle) {
            // Ensure space with smiley after name in greeting
            let finalGreeting = parsed.greeting;
            if (!finalGreeting.includes(' ') || !/[\u{1F300}-\u{1FAFF}]/u.test(finalGreeting)) {
              finalGreeting = `${timeGreeting}, ${displayName} 😊`;
            }

            const finalResult: PersonalizedGreeting = {
              greeting: finalGreeting,
              tagline: parsed.tagline,
              subtitle: parsed.subtitle,
              weatherBadge: parsed.weatherBadge || feelGoodGreeting.weatherBadge,
              vibeBadge: parsed.vibeBadge || feelGoodGreeting.vibeBadge,
              aiTip: parsed.aiTip || feelGoodGreeting.aiTip,
              isAiGenerated: true,
              generatedAt: Date.now(),
            };

            if (typeof sessionStorage !== 'undefined') {
              try {
                sessionStorage.setItem(`${STORAGE_KEY}_${displayName}`, JSON.stringify(finalResult));
              } catch {}
            }

            return finalResult;
          }
        } catch {}
      }
    }

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(`${STORAGE_KEY}_${displayName}`, JSON.stringify(feelGoodGreeting));
      } catch {}
    }

    return feelGoodGreeting;
  } catch (err) {
    console.warn('AI Personalized greeting generation failed, using fallback:', err);
    return getFallbackGreeting(displayName);
  }
}
