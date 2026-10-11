import { CheckCircle2, Circle, XCircle, AlertTriangle } from 'lucide-react';
import type { RtmMessage } from '@/lib/rtm';

const OK = new Set(['sent', 'delivered', 'rendered', 'matched', 'accepted']);
const BAD = new Set(['failed', 'invalid', 'dead_letter']);
const WARN = new Set(['suppressed', 'skipped', 'no_match']);

function iconFor(state: string) {
  if (BAD.has(state)) return <XCircle className="h-4 w-4 text-red-500" />;
  if (WARN.has(state)) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (OK.has(state)) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <Circle className="h-4 w-4 text-slate-300" />;
}

export function RtmMessageTrace({ message, compact = false }: { message: RtmMessage; compact?: boolean }) {
  const history = message.state_history ?? [];
  const t0 = history[0] ? new Date(history[0].at).getTime() : 0;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <ol className="relative space-y-2 border-l border-slate-200 pl-4">
        {history.map((step, i) => {
          const ms = t0 ? new Date(step.at).getTime() - t0 : 0;
          return (
            <li key={i} className="relative">
              <span className="absolute -left-[25px] top-0 bg-white">{iconFor(step.state)}</span>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold capitalize text-slate-800">{step.state.replace(/_/g, ' ')}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-400">+{ms} ms</span>
              </div>
              {step.detail && <p className="text-xs text-slate-500">{step.detail}</p>}
            </li>
          );
        })}
      </ol>

      {!compact && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Block title="Recipient" body={message.recipient} />
          <Block title="Payload" body={message.payload} />
          {message.rendered && <Block title="Rendered" body={message.rendered} />}
          <div className="rounded-lg border border-slate-200 p-3 text-xs">
            <p className="mb-1 font-semibold text-slate-700">Delivery</p>
            <dl className="space-y-0.5 text-slate-500">
              <Kv k="channel" v={message.channel} />
              <Kv k="provider" v={message.provider} />
              <Kv k="credits" v={String(message.cost_credits)} />
              <Kv k="attempts" v={String(message.attempts)} />
              {message.reason_code && <Kv k="reason" v={message.reason_code} />}
              {message.error_detail && <Kv k="error" v={message.error_detail} />}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Block({ title, body }: { title: string; body: unknown }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-1 text-xs font-semibold text-slate-700">{title}</p>
      <pre className="max-h-40 overflow-auto font-mono text-[10px] leading-relaxed text-slate-600">
        {JSON.stringify(body, null, 2)}
      </pre>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return <div className="flex gap-2"><dt className="w-16 shrink-0 text-slate-400">{k}</dt><dd className="break-all text-slate-600">{v}</dd></div>;
}
