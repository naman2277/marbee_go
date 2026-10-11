import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, User, RotateCcw, Loader2, Copy, Check, AlertTriangle, Database } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import type { TabProps } from '../types';
import {
  runtimeStartSession, runtimeSendMessage, runtimeIdleFollowup, runtimeCloseSession, runtimeSubmitFeedback,
  DEFAULT_SESSION_LIFECYCLE,
  type RuntimeCtaPayload, type ChatBotSentiment, type SessionLifecycle,
} from '@/lib/chatbots';
import { supabase } from '@/lib/supabase';

type TestMessage = { id: string; role: 'user' | 'bot' | 'system'; text: string; ctas?: RuntimeCtaPayload[] };

type LifecycleConfig = {
  idle_followup_enabled: boolean;
  idle_followup_seconds: number;
  idle_close_enabled: boolean;
  idle_close_seconds: number;
  feedback_enabled: boolean;
};

const SENTIMENT_ICON: Record<ChatBotSentiment, string> = { positive: '🟢', neutral: '🔵', negative: '🔴', mixed: '🟡' };
const FEEDBACK_EMOJIS = ['😞', '😐', '🙂', '😊', '🤩'];

export function TestTab({ draft, dirty, onSaveFirst }: TabProps & { dirty: boolean; onSaveFirst: () => Promise<boolean> }) {
  const bot = draft.bot;
  const [visitorId] = useState(() => `test_${crypto.randomUUID()}`);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);
  const [chatClosed, setChatClosed] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleConfig | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const idleFollowupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs that mirror state so timer callbacks always read the latest values
  const sessionIdRef = useRef(sessionId);
  const conversationIdRef = useRef(conversationId);
  const chatClosedRef = useRef(chatClosed);
  sessionIdRef.current = sessionId;
  conversationIdRef.current = conversationId;
  chatClosedRef.current = chatClosed;

  const clearIdleTimers = useCallback(() => {
    if (idleFollowupTimer.current) { clearTimeout(idleFollowupTimer.current); idleFollowupTimer.current = null; }
    if (idleCloseTimer.current) { clearTimeout(idleCloseTimer.current); idleCloseTimer.current = null; }
  }, []);

  const closeChat = useCallback(async (reason: string) => {
    const sid = sessionIdRef.current;
    const cid = conversationIdRef.current;
    if (chatClosedRef.current || !sid || !cid) return;
    clearIdleTimers();
    const lcConfig = bot.context?.session_lifecycle ?? DEFAULT_SESSION_LIFECYCLE;
    try {
      const result = await runtimeCloseSession({ botId: bot.id, sessionId: sid, conversationId: cid, reason, mode: 'test' });
      setChatClosed(true);
      const mappingNote = (result as Record<string, unknown>)._schema_mapping_result
        ? `\nSchema mapping: ${(result as Record<string, unknown>)._schema_mapping_result}`
        : '';
      if (result.summary) {
        setMessages((prev) => [...prev, { id: `close-${Date.now()}`, role: 'system', text: `Summary: ${result.summary}\n\nConversation closed.${mappingNote}` }]);
      } else {
        setMessages((prev) => [...prev, { id: `close-${Date.now()}`, role: 'system', text: `Conversation closed.${mappingNote}` }]);
      }
      if (result.show_feedback || DEFAULT_SESSION_LIFECYCLE.feedback_enabled) setShowFeedback(true);
      setLastPayload((prev) => ({ ...prev, close_result: result }));
    } catch {
      setChatClosed(true);
      setMessages((prev) => [...prev, { id: `close-${Date.now()}`, role: 'system', text: 'Thank you for chatting with us! This conversation is now closed.' }]);
      if (lcConfig.feedback_enabled) setShowFeedback(true);
    }
  }, [bot.id, bot.context, clearIdleTimers]);

  const startIdleTimers = useCallback((lc: LifecycleConfig) => {
    clearIdleTimers();
    if (!lc.idle_followup_enabled || chatClosedRef.current) return;

    const followupMsg = (bot.context?.session_lifecycle ?? DEFAULT_SESSION_LIFECYCLE).idle_followup_message
      || 'Hey, are we still connected? Let me know if you need anything else.';

    idleFollowupTimer.current = setTimeout(async () => {
      const sid = sessionIdRef.current;
      const cid = conversationIdRef.current;
      if (!sid || !cid) return;
      try {
        const result = await runtimeIdleFollowup({ botId: bot.id, sessionId: sid, conversationId: cid, mode: 'test' });
        if (result.success && result.message) {
          setMessages((prev) => [...prev, { id: `followup-${Date.now()}`, role: 'bot', text: result.message }]);
        }
      } catch {
        setMessages((prev) => [...prev, { id: `followup-${Date.now()}`, role: 'bot', text: followupMsg }]);
      }

      if (lc.idle_close_enabled) {
        idleCloseTimer.current = setTimeout(() => closeChat('idle_timeout'), lc.idle_close_seconds * 1000);
      }
    }, lc.idle_followup_seconds * 1000);
  }, [clearIdleTimers, bot.id, bot.context, closeChat]);

  const startSession = async () => {
    setStarting(true);
    setError(null);
    setChatClosed(false);
    setShowFeedback(false);
    setFeedbackRating(null);
    setFeedbackSubmitted(false);
    setLifecycle(null);
    clearIdleTimers();
    setMessages([{ id: 'welcome', role: 'bot', text: bot.welcome_message }]);
    try {
      const res = await runtimeStartSession(bot.id, 'test', visitorId);
      setSessionId(res.session_id);
      setConversationId(res.conversation_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start test session.');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => { startSession(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bot.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => clearIdleTimers(), [clearIdleTimers]);

  const reset = () => { setSessionId(null); setConversationId(null); setLastPayload(null); startSession(); };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !sessionId || chatClosed) return;
    setInput('');
    clearIdleTimers();
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    setSending(true);
    setError(null);
    try {
      const result = await runtimeSendMessage({ botId: bot.id, sessionId, visitorId, message: text, clientMessageId: crypto.randomUUID(), mode: 'test' });
      setConversationId(result.conversation_id);
      setMessages((prev) => [...prev, { id: result.message_id || `b-${Date.now()}`, role: 'bot', text: result.reply, ctas: result.ctas }]);
      setLastPayload(result as unknown as Record<string, unknown>);

      // Use runtime lifecycle config only if it has features enabled;
      // otherwise the bot context wasn't configured yet — use defaults
      const lc = (result as unknown as Record<string, unknown>).session_lifecycle as LifecycleConfig | undefined;
      const lcSrc = bot.context?.session_lifecycle ?? DEFAULT_SESSION_LIFECYCLE;
      const effectiveLc: LifecycleConfig = (lc && (lc.idle_followup_enabled || lc.idle_close_enabled)) ? lc : {
        idle_followup_enabled: lcSrc.idle_followup_enabled,
        idle_followup_seconds: lcSrc.idle_followup_seconds,
        idle_close_enabled: lcSrc.idle_close_enabled,
        idle_close_seconds: lcSrc.idle_close_seconds,
        feedback_enabled: lcSrc.feedback_enabled,
      };
      setLifecycle(effectiveLc);
      startIdleTimers(effectiveLc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not respond.');
    } finally {
      setSending(false);
    }
  };

  const submitFeedback = async (rating: number) => {
    setFeedbackRating(rating);
    if (conversationId) {
      try { await runtimeSubmitFeedback({ conversationId, rating }); } catch { /* ignore */ }
    }
    setFeedbackSubmitted(true);
    setTimeout(() => setShowFeedback(false), 2000);
  };

  const [processingData, setProcessingData] = useState(false);

  const processData = async () => {
    if (!conversationId || processingData) return;
    setProcessingData(true);
    try {
      const { data, error } = await supabase.rpc('chatbot_process_captured_data', { p_conversation_id: conversationId });
      const result = error ? { ok: false, step: 'rpc_error', detail: error.message } : data;
      setMessages((prev) => [...prev, {
        id: `process-${Date.now()}`,
        role: 'system',
        text: `Schema mapping result:\n${JSON.stringify(result, null, 2)}`,
      }]);
      setLastPayload((prev) => ({ ...prev, process_result: result }));
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `process-${Date.now()}`,
        role: 'system',
        text: `Process error: ${err instanceof Error ? err.message : String(err)}`,
      }]);
    } finally {
      setProcessingData(false);
    }
  };

  const copyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ session_id: sessionId, conversation_id: conversationId, visitor_id: visitorId, last_event: lastPayload }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid grid-cols-[1fr_360px] gap-6 max-w-5xl">
      <Card className="flex flex-col" >
        <CardHeader
          title="Test Chat Bot"
          subtitle={bot.llm_provider_id ? 'Live LLM calls — nothing is published to visitors.' : 'No LLM provider selected — replies will use the fallback response.'}
          action={<button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Reset Conversation</button>}
        />

        {dirty && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Unsaved changes won't be reflected until you save.</span>
            <button type="button" onClick={() => onSaveFirst().then(reset)} className="font-semibold underline">Save &amp; restart test</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 420, maxHeight: 520 }}>
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {m.role !== 'system' && (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === 'bot' ? 'bg-brand-100' : 'bg-slate-200'}`}>
                  {m.role === 'bot' ? <Bot className="w-3.5 h-3.5 text-brand-600" /> : <User className="w-3.5 h-3.5 text-slate-600" />}
                </div>
              )}
              <div className={`${m.role === 'system' ? 'w-full' : 'max-w-[75%]'} space-y-2`}>
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'bot' ? 'bg-slate-100 text-slate-800 rounded-bl-md' :
                  m.role === 'system' ? 'bg-amber-50 border border-amber-200 text-amber-800 text-center text-xs' :
                  'bg-brand-600 text-white rounded-br-md'
                }`} style={{ whiteSpace: 'pre-line' }}>
                  {m.text}
                </div>
                {m.ctas && m.ctas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.ctas.map((c) => <span key={c.id} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{c.button_label}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {(sending || starting) && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center"><Bot className="w-3.5 h-3.5 text-brand-600" /></div>
              <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3"><Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}

        {/* Feedback strip */}
        {showFeedback && (
          <div className="border-t border-slate-200 bg-white px-4 py-3">
            {feedbackSubmitted ? (
              <p className="text-center text-sm font-semibold text-slate-700">Thanks! {FEEDBACK_EMOJIS[(feedbackRating || 3) - 1]}</p>
            ) : (
              <div className="flex items-center justify-center gap-4">
                <span className="text-xs font-medium text-slate-600">Rate this chat:</span>
                {FEEDBACK_EMOJIS.map((emoji, i) => (
                  <button key={i} type="button" onClick={() => submitFeedback(i + 1)} className="text-xl hover:scale-125 transition-transform">{emoji}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {chatClosed ? (
          <div className="border-t border-slate-200 p-3 space-y-2">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
              Conversation ended &mdash; <button type="button" onClick={reset} className="font-semibold text-brand-600 hover:underline">Start new test</button>
            </div>
            {conversationId && (
              <button type="button" onClick={processData} disabled={processingData}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                {processingData ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                Process Captured Data to Schema
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={bot.placeholder_text}
              disabled={sending || starting || !sessionId}
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none disabled:opacity-50"
            />
            <button type="submit" disabled={!input.trim() || sending || !sessionId} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader title="Test Payload" subtitle="Developer view of session/event data." action={<button type="button" onClick={copyPayload} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button>} />
        <div className="p-4">
          <pre className="max-h-[480px] overflow-auto rounded-lg bg-slate-900 p-3 text-[10.5px] leading-relaxed text-emerald-300">
{JSON.stringify({ session_id: sessionId, conversation_id: conversationId, visitor_id: visitorId, lifecycle, last_event: lastPayload }, null, 2)}
          </pre>
          {lastPayload && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {lastPayload.sentiment ? <span className="text-[11px]">{SENTIMENT_ICON[lastPayload.sentiment as ChatBotSentiment]} {String(lastPayload.sentiment)}</span> : null}
              {chatClosed && <span className="text-[11px] text-slate-400">Chat closed</span>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
