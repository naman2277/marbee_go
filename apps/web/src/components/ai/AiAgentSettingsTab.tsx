import { useState, useEffect } from 'react';
import { Settings, Cpu, Check, ExternalLink, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAiModelsConfig, type AiModelConfig } from '@/lib/ai-engine-config';

export function AiAgentSettingsTab() {
  const navigate = useNavigate();
  const { tenantId, environment } = useAuth();
  const [models, setModels] = useState<AiModelConfig[]>([]);
  const [modelMode, setModelMode] = useState<'live_rag' | 'fast_stream'>('live_rag');

  useEffect(() => {
    fetchAiModelsConfig(tenantId, environment).then((data) => {
      if (data) setModels(data);
    });
  }, [tenantId, environment]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto font-sans">
      <div className="flex items-center justify-between border-b border-slate-200/90 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 font-extrabold text-sm border border-purple-200 shadow-xs">
              <Settings className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-black text-slate-900">AI Engine &amp; Copilot Settings</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Configure reasoning models, credentials vault, and diagnostic engine behaviors.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/settings/ai-engine')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-xl transition shadow-sm"
        >
          <span>Open AI Engine Vault</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Intelligence Tier Selector */}
        <div className="rounded-3xl bg-white p-6 border border-slate-200/90 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
            <Cpu className="h-4 w-4 text-purple-600" />
            <span>Reasoning Pipeline Mode</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setModelMode('live_rag')}
              className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-2 ${
                modelMode === 'live_rag'
                  ? 'border-purple-600 bg-purple-50/60 ring-1 ring-purple-600/30'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">Live RAG + Database Schema Engine</span>
                {modelMode === 'live_rag' && <Check className="h-4 w-4 text-purple-600" />}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Evaluates prompt with full platform schema, live customer metrics, and real-time database querying.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setModelMode('fast_stream')}
              className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-2 ${
                modelMode === 'fast_stream'
                  ? 'border-purple-600 bg-purple-50/60 ring-1 ring-purple-600/30'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">High-Throughput Fast Stream</span>
                {modelMode === 'fast_stream' && <Check className="h-4 w-4 text-purple-600" />}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Optimized for low latency copywriting and instant natural language template drafts.
              </p>
            </button>
          </div>
        </div>

        {/* Connected AI Engine Status List */}
        <div className="rounded-3xl bg-white p-6 border border-slate-200/90 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
              <Key className="h-4 w-4 text-purple-600" />
              <span>Configured LLM Reasoning Engines</span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/settings/ai-engine')}
              className="text-xs font-bold text-purple-600 hover:underline"
            >
              Manage in Settings &rarr;
            </button>
          </div>

          <div className="space-y-2">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center font-bold text-xs">
                    {m.provider.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="block text-xs font-black text-slate-900">{m.providerName} ({m.modelName})</span>
                    <span className="block text-[10px] text-slate-500 font-mono">
                      Max Tokens: {m.maxTokens} &bull; Temp: {m.temperature}
                    </span>
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  m.apiKey
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {m.apiKey ? '● Configured & Active' : 'Unconfigured'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
