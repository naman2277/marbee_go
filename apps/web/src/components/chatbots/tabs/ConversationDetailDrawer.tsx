import { useQuery } from '@tanstack/react-query';
import { X, Bot, User, Zap, Gauge, AlertCircle, Star } from 'lucide-react';
import { Badge } from '@/components/ui';
import { fetchConversationDetail, type ChatBotSentiment } from '@/lib/chatbots';

const SENTIMENT_ICON: Record<ChatBotSentiment, string> = { positive: '🟢', neutral: '🔵', negative: '🔴', mixed: '🟡' };

function maskIfPii(fieldName: string, value: string | null): string {
  if (!value) return '';
  if (fieldName.toLowerCase().includes('email')) {
    const [user, domain] = value.split('@');
    if (!domain) return value;
    return `${user.slice(0, 1)}***@${domain}`;
  }
  if (fieldName.toLowerCase().includes('phone') || fieldName.toLowerCase().includes('mobile')) {
    return value.replace(/\d(?=\d{3})/g, '*');
  }
  return value;
}

export function ConversationDetailDrawer({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['chatbot-conversation-detail', conversationId],
    queryFn: () => fetchConversationDetail(conversationId),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">Conversation Detail</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {isLoading && <div className="p-8 text-center text-sm text-slate-400">Loading…</div>}

        {data && (
          <div className="space-y-6 p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {data.conversation.sentiment && <Badge variant="default">{SENTIMENT_ICON[data.conversation.sentiment]} {data.conversation.sentiment}</Badge>}
              <Badge>{data.conversation.status}</Badge>
              <Badge>Lead: {data.conversation.lead_status.replace('_', ' ')}</Badge>
              {data.conversation.intent && <Badge>Intent: {data.conversation.intent}</Badge>}
              {data.conversation.closed_reason && <Badge>Closed: {data.conversation.closed_reason.replace('_', ' ')}</Badge>}
              <span className="text-slate-400">Language: {data.conversation.language ?? '—'}</span>
            </div>

            {data.conversation.feedback_rating != null && (
              <div className="flex items-center gap-3 rounded-xl border border-yellow-100 bg-yellow-50 p-3">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={`h-4 w-4 ${i <= data.conversation.feedback_rating! ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                  ))}
                </div>
                <span className="text-xs font-semibold text-yellow-800">{data.conversation.feedback_rating}/5</span>
                {data.conversation.feedback_comment && (
                  <span className="text-xs text-yellow-700">&mdash; {data.conversation.feedback_comment}</span>
                )}
              </div>
            )}

            {data.conversation.summary && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">{data.conversation.summary}</div>
            )}

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Timeline</h4>
              <div className="space-y-3">
                {data.messages.map((m) => (
                  <div key={m.id} className={`flex gap-2 ${m.sender_type === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${m.sender_type === 'bot' ? 'bg-brand-100' : 'bg-slate-200'}`}>
                      {m.sender_type === 'bot' ? <Bot className="h-3.5 w-3.5 text-brand-600" /> : <User className="h-3.5 w-3.5 text-slate-600" />}
                    </div>
                    <div className="max-w-[80%]">
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.sender_type === 'bot' ? 'bg-slate-100 text-slate-800 rounded-bl-md' : 'bg-brand-600 text-white rounded-br-md'}`}>
                        {m.message_text}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                        {m.sender_type === 'bot' && m.llm_model && <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3" />{m.llm_model}</span>}
                        {m.sender_type === 'bot' && m.latency_ms != null && <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" />{m.latency_ms}ms</span>}
                        {m.sender_type === 'bot' && m.total_tokens != null && <span>{m.total_tokens} tok</span>}
                        {m.sentiment && <span>{SENTIMENT_ICON[m.sentiment]}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Captured Data</h4>
              {data.capturedData.length === 0 ? (
                <p className="text-xs text-slate-400">No structured data captured in this conversation.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50 text-left text-slate-500"><th className="px-3 py-2 font-semibold">Field</th><th className="px-3 py-2 font-semibold">Value</th><th className="px-3 py-2 font-semibold">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.capturedData.map((cd) => (
                        <tr key={cd.id}>
                          <td className="px-3 py-2 font-medium text-slate-700">{cd.field_name}</td>
                          <td className="px-3 py-2 text-slate-600">{maskIfPii(cd.field_name, cd.field_value)}</td>
                          <td className="px-3 py-2">
                            <Badge variant={cd.mapped_status === 'mapped' ? 'success' : cd.mapped_status === 'failed' ? 'error' : 'default'}>{cd.mapped_status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {data.ctaEvents.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">CTA Interactions</h4>
                <div className="flex flex-wrap gap-1.5">
                  {data.ctaEvents.map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      <AlertCircle className="h-3 w-3" /> {e.event_type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
