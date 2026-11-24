import React, { useState, useEffect } from 'react';
import { MessageSquare, Clock, Trash2, Plus, Sparkles, ChevronRight, Timer } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchChatSessions, clearAllChatSessions, deleteSingleChatSession } from '@/lib/ai-engine-config';

type SavedSession = {
  id: string;
  updatedAt: string;
  createdAt?: string;
  expiresAt?: string;
  title: string;
  messageCount: number;
  messages: Array<{ id: string; sender: 'user' | 'agent'; text: string; timestamp: string }>;
};

interface AiAgentChatsTabProps {
  onSelectChat: (session: SavedSession | string) => void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function AiAgentChatsTab({ onSelectChat }: AiAgentChatsTabProps) {
  const { tenantId, environment } = useAuth();
  const [sessions, setSessions] = useState<SavedSession[]>([]);

  // Load and auto-purge sessions older than 7 days
  useEffect(() => {
    fetchChatSessions(tenantId, environment).then((loaded) => {
      const now = Date.now();
      const validUnexpired = loaded.filter((s: SavedSession) => {
        const time = new Date(s.updatedAt || s.createdAt || now).getTime();
        return now - time < SEVEN_DAYS_MS;
      });
      setSessions(validUnexpired);
    });
  }, [tenantId, environment]);

  const handleClearHistory = async () => {
    await clearAllChatSessions(tenantId, environment);
    setSessions([]);
  };

  const handleDeleteSingleSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    await deleteSingleChatSession(sessionId);
    // Sync to local fallback list as backup
    try {
      localStorage.setItem('marbee_ai_saved_sessions', JSON.stringify(updated));
    } catch {}
  };

  // Helper to calculate time until 7-day auto-purge
  const getRemainingRetentionText = (updatedAt: string) => {
    const time = new Date(updatedAt).getTime();
    const expiresAt = time + SEVEN_DAYS_MS;
    const remainingMs = expiresAt - Date.now();

    if (remainingMs <= 0) return 'Expiring now';

    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) {
      return `Purges in ${days}d ${hours}h`;
    }
    return `Purges in ${hours}h`;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-8 space-y-6 max-w-4xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 font-extrabold text-sm border border-purple-200 shadow-xs">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900">Conversational Sessions</h2>
              <p className="text-xs text-slate-500 font-medium">
                Saved query sessions &bull; Automatic 7-day rolling purge window
              </p>
            </div>
          </div>
        </div>

        {sessions.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-3.5 py-1.5 rounded-xl border border-rose-200 transition shadow-2xs cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear All History</span>
          </button>
        )}
      </div>

      {/* 7-Day Retention Notice Banner */}
      <div className="flex items-start gap-3 bg-purple-50/70 border border-purple-200/80 rounded-2xl p-4 text-xs">
        <Timer className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-black text-purple-950">7-Day Retention &amp; Automatic Purge Policy</span>
          <p className="text-purple-800 leading-relaxed">
            All chat logs and conversational sessions are securely retained for exactly <strong>7 days</strong> from their last update and are automatically purged permanently.
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-3xl bg-slate-50/70 p-10 border border-slate-200/90 text-center space-y-4 shadow-2xs">
          <div className="h-12 w-12 rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center mx-auto shadow-xs">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">No Active Sessions in Last 7 Days</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Start asking questions in the AI Copilot workspace. Your recent conversations will be saved and retained for 7 days.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectChat('How do I create an abandoned cart recovery journey?')}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Start New Query</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((sess) => {
            const firstUserMsg = sess.messages.find((m) => m.sender === 'user')?.text || sess.title;
            const lastAgentReply = [...sess.messages].reverse().find((m) => m.sender === 'agent')?.text || '';
            const remainingText = getRemainingRetentionText(sess.updatedAt);

            return (
              <div
                key={sess.id}
                onClick={() => onSelectChat(sess)}
                className="group cursor-pointer rounded-3xl bg-white p-5 border border-slate-200/90 shadow-2xs hover:border-purple-300 hover:shadow-sm transition flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                      {sess.messageCount} Messages
                    </span>

                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                      <Clock className="h-3 w-3" /> {new Date(sess.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(sess.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                      <Timer className="h-2.5 w-2.5" /> {remainingText}
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-slate-900 group-hover:text-purple-600 transition truncate">
                    {firstUserMsg}
                  </h3>

                  {lastAgentReply && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                      {lastAgentReply.replace(/###|\*\*|```sql|```/g, '')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSingleSession(e, sess.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                    title="Delete this session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-1 text-xs font-bold text-purple-600 group-hover:translate-x-0.5 transition">
                    <span>Resume</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
