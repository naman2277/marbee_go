// Build 01..95 on PGlite, then 96 (twice). Proves: batch completion behaves exactly like the
// per-row path (logs, retries, pruning), isolates a bad row, is service-only; the tick starts
// one worker per ~3,000 due pushes (max 10) and is a no-op without Vault.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const throwsWith = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };

const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 15, src.indexOf('`);', src.indexOf('await db.exec(`')));
const db = new PGlite();
await db.exec(stub);
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
const files = readdirSync('supabase/sql').filter((f) => /^\d+_.*\.sql$/.test(f) && !/^0[03]_/.test(f)).sort();
for (const f of files.filter((f) => f < '96_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const s96 = strip(readFileSync('supabase/sql/96_web_push_throughput.sql', 'utf8'));
await db.exec(s96);
await db.exec(s96);
ok(true, '96 runs (twice)');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a', U = 'a1a1a1a1-0000-0000-0000-0000000000a1', C = 'c1c1c1c1-0000-0000-0000-0000000000c1';
await db.exec(`INSERT INTO tenants (id, name, slug, status) VALUES ('${A}','A','tenant-a','active');
  INSERT INTO auth.users (id, email) VALUES ('${U}','a@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1','${A}','Admin','tenant_admin');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES ('${A}','${U}','aaaaaaaa-0000-0000-0000-0000000000a1','active');
  INSERT INTO customers (id, tenant_id, environment, email) VALUES ('${C}','${A}','production','c@x');
  INSERT INTO web_push_subscribers (id, tenant_id, environment, customer_id, fcm_token, subscription_status)
  SELECT ('d0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '${A}', 'production', '${C}', 'tok-' || g, 'active'
  FROM generate_series(1, 4) g;`);
const svc = async (sql, params) => { await db.exec('SET ROLE service_role'); try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); } };
const asUser = async (sql) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`RESET ROLE`); }
};

await svc(`SELECT enqueue_web_push_internal('${A}','production','{${C}}'::uuid[],'{}'::uuid[],'{"title":"Sale","click_url":"https://s.test"}'::jsonb,'blast-1')`);
const batch = (await svc(`SELECT * FROM claim_web_push_batch(10)`)).rows;
ok(batch.length === 4, 'four devices claimed');
const tok = (t) => batch.find((b) => b.fcm_token === t).id;

ok(await throwsWith(asUser(`SELECT complete_web_push_batch('[]'::jsonb)`), /permission denied/), 'members cannot call complete_web_push_batch');
ok(await throwsWith(asUser(`SELECT push_worker_kick_n(3)`), /permission denied/), 'members cannot start workers');
ok(await throwsWith(svc(`SELECT complete_web_push_batch('{}'::jsonb)`), /JSON array/), 'rejects a non-array');

const results = [
  { id: tok('tok-1'), outcome: 'delivered' },
  { id: tok('tok-2'), outcome: 'invalid_token', error: 'FCM 404 UNREGISTERED' },
  { id: tok('tok-3'), outcome: 'retry', error: 'FCM 503', retry_after: '120' },
  { id: 'not-a-uuid', outcome: 'delivered' },
  { id: tok('tok-4'), outcome: 'nonsense' },
];
const r = (await svc(`SELECT complete_web_push_batch($1::jsonb) AS r`, [JSON.stringify(results)])).rows[0].r;
ok(r.delivered === 1 && r.requeued === 1 && r.failed === 1 && r.ignored === 2, `one call records the whole batch (${JSON.stringify(r)})`);
const st = async (t) => (await db.query(`SELECT o.status, o.next_attempt_at > now() + interval '100 seconds' AS later FROM web_push_outbox o JOIN web_push_subscribers s ON s.id = o.subscriber_id WHERE s.fcm_token = $1`, [t])).rows[0];
ok((await st('tok-1')).status === 'delivered', 'delivered row marked delivered');
ok((await db.query(`SELECT subscription_status FROM web_push_subscribers WHERE fcm_token = 'tok-2'`)).rows[0].subscription_status === 'invalid', 'expired device pruned, same as the per-row path');
const s3 = await st('tok-3');
ok(s3.status === 'queued' && s3.later, 'retry re-queued honouring Retry-After');
ok((await st('tok-4')).status === 'sending', 'a bad entry is isolated: that row stays locked and will be retried, the rest are recorded');
const nlog = (await db.query(`SELECT count(*)::int n FROM engagement_log WHERE tenant_id = '${A}' AND event IN ('delivered','failed')`)).rows[0].n; ok(nlog === 2, `logs written once per completed row (${nlog})`);

ok((await svc(`SELECT web_push_due_count() AS n`)).rows[0].n === 0, 'due count: nothing due (retry is in the future, tok-4 still locked)');
await db.query(`UPDATE web_push_outbox SET next_attempt_at = now() - interval '1 s'`);
ok((await svc(`SELECT web_push_due_count() AS n`)).rows[0].n === 1, 'due count sees the retry once it is due');
ok((await svc(`SELECT push_worker_kick_n(5) AS n`)).rows[0].n === 0, 'kick_n is a no-op without Vault (no error)');
ok((await svc(`SELECT push_worker_tick() AS t`)).rows[0].t === false, 'tick is a no-op without Vault (no error)');

// Worker count = ceil(due / 3000), capped at 10 — checked with a stand-in kick that always succeeds.
await db.exec(`CREATE OR REPLACE FUNCTION public.push_worker_kick() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`);
ok((await svc(`SELECT push_worker_kick_n(25) AS n`)).rows[0].n === 10, 'never more than 10 workers at once');
ok((await svc(`SELECT push_worker_kick_n(0) AS n`)).rows[0].n === 1, 'at least one worker when asked');
await db.query(`INSERT INTO web_push_subscribers (tenant_id, environment, customer_id, fcm_token, subscription_status)
  SELECT '${A}','production','${C}','bulk-' || g, 'active' FROM generate_series(1, 7000) g`);
await svc(`SELECT enqueue_web_push_internal('${A}','production','{${C}}'::uuid[],'{}'::uuid[],'{"title":"Bulk"}'::jsonb,'blast-2')`);
const due = (await svc(`SELECT web_push_due_count() AS n`)).rows[0].n;
await db.exec(`CREATE TABLE kicks (n int); CREATE OR REPLACE FUNCTION public.push_worker_kick() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN INSERT INTO kicks VALUES (1); RETURN true; END $$;`);
await db.query(`UPDATE web_push_outbox SET status = 'queued', locked_until = NULL WHERE status = 'sending'`); // no busy workers
await db.query(`SELECT push_worker_tick()`);
let kicks = (await db.query(`SELECT count(*)::int n FROM kicks`)).rows[0].n;
ok(kicks === Math.ceil(due / 3000), `idle: tick starts ceil(${due}/3000) = ${kicks} workers for the backlog`);

// Two workers already busy (≈1,000 rows locked): the tick only tops up to the target, so
// self-restarting workers + cron never pile up past 10.
await db.query(`DELETE FROM kicks`);
await db.query(`UPDATE web_push_outbox SET status = 'sending', locked_until = now() + interval '2 minutes'
  WHERE id IN (SELECT id FROM web_push_outbox WHERE status = 'queued' LIMIT 1000)`);
const due2 = (await svc(`SELECT web_push_due_count() AS n`)).rows[0].n;
await db.query(`SELECT push_worker_tick()`);
kicks = (await db.query(`SELECT count(*)::int n FROM kicks`)).rows[0].n;
ok(kicks === Math.max(Math.min(Math.ceil(due2 / 3000), 10) - 2, 0), `busy: tick tops up by ${kicks} (target ${Math.ceil(due2 / 3000)} − 2 busy)`);
await db.query(`DELETE FROM kicks`);
await db.query(`UPDATE web_push_outbox SET status = 'sending', locked_until = now() + interval '2 minutes' WHERE status = 'queued'`);
await db.query(`UPDATE web_push_outbox SET status = 'queued', locked_until = NULL WHERE id IN (SELECT id FROM web_push_outbox WHERE status = 'sending' LIMIT 100)`);
await db.query(`SELECT push_worker_tick()`);
ok((await db.query(`SELECT count(*)::int n FROM kicks`)).rows[0].n === 0, 'enough workers busy: tick starts none');

for (const f of files.filter((f) => f > '96_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
