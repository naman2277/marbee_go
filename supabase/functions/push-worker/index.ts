// push-worker — drains the Web Push outbox (sql/95, D-022).
//
// Called ONLY with the service-role key: by pg_cron every minute (push_worker_tick →
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

const BATCH = 200;
const CONCURRENCY = 20;
const BUDGET_MS = 45_000;

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
  if (!isServiceCaller(req)) return errorResponse('Unauthorized', 401);

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

  try {
    while (Date.now() - started < BUDGET_MS) {
      const { data, error } = await supabase.rpc('claim_web_push_batch', { p_limit: BATCH });
      if (error) {
        console.error('claim_web_push_batch failed', error.message);
        return errorResponse('Could not claim work', 500);
      }
      const batch = (data ?? []) as Row[];
      if (!batch.length) break;
      totals.claimed += batch.length;

      await runPool(batch, CONCURRENCY, async (row) => {
        let result: SendResult;
        const p = await providerFor(row);
        if (!p.sa) {
          result = { outcome: p.transient ? 'retry' : 'failed', error: p.error };
        } else {
          const content = normalizeContent(row.content ?? {});
          result = await sendFcm(p.sa, row.fcm_token, content, {
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
        const { error: cErr } = await supabase.rpc('complete_web_push', {
          p_id: row.id,
          p_outcome: result.outcome,
          p_error: result.error ? explainFcmError(result.error).slice(0, 500) : null,
          p_retry_after_seconds: result.retryAfterSeconds ?? null,
        });
        // If this fails the row's lock expires and it is retried — at-least-once.
        if (cErr) console.error('complete_web_push failed', row.id, cErr.message);
      });

      if (batch.length < BATCH) break;
    }
    return jsonResponse({ ok: true, ...totals, ms: Date.now() - started });
  } catch (e) {
    console.error('push-worker unhandled', e instanceof Error ? e.message : e);
    return errorResponse('Internal error', 500);
  }
});
