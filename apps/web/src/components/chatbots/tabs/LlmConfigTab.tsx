import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, Cpu, Gauge, CheckCircle2, XOctagon } from 'lucide-react';
import { SectionCard, Field, Toggle, SegmentedControl, fieldInput, TabHeading } from '../studio-ui';
import type { TabProps } from '../types';
import { fetchChatBotLlmHealth, isLlmUnhealthy, describeLlmError } from '@/lib/chatbots';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function LlmConfigTab({ draft, update, providers }: TabProps) {
  const bot = draft.bot;
  const set = (patch: Partial<typeof bot>) => update((d) => ({ ...d, bot: { ...d.bot, ...patch } }));
  const selectedProvider = providers.find((p) => p.id === bot.llm_provider_id);

  // Live health — refetches on focus and every 20s so a failing test shows here.
  const { data: health } = useQuery({
    queryKey: ['chatbot-llm-health', bot.id],
    queryFn: () => fetchChatBotLlmHealth(bot.id),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
  const unhealthy = health ? isLlmUnhealthy(health) : false;
  const diag = unhealthy ? describeLlmError(health?.llm_last_error) : null;

  return (
    <div className="space-y-5">
      <TabHeading title="LLM Configuration" description="Choose the model that powers replies. Providers come from Settings → AI Engine." />

      {health && (unhealthy ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <XOctagon className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div className="min-w-0">
            <p className="font-bold">{diag?.title} — the bot is replying with the fallback message.</p>
            <p className="mt-0.5 text-xs text-rose-700">{diag?.detail}</p>
            {health.llm_last_error && <p className="mt-1 truncate font-mono text-[11px] text-rose-500" title={health.llm_last_error}>{health.llm_last_error}</p>}
            {health.llm_last_error_at && <p className="mt-1 text-[11px] text-rose-500">Last failure {timeAgo(health.llm_last_error_at)}.</p>}
          </div>
        </div>
      ) : health.llm_last_success_at ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> LLM responding normally — last successful reply {timeAgo(health.llm_last_success_at)}.
        </div>
      ) : null)}

      {providers.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            No LLM providers are configured for this workspace yet.{' '}
            <Link to="/settings/ai-engine" className="font-semibold underline">Configure one in Settings → AI Engine</Link>{' '}
            before this bot can go live.
          </div>
        </div>
      )}

      <SectionCard icon={Cpu} title="Model" description="Only providers already configured in Settings → AI Engine can be selected.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="LLM Provider" required>
            <select className={fieldInput} value={bot.llm_provider_id ?? ''} onChange={(e) => set({ llm_provider_id: e.target.value || null })}>
              <option value="">Select a provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.provider_name} — {p.model_name}{p.status === 'connected' ? '' : ' (unverified)'}</option>
              ))}
            </select>
          </Field>
          <Field label="Model" hint="Set from the provider's configuration.">
            <input className={`${fieldInput} bg-slate-50 text-slate-500`} disabled value={selectedProvider?.model_name ?? '—'} />
          </Field>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-[11px] text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          API keys are never stored on this bot or sent to the browser — the runtime resolves them server-side from Edge Function secrets at message time.
        </div>
      </SectionCard>

      <SectionCard icon={Gauge} title="Generation Settings" description="Tune how the model responds.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Response Style" className="col-span-2">
            <SegmentedControl
              value={bot.llm_response_style}
              onChange={(v) => set({ llm_response_style: v })}
              options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]}
            />
          </Field>
          <Field label={`Temperature — ${bot.llm_temperature.toFixed(2)}`} hint="0 = focused, 1 = creative.">
            <input type="range" min={0} max={1} step={0.05} className="w-full accent-brand-600" value={bot.llm_temperature} onChange={(e) => set({ llm_temperature: Number(e.target.value) })} />
          </Field>
          <Field label="Maximum Output Tokens">
            <input type="number" min={64} step={64} className={fieldInput} value={bot.llm_max_output_tokens} onChange={(e) => set({ llm_max_output_tokens: Number(e.target.value) })} />
          </Field>
          <Field label="Timeout (seconds)">
            <input type="number" min={5} className={fieldInput} value={bot.llm_timeout_seconds} onChange={(e) => set({ llm_timeout_seconds: Number(e.target.value) })} />
          </Field>
          <Field label="Retry Count">
            <input type="number" min={0} max={5} className={fieldInput} value={bot.llm_retry_count} onChange={(e) => set({ llm_retry_count: Number(e.target.value) })} />
          </Field>
          <div className="col-span-2">
            <Toggle checked={bot.llm_streaming} onChange={(v) => set({ llm_streaming: v })} label="Streaming Response" description="Stream tokens as they generate." />
          </div>
          <Field label="System Instruction" className="col-span-2" hint="Extra instruction prepended before the generated business context.">
            <textarea className={fieldInput} rows={4} value={bot.llm_system_instruction ?? ''} onChange={(e) => set({ llm_system_instruction: e.target.value })} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}
