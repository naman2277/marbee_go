// Pipeline run worker (Phase B) — turns a queued data_job_run into a real
// execution: validate -> topological plan -> per-node executors -> node runs,
// structured logs, checkpoints, final status + stats.
//
//   POST /functions/v1/pipeline-run-worker  { "run_id": "<uuid>" }
//
// Auth: the service role key, or a Supabase user JWT whose account belongs to
// the run's tenant. Claims the run with a compare-and-set on status='queued'
// so concurrent invocations are idempotent.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { buildPlan, parseGraph, type GNode } from './graph.ts';
import { getExecutor, profileRows, WaitError, type Dataset, type ExecContext } from './executors.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const ROW_CAP = 50_000;
const MAX_NODES = 200;
const LEASE_SECONDS = 900;
const MAX_RUN_MS = 15 * 60 * 1000;
const NODE_TIMEOUT_MS = 3 * 60 * 1000;

function service(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = service();
  const auth = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
  const isService = Boolean(auth) && auth === (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '__none__');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be valid JSON' }, 400);
  }
  const runId = String(body.run_id ?? '');
  if (!runId) return json({ error: 'run_id is required' }, 422);

  // Load the run + parent job.
  const { data: run } = await supabase
    .from('data_job_runs')
    .select('id, job_id, tenant_id, environment, version_id, status, run_mode, until_node_id, from_node_id, trigger_source, trigger_payload, stats')
    .eq('id', runId)
    .maybeSingle();
  if (!run) return json({ error: 'run not found' }, 404);

  if (!isService) {
    const { data: user } = await supabase.auth.getUser(auth);
    const uid = user?.user?.id;
    if (!uid) return json({ error: 'Unauthorized' }, 401);
    const { data: member } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', uid)
      .eq('tenant_id', run.tenant_id)
      .maybeSingle();
    if (!member) return json({ error: 'Forbidden' }, 403);
  }

  // Claim a queued run, or recover one whose worker lease has expired.
  const { data: claimedRows, error: claimError } = await supabase.rpc('claim_pipeline_run', {
    p_run_id: runId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claimError) return json({ error: `Unable to claim run: ${claimError.message}` }, 503);
  const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
  if (!claimed) {
    return json({ skipped: true, reason: `run is '${run.status}', not 'queued'` });
  }

  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  const workerToken = String(claimed.worker_token);
  const deadlineAt = new Date(Math.min(
    Date.now() + MAX_RUN_MS,
    new Date(claimed.deadline_at ?? Date.now() + LEASE_SECONDS * 1000).getTime(),
  ));
  const touch = async (progress?: Record<string, unknown>) => {
    if (Date.now() >= deadlineAt.getTime()) throw new Error('Pipeline run exceeded its execution deadline');
    const { data, error } = await supabase.rpc('touch_pipeline_run', {
      p_run_id: runId,
      p_worker_token: workerToken,
      p_progress: progress ?? null,
    });
    if (error || data !== true) throw new Error('Pipeline worker lease is no longer active');
  };
  const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string, nodeId?: string, context?: unknown) =>
    supabase
      .from('data_job_run_logs')
      .insert({ run_id: runId, node_id: nodeId ?? null, level, message, context: context ?? null })
      .then(() => {});

  try {
  // Resolve the graph — pinned version snapshot, else the live job.
  let graphSource: unknown = null;
  if (run.version_id) {
    const { data: version } = await supabase
      .from('data_job_versions')
      .select('snapshot')
      .eq('id', run.version_id)
      .maybeSingle();
    graphSource = (version?.snapshot as { graph?: unknown } | null)?.graph ?? null;
  }
  if (!graphSource) {
    const { data: job } = await supabase.from('data_jobs').select('workflow_json').eq('id', run.job_id).maybeSingle();
    graphSource = job?.workflow_json ?? null;
  }

  const graph = parseGraph(graphSource);
  const plan = buildPlan(graph);

  // run-until-node: drop everything after the chosen node from the plan.
  if (run.until_node_id) {
    const idx = plan.order.indexOf(String(run.until_node_id));
    if (idx >= 0) plan.order = plan.order.slice(0, idx + 1);
  }

  await supabase
    .from('data_job_runs')
    .update({
      plan: {
        order: plan.order,
        node_count: graph.nodes.length,
        errors: plan.errors,
        until_node_id: run.until_node_id ?? null,
      },
    })
    .eq('id', runId)
    .eq('status', 'running')
    .eq('worker_token', workerToken);

  if (plan.errors.length || graph.nodes.length > MAX_NODES) {
    const errors = graph.nodes.length > MAX_NODES ? [`Too many nodes (${graph.nodes.length} > ${MAX_NODES})`] : plan.errors;
    await log('error', `Validation failed: ${errors.join('; ')}`);
    await supabase
      .from('data_job_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_log: errors.map((e) => ({ reason: 'validation', message: e })),
      })
      .eq('id', runId)
      .eq('status', 'running')
      .eq('worker_token', workerToken);
    return json({ status: 'failed', errors });
  }

  // Resume support: if this run was previously waiting, skip nodes before the waiting node.
  const isResume = Boolean(body.resume);
  const resumeFromNodeId = isResume ? (run.stats as Record<string, unknown>)?.waiting_node_id as string | undefined : undefined;

  if (resumeFromNodeId) {
    const idx = plan.order.indexOf(resumeFromNodeId);
    if (idx > 0) plan.order = plan.order.slice(idx);
    await log('info', `Resuming run from node '${resumeFromNodeId}' · ${plan.order.length} node(s) remaining`);
  } else {
    await log('info', `Run started · ${graph.nodes.length} node(s) · mode ${run.run_mode}`);
  }

  const noWrites = run.run_mode === 'dry_run' || run.run_mode === 'preview';
  const ctx: ExecContext = {
    supabase,
    tenantId: run.tenant_id,
    environment: run.environment,
    runId,
    runStartedAt: startedIso,
    rowCap: run.run_mode === 'preview' ? 500 : ROW_CAP,
    triggerPayload: run.trigger_payload ? run.trigger_payload as Record<string, unknown> : undefined,
    log,
  };

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const outputs = new Map<string, { default: Dataset; branches: Record<string, Dataset> }>();
  const perNode: Array<Record<string, unknown>> = [];

  let runFailed = false;
  let canceled = false;
  let totalFailed = 0;
  let processed = 0;

  for (const nodeId of plan.order) {
    const node = nodeById.get(nodeId) as GNode;

    // Honour a cancel requested mid-run.
    await touch({ current_node_id: nodeId, current_node_index: plan.order.indexOf(nodeId) });
    const { data: cur } = await supabase.from('data_job_runs').select('status').eq('id', runId).maybeSingle();
    if (cur?.status === 'canceled') {
      canceled = true;
      break;
    }

    // Gather inputs from incoming edges.
    const incoming = plan.byTarget.get(nodeId) ?? [];
    const inRows: Dataset['rows'] = [];
    let truncated = false;
    for (const e of incoming) {
      const prod = outputs.get(e.source);
      if (!prod) continue;
      const ds = e.sourceHandle ? prod.branches[e.sourceHandle] ?? prod.default : prod.default;
      inRows.push(...ds.rows);
      truncated = truncated || ds.truncated;
    }
    const input: Dataset = { rows: inRows, truncated };

    const startNode = Date.now();
    await supabase.from('data_job_node_runs').upsert(
      {
        run_id: runId,
        node_id: nodeId,
        node_type: node.type,
        node_label: node.label,
        worker_token: workerToken,
        state: 'running',
        attempt: 1,
        records_in: input.rows.length,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'run_id,node_id' },
    );

    if (node.disabled) {
      outputs.set(nodeId, { default: input, branches: {} });
      await supabase
        .from('data_job_node_runs')
        .update({ state: 'skipped', records_out: input.rows.length, completed_at: new Date().toISOString() })
        .eq('run_id', runId)
        .eq('node_id', nodeId)
        .eq('worker_token', workerToken);
      await log('info', `'${node.label}' is disabled — input passed through`, nodeId);
      perNode.push({ node_id: nodeId, type: node.type, state: 'skipped', ms: 0 });
      continue;
    }

    const executor = getExecutor(node.type);

    if (!executor) {
      outputs.set(nodeId, { default: input, branches: {} });
      await supabase
        .from('data_job_node_runs')
        .update({ state: 'skipped', records_out: input.rows.length, completed_at: new Date().toISOString() })
        .eq('run_id', runId)
        .eq('node_id', nodeId)
        .eq('worker_token', workerToken);
      await log('warn', `No executor for '${node.type}' — input passed through`, nodeId);
      perNode.push({ node_id: nodeId, type: node.type, state: 'skipped', ms: 0 });
      continue;
    }

    // dry_run / preview: don't touch destinations.
    if (noWrites && (node.type === 'target' || node.type === 'target_export')) {
      outputs.set(nodeId, { default: input, branches: {} });
      await supabase
        .from('data_job_node_runs')
        .update({ state: 'skipped', records_out: input.rows.length, completed_at: new Date().toISOString() })
        .eq('run_id', runId)
        .eq('node_id', nodeId);
      await log('info', `${run.run_mode} — skipped write node '${node.label}'`, nodeId);
      perNode.push({ node_id: nodeId, type: node.type, state: 'skipped', ms: 0 });
      continue;
    }

    let attempt = 0;
    let ok = false;
    let lastErr = '';
    while (attempt < 3 && !ok) {
      attempt++;
      try {
        const res = await Promise.race([
          executor(ctx, node, input),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Node '${node.label}' timed out after ${NODE_TIMEOUT_MS}ms`)), NODE_TIMEOUT_MS)),
        ]);
        outputs.set(nodeId, { default: res.out, branches: res.branches ?? {} });
        if (node.type.startsWith('target')) processed += res.recordsOut;
        totalFailed += res.recordsFailed;
        await supabase
          .from('data_job_node_runs')
          .update({
            state: 'succeeded',
            attempt,
            records_in: res.recordsIn,
            records_out: res.recordsOut,
            records_failed: res.recordsFailed,
            checkpoint: { done: true },
            completed_at: new Date().toISOString(),
          })
          .eq('run_id', runId)
          .eq('node_id', nodeId)
          .eq('worker_token', workerToken);
        perNode.push({ node_id: nodeId, type: node.type, state: 'succeeded', ms: Date.now() - startNode, out: res.recordsOut });
        ok = true;
      } catch (e) {
        if (e instanceof WaitError) {
          await log('info', `Node '${node.label}' is waiting: ${e.message}`, nodeId);
          perNode.push({ node_id: nodeId, type: node.type, state: 'waiting', ms: Date.now() - startNode });
          // Run transitions to 'waiting' — the resume sweep will re-invoke the worker later.
          const durationMs = Date.now() - startedAt;
          await supabase
            .from('data_job_runs')
            .update({
              status: 'waiting',
              stats: { duration_ms: durationMs, nodes: plan.order.length, per_node: perNode, waiting_node_id: nodeId },
            })
            .eq('id', runId)
            .eq('status', 'running')
            .eq('worker_token', workerToken);
          return json({ status: 'waiting', waiting_node: nodeId, duration_ms: durationMs });
        }
        lastErr = e instanceof Error ? e.message : String(e);
        if (attempt < 3) {
          await supabase.from('data_job_node_runs').update({ state: 'retrying', attempt }).eq('run_id', runId).eq('node_id', nodeId).eq('worker_token', workerToken);
          await log('warn', `Node '${node.label}' failed (attempt ${attempt}): ${lastErr} — retrying`, nodeId);
          await sleep(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
        }
      }
    }

    if (!ok) {
      runFailed = true;
      await supabase
        .from('data_job_node_runs')
        .update({ state: 'failed', error: { message: lastErr }, completed_at: new Date().toISOString() })
        .eq('run_id', runId)
        .eq('node_id', nodeId)
        .eq('worker_token', workerToken);
      await log('error', `Node '${node.label}' failed: ${lastErr}`, nodeId);
      perNode.push({ node_id: nodeId, type: node.type, state: 'failed', ms: Date.now() - startNode });
      break;
    }
  }

  // Preview mode: snapshot the last executed node's rows + column profile so
  // the UI can show real sample data for that node.
  if (run.run_mode === 'preview' && !runFailed && !canceled) {
    const lastId = plan.order[plan.order.length - 1];
    const prod = lastId ? outputs.get(lastId) : undefined;
    const sample = (prod?.default.rows ?? []).slice(0, 200);
    if (sample.length || lastId) {
      const path = `${run.tenant_id}/${runId}/preview.json`;
      await supabase.storage
        .from('data-artifacts')
        .upload(path, new Blob([JSON.stringify(sample)]), { upsert: true, contentType: 'application/json' })
        .catch(() => {});
      await supabase.from('data_job_run_artifacts').upsert({
        run_id: runId,
        node_id: lastId ?? null,
        kind: 'preview',
        storage_bucket: 'data-artifacts',
        storage_path: path,
        content_type: 'application/json',
        byte_size: JSON.stringify(sample).length,
        row_count: sample.length,
        idempotency_key: `${runId}:${lastId ?? 'none'}:preview`,
        meta: { profile: profileRows(sample), node_label: nodeById.get(lastId ?? '')?.label ?? null },
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      }, { onConflict: 'idempotency_key' });
      await log('info', `Preview captured — ${sample.length} sample row(s) from '${nodeById.get(lastId ?? '')?.label ?? lastId}'`, lastId);
    }
  }

  const status = canceled ? 'canceled' : runFailed ? 'failed' : totalFailed > 0 ? 'partial' : 'succeeded';
  const durationMs = Date.now() - startedAt;
  await supabase
    .from('data_job_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      records_processed: processed,
      records_failed: totalFailed,
      stats: { duration_ms: durationMs, nodes: plan.order.length, per_node: perNode },
    })
    .eq('id', runId)
    .eq('status', 'running')
    .eq('worker_token', workerToken);
  await log(status === 'succeeded' ? 'info' : status === 'failed' ? 'error' : 'warn', `Run ${status} · ${processed} written · ${totalFailed} failed · ${durationMs}ms`);

  // Alerting hooks (D13): POST to the pipeline's webhook when the outcome matches.
  try {
    const { data: jobRow } = await supabase.from('data_jobs').select('name, alert_config').eq('id', run.job_id).maybeSingle();
    const ac = (jobRow?.alert_config ?? {}) as { on?: string[]; webhook?: string };
    if (ac.webhook && Array.isArray(ac.on) && ac.on.includes(status)) {
      await fetch(ac.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline: jobRow?.name,
          run_id: runId,
          status,
          records_processed: processed,
          records_failed: totalFailed,
          duration_ms: durationMs,
          at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => {});
    }
  } catch { /* alerting is best-effort */ }

  return json({ status, records_processed: processed, records_failed: totalFailed, duration_ms: durationMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('data_job_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_log: [{ reason: 'worker', message }],
      })
      .eq('id', runId)
      .eq('status', 'running')
      .eq('worker_token', workerToken);
    await supabase.from('data_job_run_logs').insert({
      run_id: runId,
      level: 'error',
      message: `Worker failed: ${message}`,
      context: { worker_attempt: claimed.worker_attempt ?? null },
    });
    return json({ status: 'failed', error: message }, 500);
  }
});
