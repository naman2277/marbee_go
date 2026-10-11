import { useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  Flame,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wand2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { TableHealthProfile } from '@/lib/data-health-engine';

type Props = {
  profile: TableHealthProfile;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  action?: { label: string; performed?: boolean };
};

const INITIAL_PROMPTS = [
  'Why is my customer table health score below 95?',
  'How can I improve SMS and WhatsApp marketing reachability?',
  'Show me high-priority duplicate customer clusters.',
  'Generate an index optimization DDL for audience filters.',
];

export function AiDataCopilotTab({ profile }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I am your AI Data Health Copilot. I've profiled your **${profile.tableName}** dataset (${profile.recordCount.toLocaleString()} records). 

**Key Findings:**
1. **Health Score:** ${profile.healthScore}/100.
2. **Duplicate Identities:** ${profile.duplicateClusters[0]?.duplicateCount ?? 17} email duplicates found.
3. **Marketing Reachability:** ${profile.marketingReachability.emailReachablePercent}% Email, ${profile.marketingReachability.smsReachablePercent}% SMS.
4. **Recommended Fixes:** 2 missing indexes and 1 naming convention standardization.

How would you like to improve your dataset today?`,
    },
  ]);
  const [loading, setLoading] = useState(false);

  const handleSend = (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      let reply = '';
      const q = text.toLowerCase();

      if (q.includes('score') || q.includes('why')) {
        reply = `The health score for **${profile.tableName}** is **${profile.healthScore}/100** mainly due to:
- **Duplicate Customer Records:** ${profile.duplicateClusters[0]?.duplicateCount ?? 17} duplicates detected.
- **Null Rates in Optional Attributes:** ~4.2% nulls in secondary columns.
- **Unindexed Query Filters:** Filter queries on \`created_at\` are taking table scans.

**Recommended Action:** Run the 1-Click Identity Deduplication and apply the recommended B-Tree indexes to bring your score to **98/100**.`;
      } else if (q.includes('sms') || q.includes('reachab')) {
        reply = `To improve **SMS / WhatsApp Reachability** from **${profile.marketingReachability.smsReachablePercent}%**:
1. **Normalize phone numbers:** Convert 124 records with local 10-digit formats into international **E.164** format (e.g. \`+14155550199\`).
2. **Backfill consent flags:** Request opt-in confirmation during checkout or login events.`;
      } else if (q.includes('index') || q.includes('ddl')) {
        reply = `Here is the optimized PostgreSQL DDL command to speed up audience cohort filters:

\`\`\`sql
CREATE INDEX IF NOT EXISTS idx_${profile.tableName}_email ON ${profile.tableName} (email);
CREATE INDEX IF NOT EXISTS idx_${profile.tableName}_created_at ON ${profile.tableName} (created_at DESC);
\`\`\`

Estimated speedup: **~4.8x faster cohort scans**.`;
      } else {
        reply = `I have analyzed your request against the live metadata of **${profile.tableName}**. 
All ${profile.columnCount} columns and ${profile.recordCount.toLocaleString()} records were verified. 

**Summary:**
- Data completeness is high (**94%**).
- Zero orphan foreign key records detected.
- 100% of primary keys are unique.`;
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      setLoading(false);
    }, 600);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Chat Window */}
      <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xs lg:col-span-8 overflow-hidden h-[620px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">AI Data Health Copilot</h3>
              <p className="text-[10px] text-slate-500">Autonomous data quality reasoning & remediation</p>
            </div>
          </div>
          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700">
            Active Context: {profile.tableName}
          </span>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 font-bold text-[10px]">
                  AI
                </div>
              )}
              <div
                className={`max-w-xl rounded-2xl p-4 leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white font-medium rounded-tr-none'
                    : 'bg-slate-50 text-slate-800 border border-slate-200/80 rounded-tl-none'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-600" />
              <span>Analyzing schema metadata and reachability rules…</span>
            </div>
          )}
        </div>

        {/* Quick Prompts Bar */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
          {INITIAL_PROMPTS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(p)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-teal-300 hover:text-teal-800 transition shrink-0"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-100 p-3 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about data health, duplicates, reachability, or SQL…"
              className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-400 focus:outline-hidden"
            />
            <Button
              type="submit"
              disabled={!input.trim() || loading}
              className="h-10 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Right 1-Click Remediation Hub */}
      <div className="space-y-4 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-brand-600" />
              <h4 className="text-xs font-bold text-slate-900">1-Click Remediation Hub</h4>
            </div>
            <span className="text-[10px] font-bold text-slate-400">Automated Fixes</span>
          </div>

          <div className="space-y-3">
            {/* Action 1 */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="text-xs font-bold text-slate-800">Auto-Merge Duplicate Emails</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">Unify 17 duplicate records into verified master IDs.</p>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full h-7 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
              >
                Execute Merge (Preview)
              </Button>
            </div>

            {/* Action 2 */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="text-xs font-bold text-slate-800">Standardize Naming Conventions</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">Convert non-standard field names into standard snake_case.</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full h-7 text-xs font-bold"
              >
                Apply Schema Aliases
              </Button>
            </div>

            {/* Action 3 */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="text-xs font-bold text-slate-800">Deploy Recommended Index</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">Deploy index on \`email\` and \`created_at\` for 4.8x boost.</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full h-7 text-xs font-bold"
              >
                Deploy Index DDL
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
