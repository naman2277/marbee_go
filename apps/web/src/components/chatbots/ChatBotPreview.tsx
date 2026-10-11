import { Bot, Send, User } from 'lucide-react';
import type { ChatBotDraft } from './types';

// A live, non-interactive preview of how the published bot looks to a visitor.
// Reflects avatar, name, business, welcome message, placeholder, brand color,
// first required-field question, and branding — all updating as you edit.
export function ChatBotPreview({ draft }: { draft: ChatBotDraft }) {
  const bot = draft.bot;
  const color = draft.publish?.widget_primary_color || '#4f46e5';
  const firstRequired = draft.fields.find((f) => f.required);

  return (
    <div className="flex flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-xl" style={{ height: 560 }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/25">
          {bot.avatar_url ? (
            <img src={bot.avatar_url} alt="" className="h-10 w-10 object-cover" />
          ) : (
            <Bot className="h-5 w-5 text-white" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{bot.name || 'Untitled bot'}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-white/85">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
            {bot.business_name || 'Online'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-white to-slate-50 p-4">
        <Bubble side="bot" color={color}>
          {bot.welcome_message || 'Hi! How can I help you today?'}
        </Bubble>
        <Bubble side="user" color={color}>
          {firstRequired ? "Hi, I'd like some help." : 'Hello!'}
        </Bubble>
        {firstRequired && (
          <Bubble side="bot" color={color}>
            {firstRequired.ask_question || `Sure! What's your ${firstRequired.display_label.toLowerCase()}?`}
          </Bubble>
        )}
        {draft.ctas.filter((c) => c.is_active).slice(0, 2).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {draft.ctas
              .filter((c) => c.is_active)
              .slice(0, 2)
              .map((c) => (
                <span
                  key={c.id}
                  className="rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                  style={{ borderColor: `${color}55`, color, background: `${color}0f` }}
                >
                  {c.button_label}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-400">
            {bot.placeholder_text || 'Type your message…'}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: color }}>
            <Send className="h-4 w-4" />
          </div>
        </div>
        {bot.show_powered_by && (
          <p className="mt-2 text-center text-[10px] text-slate-400">{bot.powered_by_text || 'Powered by Marbee'}</p>
        )}
      </div>
    </div>
  );
}

function Bubble({ side, color, children }: { side: 'bot' | 'user'; color: string; children: React.ReactNode }) {
  const isBot = side === 'bot';
  return (
    <div className={`flex gap-2 ${isBot ? '' : 'flex-row-reverse'}`}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={isBot ? { background: `${color}1a`, color } : { background: '#e2e8f0', color: '#475569' }}
      >
        {isBot ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${isBot ? 'rounded-bl-md bg-slate-100 text-slate-800' : 'rounded-br-md text-white'}`}
        style={isBot ? undefined : { background: color }}
      >
        {children}
      </div>
    </div>
  );
}
