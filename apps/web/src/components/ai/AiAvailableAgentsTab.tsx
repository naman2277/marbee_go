import { BUDDY_AGENTS, type BuddyAgent } from './AiAgentSidebar';
import { Users, MessageSquare, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiAvailableAgentsTabProps {
  activeSpecialist: BuddyAgent;
  onSelectAgent: (agent: BuddyAgent) => void;
  onStartChat: (agent: BuddyAgent) => void;
  agentsList?: BuddyAgent[];
}

export function AiAvailableAgentsTab({
  activeSpecialist,
  onSelectAgent,
  onStartChat,
  agentsList = BUDDY_AGENTS,
}: AiAvailableAgentsTabProps) {
  const displayList = agentsList && agentsList.length > 0 ? agentsList : BUDDY_AGENTS;
  const onlineCount = displayList.filter((a) => a.status === 'online').length;

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 font-extrabold text-sm border border-purple-200 shadow-xs">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900">Available Buddy Specialists</h2>
              <p className="text-xs text-slate-500 font-medium">
                {displayList.length} Specialized CRM Copilots &bull; {onlineCount} Online, {displayList.length - onlineCount} In Maintenance
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {onlineCount} Specialists Online
          </span>
        </div>
      </div>

      {/* Agents Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayList.map((agent) => {
          const isSelected = activeSpecialist.id === agent.id;
          const isOnline = agent.status === 'online';

          return (
            <div
              key={agent.id}
              className={cn(
                'rounded-3xl p-6 border transition space-y-4 flex flex-col justify-between shadow-2xs',
                isSelected
                  ? 'bg-purple-50/40 border-purple-400 ring-2 ring-purple-500/20'
                  : isOnline
                  ? 'bg-white border-slate-200/90 hover:border-purple-300 hover:shadow-sm'
                  : 'bg-slate-50/70 border-slate-200/80 opacity-75'
              )}
            >
              <div className="space-y-3.5">
                {/* Agent Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="relative shrink-0">
                      <img
                        src={agent.imageUrl}
                        alt={agent.name}
                        className={cn(
                          'h-13 w-13 rounded-2xl object-cover border shadow-xs',
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
                        <h3 className="text-sm font-black text-slate-900">{agent.name}</h3>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100/70 px-1.5 py-0.2 rounded-md border border-purple-200">
                          {agent.indicName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">{agent.role}</p>
                      <p className="text-[10px] text-purple-700 font-medium mt-0.5">{agent.voiceLabel}</p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 shrink-0',
                      isOnline
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', isOnline ? 'bg-emerald-500' : 'bg-rose-500')} />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Greeting / Bio Quote */}
                <p className="text-xs text-slate-600 leading-relaxed italic bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  "{agent.greeting}"
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400 font-medium">
                  {isSelected ? (
                    <span className="text-purple-700 font-bold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Active in Workspace
                    </span>
                  ) : (
                    <span>Click to activate</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!isOnline}
                    onClick={() => {
                      onSelectAgent(agent);
                      onStartChat(agent);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl transition shadow-xs cursor-pointer',
                      isSelected
                        ? 'bg-purple-600 text-white hover:bg-purple-500'
                        : isOnline
                        ? 'bg-white hover:bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{isSelected ? 'Resume Chat' : 'Select & Chat'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
