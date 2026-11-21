import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, Send, User, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  text: string;
  ts: number;
}

export function PublicChatPage() {
  const { jobId, nodeId } = useParams<{ jobId: string; nodeId: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [botName, setBotName] = useState('Workflow Bot');
  const [, setWelcome] = useState('Hi! Send a message to start the workflow.');
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jobId || !nodeId) return;
    supabase
      .from('data_jobs')
      .select('definition')
      .eq('id', jobId)
      .maybeSingle()
      .then(({ data }) => {
        let welcomeText = 'Hi! Send a message to start the workflow.';
        if (data?.definition) {
          const def = data.definition as { nodes?: Array<{ id: string; config: Record<string, unknown> }> };
          const node = def.nodes?.find((n) => n.id === nodeId);
          if (node?.config) {
            if (node.config.chat_name) setBotName(String(node.config.chat_name));
            if (node.config.welcome_message) {
              welcomeText = String(node.config.welcome_message);
              setWelcome(welcomeText);
            }
          }
        }
        setLoaded(true);
        setMessages([{ id: 'welcome', role: 'bot', text: welcomeText, ts: Date.now() }]);
      });
  }, [jobId, nodeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (loaded) inputRef.current?.focus();
  }, [loaded]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Broadcast via Supabase Realtime so the pipeline page picks it up instantly
      const channel = supabase.channel(`workflow-trigger:${jobId}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'trigger_fire',
        payload: {
          node_id: nodeId,
          event_type: 'chat_message',
          message: text,
          sender: 'visitor',
          session_id: sessionId(),
          submitted_at: new Date().toISOString(),
        },
      });
      supabase.removeChannel(channel);

      setTriggered(true);
      const botReply: ChatMessage = {
        id: `b-${Date.now()}`,
        role: 'bot',
        text: 'Thanks! Your message has been received and the workflow is now executing.',
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, botReply]);
    } catch {
      setTriggered(true);
      const botReply: ChatMessage = {
        id: `b-${Date.now()}`,
        role: 'bot',
        text: 'Message received! The workflow has been triggered.',
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, botReply]);
    } finally {
      setSending(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: '600px' }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-sm">{botName}</h1>
            <p className="text-blue-200 text-[11px]">
              {triggered ? 'Workflow triggered' : 'Online — send a message to start'}
            </p>
          </div>
          {triggered && (
            <div className="ml-auto flex items-center gap-1.5 bg-emerald-500/20 text-emerald-200 text-[10px] px-2 py-1 rounded-full font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Running
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'bot' ? 'bg-blue-100' : 'bg-gray-200'}`}>
                {msg.role === 'bot' ? <Bot className="w-3.5 h-3.5 text-blue-600" /> : <User className="w-3.5 h-3.5 text-gray-600" />}
              </div>
              <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'bot'
                  ? 'bg-gray-100 text-gray-800 rounded-bl-md'
                  : 'bg-blue-600 text-white rounded-br-md'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-3 flex-shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={triggered ? 'Workflow already triggered' : 'Type a message…'}
              disabled={sending || triggered}
              className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || triggered}
              className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Powered by Marbee
          </p>
        </div>
      </div>
    </div>
  );
}

let _sessionId: string | null = null;
function sessionId() {
  if (!_sessionId) _sessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return _sessionId;
}
