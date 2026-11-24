import { useState, useEffect } from 'react';
import { Sparkles, Moon, Sun, Volume2, VolumeX, Eye, MessageSquare, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CharacterState =
  | 'IDLE_SLEEPING'
  | 'IDLE_WORKING'
  | 'IDLE_PHONE'
  | 'IDLE_DRINKING'
  | 'IDLE_READING'
  | 'IDLE_TYPING'
  | 'IDLE_THINKING'
  | 'NOTIFICATION'
  | 'WAKE_UP'
  | 'STAND'
  | 'WALK_FORWARD'
  | 'SIT'
  | 'GREET'
  | 'LISTEN'
  | 'THINK'
  | 'EXPLAIN'
  | 'CONFUSED'
  | 'EXCITED'
  | 'SUCCESS'
  | 'GOODBYE'
  | 'RETURN_TO_DESK';

interface AiOfficeRoomProps {
  characterState: CharacterState;
  onCharacterStateChange?: (state: CharacterState) => void;
  isAiProcessing?: boolean;
  aiStatusMessage?: string;
  isUserTyping?: boolean;
}

export function AiOfficeRoom({
  characterState,
  onCharacterStateChange,
  isAiProcessing = false,
  aiStatusMessage,
  isUserTyping = false,
}: AiOfficeRoomProps) {
  const [lampOn, setLampOn] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [characterName] = useState('Maya');
  const [spectaclesOn, setSpectaclesOn] = useState(true);
  const [ambientTheme, setAmbientTheme] = useState<'day' | 'evening'>('day');

  // Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setClockSeconds((s) => (s + 1) % 60);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute scale and position for foreground / background transition
  const isForeground = [
    'WALK_FORWARD',
    'SIT',
    'GREET',
    'LISTEN',
    'THINK',
    'EXPLAIN',
    'CONFUSED',
    'EXCITED',
    'SUCCESS',
  ].includes(characterState);

  const isStanding = ['STAND', 'WALK_FORWARD', 'RETURN_TO_DESK'].includes(characterState);
  const isThinking = characterState === 'THINK' || characterState === 'IDLE_THINKING' || (isAiProcessing && isForeground);
  const isSleeping = characterState === 'IDLE_SLEEPING';
  const isDrinking = characterState === 'IDLE_DRINKING';
  const isExplaining = characterState === 'EXPLAIN';
  const isSuccess = characterState === 'SUCCESS' || characterState === 'EXCITED';

  return (
    <div className="relative flex flex-col h-full w-full select-none overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 p-4 shadow-xl">
      {/* 1. ROOM HEADER CONTROLS */}
      <div className="relative z-30 flex items-center justify-between border-b border-white/10 pb-3 text-white">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight text-white">{characterName}</span>
              <span className="rounded-full bg-brand-500/20 px-2 py-0.2 text-[9px] font-bold text-brand-300 border border-brand-500/30">
                AI CRM Specialist
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {characterState === 'IDLE_SLEEPING' && '😴 Power napping at desk'}
              {characterState === 'IDLE_WORKING' && '💻 Reviewing system metrics'}
              {characterState === 'IDLE_PHONE' && '📱 Checking CRM alerts'}
              {characterState === 'IDLE_DRINKING' && '☕ Coffee break'}
              {characterState === 'IDLE_READING' && '📖 Studying API documentation'}
              {characterState === 'IDLE_TYPING' && '⚡ Optimizing SQL queries'}
              {characterState === 'NOTIFICATION' && '🔔 Noticed incoming question!'}
              {characterState === 'WAKE_UP' && '👀 Waking up & adjusting glasses'}
              {characterState === 'STAND' && '🚶 Standing up from desk'}
              {characterState === 'WALK_FORWARD' && '🏃 Walking over to your desk...'}
              {characterState === 'SIT' && '👋 Ready at support desk'}
              {characterState === 'GREET' && '👋 Greeting you'}
              {characterState === 'LISTEN' && '👂 Listening to your query...'}
              {characterState === 'THINK' && '🧠 Analyzing CRM architecture...'}
              {characterState === 'EXPLAIN' && '💡 Explaining recommended solution'}
              {characterState === 'CONFUSED' && '🤔 Investigating unusual log error'}
              {characterState === 'SUCCESS' && '🎉 Issue resolved!'}
            </p>
          </div>
        </div>

        {/* Room Toggles */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <button
            type="button"
            onClick={() => setLampOn(!lampOn)}
            className={cn(
              'rounded-xl p-1.5 transition',
              lampOn ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/5 hover:bg-white/10 text-slate-400'
            )}
            title="Toggle Desk Lamp"
          >
            <Sun className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setAmbientTheme(ambientTheme === 'day' ? 'evening' : 'day')}
            className="rounded-xl bg-white/5 p-1.5 hover:bg-white/10 text-slate-400 transition"
            title="Toggle Room Ambiance"
          >
            <Moon className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setSpectaclesOn(!spectaclesOn)}
            className={cn(
              'rounded-xl p-1.5 transition',
              spectaclesOn ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-slate-400'
            )}
            title="Toggle Spectacles"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="rounded-xl bg-white/5 p-1.5 hover:bg-white/10 text-slate-400 transition"
            title="Toggle Room Sounds"
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-emerald-400" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. VIRTUAL 3D/2D OFFICE ROOM STAGE */}
      <div className="relative flex-1 w-full min-h-[320px] flex items-center justify-center overflow-hidden">
        {/* Wall Background & Ambient Gradients */}
        <div
          className={cn(
            'absolute inset-0 transition-colors duration-700',
            ambientTheme === 'day'
              ? 'bg-gradient-to-b from-[#1E293B] via-[#0F172A] to-[#020617]'
              : 'bg-gradient-to-b from-[#111827] via-[#090D16] to-[#030712]'
          )}
        />

        {/* Room Lighting Lamp Glow */}
        {lampOn && (
          <div className="pointer-events-none absolute -top-12 left-1/4 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl animate-pulse" />
        )}
        <div className="pointer-events-none absolute -bottom-10 right-1/4 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />

        {/* Wall Hanging 1: Animated Wall Clock */}
        <div className="absolute top-4 left-8 flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-800/80 shadow-lg shadow-black/40 backdrop-blur-xs">
          <div className="relative h-10 w-10 rounded-full border border-slate-600 bg-slate-900/90 flex items-center justify-center">
            {/* Clock center pin */}
            <div className="h-1.5 w-1.5 rounded-full bg-rose-500 z-10" />
            {/* Clock hands */}
            <div
              className="absolute h-3 w-0.5 bg-slate-300 origin-bottom transition-transform"
              style={{ transform: `rotate(${(clockSeconds / 60) * 360}deg)` }}
            />
            <div
              className="absolute h-2 w-1 bg-amber-400 origin-bottom"
              style={{ transform: 'rotate(120deg)' }}
            />
          </div>
        </div>

        {/* Wall Hanging 2: Live CRM Analytics Monitor */}
        <div className="absolute top-3 right-8 w-36 rounded-xl border border-slate-700 bg-slate-900/90 p-2 shadow-lg backdrop-blur-xs hidden sm:block">
          <div className="flex items-center justify-between text-[8px] font-extrabold text-slate-400 uppercase">
            <span>Marbee Live Pulse</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div className="mt-1 flex items-end gap-1 h-6">
            <div className="w-2 bg-emerald-500 rounded-xs h-3 animate-pulse" />
            <div className="w-2 bg-emerald-400 rounded-xs h-5" />
            <div className="w-2 bg-indigo-500 rounded-xs h-4" />
            <div className="w-2 bg-brand-500 rounded-xs h-6" />
            <div className="w-2 bg-teal-400 rounded-xs h-2" />
            <div className="w-2 bg-amber-400 rounded-xs h-5" />
            <div className="w-2 bg-emerald-400 rounded-xs h-4" />
          </div>
          <div className="mt-1 flex justify-between text-[8px] text-slate-400">
            <span>Delivery: 99.8%</span>
            <span className="text-emerald-400 font-bold">2.4k/s</span>
          </div>
        </div>

        {/* Wall Hanging 3: Sticky Notes Board */}
        <div className="absolute top-20 left-6 hidden lg:flex flex-col gap-1.5 opacity-80">
          <div className="rounded-lg bg-yellow-200/90 text-yellow-900 p-1.5 text-[8px] font-bold shadow-xs rotate-[-3deg] w-24">
            📌 Check Duplicate SQL Join
          </div>
          <div className="rounded-lg bg-rose-200/90 text-rose-900 p-1.5 text-[8px] font-bold shadow-xs rotate-[2deg] w-24">
            🚀 Launch Push Sprint v2
          </div>
        </div>

        {/* Room Floor Ground Plane with Perspective */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 via-slate-900/90 to-transparent border-t border-slate-800/40" />

        {/* =========================================================================
            BACKGROUND SUPPORT DESK (Where character works when idle)
           ========================================================================= */}
        <div
          className={cn(
            'absolute bottom-10 left-1/2 -translate-x-1/2 w-[340px] transition-all duration-700 flex flex-col items-center',
            isForeground ? 'opacity-40 scale-90 translate-y-3 blur-[1px]' : 'opacity-100 scale-100'
          )}
        >
          {/* Desk Top */}
          <div className="relative w-full h-8 rounded-2xl bg-gradient-to-r from-[#3E2723] via-[#4E342E] to-[#2E1C18] border-t-2 border-amber-800/40 shadow-2xl flex items-center justify-between px-6">
            {/* Water Bottle & Coffee Mug */}
            <div className="flex items-center gap-2">
              <div
                className="relative flex h-6 w-3 rounded-full bg-cyan-400/40 border border-cyan-300/60 shadow-xs cursor-pointer hover:scale-110 transition"
                title="Water Bottle"
              >
                <div className="absolute bottom-0 inset-x-0 h-4 bg-cyan-400/80 rounded-b-full" />
              </div>
              <div
                className="relative flex h-4.5 w-4.5 rounded-md bg-amber-700/80 border border-amber-500 shadow-xs cursor-pointer hover:scale-110 transition"
                title="Coffee Mug"
              >
                {/* Steam */}
                <div className="absolute -top-3 left-1 flex gap-0.5 opacity-60 animate-bounce">
                  <div className="h-2 w-0.5 rounded-full bg-white blur-[0.5px]" />
                  <div className="h-2.5 w-0.5 rounded-full bg-white blur-[0.5px] delay-100" />
                </div>
              </div>
            </div>

            {/* Glowing Laptop */}
            <div className="relative flex flex-col items-center cursor-pointer hover:scale-105 transition">
              {/* Laptop Screen */}
              <div className="relative h-10 w-16 rounded-t-lg bg-slate-900 border-2 border-slate-600 shadow-md flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/30 via-brand-500/20 to-teal-500/20 animate-pulse" />
                <span className="text-[7px] font-black text-white/90">Marbee OS</span>
              </div>
              {/* Laptop Keyboard base */}
              <div className="h-1.5 w-20 rounded-b-md bg-slate-700 shadow-xs" />
            </div>

            {/* Desk Plant */}
            <div className="flex flex-col items-center">
              <div className="flex gap-1 animate-pulse">
                <div className="h-3 w-1.5 rounded-full bg-emerald-500 rotate-[-20deg]" />
                <div className="h-4 w-1.5 rounded-full bg-emerald-400" />
                <div className="h-3 w-1.5 rounded-full bg-emerald-500 rotate-[20deg]" />
              </div>
              <div className="h-3.5 w-4 rounded-b-md bg-amber-900/90 border border-amber-800" />
            </div>
          </div>

          {/* Desk Legs */}
          <div className="w-full flex justify-between px-8">
            <div className="w-2.5 h-16 bg-slate-800 rounded-b-sm border-l border-slate-700" />
            <div className="w-2.5 h-16 bg-slate-800 rounded-b-sm border-r border-slate-700" />
          </div>
        </div>

        {/* =========================================================================
            THE CHARACTER: MAYA (Vector SVG Animated Body & Facial Expressions)
           ========================================================================= */}
        <div
          className={cn(
            'absolute transition-all duration-700 ease-out flex flex-col items-center cursor-pointer',
            isForeground
              ? 'bottom-4 left-1/2 -translate-x-1/2 scale-125 z-20'
              : 'bottom-16 left-1/2 -translate-x-1/2 scale-100 z-10'
          )}
          onClick={() => {
            if (isSleeping) {
              onCharacterStateChange?.('WAKE_UP');
            } else if (!isForeground) {
              onCharacterStateChange?.('WALK_FORWARD');
            }
          }}
        >
          {/* Sleeping "Z Z Z" floating animation */}
          {isSleeping && (
            <div className="absolute -top-8 right-0 flex flex-col items-center animate-bounce text-indigo-300 font-black text-xs">
              <span className="text-[10px] opacity-70">z</span>
              <span className="text-xs opacity-90">Z</span>
              <span className="text-sm">Z</span>
            </div>
          )}

          {/* Notification Ping Badge when message received */}
          {characterState === 'NOTIFICATION' && (
            <div className="absolute -top-10 flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-black text-white shadow-xl animate-bounce">
              <Bell className="h-3 w-3 animate-ping" />
              <span>New Message!</span>
            </div>
          )}

          {/* Thinking Bubble */}
          {isThinking && (
            <div className="absolute -top-12 flex items-center gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-[10px] font-extrabold text-slate-800 shadow-2xl border border-slate-200 animate-pulse">
              <Sparkles className="h-3.5 w-3.5 text-brand-600 animate-spin" />
              <span>{aiStatusMessage || 'Analyzing solution…'}</span>
            </div>
          )}

          {/* Success Bubble */}
          {isSuccess && (
            <div className="absolute -top-10 flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white shadow-2xl animate-bounce">
              <span>🎉 Got it solved!</span>
            </div>
          )}

          {/* Character SVG Body */}
          <div
            className={cn(
              'relative transition-transform duration-300',
              isSleeping && 'rotate-[25deg] translate-y-3',
              isThinking && 'rotate-[-4deg]',
              isExplaining && 'translate-x-1',
              isUserTyping && 'animate-pulse'
            )}
          >
            <svg
              width="130"
              height="180"
              viewBox="0 0 130 180"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-2xl"
            >
              {/* Hair Back */}
              <path
                d="M35 55 C25 20, 105 20, 95 55 C100 80, 95 105, 90 115 C85 95, 80 80, 75 75 C60 70, 45 75, 40 115 C35 105, 30 80, 35 55 Z"
                fill="#2C1810"
              />

              {/* Head / Face */}
              <ellipse cx="65" cy="55" rx="26" ry="28" fill="#FBD3B6" />

              {/* Cheeks blush */}
              <circle cx="48" cy="62" r="4" fill="#F87171" opacity="0.4" />
              <circle cx="82" cy="62" r="4" fill="#F87171" opacity="0.4" />

              {/* Eyes */}
              {isSleeping ? (
                /* Sleeping Eyes (Closed curve) */
                <g stroke="#374151" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M47 54 Q53 60 59 54" />
                  <path d="M71 54 Q77 60 83 54" />
                </g>
              ) : (
                /* Open Alert / Thinking Eyes */
                <g>
                  <ellipse cx="53" cy="53" rx="4.5" ry="5.5" fill="#1E293B" />
                  <ellipse cx="77" cy="53" rx="4.5" ry="5.5" fill="#1E293B" />
                  {/* Eye Highlights */}
                  <circle cx="51.5" cy="51" r="1.5" fill="#FFFFFF" />
                  <circle cx="75.5" cy="51" r="1.5" fill="#FFFFFF" />
                  {/* Eyebrows */}
                  <path
                    d={isThinking ? 'M47 44 Q53 40 59 45' : 'M47 45 Q53 42 59 45'}
                    stroke="#2C1810"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d={isThinking ? 'M71 45 Q77 40 83 44' : 'M71 45 Q77 42 83 45'}
                    stroke="#2C1810"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </g>
              )}

              {/* Nose */}
              <path d="M64 56 Q65 60 67 60" stroke="#E0A985" strokeWidth="2" strokeLinecap="round" />

              {/* Mouth */}
              {isSleeping ? (
                <ellipse cx="65" cy="67" rx="2" ry="2.5" fill="#E11D48" opacity="0.7" />
              ) : isSuccess || isExplaining ? (
                /* Big Smile */
                <path d="M56 65 Q65 74 74 65" stroke="#E11D48" strokeWidth="2.5" fill="#FFF" strokeLinecap="round" />
              ) : (
                /* Gentle friendly smile */
                <path d="M58 66 Q65 70 72 66" stroke="#991B1B" strokeWidth="2" strokeLinecap="round" />
              )}

              {/* Spectacles / Glasses */}
              {spectaclesOn && (
                <g stroke="#D97706" strokeWidth="2" fill="none">
                  {/* Left lens */}
                  <rect x="43" y="46" width="18" height="15" rx="5" fill="#38BDF8" fillOpacity="0.15" />
                  {/* Right lens */}
                  <rect x="69" y="46" width="18" height="15" rx="5" fill="#38BDF8" fillOpacity="0.15" />
                  {/* Bridge */}
                  <path d="M61 52 L69 52" />
                  {/* Side stems */}
                  <path d="M43 51 L36 49" />
                  <path d="M87 51 L94 49" />
                </g>
              )}

              {/* Front Hair Bangs */}
              <path
                d="M40 38 Q65 24 90 38 Q82 48 78 45 Q65 32 52 45 Q48 48 40 38 Z"
                fill="#2C1810"
              />

              {/* Neck */}
              <rect x="58" y="78" width="14" height="10" fill="#FBD3B6" />

              {/* Collar Shirt & Blazer */}
              <path d="M40 86 L65 110 L90 86 L100 140 L30 140 Z" fill="#800F2F" />
              {/* Inner White Blouse Collar */}
              <polygon points="56,86 65,102 74,86 65,88" fill="#FFFFFF" />
              <polygon points="65,92 68,125 62,125" fill="#F43F5E" />

              {/* Arms */}
              {isDrinking ? (
                /* Arm holding mug to mouth */
                <path d="M40 95 Q30 110 50 115 Q65 115 65 75" stroke="#800F2F" strokeWidth="12" strokeLinecap="round" fill="none" />
              ) : isThinking ? (
                /* Hand on Chin */
                <g>
                  <path d="M85 95 Q100 120 75 80" stroke="#800F2F" strokeWidth="11" strokeLinecap="round" fill="none" />
                  <circle cx="72" cy="74" r="5" fill="#FBD3B6" />
                </g>
              ) : isExplaining ? (
                /* Pointing / Explaining Gesture */
                <g>
                  <path d="M85 95 Q105 105 115 90" stroke="#800F2F" strokeWidth="11" strokeLinecap="round" fill="none" />
                  <circle cx="116" cy="88" r="5" fill="#FBD3B6" />
                </g>
              ) : (
                /* Resting / Typing Hands */
                <g>
                  <path d="M38 95 Q25 125 45 135" stroke="#800F2F" strokeWidth="11" strokeLinecap="round" fill="none" />
                  <path d="M92 95 Q105 125 85 135" stroke="#800F2F" strokeWidth="11" strokeLinecap="round" fill="none" />
                  <circle cx="45" cy="135" r="5" fill="#FBD3B6" />
                  <circle cx="85" cy="135" r="5" fill="#FBD3B6" />
                </g>
              )}

              {/* Legs / Chair Support */}
              {isStanding ? (
                /* Standing legs */
                <g stroke="#1E293B" strokeWidth="12" strokeLinecap="round">
                  <path d="M52 140 L50 178" />
                  <path d="M78 140 L80 178" />
                </g>
              ) : (
                /* Seated posture */
                <g>
                  {/* Chair backrest */}
                  <rect x="25" y="80" width="80" height="60" rx="10" fill="#0F172A" fillOpacity="0.7" />
                  <path d="M48 140 Q40 165 52 175" stroke="#1E293B" strokeWidth="10" strokeLinecap="round" fill="none" />
                  <path d="M82 140 Q90 165 78 175" stroke="#1E293B" strokeWidth="10" strokeLinecap="round" fill="none" />
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* =========================================================================
            FOREGROUND SUPPORT DESK (When character sits close to user)
           ========================================================================= */}
        {isForeground && (
          <div className="absolute bottom-0 inset-x-8 h-8 rounded-t-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 border-t-2 border-brand-500/40 shadow-2xl flex items-center justify-between px-6 z-25 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-bold text-slate-300">Active Support Session</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-brand-300 font-extrabold">
              <Sparkles className="h-3 w-3" />
              <span>CRM Copilot Ready</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. ROOM FOOTER QUICK ACTIONS */}
      <div className="relative z-30 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400">Activity:</span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
            {characterState.replace('IDLE_', '').replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!isForeground ? (
            <button
              type="button"
              onClick={() => onCharacterStateChange?.('WALK_FORWARD')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-black text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 active:scale-95 transition"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Call {characterName} to Desk
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onCharacterStateChange?.('RETURN_TO_DESK')}
              className="rounded-xl bg-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-white/20 transition"
            >
              Back to Desk
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
