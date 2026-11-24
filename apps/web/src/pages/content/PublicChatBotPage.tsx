import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, Send, User, Loader2 } from 'lucide-react';
import {
  runtimeGetBot, runtimeStartSession, runtimeSendMessage, runtimeExecuteCta,
  runtimeIdleFollowup, runtimeCloseSession, runtimeSubmitFeedback,
  DEFAULT_SESSION_LIFECYCLE,
  type RuntimeCtaPayload,
} from '@/lib/chatbots';

type ChatMessage = { id: string; role: 'bot' | 'user' | 'system'; text: string; ctas?: RuntimeCtaPayload[] };

type LifecycleConfig = {
  idle_followup_enabled: boolean;
  idle_followup_seconds: number;
  idle_close_enabled: boolean;
  idle_close_seconds: number;
  feedback_enabled: boolean;
};

const FEEDBACK_EMOJIS = ['😞', '😐', '🙂', '😊', '🤩'];

function getVisitorId(botSlug: string): string {
  const key = `marbee_chat_visitor_${botSlug}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = `visitor_${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function PublicChatBotPage({ embed = false }: { embed?: boolean }) {
  const { slug } = useParams<{ slug: string }>();
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatClosed, setChatClosed] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [, setLifecycle] = useState<LifecycleConfig | null>(null);
  const [, setFollowupSent] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const vId = useRef(slug ? getVisitorId(slug) : `visitor_${crypto.randomUUID()}`);
  const idleFollowupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs that mirror state so timer callbacks always read the latest values
  const botRef = useRef(bot);
  const sessionIdRef = useRef(sessionId);
  const conversationIdRef = useRef(conversationId);
  const chatClosedRef = useRef(chatClosed);
  botRef.current = bot;
  sessionIdRef.current = sessionId;
  conversationIdRef.current = conversationId;
  chatClosedRef.current = chatClosed;

  const clearIdleTimers = useCallback(() => {
    if (idleFollowupTimer.current) { clearTimeout(idleFollowupTimer.current); idleFollowupTimer.current = null; }
    if (idleCloseTimer.current) { clearTimeout(idleCloseTimer.current); idleCloseTimer.current = null; }
  }, []);

  const closeChat = useCallback(async (reason: string) => {
    const b = botRef.current;
    const sid = sessionIdRef.current;
    const cid = conversationIdRef.current;
    if (chatClosedRef.current || !b || !sid || !cid) return;
    clearIdleTimers();
    try {
      const result = await runtimeCloseSession({ botId: String(b.id), sessionId: sid, conversationId: cid, reason, mode: 'live' });
      setChatClosed(true);
      if (result.summary) {
        setMessages((prev) => [...prev, {
          id: `close-${Date.now()}`,
          role: 'system',
          text: `Here's a summary of our conversation:\n\n${result.summary}\n\nThank you for chatting with us!`,
        }]);
      } else {
        setMessages((prev) => [...prev, {
          id: `close-${Date.now()}`,
          role: 'system',
          text: 'Thank you for chatting with us! This conversation is now closed.',
        }]);
      }
      if (result.show_feedback || DEFAULT_SESSION_LIFECYCLE.feedback_enabled) setShowFeedback(true);
    } catch {
      setChatClosed(true);
      setMessages((prev) => [...prev, {
        id: `close-${Date.now()}`,
        role: 'system',
        text: 'Thank you for chatting with us! This conversation is now closed.',
      }]);
      if (DEFAULT_SESSION_LIFECYCLE.feedback_enabled) setShowFeedback(true);
    }
  }, [clearIdleTimers]);

  const startIdleTimers = useCallback((lc: LifecycleConfig) => {
    clearIdleTimers();
    if (!lc.idle_followup_enabled || chatClosedRef.current) return;

    const followupMsg = DEFAULT_SESSION_LIFECYCLE.idle_followup_message;

    idleFollowupTimer.current = setTimeout(async () => {
      const b = botRef.current;
      const sid = sessionIdRef.current;
      const cid = conversationIdRef.current;
      if (!b || !sid || !cid) return;
      try {
        const result = await runtimeIdleFollowup({ botId: String(b.id), sessionId: sid, conversationId: cid, mode: 'live' });
        const followupText = result.message;
        if (result.success && followupText) {
          setMessages((prev) => [...prev, { id: `followup-${Date.now()}`, role: 'bot', text: followupText }]);
          setFollowupSent(true);
        }
      } catch {
        setMessages((prev) => [...prev, { id: `followup-${Date.now()}`, role: 'bot', text: followupMsg }]);
        setFollowupSent(true);
      }

      if (lc.idle_close_enabled) {
        idleCloseTimer.current = setTimeout(() => {
          closeChat('idle_timeout');
        }, lc.idle_close_seconds * 1000);
      }
    }, lc.idle_followup_seconds * 1000);
  }, [clearIdleTimers, closeChat]);

  // Init
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const botInfo = await runtimeGetBot({ publicSlug: slug, mode: 'live' });
        setBot(botInfo);
        const session = await runtimeStartSession(String(botInfo.id), 'live', vId.current);
        setSessionId(session.session_id);
        setMessages([{ id: 'welcome', role: 'bot', text: String(botInfo.welcome_message || 'Hi! How can I help you today?') }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'This assistant is not available right now.');
      } finally {
        setLoaded(true);
      }
    })();
  }, [slug]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (loaded && !error) inputRef.current?.focus(); }, [loaded, error]);

  // Cleanup timers on unmount
  useEffect(() => () => clearIdleTimers(), [clearIdleTimers]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !sessionId || !bot || chatClosed) return;
    setInput('');
    clearIdleTimers();
    setFollowupSent(false);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    setSending(true);
    try {
      const result = await runtimeSendMessage({
        botId: String(bot.id), sessionId, visitorId: vId.current, message: text,
        clientMessageId: crypto.randomUUID(), mode: 'live',
      });
      setConversationId(result.conversation_id);
      setMessages((prev) => [...prev, { id: result.message_id || `b-${Date.now()}`, role: 'bot', text: result.reply, ctas: result.ctas }]);

      // Use runtime lifecycle config only if it has features enabled;
      // otherwise the bot context wasn't configured yet — use defaults
      const lc = (result as unknown as Record<string, unknown>).session_lifecycle as LifecycleConfig | undefined;
      const effectiveLc: LifecycleConfig = (lc && (lc.idle_followup_enabled || lc.idle_close_enabled)) ? lc : {
        idle_followup_enabled: DEFAULT_SESSION_LIFECYCLE.idle_followup_enabled,
        idle_followup_seconds: DEFAULT_SESSION_LIFECYCLE.idle_followup_seconds,
        idle_close_enabled: DEFAULT_SESSION_LIFECYCLE.idle_close_enabled,
        idle_close_seconds: DEFAULT_SESSION_LIFECYCLE.idle_close_seconds,
        feedback_enabled: DEFAULT_SESSION_LIFECYCLE.feedback_enabled,
      };
      setLifecycle(effectiveLc);
      startIdleTimers(effectiveLc);
    } catch {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'bot', text: "I'm having trouble responding right now — please try again shortly." }]);
    } finally {
      setSending(false);
    }
  };

  const handleCtaClick = async (cta: RuntimeCtaPayload) => {
    if (cta.destination) {
      if (cta.action_type === 'call') window.location.href = `tel:${cta.destination}`;
      else if (cta.action_type === 'whatsapp') window.open(`https://wa.me/${cta.destination.replace(/\D/g, '')}`, '_blank');
      else window.open(cta.destination, '_blank');
    }
    if (conversationId) void runtimeExecuteCta({ conversationId, ctaId: cta.id, eventType: 'clicked' }).catch(() => {});
  };

  const submitFeedback = async (rating: number) => {
    setFeedbackRating(rating);
    if (conversationId) {
      try {
        await runtimeSubmitFeedback({ conversationId, rating });
      } catch { /* ignore */ }
    }
    setFeedbackSubmitted(true);
    setTimeout(() => setShowFeedback(false), 2000);
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-brand-50">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (error || !bot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <Bot className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">{error || 'This assistant is not available.'}</p>
        </div>
      </div>
    );
  }

  const widgetColor = (bot.widget_primary_color as string | undefined) || '#4f46e5';

  const chatCard = (
    <div className={`flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${embed ? 'h-screen max-w-none rounded-none' : ''}`} style={embed ? undefined : { height: 640 }}>
      <div className="flex shrink-0 items-center gap-3 px-5 py-4" style={{ background: `linear-gradient(135deg, ${widgetColor}, ${widgetColor}dd)` }}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/25 ring-1 ring-white/20">
          {bot.avatar_url ? <img src={String(bot.avatar_url)} alt="" className="h-10 w-10 rounded-full object-cover" /> : <Bot className="h-5 w-5 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-white">{String(bot.name)}</h1>
          <p className="flex items-center gap-1.5 text-[11px] text-white/85">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${chatClosed ? 'bg-slate-300' : 'bg-emerald-300'}`} />
            {chatClosed ? 'Conversation ended' : String(bot.business_name || 'Online')}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-white to-slate-50 p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role !== 'system' && (
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === 'bot' ? 'bg-brand-100' : 'bg-slate-200'}`}>
                {m.role === 'bot' ? <Bot className="h-3.5 w-3.5 text-brand-600" /> : <User className="h-3.5 w-3.5 text-slate-600" />}
              </div>
            )}
            <div className={`${m.role === 'system' ? 'w-full' : 'max-w-[78%]'} space-y-2`}>
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'bot' ? 'rounded-bl-md bg-slate-100 text-slate-800' :
                m.role === 'system' ? 'bg-slate-50 border border-slate-200 text-slate-600 text-center text-xs' :
                'rounded-br-md bg-brand-600 text-white'
              }`} style={{ whiteSpace: 'pre-line' }}>
                {m.text}
              </div>
              {m.ctas && m.ctas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.ctas.map((c) => (
                    <button key={c.id} type="button" onClick={() => handleCtaClick(c)} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                      {c.button_label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100"><Bot className="h-3.5 w-3.5 text-brand-600" /></div>
            <div className="rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Feedback overlay */}
      {showFeedback && (
        <div className="border-t border-slate-200 bg-white px-4 py-4">
          {feedbackSubmitted ? (
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">Thanks for your feedback! {FEEDBACK_EMOJIS[(feedbackRating || 3) - 1]}</p>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">How was your experience?</p>
              <div className="flex items-center justify-center gap-3">
                {FEEDBACK_EMOJIS.map((emoji, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => submitFeedback(i + 1)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-xl transition-all hover:scale-125 ${feedbackRating === i + 1 ? 'ring-2 ring-brand-400 bg-brand-50 scale-110' : 'hover:bg-slate-100'}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">1 = Poor &middot; 5 = Excellent</p>
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-slate-200 p-3">
        {chatClosed ? (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
            This conversation has ended.
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={String(bot.placeholder_text || 'Type your message…')}
              disabled={sending}
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none disabled:opacity-50"
            />
            <button type="submit" disabled={!input.trim() || sending} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
        {bot.show_powered_by !== false && (
          <p className="mt-2 text-center text-[10px] text-slate-400">{String(bot.powered_by_text || 'Powered by Marbee')}</p>
        )}
      </div>
    </div>
  );

  if (embed) return chatCard;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-brand-50 p-4">
      {chatCard}
    </div>
  );
}
