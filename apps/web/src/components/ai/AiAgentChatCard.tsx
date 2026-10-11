import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  MoreVertical,
  X,
  Image as ImageIcon,
  Paperclip,
  FileText,
  Check,
  CheckCheck,
  Sparkles,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Copy,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { executeIntelligentReasoning } from '@/lib/ai-crm-context';
import { analyzeUserQuery } from './knowledgeBase';

import type { CharacterState } from './AiOfficeRoom';

export type ChatItem = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  checklist?: { text: string; checked: boolean }[];
  attachment?: {
    type: 'screenshot' | 'file';
    name: string;
    previewUrl?: string;
  };
  sqlCode?: string;
  logTrace?: string;
};

interface AiAgentChatCardProps {
  onAiTypingStateChange?: (isTyping: boolean) => void;
  onCharacterStateChange?: (state: CharacterState) => void;
  externalPrompt?: string | null;
  onClearExternalPrompt?: () => void;
}

export function AiAgentChatCard({
  onAiTypingStateChange,
  onCharacterStateChange,
  externalPrompt,
  onClearExternalPrompt,
}: AiAgentChatCardProps) {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: 'm1',
      sender: 'user',
      text: 'Why is my campaign not sending?',
      timestamp: '10:30 AM',
    },
    {
      id: 'm2',
      sender: 'ai',
      text: "I can help you with that.\nTo investigate this issue, I'll need a few details.",
      timestamp: '10:30 AM',
      checklist: [
        { text: 'Which campaign are you referring to?', checked: true },
        { text: 'What is the current status of the campaign?', checked: true },
        { text: 'Are you seeing any error messages?', checked: true },
        { text: 'When did you schedule or trigger the campaign?', checked: false },
        { text: 'Can you share a screenshot of the campaign details?', checked: false },
      ],
    },
    {
      id: 'm3',
      sender: 'user',
      text: 'It\'s the "Welcome Campaign". Status shows Failed. I\'m seeing an error: Delivery failed due to SMTP authentication error.',
      timestamp: '10:31 AM',
    },
  ]);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeAttachment, setActiveAttachment] = useState<{ type: 'screenshot' | 'file'; name: string; previewUrl?: string } | null>(null);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Handle external prompt injection (e.g. from clicking the desk plaque)
  useEffect(() => {
    if (externalPrompt) {
      handleSendMessage(externalPrompt);
      onClearExternalPrompt?.();
    }
  }, [externalPrompt]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query && !activeAttachment) return;

    const newMsg: ChatItem = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachment: activeAttachment || undefined,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    setActiveAttachment(null);

    // AI Typing State & Character Animation
    setIsTyping(true);
    onAiTypingStateChange?.(true);
    onCharacterStateChange?.('THINK');

    const result = await executeIntelligentReasoning(query);

    let sqlCode: string | undefined = undefined;
    const sqlMatch = result.text.match(/```(?:sql|postgresql)([\s\S]*?)```/i);
    if (sqlMatch) {
      sqlCode = sqlMatch[1].trim();
    }

    if (result.text.includes('⚠️')) {
      onCharacterStateChange?.('EXPLAIN');
    } else {
      onCharacterStateChange?.('SUCCESS');
    }

    const aiMsg: ChatItem = {
      id: `ai_${Date.now()}`,
      sender: 'ai',
      text: result.text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sqlCode,
    };

    setMessages((prev) => [...prev, aiMsg]);
    setIsTyping(false);
    onAiTypingStateChange?.(false);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleChecklistItem = (msgId: string, idx: number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.checklist) return m;
        const updated = [...m.checklist];
        updated[idx] = { ...updated[idx], checked: !updated[idx].checked };
        return { ...m, checklist: updated };
      })
    );
  };

  return (
    <div className="w-full max-w-[480px] h-[92vh] max-h-[820px] rounded-3xl bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200/90 flex flex-col justify-between overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
      {/* 1. CARD HEADER */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-white">
        <div>
          <h2 className="text-sm font-black text-slate-900 tracking-tight">CRM Support Assistant</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-600">Online</span>
          </div>
        </div>

        <div className="flex items-center gap-1 relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-8 w-44 rounded-2xl bg-white p-2 shadow-xl border border-slate-200 z-30 space-y-1 text-xs animate-in fade-in"
            >
              <button
                type="button"
                onClick={() => {
                  setMessages([
                    {
                      id: `m_init_${Date.now()}`,
                      sender: 'ai',
                      text: "Hello! How can I assist you with your CRM campaigns, journeys, or queries today?",
                      timestamp: 'Just now',
                    },
                  ]);
                  setIsMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Clear Chat History
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogsModalOpen(true);
                  setIsMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 transition"
              >
                <FileText className="h-3.5 w-3.5" />
                Inspect Worker Logs
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. CHAT MESSAGE STREAM */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
        {messages.map((m) => {
          const isUser = m.sender === 'user';

          return (
            <div key={m.id} className={cn('flex items-start gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
              {/* AI Avatar */}
              {!isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white font-black text-xs border border-purple-200 shadow-2xs">
                  👨‍💼
                </div>
              )}

              {/* Message Bubble */}
              <div className={cn('flex flex-col gap-1 max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'p-3.5 rounded-2xl shadow-2xs leading-relaxed transition-all',
                    isUser
                      ? 'bg-[#9333EA] text-white font-medium rounded-tr-xs'
                      : 'bg-slate-50 border border-slate-200/80 text-slate-800 rounded-tl-xs'
                  )}
                >
                  {/* Attached Preview */}
                  {m.attachment && (
                    <div className="mb-2 rounded-xl bg-white/20 p-2 flex items-center gap-2">
                      {m.attachment.previewUrl ? (
                        <img
                          src={m.attachment.previewUrl}
                          alt="Attachment"
                          className="h-12 w-12 object-cover rounded-lg border border-white/40"
                        />
                      ) : (
                        <FileText className="h-6 w-6 text-white" />
                      )}
                      <span className="font-bold truncate text-[11px]">{m.attachment.name}</span>
                    </div>
                  )}

                  {/* Message Body */}
                  <div className="whitespace-pre-line text-[12px]">{m.text}</div>

                  {/* Interactive Checklist (As shown in screenshot) */}
                  {m.checklist && m.checklist.length > 0 && (
                    <div className="mt-3 space-y-1.5 pt-2 border-t border-slate-200/60">
                      {m.checklist.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => toggleChecklistItem(m.id, idx)}
                          className="flex items-start gap-2 cursor-pointer group hover:bg-slate-100/60 p-1 rounded-lg transition"
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] transition mt-0.5',
                              item.checked
                                ? 'bg-purple-600 border-purple-600 text-white font-black'
                                : 'border-slate-300 bg-white text-transparent group-hover:border-purple-400'
                            )}
                          >
                            ✓
                          </span>
                          <span className={cn('text-[11px] leading-snug', item.checked ? 'text-slate-800 font-semibold' : 'text-slate-600')}>
                            {item.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SQL Code Box if present */}
                  {m.sqlCode && (
                    <div className="mt-3 rounded-xl bg-slate-900 text-emerald-300 p-2.5 font-mono text-[10px] relative">
                      <button
                        type="button"
                        onClick={() => handleCopy(m.sqlCode || '', m.id)}
                        className="absolute right-2 top-2 rounded-md bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300 hover:bg-slate-700 transition flex items-center gap-1"
                      >
                        {copiedId === m.id ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                        Copy
                      </button>
                      <pre className="overflow-x-auto whitespace-pre leading-relaxed">{m.sqlCode}</pre>
                    </div>
                  )}
                </div>

                {/* Timestamp & double check delivery indicator */}
                <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 px-1">
                  <span>{m.timestamp}</span>
                  {isUser && <CheckCheck className="h-3 w-3 text-purple-600 stroke-[2.5]" />}
                </div>
              </div>
            </div>
          );
        })}

        {/* AI Typing Indicator (Matching screenshot) */}
        {isTyping && (
          <div className="flex items-start gap-2.5 justify-start animate-in fade-in duration-200">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white font-black text-xs border border-purple-200 shadow-2xs">
              👨‍💼
            </div>
            <div className="rounded-2xl rounded-tl-xs bg-slate-50 border border-slate-200/80 p-3 shadow-2xs space-y-1.5">
              <p className="text-[12px] font-semibold text-slate-800">Let me check this for you…</p>
              <div className="flex items-center gap-1 text-[10px] font-bold text-purple-600">
                <span>Typing…</span>
                <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-bounce delay-100" />
                <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. ACTION ROW: [Upload Screenshot] [Upload File] [View Logs] */}
      <div className="px-4 py-2 border-t border-slate-100 bg-white flex items-center gap-2">
        <button
          type="button"
          onClick={() => screenshotInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:border-purple-300 transition shadow-2xs"
        >
          <ImageIcon className="h-3.5 w-3.5 text-purple-600" />
          <span>Upload Screenshot</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:border-purple-300 transition shadow-2xs"
        >
          <Paperclip className="h-3.5 w-3.5 text-purple-600" />
          <span>Upload File</span>
        </button>

        <button
          type="button"
          onClick={() => setIsLogsModalOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:border-purple-300 transition shadow-2xs"
        >
          <FileText className="h-3.5 w-3.5 text-purple-600" />
          <span>View Logs</span>
        </button>

        {/* Hidden inputs */}
        <input
          ref={screenshotInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setActiveAttachment({ type: 'screenshot', name: f.name, previewUrl: URL.createObjectURL(f) });
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".log,.json,.sql,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setActiveAttachment({ type: 'file', name: f.name });
          }}
        />
      </div>

      {/* 4. ATTACHMENT BADGE IF SELECTED */}
      {activeAttachment && (
        <div className="mx-4 mb-2 flex items-center justify-between rounded-xl bg-purple-50 px-3 py-1.5 text-xs text-purple-900 border border-purple-200">
          <span className="font-bold truncate text-[11px]">📎 {activeAttachment.name}</span>
          <button type="button" onClick={() => setActiveAttachment(null)} className="text-purple-600 hover:text-purple-900">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 5. INPUT BAR & PURPLE SEND BUTTON */}
      <div className="p-4 pt-1 bg-white">
        <div className="relative flex items-center rounded-2xl border border-slate-200 bg-slate-50/50 p-1.5 focus-within:bg-white focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 shadow-2xs transition">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type your message..."
            className="flex-1 bg-transparent px-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden"
          />

          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!input.trim() && !activeAttachment}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#9333EA] text-white shadow-md shadow-purple-600/30 hover:bg-[#7E22CE] disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95 shrink-0"
            title="Send Message"
          >
            <Send className="h-4 w-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Footer Subtext */}
        <p className="mt-2 text-center text-[10px] font-medium text-slate-400">
          Powered by AI. Always here to help.
        </p>
      </div>

      {/* 6. LOGS MODAL DIALOG */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 font-extrabold text-sm border border-purple-100">
                  <Terminal className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Campaign Execution Logs</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Real-time worker trace and SMTP gateway output</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-900 p-4 text-emerald-300 font-mono text-[11px] space-y-1 max-h-64 overflow-y-auto">
              <p className="text-slate-400">[2025-04-10 10:30:15] INFO Worker pool initialized on cluster us-east-1</p>
              <p className="text-slate-400">[2025-04-10 10:30:18] INFO Ingesting audience segment: "New VIP Customers"</p>
              <p className="text-slate-400">[2025-04-10 10:30:20] INFO Audience resolved: 14,280 unique recipient tokens</p>
              <p className="text-amber-400">[2025-04-10 10:30:45] WARN Connecting to SMTP relay endpoint smtp.mailgun.org:587</p>
              <p className="text-rose-400 font-bold">[2025-04-10 10:31:02] ERROR 535 5.7.8 Authentication credentials invalid</p>
              <p className="text-rose-400">[2025-04-10 10:31:03] FATAL Campaign CMP-9012 aborted: Delivery failed due to SMTP authentication error</p>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(false)}
                className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 text-xs transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSendMessage("Here are the logs: [ERROR 535 Authentication credentials invalid on smtp.mailgun.org:587 for CMP-9012]");
                  setIsLogsModalOpen(false);
                }}
                className="rounded-xl bg-purple-600 px-5 py-2 font-extrabold text-white text-xs shadow-md shadow-purple-600/30 hover:bg-purple-700 active:scale-95 transition"
              >
                Diagnose Logs with AI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
