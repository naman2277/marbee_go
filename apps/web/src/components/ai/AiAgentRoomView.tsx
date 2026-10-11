import React, { useState, useEffect } from 'react';
import { Sparkles, Headphones, Sun, Moon, Bell, Coffee, Eye, Lightbulb, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CharacterState } from './AiOfficeRoom';

interface AiAgentRoomViewProps {
  onQuickPromptClick: (prompt: string) => void;
  isAiTyping?: boolean;
  characterState?: CharacterState;
  onCharacterStateChange?: (state: CharacterState) => void;
}

export function AiAgentRoomView({
  onQuickPromptClick,
  isAiTyping = false,
  characterState = 'IDLE_WORKING',
  onCharacterStateChange,
}: AiAgentRoomViewProps) {
  const [neonGlow, setNeonGlow] = useState(true);
  const [roomTime, setRoomTime] = useState<'day' | 'night'>('day');
  const [glassesOn, setGlassesOn] = useState(true);
  const [deskLampGlow, setDeskLampGlow] = useState(true);

  // States
  const isSleeping = characterState === 'IDLE_SLEEPING';
  const isDrinking = characterState === 'IDLE_DRINKING';
  const isThinking = characterState === 'THINK' || isAiTyping;
  const isTyping = characterState === 'IDLE_TYPING' || characterState === 'IDLE_WORKING';
  const isExplaining = characterState === 'EXPLAIN';
  const isSuccess = characterState === 'SUCCESS' || characterState === 'EXCITED';

  return (
    <div className="relative flex-1 h-full min-h-[520px] w-full overflow-hidden bg-slate-950 flex items-center justify-center select-none font-sans">
      {/* =========================================================================
          1. ENVIRONMENT & WALL BACKDROP (PURE CSS & SVG VECTOR WORKSPACE)
         ========================================================================= */}
      <div
        className={cn(
          'absolute inset-0 transition-colors duration-700',
          roomTime === 'day'
            ? 'bg-gradient-to-b from-[#2D2A32] via-[#242129] to-[#18161D]'
            : 'bg-gradient-to-b from-[#16141D] via-[#0E0C12] to-[#070609]'
        )}
      >
        {/* Sunbeams from Window on the Left */}
        {roomTime === 'day' && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-10 -left-10 w-[550px] h-[650px] bg-gradient-to-br from-amber-200/15 via-amber-100/5 to-transparent rotate-12 blur-xl" />
            <div className="absolute top-10 left-12 w-[350px] h-[500px] bg-gradient-to-br from-amber-300/10 to-transparent rotate-[18deg] blur-lg" />
          </div>
        )}

        {/* Ambient Room Glows */}
        {neonGlow && (
          <div className="pointer-events-none absolute top-12 left-[18%] w-72 h-72 rounded-full bg-cyan-500/15 blur-3xl animate-pulse" />
        )}
        <div className="pointer-events-none absolute bottom-12 right-[25%] w-80 h-80 rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      {/* SVG Canvas for Room Architecture & Illustrated Furniture */}
      <svg
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        viewBox="0 0 1000 650"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="wallGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#35313A" />
            <stop offset="100%" stopColor="#1E1B24" />
          </linearGradient>
          <linearGradient id="deskWood" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6D4C41" />
            <stop offset="50%" stopColor="#8D6E63" />
            <stop offset="100%" stopColor="#5D4037" />
          </linearGradient>
          <linearGradient id="windowLight" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE082" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#FFD54F" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="screenGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9333EA" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* =========================================================================
            WALL OBJECT 1: WINDOW WITH BLINDS (LEFT SIDE)
           ========================================================================= */}
        <g id="window_blinds">
          {/* Window Frame */}
          <rect x="50" y="40" width="130" height="340" rx="6" fill="#1A1820" stroke="#4A4453" strokeWidth="6" />
          <rect x="58" y="48" width="114" height="324" fill="#90CAF9" fillOpacity={roomTime === 'day' ? '0.45' : '0.1'} />
          {/* Distant City Skyline Silhouette */}
          <path d="M60 320 L75 290 L75 370 L95 270 L115 370 L130 250 L145 370 L170 300 L170 370 Z" fill="#455A64" opacity="0.4" />
          {/* Blind Slats */}
          {[60, 85, 110, 135, 160, 185, 210, 235, 260, 285, 310, 335].map((y) => (
            <line key={y} x1="58" y1={y} x2="172" y2={y} stroke="#D7CCC8" strokeWidth="2.5" opacity="0.85" />
          ))}
          {/* Blind String */}
          <line x1="162" y1="50" x2="162" y2="280" stroke="#BCAAA4" strokeWidth="1.5" />
          <circle cx="162" cy="282" r="3" fill="#8D6E63" />
        </g>

        {/* =========================================================================
            WALL OBJECT 2: NEON SIGN "CRM SUPPORT"
           ========================================================================= */}
        <g id="neon_sign" transform="translate(190, 45)">
          {/* Glowing Headphone Neon Ring */}
          <circle cx="45" cy="45" r="32" stroke={neonGlow ? '#38BDF8' : '#334155'} strokeWidth="4" fill="none" opacity={neonGlow ? '0.9' : '0.4'} />
          {/* Headphone Arch */}
          <path d="M28 48 C28 26, 62 26, 62 48" stroke={neonGlow ? '#67E8F9' : '#475569'} strokeWidth="4.5" strokeLinecap="round" fill="none" />
          {/* Headphone Earcups */}
          <rect x="23" y="44" width="9" height="16" rx="4" fill={neonGlow ? '#06B6D4' : '#334155'} />
          <rect x="58" y="44" width="9" height="16" rx="4" fill={neonGlow ? '#06B6D4' : '#334155'} />
          {/* Mic stem */}
          <path d="M30 56 Q36 68 45 66" stroke={neonGlow ? '#67E8F9' : '#475569'} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <circle cx="47" cy="66" r="2.5" fill={neonGlow ? '#A5F3FC' : '#334155'} />
          {/* Neon Text: "CRM Support" */}
          <text x="45" y="92" textAnchor="middle" fill={neonGlow ? '#E0F2FE' : '#64748B'} fontSize="13" fontWeight="900" fontFamily="sans-serif" letterSpacing="0.5">
            CRM
          </text>
          <text x="45" y="107" textAnchor="middle" fill={neonGlow ? '#38BDF8' : '#475569'} fontSize="11" fontWeight="800" fontFamily="sans-serif" letterSpacing="0.5">
            SUPPORT
          </text>
        </g>

        {/* =========================================================================
            WALL OBJECT 3: WHITEBOARD ("CUSTOMER FIRST")
           ========================================================================= */}
        <g id="whiteboard" transform="translate(370, 35)">
          <rect x="0" y="0" width="130" height="175" rx="6" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="4" />
          <rect x="4" y="4" width="122" height="167" fill="#FFFFFF" />
          {/* Title: Customer First */}
          <text x="65" y="24" textAnchor="middle" fill="#334155" fontSize="10" fontWeight="900" fontFamily="sans-serif">
            Customer First
          </text>
          <line x1="20" y1="28" x2="110" y2="28" stroke="#E2E8F0" strokeWidth="1.5" />
          {/* Checklist on Board */}
          {[
            { t: 'Understand', y: 44 },
            { t: 'Analyze', y: 64 },
            { t: 'Solve', y: 84 },
            { t: 'Delight', y: 104 },
          ].map((item, i) => (
            <g key={i}>
              <path d={`M20 ${item.y - 3} L24 ${item.y + 1} L30 ${item.y - 7}`} stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" fill="none" />
              <text x="35" y={item.y} fill="#475569" fontSize="9" fontWeight="700" fontFamily="sans-serif">
                {item.t}
              </text>
            </g>
          ))}
          {/* Smiley Drawing */}
          <circle cx="65" cy="138" r="14" stroke="#F87171" strokeWidth="1.5" fill="none" strokeDasharray="2,2" />
          <circle cx="60" cy="135" r="1.5" fill="#F87171" />
          <circle cx="70" cy="135" r="1.5" fill="#F87171" />
          <path d="M59 143 Q65 149 71 143" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          {/* Sticky note on whiteboard edge */}
          <g transform="translate(100, 125) rotate(6)">
            <rect x="0" y="0" width="34" height="34" fill="#FEF08A" rx="2" stroke="#FDE047" strokeWidth="0.5" />
            <text x="17" y="14" textAnchor="middle" fill="#854D0E" fontSize="6.5" fontWeight="800" fontFamily="sans-serif">
              You've
            </text>
            <text x="17" y="24" textAnchor="middle" fill="#854D0E" fontSize="6.5" fontWeight="800" fontFamily="sans-serif">
              got this!
            </text>
          </g>
        </g>

        {/* =========================================================================
            WALL OBJECT 4: BOOKSHELF & FIGURINE (RIGHT SIDE)
           ========================================================================= */}
        <g id="bookshelf" transform="translate(515, 20)">
          {/* Outer Frame */}
          <rect x="0" y="0" width="130" height="380" rx="4" fill="#292524" stroke="#44403C" strokeWidth="4" />
          {/* Shelves */}
          <line x1="0" y1="80" x2="130" y2="80" stroke="#57534E" strokeWidth="6" />
          <line x1="0" y1="180" x2="130" y2="180" stroke="#57534E" strokeWidth="6" />
          <line x1="0" y1="280" x2="130" y2="280" stroke="#57534E" strokeWidth="6" />

          {/* Shelf 1 (Top): Figurine & Plant */}
          <g transform="translate(70, 25)">
            {/* Cute Pop Figurine */}
            <rect x="10" y="10" width="18" height="18" rx="4" fill="#FBBF24" />
            <ellipse cx="19" cy="20" rx="7" ry="6" fill="#1E293B" />
            <rect x="14" y="28" width="10" height="16" fill="#3B82F6" rx="2" />
          </g>
          {/* Small Plant on top shelf */}
          <g transform="translate(15, 38)">
            <ellipse cx="14" cy="18" rx="10" ry="12" fill="#22C55E" />
            <ellipse cx="8" cy="24" rx="7" ry="9" fill="#16A34A" />
            <ellipse cx="20" cy="24" rx="7" ry="9" fill="#15803D" />
            <rect x="8" y="28" width="12" height="12" fill="#78350F" rx="2" />
          </g>

          {/* Shelf 2: Framed Quote ("Be the reason someone smiles today") */}
          <g transform="translate(15, 95)">
            <rect x="65" y="10" width="38" height="58" rx="3" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />
            <text x="84" y="28" textAnchor="middle" fill="#92400E" fontSize="5.5" fontWeight="800">
              Be the
            </text>
            <text x="84" y="38" textAnchor="middle" fill="#92400E" fontSize="5.5" fontWeight="800">
              reason
            </text>
            <text x="84" y="48" textAnchor="middle" fill="#92400E" fontSize="5" fontWeight="700">
              someone
            </text>
            <text x="84" y="58" textAnchor="middle" fill="#92400E" fontSize="5.5" fontWeight="800">
              smiles today.
            </text>
            {/* Binder folders */}
            <rect x="10" y="14" width="10" height="56" fill="#3B82F6" rx="2" />
            <rect x="22" y="12" width="10" height="58" fill="#10B981" rx="2" />
            <rect x="34" y="16" width="10" height="54" fill="#F97316" rx="2" />
          </g>

          {/* Shelf 3: Document Binder Folders */}
          <g transform="translate(15, 195)">
            <rect x="15" y="12" width="14" height="64" fill="#0284C7" rx="2" />
            <circle cx="22" cy="30" r="3" fill="#E0F2FE" />
            <text x="22" y="65" textAnchor="middle" fill="#E0F2FE" fontSize="6" fontWeight="800" transform="rotate(-90 22 65)">
              CAMPAIGNS
            </text>

            <rect x="32" y="12" width="14" height="64" fill="#0D9488" rx="2" />
            <circle cx="39" cy="30" r="3" fill="#CCFBF1" />
            <text x="39" y="65" textAnchor="middle" fill="#CCFBF1" fontSize="6" fontWeight="800" transform="rotate(-90 39 65)">
              WORKFLOWS
            </text>

            <rect x="49" y="12" width="14" height="64" fill="#4F46E5" rx="2" />
            <circle cx="56" cy="30" r="3" fill="#EEF2FF" />
            <text x="56" y="65" textAnchor="middle" fill="#EEF2FF" fontSize="6" fontWeight="800" transform="rotate(-90 56 65)">
              ANALYTICS
            </text>
          </g>
        </g>

        {/* Framed Wall Quote (Left Desk Wall): "FOCUS SOLVE DELIVER" */}
        <g id="framed_quote" transform="translate(108, 380)">
          <rect x="0" y="0" width="70" height="110" rx="3" fill="#1E293B" stroke="#D97706" strokeWidth="4" />
          <text x="35" y="42" textAnchor="middle" fill="#F59E0B" fontSize="9" fontWeight="900" fontFamily="sans-serif">
            FOCUS
          </text>
          <text x="35" y="62" textAnchor="middle" fill="#F59E0B" fontSize="9" fontWeight="900" fontFamily="sans-serif">
            SOLVE
          </text>
          <text x="35" y="82" textAnchor="middle" fill="#F59E0B" fontSize="9" fontWeight="900" fontFamily="sans-serif">
            DELIVER
          </text>
        </g>

        {/* Small Desk Plant on Left */}
        <g id="desk_plant" transform="translate(68, 460)">
          <ellipse cx="18" cy="10" rx="14" ry="18" fill="#15803D" />
          <ellipse cx="8" cy="18" rx="10" ry="12" fill="#22C55E" />
          <ellipse cx="28" cy="18" rx="10" ry="12" fill="#16A34A" />
          <rect x="10" y="24" width="16" height="22" fill="#78350F" rx="3" />
        </g>

        {/* =========================================================================
            DESK SURFACE & TEXTURE
           ========================================================================= */}
        <g id="desk_surface">
          {/* Main Wooden Table Top with Depth */}
          <polygon points="40,510 650,510 670,650 20,650" fill="url(#deskWood)" />
          {/* Table Chamfer Bevel Highlight */}
          <polygon points="40,510 650,510 652,518 38,518" fill="#A1887F" opacity="0.6" />
          {/* Desk shadow */}
          <polygon points="20,640 670,640 670,650 20,650" fill="#3E2723" />
        </g>
      </svg>

      {/* =========================================================================
          2. THE ARTICULATED CARTOON SUPPORT EXECUTIVE ("ALEX") - PURE VECTOR SVG
         ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <svg
          viewBox="0 0 1000 650"
          className="w-full h-full object-cover"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* =======================================================================
              CHARACTER: MESH CHAIR BACKREST
             ======================================================================= */}
          <g id="chair_backrest" transform="translate(325, 230)">
            <rect x="0" y="0" width="180" height="250" rx="40" fill="#1E293B" stroke="#0F172A" strokeWidth="8" />
            <rect x="12" y="12" width="156" height="226" rx="32" fill="#0F172A" opacity="0.75" />
            {/* Mesh Texture Lines */}
            {[40, 70, 100, 130, 160, 190].map((y) => (
              <line key={y} x1="20" y1={y} x2="160" y2={y} stroke="#334155" strokeWidth="2" opacity="0.6" />
            ))}
          </g>

          {/* =======================================================================
              CHARACTER: ALEX (HAIR, HEAD, BODY, HOODIE & ARMS)
             ======================================================================= */}
          <g
            id="character_alex"
            className={cn(
              'transition-transform duration-500 origin-bottom',
              isSleeping && 'rotate-[14deg] translate-y-8',
              isThinking && 'rotate-[-3deg]',
              isExplaining && 'translate-x-2',
              isSuccess && 'scale-[1.02] -translate-y-2'
            )}
          >
            {/* Torso & Navy Hoodie */}
            <g id="hoodie_torso">
              {/* Main Navy Hoodie Body */}
              <path
                d="M330 400 Q415 375 500 400 L530 550 L300 550 Z"
                fill="#1E293B"
                stroke="#0F172A"
                strokeWidth="4"
              />
              {/* Hoodie strings */}
              <line x1="395" y1="390" x2="390" y2="445" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" />
              <line x1="435" y1="390" x2="440" y2="445" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" />
              <circle cx="390" cy="447" r="2.5" fill="#94A3B8" />
              <circle cx="440" cy="447" r="2.5" fill="#94A3B8" />

              {/* Headset Logo on Hoodie Left Chest (Matching Reference) */}
              <g transform="translate(450, 415) scale(0.65)">
                <path d="M12 22 C12 10, 32 10, 32 22" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" fill="none" />
                <rect x="8" y="20" width="6" height="10" rx="3" fill="#E2E8F0" />
                <rect x="30" y="20" width="6" height="10" rx="3" fill="#E2E8F0" />
                <path d="M14 26 Q18 34 24 33" stroke="#E2E8F0" strokeWidth="2" fill="none" strokeLinecap="round" />
              </g>

              {/* Left Arm & Shoulder */}
              <path
                d="M330 400 Q260 440 265 520 L315 540 Q310 470 360 440 Z"
                fill="#1E293B"
                stroke="#0F172A"
                strokeWidth="3"
              />
              {/* Right Arm & Shoulder */}
              <path
                d="M500 400 Q570 440 560 520 L510 540 Q520 470 470 440 Z"
                fill="#1E293B"
                stroke="#0F172A"
                strokeWidth="3"
              />
            </g>

            {/* Neck & Face Collar */}
            <path d="M390 350 L440 350 L430 395 L400 395 Z" fill="#F5D0B5" />

            {/* Head (Alex's friendly facial structure) */}
            <g id="face_and_features">
              {/* Hair Back */}
              <path
                d="M360 270 Q415 170 470 270 Q485 320 460 360 Q415 375 370 360 Q345 320 360 270 Z"
                fill="#18181B"
              />

              {/* Head / Jaw Oval */}
              <ellipse cx="415" cy="295" rx="46" ry="52" fill="#F5D0B5" />

              {/* Cheeks subtle warm blush */}
              <circle cx="385" cy="310" r="7" fill="#F87171" opacity="0.3" />
              <circle cx="445" cy="310" r="7" fill="#F87171" opacity="0.3" />

              {/* Eyes */}
              {isSleeping ? (
                /* Sleeping Eyes */
                <g stroke="#27272A" strokeWidth="3" strokeLinecap="round">
                  <path d="M385 295 Q395 303 405 295" />
                  <path d="M425 295 Q435 303 445 295" />
                </g>
              ) : (
                /* Expressive Anime/Cartoon Alert Eyes */
                <g>
                  {/* Eyebrows */}
                  <path
                    d={isThinking ? 'M380 278 Q395 272 408 280' : 'M380 280 Q395 274 408 280'}
                    stroke="#18181B"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <path
                    d={isThinking ? 'M422 280 Q435 272 450 278' : 'M422 280 Q435 274 450 280'}
                    stroke="#18181B"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Eyeballs */}
                  <ellipse cx="395" cy="295" rx="8" ry="9" fill="#18181B" />
                  <ellipse cx="435" cy="295" rx="8" ry="9" fill="#18181B" />
                  {/* Warm eye gleam reflections */}
                  <circle cx="392" cy="292" r="3" fill="#FFFFFF" />
                  <circle cx="432" cy="292" r="3" fill="#FFFFFF" />
                  <circle cx="397" cy="297" r="1.5" fill="#FFFFFF" />
                  <circle cx="437" cy="297" r="1.5" fill="#FFFFFF" />
                </g>
              )}

              {/* Nose */}
              <path d="M413 298 Q415 308 419 307" stroke="#DCA281" strokeWidth="2.5" strokeLinecap="round" fill="none" />

              {/* Smile / Mouth */}
              {isSleeping ? (
                <ellipse cx="415" cy="322" rx="3" ry="4" fill="#E11D48" opacity="0.6" />
              ) : isSuccess || isExplaining ? (
                /* Big Genuine Smile with white teeth */
                <g>
                  <path d="M398 318 Q415 334 432 318 Z" fill="#991B1B" />
                  <path d="M401 319 Q415 325 429 319" stroke="#FFFFFF" strokeWidth="3" fill="#FFFFFF" />
                </g>
              ) : (
                /* Warm friendly open smile */
                <path d="M400 320 Q415 330 430 320" stroke="#991B1B" strokeWidth="3" strokeLinecap="round" fill="none" />
              )}

              {/* Thick Black Glasses / Spectacles (Iconic to Reference Image) */}
              {glassesOn && (
                <g stroke="#0F172A" strokeWidth="3.5" fill="none">
                  {/* Left Frame */}
                  <rect x="376" y="282" width="34" height="26" rx="7" fill="#38BDF8" fillOpacity="0.12" stroke="#09090B" strokeWidth="4" />
                  {/* Right Frame */}
                  <rect x="420" y="282" width="34" height="26" rx="7" fill="#38BDF8" fillOpacity="0.12" stroke="#09090B" strokeWidth="4" />
                  {/* Center Bridge */}
                  <path d="M410 292 L420 292" stroke="#09090B" strokeWidth="4.5" />
                  {/* Frame temples */}
                  <path d="M376 290 L362 287" stroke="#09090B" strokeWidth="3.5" />
                  <path d="M454 290 L468 287" stroke="#09090B" strokeWidth="3.5" />
                </g>
              )}

              {/* Stylish Wavy Black Front Hair (Matching the character) */}
              <path
                d="M365 260 Q380 220 420 225 Q465 215 470 255 Q450 250 435 265 Q405 240 380 268 Q368 270 365 260 Z"
                fill="#09090B"
              />
              <path d="M420 225 Q445 235 440 255" stroke="#27272A" strokeWidth="2" fill="none" />
            </g>
          </g>

          {/* =======================================================================
              DESK OBJECT 1: OPEN SPIRAL NOTEBOOK WITH PEN
             ======================================================================= */}
          <g id="notebook_and_pen" transform="translate(360, 525)">
            {/* Notebook Base */}
            <polygon points="0,0 120,-15 130,70 10,85" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
            {/* Spiral binding rings */}
            {[0, 10, 20, 30, 40, 50, 60, 70].map((y, i) => (
              <ellipse key={i} cx="5" cy={y} rx="3" ry="1.5" fill="#475569" />
            ))}
            {/* Scribbled notes lines */}
            <line x1="20" y1="15" x2="105" y2="5" stroke="#94A3B8" strokeWidth="1" strokeDasharray="4,2" />
            <line x1="20" y1="28" x2="100" y2="18" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3,2" />
            <line x1="20" y1="41" x2="70" y2="34" stroke="#94A3B8" strokeWidth="1" strokeDasharray="4,2" />
            {/* Yellow Sticky Note on Notepad */}
            <polygon points="75,25 115,20 120,55 80,60" fill="#FEF08A" stroke="#FDE047" strokeWidth="0.5" />
            <line x1="82" y1="35" x2="110" y2="30" stroke="#CA8A04" strokeWidth="1" />
            <line x1="82" y1="45" x2="105" y2="42" stroke="#CA8A04" strokeWidth="1" />
            {/* Black Pen */}
            <polygon points="125,-10 132,-20 135,-18 128,-8" fill="#1E293B" />
            <line x1="125" y1="-10" x2="140" y2="25" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
          </g>

          {/* =======================================================================
              DESK OBJECT 2: LAPTOP WITH HEADSET EMBLEM (ALEX'S WORK COMPUTER)
             ======================================================================= */}
          <g id="laptop_workstation" transform="translate(130, 420)">
            {/* Laptop Back Screen Angle */}
            <polygon points="20,80 180,65 190,195 30,210" fill="#94A3B8" stroke="#64748B" strokeWidth="3" />
            {/* Inner Screen Glow */}
            <polygon points="28,88 172,74 182,188 38,202" fill="url(#screenGlow)" />
            {/* Headphone Logo on Laptop Lid */}
            <g transform="translate(100, 130) scale(0.7)">
              <circle cx="15" cy="15" r="14" fill="#0F172A" opacity="0.8" />
              <path d="M8 17 C8 8, 22 8, 22 17" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" fill="none" />
              <rect x="5" y="15" width="4" height="7" rx="2" fill="#FFFFFF" />
              <rect x="21" y="15" width="4" height="7" rx="2" fill="#FFFFFF" />
            </g>
            {/* Laptop Base / Keyboard */}
            <polygon points="10,205 195,190 225,225 35,240" fill="#475569" stroke="#334155" strokeWidth="2" />
          </g>

          {/* =======================================================================
              DESK OBJECT 3: COFFEE MUG WITH HEADSET LOGO
             ======================================================================= */}
          <g id="coffee_mug" transform="translate(480, 520)">
            {/* Mug Body */}
            <rect x="0" y="0" width="44" height="52" rx="6" fill="#0F172A" stroke="#334155" strokeWidth="2" />
            {/* Mug Handle */}
            <path d="M44 12 Q58 26 44 40" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" fill="none" />
            {/* Logo on Mug */}
            <g transform="translate(14, 18) scale(0.6)">
              <path d="M8 17 C8 8, 22 8, 22 17" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" fill="none" />
              <rect x="5" y="15" width="4" height="7" rx="2" fill="#E2E8F0" />
              <rect x="21" y="15" width="4" height="7" rx="2" fill="#E2E8F0" />
              <path d="M9 19 Q12 25 17 24" stroke="#E2E8F0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </g>
          </g>
        </svg>
      </div>

      {/* =========================================================================
          3. INTERACTIVE OVERLAYS & CONTROLS
         ========================================================================= */}

      {/* Top Room Utility Controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRoomTime(roomTime === 'day' ? 'night' : 'day')}
          className="rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 p-2 border border-slate-700/80 backdrop-blur-md shadow-lg transition"
          title="Toggle Day / Night Sunlight"
        >
          {roomTime === 'day' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
        </button>

        <button
          type="button"
          onClick={() => setNeonGlow(!neonGlow)}
          className={cn(
            'rounded-xl p-2 border backdrop-blur-md shadow-lg transition text-xs font-bold flex items-center gap-1.5',
            neonGlow
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              : 'bg-slate-900/80 text-slate-400 border-slate-700/80'
          )}
          title="Toggle CRM Support Neon Light"
        >
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Neon</span>
        </button>

        <button
          type="button"
          onClick={() => setGlassesOn(!glassesOn)}
          className={cn(
            'rounded-xl p-2 border backdrop-blur-md shadow-lg transition text-xs font-bold flex items-center gap-1.5',
            glassesOn
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
              : 'bg-slate-900/80 text-slate-400 border-slate-700/80'
          )}
          title="Toggle Spectacles"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Floating Interactive Desk Plaque: "How can I help you today?" (Left-Bottom) */}
      <div className="absolute bottom-6 left-8 z-20">
        <button
          type="button"
          onClick={() => onQuickPromptClick("Why is my campaign not sending?")}
          className="group relative flex items-center gap-3 rounded-2xl bg-slate-900/95 hover:bg-slate-900 text-white px-4 py-3 shadow-2xl border-2 border-slate-700 hover:border-purple-500 backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-2xs group-hover:text-purple-300">
            <Headphones className="h-4 w-4 stroke-[2.5]" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight text-white group-hover:text-purple-300 transition">
                How can I help you today?
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium block">Click to start troubleshooting</span>
          </div>
        </button>
      </div>

      {/* Interactive Coffee Mug Steam (Rising CSS Animation) */}
      <div className="absolute bottom-[20%] left-[49%] pointer-events-none z-20">
        <div className="flex gap-1 opacity-60 animate-bounce">
          <div className="h-4 w-1 rounded-full bg-white/70 blur-[0.5px]" />
          <div className="h-5 w-1 rounded-full bg-white/70 blur-[0.5px] delay-150" />
        </div>
      </div>

      {/* Live AI Status Notification Banner when processing */}
      {isAiTyping && (
        <div className="absolute top-5 left-1/3 z-20 flex items-center gap-2 rounded-2xl bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl border border-purple-500/40 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
          <Sparkles className="h-4 w-4 text-purple-400 animate-spin" />
          <span>Alex is checking your campaign settings & worker traces…</span>
        </div>
      )}
    </div>
  );
}
