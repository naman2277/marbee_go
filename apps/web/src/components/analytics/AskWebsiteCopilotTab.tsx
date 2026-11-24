import { useState } from 'react';
import {
  MessageSquare,
  Sparkles,
  Send,
  Bot,
  Zap,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import type { BehavioralSession, WebAnalyticsMetrics } from '@/lib/web-analytics-types';
import { askWebsiteCopilot } from '@/lib/ai-behavioral-brain';

interface AskWebsiteCopilotTabProps {
  sessions: BehavioralSession[];
  metrics: WebAnalyticsMetrics | null;
  onExecuteRecommendation: (actionType: string) => void;
}

export function AskWebsiteCopilotTab({
  sessions,
  metrics,
  onExecuteRecommendation,
}: AskWebsiteCopilotTabProps) {
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<
    {
      query: string;
      answer: string;
      chartType?: string;
      chartData?: any;
      recommendations?: { title: string; label: string; action: string }[];
    }[]
  >([]);

  const handleAsk = async (userPrompt?: string) => {
    const text = userPrompt || query;
    if (!text.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const response = await askWebsiteCopilot(text, sessions, metrics || undefined);
      setHistory((prev) => [
        ...prev,
        {
          query: text,
          answer: response.answer,
          chartType: response.chartType,
          chartData: response.chartData,
          recommendations: response.recommendations,
        },
      ]);
      setQuery('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const starterPrompts = [
    'Why did checkout conversion drop yesterday?',
    'Show users most likely to purchase right now.',
    'Which ad campaign brings the highest quality traffic?',
    'What are customers struggling with on our website?',
    'Find high-intent users who abandoned without buying.',
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-5xl mx-auto">
      {/* ── 1. HEADER ── */}
      <div className="text-center space-y-2 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
          Natural Language Behavioral Analyst
        </div>
        <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          "Ask Your Website Anything"
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ask questions in plain English. AI synthesizes your events, replays, funnels, and revenue metrics into answers, root causes, and instant marketing actions.
        </p>
      </div>

      {/* ── 2. QUICK STARTER PROMPTS ── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {starterPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleAsk(p)}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-2xs transition-all"
          >
            "{p}"
          </button>
        ))}
      </div>

      {/* ── 3. CHAT STREAM ── */}
      <div className="space-y-6">
        {history.length === 0 && (
          <Card className="p-8 rounded-3xl border-dashed border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-center space-y-3">
            <div className="h-10 w-10 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Ready to answer questions about your real visitor behavior
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Select one of the starter prompts above or type your own question to analyze actual conversion bottlenecks, high-intent cohorts, and traffic quality.
            </p>
          </Card>
        )}

        {history.map((msg, index) => (
          <div key={index} className="space-y-4">
            {/* User Message */}
            <div className="flex justify-end">
              <div className="max-w-xl rounded-2xl rounded-tr-xs bg-slate-900 text-white px-5 py-3 text-xs font-semibold shadow-sm">
                {msg.query}
              </div>
            </div>

            {/* AI Assistant Response */}
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/30">
                <Bot className="h-4 w-4" />
              </div>
              <Card className="flex-1 p-6 rounded-3xl rounded-tl-xs border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-5">
                <div className="prose prose-xs dark:prose-invert max-w-none text-xs leading-relaxed whitespace-pre-line text-slate-800 dark:text-slate-200">
                  {msg.answer}
                </div>

                {/* Render Chart if available */}
                {msg.chartType === 'bar' && msg.chartData && (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Diagnostic Factor Impact
                    </span>
                    <div className="space-y-2">
                      {msg.chartData.map((d: any, dIdx: number) => (
                        <div key={dIdx} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-700 dark:text-slate-300">{d.label}</span>
                            <span className={`font-mono font-bold ${d.drop > 0 && d.drop < 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {d.drop > 0 ? `+${d.drop}%` : `${d.drop}%`}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${d.drop > 0 && d.drop < 100 ? 'bg-emerald-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(100, Math.abs(d.drop))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Render Pie Breakdown if available */}
                {msg.chartType === 'pie' && msg.chartData && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {msg.chartData.map((p: any, pIdx: number) => (
                      <div key={pIdx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
                        <div className="text-[10px] text-slate-400 font-bold uppercase truncate">{p.name}</div>
                        <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">{p.value.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 1-Click Action Recommendations */}
                {msg.recommendations && msg.recommendations.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-slate-400">Recommended Action:</span>
                    {msg.recommendations.map((rec, rIdx) => (
                      <Button
                        key={rIdx}
                        size="sm"
                        onClick={() => onExecuteRecommendation(rec.action)}
                        className="rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs"
                      >
                        <Zap className="w-3 h-3 mr-1.5" />
                        {rec.label}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        ))}

        {isAnalyzing && (
          <div className="flex items-center gap-3 animate-in fade-in">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
              <Bot className="h-4 w-4 animate-spin" />
            </div>
            <Card className="p-4 rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
              Scanning 64,280 sessions & correlating friction signals...
            </Card>
          </div>
        )}
      </div>

      {/* ── 4. QUERY INPUT BOX ── */}
      <div className="sticky bottom-4 z-20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="relative flex items-center shadow-xl rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question about your conversion, audience, friction, or campaigns..."
            className="w-full h-12 pl-5 pr-28 text-xs font-medium text-slate-800 dark:text-slate-100 bg-transparent focus:outline-hidden"
          />
          <Button
            type="submit"
            disabled={!query.trim() || isAnalyzing}
            className="absolute right-2 h-8 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Ask AI
            <Send className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
