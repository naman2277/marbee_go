import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, ExternalLink, Loader2 } from 'lucide-react';
import { logPushEngagement } from '@/lib/push-engage';

export function PushOpenPage() {
  const [params] = useSearchParams();
  const messageId = params.get('mid') ?? '';
  const tenantId = params.get('tid') ?? '';
  const environment = params.get('env') ?? 'production';
  const deliveryId = params.get('did') ?? undefined;
  const deliveryNameParam = params.get('dn') ?? undefined;
  const journeyIdParam = params.get('jid') ?? undefined;

  const [title, setTitle] = useState('Notification');
  const [body, setBody] = useState('');
  const [clickUrl, setClickUrl] = useState<string | null>(null);
  const [deliveryName, setDeliveryName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!messageId || !tenantId) {
      setError('Invalid push link — missing message or tenant.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const opened = await logPushEngagement({
          tenantId,
          environment,
          messageId,
          event: 'opened',
          deliveryId,
          deliveryName: deliveryNameParam,
          journeyId: journeyIdParam,
        });

        if (cancelled) return;

        setTitle(opened.title ?? 'Notification');
        setBody(opened.body ?? '');
        setClickUrl(safeHttpUrl(opened.click_url));
        setDeliveryName(opened.delivery_name ?? deliveryNameParam ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load notification');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messageId, tenantId, environment, deliveryId, deliveryNameParam, journeyIdParam]);

  const handleContinue = useCallback(async () => {
    try {
      await logPushEngagement({
        tenantId,
        environment,
        messageId,
        event: 'clicked',
        deliveryId,
        deliveryName: deliveryNameParam,
        journeyId: journeyIdParam,
      });
    } catch {
      /* still navigate */
    }
    if (clickUrl) {
      window.location.href = clickUrl;
    }
  }, [tenantId, environment, messageId, deliveryId, deliveryNameParam, journeyIdParam, clickUrl]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060810] text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Opening notification…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#060810] px-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <a href="/" className="mt-4 text-sm text-sky-400 hover:underline">
          Go to Marbee
        </a>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#0a1020] via-[#060810] to-[#040508]">
      <header className="flex items-center gap-3 border-b border-slate-800/80 px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">
            Web push delivery
          </p>
          {deliveryName && <p className="text-xs text-slate-500">{deliveryName}</p>}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900/60 p-8 shadow-2xl shadow-sky-950/40 backdrop-blur">
          <h1 className="text-2xl font-bold leading-tight text-white">{title}</h1>
          {body && <p className="mt-4 text-base leading-relaxed text-slate-300">{body}</p>}
          <p className="mt-6 font-mono text-[10px] text-slate-600">Message {messageId.slice(0, 8)}</p>
        </div>

        {clickUrl ? (
          <button
            type="button"
            onClick={() => void handleContinue()}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 hover:bg-sky-500"
          >
            Continue
            <ExternalLink className="h-4 w-4" />
          </button>
        ) : null}
      </main>
    </div>
  );
}

/** Only follow absolute http(s) links (no javascript:, data:, etc.). */
function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
