import React from 'react';
import { Bot, Sparkles, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AiAgentTab = 'copilot' | 'chats' | 'settings';

export type BuddyAgent = {
  id: string;
  name: string;
  indicName: string;
  role: string;
  gender: 'female' | 'male';
  status: 'online' | 'offline';
  voiceLabel: string;
  voiceAdapterId?: string;
  voiceId?: string;
  voiceProvider?: 'gemini' | 'google' | 'elevenlabs' | 'runwayml' | 'heygen' | 'tavus' | 'did' | 'vapi' | 'browser';
  imageUrl: string;
  greeting: string;
  description?: string;
  specialties?: string[];
};

// Aliases for backwards compatibility
export type AstraAgent = BuddyAgent;

export const BUDDY_AGENTS: BuddyAgent[] = [
  {
    id: 'agent_aanya',
    name: 'Aanya Sharma',
    indicName: 'आन्या शर्मा',
    role: 'CRM Operations & Growth',
    gender: 'female',
    status: 'online',
    voiceLabel: 'Gemini Aoede / Neerja (Female Warm)',
    voiceAdapterId: 'gemini_aoede',
    voiceProvider: 'gemini',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop',
    greeting: "Hi there! I'm Aanya. How can I help you today? Whether you're setting up a new campaign, troubleshooting deliverability, or analyzing audience cohorts, I'm right here with you.",
    description: 'Specializes in CRM growth, lifecycle campaigns, cart recovery, and customer RFM tier analytics.',
    specialties: ['Campaign Strategy', 'Cart Recovery', 'RFM Segmentation', 'Growth Tactics'],
  },
  {
    id: 'agent_dev',
    name: 'Dev Malhotra',
    indicName: 'देव मल्होत्रा',
    role: 'Data & Solutions Architect',
    gender: 'male',
    status: 'online',
    voiceLabel: 'Gemini Puck / Prabhat (Male Consultative)',
    voiceAdapterId: 'gemini_puck',
    voiceProvider: 'gemini',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop',
    greeting: "Hey! Dev here. Ready to optimize your PostgreSQL schemas, write complex targeting SQL queries, or configure real-time trigger pipelines whenever you are.",
    description: 'Expert in PostgreSQL database schemas, complex SQL targeting queries, ETL connectors, and real-time triggers.',
    specialties: ['PostgreSQL & SQL', 'Data Schemas', 'Audience Queries', 'Event Pipelines'],
  },
  {
    id: 'agent_pooja',
    name: 'Pooja Verma',
    indicName: 'पूजा वर्मा',
    role: 'Omnichannel & Customer Experience',
    gender: 'female',
    status: 'online',
    voiceLabel: 'Gemini Kore / Rachel (Female Expressive)',
    voiceAdapterId: 'gemini_kore',
    voiceProvider: 'gemini',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop',
    greeting: "Hello! I'm Pooja. Let's design engaging customer journeys, WhatsApp message templates, and automated win-back workflows together.",
    description: 'Focuses on visual omnichannel customer journeys, WhatsApp interactive messages, Web Push, and SMS copy.',
    specialties: ['Visual Journeys', 'WhatsApp & RCS', 'Web Push Copy', 'Automation Flow'],
  },
  {
    id: 'agent_rohan',
    name: 'Rohan Deshmukh',
    indicName: 'रोहन देशमुख',
    role: 'Infrastructure & Deliverability',
    gender: 'male',
    status: 'offline',
    voiceLabel: 'Gemini Fenrir / David (Male Technical)',
    voiceAdapterId: 'gemini_fenrir',
    voiceProvider: 'gemini',
    imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=600&auto=format&fit=crop',
    greeting: "Rohan is currently offline during scheduled system maintenance.",
    description: 'Infrastructure engineer for SMTP relays, VAPID key verification, FCM push token pruning, and delivery bounce rates.',
    specialties: ['SMTP Relays', 'VAPID & FCM', 'Deliverability', 'DNS Records'],
  },
];

export const ASTRA_AGENTS = BUDDY_AGENTS;

interface AiAgentSidebarProps {
  activeTab: AiAgentTab;
  onSelectTab: (tab: AiAgentTab) => void;
  activeSpecialist: BuddyAgent;
  onOpenAgentPicker: () => void;
}

export function AiAgentSidebar({
  activeTab,
  onSelectTab,
  activeSpecialist,
  onOpenAgentPicker,
}: AiAgentSidebarProps) {
  const navItems: { id: AiAgentTab; label: string; icon: React.ElementType }[] = [
    { id: 'copilot', label: 'Buddy', icon: Bot },
    { id: 'chats', label: 'Sessions', icon: MessageSquare },
    { id: 'settings', label: 'Config', icon: Settings },
  ];

  return (
    <aside className="w-[74px] shrink-0 border-r border-slate-200/90 bg-white flex flex-col justify-between items-center py-5 select-none z-20 font-sans shadow-2xs">
      {/* Top Logo / Buddy Emblem */}
      <div className="flex flex-col items-center gap-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 shadow-xs">
          <Sparkles className="h-5 w-5" />
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col items-center gap-2.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  'flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all duration-200 gap-1 text-[10px] font-bold tracking-tight cursor-pointer',
                  isActive
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25 ring-1 ring-purple-500'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
                )}
                title={item.label}
              >
                <Icon className={cn('h-4 w-4 transition-transform duration-200', isActive && 'scale-110')} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Avatar Clickable Agent Selector */}
      <button
        type="button"
        onClick={onOpenAgentPicker}
        className="flex flex-col items-center gap-1.5 p-1 rounded-2xl hover:bg-purple-50 transition group cursor-pointer"
        title="Click to Switch Active AI Agent"
      >
        <div className="relative group-hover:scale-105 transition-transform duration-200">
          <img
            src={activeSpecialist.imageUrl}
            alt={activeSpecialist.name}
            className="h-9 w-9 rounded-full object-cover border-2 border-purple-400 shadow-xs group-hover:border-purple-600"
          />
          {activeSpecialist.status === 'online' ? (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
          ) : (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </div>
        <span className="text-[9px] font-black text-purple-700 uppercase tracking-wider group-hover:underline truncate max-w-[62px]">
          {activeSpecialist.name.split(' ')[0]}
        </span>
      </button>
    </aside>
  );
}
