import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Paperclip,
  Image as ImageIcon,
  Copy,
  Check,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Terminal,
  GitBranch,
  Ticket,
  Mic,
  MicOff,
  X,
  FileText,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { executeIntelligentReasoning } from '@/lib/ai-crm-context';
import { type KnownError } from './knowledgeBase';
import type { CharacterState } from './AiOfficeRoom';

export type ChatMessage = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  attachment?: {
    type: 'image' | 'file' | 'log';
    name: string;
    previewUrl?: string;
  };
  diagnostic?: {
    error?: KnownError;
    confidence: 'high' | 'medium' | 'low';
    steps?: string[];
    sqlQuery?: string;
    flowDiagram?: { title: string; nodes: string[] };
    navigation?: { label: string; path: string };
  };
  ticketEscalation?: {
    ticketId: string;
    summary: string;
    diagnostics: string;
    stepsTried: string;
  };
  followUps?: string[];
  feedback?: 'helpful' | 'unhelpful' | null;
};

interface AiSupportConsoleProps {
  onCharacterStateChange: (state: CharacterState) => void;
  onProcessingStateChange?: (isProcessing: boolean, status?: string) => void;
  onUserTypingChange?: (isTyping: boolean) => void;
}

export function AiSupportConsole({
  onCharacterStateChange,
  onProcessingStateChange,
  onUserTypingChange,
}: AiSupportConsoleProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'ai',
      text: "👋 Hi! I'm Maya, your AI CRM Support Colleague. I'm here to help you build journeys, troubleshoot campaign errors, optimize targeting queries, or answer any product question. How can I help you today?",
      timestamp: 'Just now',
      followUps: [
        'How do I create an abandoned cart journey?',
        'Why is my campaign failing with duplicate key error?',
        'Help me build an audience with SQL',
        'Web Push notification deliverability troubleshooting',
      ],
    },
  ]);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ type: 'image' | 'file' | 'log'; name: string; previewUrl?: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ticketModalData, setTicketModalData] = useState<ChatMessage['ticketEscalation'] | null>(null);
  const [isVoiceListening, setIsVoiceListening] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Handle User Input Change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    onUserTypingChange?.(e.target.value.length > 0);
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Send Message Lifecycle
  const handleSendMessage = async (customText?: string) => {
    const queryText = (customText || input).trim();
    if (!queryText && !attachedFile) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachment: attachedFile || undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedFile(null);
    onUserTypingChange?.(false);

    // 1. Trigger Character Wake-Up & Approach Sequence
    onCharacterStateChange('NOTIFICATION');
    setIsProcessing(true);
    onProcessingStateChange?.(true, 'Noticing your question...');

    await new Promise((r) => setTimeout(r, 600));
    onCharacterStateChange('WAKE_UP');
    setProcessingStatus('Waking up & reviewing context...');
    onProcessingStateChange?.(true, 'Waking up & reviewing context...');

    await new Promise((r) => setTimeout(r, 800));
    onCharacterStateChange('WALK_FORWARD');
    setProcessingStatus('Walking to support desk...');
    onProcessingStateChange?.(true, 'Walking to support desk...');

    await new Promise((r) => setTimeout(r, 900));
    onCharacterStateChange('SIT');

    // 2. AI Live Model Inference with live CRM & DB context
    onCharacterStateChange('THINK');
    setProcessingStatus('Consulting active reasoning model & platform database...');
    onProcessingStateChange?.(true, 'Consulting active reasoning model & platform database...');

    const reasoningResult = await executeIntelligentReasoning(queryText);

    let aiResponseText = reasoningResult.text;
    let diagnosticPayload: ChatMessage['diagnostic'] = undefined;
    let ticketPayload: ChatMessage['ticketEscalation'] = undefined;

    // Check if the response contains SQL code block
    const sqlMatch = aiResponseText.match(/```(?:sql|postgresql)([\s\S]*?)```/i);
    const sqlQuery = sqlMatch ? sqlMatch[1].trim() : undefined;

    if (sqlQuery) {
      diagnosticPayload = {
        confidence: 'high',
        sqlQuery,
      };
    }

    if (reasoningResult.text.includes('⚠️')) {
      onCharacterStateChange('NOTIFICATION');
    } else {
      onCharacterStateChange('EXPLAIN');
    }

    const aiMsg: ChatMessage = {
      id: `ai_${Date.now()}`,
      sender: 'ai',
      text: aiResponseText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      diagnostic: diagnosticPayload,
      ticketEscalation: ticketPayload,
    };

    setMessages((prev) => [...prev, aiMsg]);
    setIsProcessing(false);
    onProcessingStateChange?.(false);
  };

  // Generate Escalation Ticket for Support Team
  const handleEscalateToSupport = (msg: ChatMessage) => {
    const ticketId = `MB-TICK-${Math.floor(100000 + Math.random() * 900000)}`;
    const escalation = {
      ticketId,
      summary: msg.diagnostic?.error?.problem || 'CRM Workflow / Campaign Investigation',
      diagnostics: `Detected Error: ${msg.diagnostic?.error?.code || 'Custom Workflow Issue'}\nCategory: ${msg.diagnostic?.error?.category || 'General Configuration'}\nConfidence: ${msg.diagnostic?.confidence || 'High'}`,
      stepsTried: msg.diagnostic?.steps?.join('\n') || 'Diagnosed using AI Knowledge Base',
    };
    setTicketModalData(escalation);
    onCharacterStateChange('SUCCESS');
  };

  // Attach File / Screenshot
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = file.type.startsWith('image/');
    setAttachedFile({
      type: isImg ? 'image' : 'file',
      name: file.name,
      previewUrl: isImg ? URL.createObjectURL(file) : undefined,
    });
  };

  // Feedback Toggle
  const handleFeedback = (msgId: string, type: 'helpful' | 'unhelpful') => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedback: type } : m))
    );
    if (type === 'helpful') {
      onCharacterStateChange('SUCCESS');
    }
  };

  return (
    <div className="flex flex-col h-full w-full rounded-3xl bg-white border border-slate-200/90 shadow-xl overflow-hidden">
      {/* Console Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-100 shadow-2xs font-extrabold text-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-xs font-black text-slate-900 tracking-tight">AI Support Console</h3>
            <p className="text-[10px] text-slate-400 font-medium">Enterprise CRM Knowledge & Diagnostic Copilot</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setMessages([
              {
                id: `msg_welcome_${Date.now()}`,
                sender: 'ai',
                text: "Session refreshed! What CRM topic or error can I investigate for you?",
                timestamp: 'Just now',
                followUps: [
                  'How do I create an abandoned cart journey?',
                  'Why is my campaign failing with duplicate key error?',
                  'Help me build an audience with SQL',
                ],
              },
            ])
          }
          className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition"
        >
          <RefreshCw className="h-3 w-3" />
          Reset Chat
        </button>
      </div>

      {/* Message Feed Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200',
              msg.sender === 'user' ? 'items-end' : 'items-start'
            )}
          >
            {/* Sender Name & Time */}
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 px-1">
              <span>{msg.sender === 'user' ? 'You' : 'Maya (AI Colleague)'}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble */}
            <div
              className={cn(
                'max-w-[90%] sm:max-w-[85%] rounded-3xl p-4 text-xs leading-relaxed shadow-2xs',
                msg.sender === 'user'
                  ? 'bg-brand-600 text-white rounded-br-xs font-medium'
                  : 'bg-slate-50 border border-slate-200/90 text-slate-800 rounded-bl-xs'
              )}
            >
              {/* Attached file preview if present */}
              {msg.attachment && (
                <div className="mb-2.5 rounded-2xl bg-white/20 p-2 border border-white/20 flex items-center gap-2">
                  {msg.attachment.previewUrl ? (
                    <img
                      src={msg.attachment.previewUrl}
                      alt="Attachment Preview"
                      className="h-10 w-10 object-cover rounded-lg border border-white/40 shadow-xs"
                    />
                  ) : (
                    <FileText className="h-6 w-6 text-white" />
                  )}
                  <div className="truncate">
                    <span className="font-bold block truncate">{msg.attachment.name}</span>
                    <span className="text-[9px] opacity-80 uppercase">{msg.attachment.type}</span>
                  </div>
                </div>
              )}

              {/* Main Message Text */}
              <div className="whitespace-pre-line font-medium">{msg.text}</div>

              {/* =========================================================================
                  RICH INTERACTIVE CARD 1: DIAGNOSTIC & ROOT CAUSE CARD
                 ========================================================================= */}
              {msg.diagnostic?.error && (
                <div className="mt-3.5 rounded-2xl bg-white p-3.5 border border-rose-200/80 shadow-xs space-y-2.5 text-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2 text-rose-700 font-extrabold text-xs">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{msg.diagnostic.error.code}</span>
                    </div>
                    <span className="rounded-full bg-rose-50 px-2 py-0.2 text-[9px] font-bold text-rose-700 border border-rose-200">
                      {msg.diagnostic.error.category}
                    </span>
                  </div>

                  <div>
                    <span className="font-bold text-slate-900 block mb-0.5">Likely Root Cause:</span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{msg.diagnostic.error.likelyCause}</p>
                  </div>

                  <div>
                    <span className="font-bold text-slate-900 block mb-1">Recommended Action Steps:</span>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 font-medium">
                      {msg.diagnostic.error.fixSteps.map((st, i) => (
                        <li key={i}>{st}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-xl bg-emerald-50/70 p-2 border border-emerald-200 text-[11px] text-emerald-800">
                    <span className="font-bold">Verification: </span>
                    {msg.diagnostic.error.verification}
                  </div>
                </div>
              )}

              {/* =========================================================================
                  RICH INTERACTIVE CARD 2: STEP-BY-STEP WALKTHROUGH
                 ========================================================================= */}
              {msg.diagnostic?.steps && !msg.diagnostic.error && (
                <div className="mt-3.5 rounded-2xl bg-white p-3.5 border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-brand-600" />
                      Guided Implementation Steps
                    </span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.2 text-[9px] font-bold text-brand-700">
                      {msg.diagnostic.steps.length} Milestones
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {msg.diagnostic.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-700">
                        <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[10px] text-slate-600">
                          {idx + 1}
                        </span>
                        <span className="leading-snug pt-0.5">{step}</span>
                      </div>
                    ))}
                  </div>

                  {msg.diagnostic.navigation && (
                    <a
                      href={msg.diagnostic.navigation.path}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 transition"
                    >
                      {msg.diagnostic.navigation.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}

              {/* =========================================================================
                  RICH INTERACTIVE CARD 3: SYNTAX-HIGHLIGHTED SQL & CODE BLOCK
                 ========================================================================= */}
              {msg.diagnostic?.sqlQuery && (
                <div className="mt-3 rounded-2xl bg-slate-900 text-slate-100 p-3 shadow-md border border-slate-800 text-[11px] font-mono">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px]">
                      <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Optimized SQL Query</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.diagnostic?.sqlQuery || '', msg.id)}
                      className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 transition"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy SQL
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre leading-relaxed text-emerald-300">
                    {msg.diagnostic.sqlQuery}
                  </pre>
                </div>
              )}

              {/* =========================================================================
                  RICH INTERACTIVE CARD 4: JOURNEY FLOW DIAGRAM
                 ========================================================================= */}
              {msg.diagnostic?.flowDiagram && (
                <div className="mt-3 rounded-2xl bg-white p-3 border border-indigo-100 shadow-2xs space-y-2">
                  <span className="font-extrabold text-slate-900 text-[11px] flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5 text-indigo-600" />
                    {msg.diagnostic.flowDiagram.title}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {msg.diagnostic.flowDiagram.nodes.map((node, i, arr) => (
                      <React.Fragment key={i}>
                        <span className="rounded-xl bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 border border-slate-200">
                          {node}
                        </span>
                        {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-slate-400" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons for AI Responses */}
              {msg.sender === 'ai' && (
                <div className="mt-3.5 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                  {/* Feedback Buttons */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold">Helpful?</span>
                    <button
                      type="button"
                      onClick={() => handleFeedback(msg.id, 'helpful')}
                      className={cn(
                        'rounded-lg p-1 transition',
                        msg.feedback === 'helpful' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-700'
                      )}
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedback(msg.id, 'unhelpful')}
                      className={cn(
                        'rounded-lg p-1 transition',
                        msg.feedback === 'unhelpful' ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:text-slate-700'
                      )}
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Escalate to Human Support Button */}
                  <button
                    type="button"
                    onClick={() => handleEscalateToSupport(msg)}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-slate-800 transition"
                  >
                    <Ticket className="h-3 w-3 text-brand-300" />
                    Escalate to Support
                  </button>
                </div>
              )}
            </div>

            {/* Smart Contextual Follow-up Chips */}
            {msg.followUps && msg.followUps.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pl-2 pt-1 max-w-[90%]">
                {msg.followUps.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-600 border border-slate-200 shadow-2xs hover:bg-brand-50 hover:text-brand-800 hover:border-brand-300 transition"
                  >
                    💡 {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200/80 animate-pulse">
            <Sparkles className="h-4 w-4 text-brand-600 animate-spin" />
            <span className="font-bold">{processingStatus}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-100 p-3.5 bg-slate-50/50">
        {attachedFile && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-1.5 text-xs text-brand-800 border border-brand-200">
            <div className="flex items-center gap-2 truncate">
              <Paperclip className="h-3.5 w-3.5" />
              <span className="font-bold truncate">{attachedFile.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              className="text-brand-600 hover:text-brand-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500">
          <textarea
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask Maya anything, paste error log, SQL query, or upload screenshot…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-xs focus:outline-hidden max-h-32 text-slate-800 font-medium placeholder-slate-400"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.sql,.json,.log,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Upload Screenshot or Error Log"
            >
              <ImageIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsVoiceListening(!isVoiceListening)}
              className={cn(
                'rounded-xl p-1.5 transition',
                isVoiceListening ? 'bg-rose-100 text-rose-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
              )}
              title="Voice Speech Input"
            >
              {isVoiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={(!input.trim() && !attachedFile) || isProcessing}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Support Ticket Modal Dialog */}
      {ticketModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 font-extrabold text-sm border border-rose-100">
                  <Ticket className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Support Ticket Generated</h3>
                  <p className="text-[10px] text-slate-400">{ticketModalData.ticketId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTicketModalData(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="font-bold text-slate-400 text-[10px] uppercase block">Issue Summary</span>
                <p className="font-extrabold text-slate-900 mt-0.5">{ticketModalData.summary}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="font-bold text-slate-400 text-[10px] uppercase block">AI Diagnostic Report</span>
                <pre className="font-mono text-[11px] text-slate-700 mt-0.5 whitespace-pre-line">
                  {ticketModalData.diagnostics}
                </pre>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="font-bold text-slate-400 text-[10px] uppercase block">Steps Attempted</span>
                <pre className="text-[11px] text-slate-700 mt-0.5 whitespace-pre-line font-medium">
                  {ticketModalData.stepsTried}
                </pre>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setTicketModalData(null)}
                className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 text-xs transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(ticketModalData, null, 2));
                  alert(`Ticket ${ticketModalData.ticketId} copied to clipboard and escalated to Marbee Support!`);
                  setTicketModalData(null);
                }}
                className="rounded-xl bg-brand-600 px-5 py-2 font-extrabold text-white text-xs shadow-md shadow-brand-600/30 hover:bg-brand-700 active:scale-95 transition"
              >
                Copy & Submit to Support Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
