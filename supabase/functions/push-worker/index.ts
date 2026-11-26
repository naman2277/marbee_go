// push-worker — drains the Web Push outbox (sql/95, D-022).
//
// Called ONLY with PUSH_WORKER_SECRET (or the service-role key): by pg_cron every minute (push_worker_tick →
// Vault push_worker_url / push_worker_key) and right after something is queued
// (enqueue_web_push → push_worker_kick). Claims batches with SKIP LOCKED, so several
// overlapping runs never send the same row twice. Each row's outcome is recorded by
// complete_web_push(): delivered · retry with backoff · invalid token (device pruned)
// · failed. Runs for at most ~45 s per call.
//
// Deploy with "Enforce JWT Verification" OFF (pg_net calls it with the service key;
// the key is checked in code).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { isServiceCaller } from '../_shared/tenant-guard.ts';
import { constantTimeEqual } from '../_shared/webhook-sig.ts';
import { isSealed, openSecret, sealSecret } from '../_shared/secret-box.ts';
import {
  explainFcmError,
  loadServiceAccountJson,
  normalizeContent,
  parseServiceAccount,
  sendFcm,
  type SendResult,
  type ServiceAccount,
} from '../_shared/web-push.ts';

// D-024 throughput: claim 500 at a time, 40 FCM calls in flight, record a batch's outcomes in
// one database call, stop after MAX_PER_RUN (stays inside the per-invocation CPU limit) and
// re-start itself while work remains. pg_cron starts one worker per ~3,000 due pushes (max 10).
const BATCH = 500;
const MAX_PER_RUN = 3_000;

/** Cron / pg_net callers present PUSH_WORKER_SECRET (a dedicated random secret, also stored
 *  in Vault as push_worker_key). The service-role key is accepted too. */
function isWorkerCaller(req: Request): boolean {
  if (isServiceCaller(req)) return true;
  const secret = Deno.env.get('PUSH_WORKER_SECRET') ?? '';
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return secret.length >= 32 && token.length > 0 && constantTimeEqual(token, secret);
}
const CONCURRENCY = 40;
const BUDGET_MS = 40_000;

type Outcome = { id: string; outcome: SendResult['outcome']; error: string | null; retry_after: number | null };

type Row = {
  id: string; tenant_id: string; environment: string; message_id: string; content: Record<string, unknown>;
  journey_id: string | null; delivery_id: string | null; delivery_name: string | null; provider_id: string | null;
  fcm_token: string; attempts: number;
};

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!isWorkerCaller(req)) return errorResponse('Unauthorized', 401);

  const supabase = getServiceClient();
  const engageUrl = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/push-engage`;
  const providers = new Map<string, Promise<{ sa?: ServiceAccount; error?: string; transient?: boolean }>>();
  const started = Date.now();
  const totals = { claimed: 0, delivered: 0, retry: 0, invalid_token: 0, failed: 0 };

  const providerFor = (row: Row) => {
    const key = `${row.tenant_id}|${row.environment}|${row.provider_id ?? 'default'}`;
    if (!providers.has(key)) {
      providers.set(key, (async () => {
        let q = supabase.from('channel_providers').select('id, tenant_id, credentials_encrypted, status')
          .eq('tenant_id', row.tenant_id).eq('environment', row.environment).eq('channel', 'web_push');
        q = row.provider_id ? q.eq('id', row.provider_id) : q.eq('is_default', true);
        const { data, error } = await q.limit(1).maybeSingle();
        if (error) return { error: `Provider lookup failed: ${error.message}`, transient: true };
        if (!data) return { error: 'No default Web Push (Firebase) provider for this environment — add one in Channels → Web Push' };
        if (data.status && data.status !== 'active') return { error: 'The Web Push provider is disabled' };
        try {
          const raw = await loadServiceAccountJson(supabase, data, { openSecret, sealSecret, isSealed });
          if (!raw) return { error: 'Firebase service-account JSON is not configured (Channels → Web Push)' };
          return { sa: parseServiceAccount(raw) };
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          return { error: m, transient: /MARBEE_SECRETS_KEY/.test(m) };
        }
      })());
    }
    return providers.get(key)!;
  };

  // One database call per batch; falls back to one call per row (e.g. before sql/96 runs).
  const record = async (outcomes: Outcome[]) => {
    if (!outcomes.length) return;
    const { error } = await supabase.rpc('complete_web_push_batch', { p_results: outcomes });
    if (!error) return;
    console.error('complete_web_push_batch failed, recording row by row', error.message);
    await runPool(outcomes, 10, async (o) => {
      const { error: cErr } = await supabase.rpc('complete_web_push', {
        p_id: o.id, p_outcome: o.outcome, p_error: o.error, p_retry_after_seconds: o.retry_after,
      });
      // If this fails too, the row's lock expires and it is retried — at-least-once.
      if (cErr) console.error('complete_web_push failed', o.id, cErr.message);
    });
  };

  try {
    let hitCap = false;
    while (Date.now() - started < BUDGET_MS) {
      if (totals.claimed >= MAX_PER_RUN) { hitCap = true; break; }
      const { data, error } = await supabase.rpc('claim_web_push_batch', { p_limit: Math.min(BATCH, MAX_PER_RUN - totals.claimed) });
      if (error) {
        console.error('claim_web_push_batch failed', error.message);
        return errorResponse('Could not claim work', 500);
      }
      const batch = (data ?? []) as Row[];
      if (!batch.length) break;
      totals.claimed += batch.length;

      const outcomes: Outcome[] = [];
      await runPool(batch, CONCURRENCY, async (row) => {
        let result: SendResult;
        const prov = await providerFor(row);
        if (!prov.sa) {
          result = { outcome: prov.transient ? 'retry' : 'failed', error: prov.error };
        } else {
          result = await sendFcm(prov.sa, row.fcm_token, normalizeContent(row.content ?? {}), {
            message_id: row.message_id,
            tenant_id: row.tenant_id,
            environment: row.environment,
            journey_id: row.journey_id,
            delivery_id: row.delivery_id,
            delivery_name: row.delivery_name,
            engage_url: engageUrl,
          });
        }
        totals[result.outcome] += 1;
        outcomes.push({
          id: row.id,
          outcome: result.outcome,
          error: result.error ? explainFcmError(result.error).slice(0, 500) : null,
          retry_after: result.retryAfterSeconds ?? null,
        });
      });
      await record(outcomes);
      if (batch.length < BATCH && totals.claimed < MAX_PER_RUN) break;
    }

    // More due work than this run may take: start a replacement worker now instead of
    // waiting for the next cron minute (keeps a large blast draining continuously).
    let restarted = false;
    if (hitCap || Date.now() - started >= BUDGET_MS) {
      const { data: due } = await supabase.rpc('web_push_due_count');
      if (Number(due ?? 0) > 0) {
        const { data: kicked } = await supabase.rpc('push_worker_kick');
        restarted = kicked === true;
      }
    }
    return jsonResponse({ ok: true, ...totals, restarted, ms: Date.now() - started });
  } catch (e) {
    console.error('push-worker unhandled', e instanceof Error ? e.message : e);
    return errorResponse('Internal error', 500);
  }
});
