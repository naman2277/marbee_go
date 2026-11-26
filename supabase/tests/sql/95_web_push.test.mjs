// Build 01..94 on PGlite, then 95 (twice). Proves: the Firebase service-account key is
// server-only; enqueue is permission- and tenant-checked, idempotent, consent/exclusion
// aware and capped; the worker's claim/complete cycle logs, retries and prunes.
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
for (const f of files.filter((f) => f < '95_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));

const A = 'aaaaaaaa-0000-0000-0000-00000000000a', B = 'bbbbbbbb-0000-0000-0000-00000000000b';
const UA = 'a1a1a1a1-0000-0000-0000-0000000000a1', UV = 'a2a2a2a2-0000-0000-0000-0000000000a2', UB = 'b1b1b1b1-0000-0000-0000-0000000000b1';
const C1 = 'c1c1c1c1-0000-0000-0000-0000000000c1', C2 = 'c2c2c2c2-0000-0000-0000-0000000000c2', C3 = 'c3c3c3c3-0000-0000-0000-0000000000c3';
const CX = 'cdcdcdcd-0000-0000-0000-0000000000cd', CB = 'cbcbcbcb-0000-0000-0000-0000000000cb';
const P = 'ffffffff-0000-0000-0000-0000000000f1';
const SA = JSON.stringify({ type: 'service_account', project_id: 'demo-proj', client_email: 'push@demo-proj.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----\n' });

await db.exec(`
  INSERT INTO tenants (id, name, slug, status) VALUES ('${A}','A','tenant-a','active'), ('${B}','B','tenant-b','active');
  INSERT INTO auth.users (id, email) VALUES ('${UA}','a@test'), ('${UV}','v@test'), ('${UB}','b@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES
    ('aaaaaaaa-0000-0000-0000-0000000000a1','${A}','Admin','tenant_admin'),
    ('aaaaaaaa-0000-0000-0000-0000000000a2','${A}','Viewer','viewer-a'),
    ('bbbbbbbb-0000-0000-0000-0000000000b1','${B}','Admin','tenant_admin');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES
    ('${A}','${UA}','aaaaaaaa-0000-0000-0000-0000000000a1','active'),
    ('${A}','${UV}','aaaaaaaa-0000-0000-0000-0000000000a2','active'),
    ('${B}','${UB}','bbbbbbbb-0000-0000-0000-0000000000b1','active');
  INSERT INTO customers (id, tenant_id, environment, email) VALUES
    ('${C1}','${A}','production','c1@x'), ('${C2}','${A}','production','c2@x'), ('${C3}','${A}','production','c3@x'),
    ('${CX}','${A}','production','cx@x'), ('${CB}','${B}','production','cb@x');
  INSERT INTO customer_identities (tenant_id, environment, customer_id, ecid) VALUES ('${A}','production','${C2}','ecid-c2');
  INSERT INTO exclusions (tenant_id, environment, customer_id, channel, reason) VALUES ('${A}','production','${CX}','web_push','asked to stop');
  INSERT INTO web_push_subscribers (id, tenant_id, environment, customer_id, ecid, fcm_token, subscription_status) VALUES
    ('d0000000-0000-0000-0000-000000000001','${A}','production','${C1}',NULL,'tok-c1-laptop','active'),
    ('d0000000-0000-0000-0000-000000000002','${A}','production','${C1}',NULL,'tok-c1-phone','active'),
    ('d0000000-0000-0000-0000-000000000003','${A}','production',NULL,'ecid-c2','tok-c2-ecid','active'),
    ('d0000000-0000-0000-0000-000000000004','${A}','production','${C3}',NULL,'tok-c3-old','inactive'),
    ('d0000000-0000-0000-0000-000000000005','${A}','production',NULL,NULL,'tok-anonymous','active'),
    ('d0000000-0000-0000-0000-000000000006','${A}','production','${CX}',NULL,'tok-cx','active'),
    ('d0000000-0000-0000-0000-000000000007','${B}','production','${CB}',NULL,'tok-b','active');
  INSERT INTO channel_providers (id, tenant_id, environment, channel, provider_type, name, credentials_encrypted, config, is_default)
    VALUES ('${P}','${A}','production','web_push','firebase','Firebase', '${SA.replace(/'/g, "''")}', '{"project_id":"demo-proj"}', true);
`);

const as = async (uid, sql, params) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
};
const svc = async (sql, params) => {
  await db.exec('SET ROLE service_role');
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
};

let r = await as(UA, `SELECT credentials_encrypted FROM channel_providers WHERE id = '${P}'`);
ok(r.rows[0]?.credentials_encrypted?.includes('PRIVATE KEY'), 'BEFORE 95: any member can read the Firebase private key (the hole)');

const s95 = strip(readFileSync('supabase/sql/95_web_push_production.sql', 'utf8'));
await db.exec(s95);
await db.exec(s95);
ok(true, '95 runs (twice)');

// ---- 1. Key is server-only ---------------------------------------------------
r = await as(UA, `SELECT credentials_encrypted, config FROM channel_providers WHERE id = '${P}'`);
ok(r.rows[0].credentials_encrypted === null, 'existing key removed from the member-readable column');
ok(r.rows[0].config.service_account_configured === true && r.rows[0].config.service_account_project_id === 'demo-proj'
  && r.rows[0].config.service_account_client_email?.startsWith('push@'), 'members still see "configured · project · client email"');
r = await svc(`SELECT secret FROM channel_provider_secrets WHERE provider_id = '${P}'`);
ok(r.rows[0]?.secret?.includes('PRIVATE KEY'), 'key now lives in channel_provider_secrets (service role can read)');
ok(await throwsWith(as(UA, `SELECT secret FROM channel_provider_secrets`), /permission denied/), 'members cannot read channel_provider_secrets');
ok(await throwsWith(as(UA, `INSERT INTO channel_provider_secrets (provider_id, tenant_id, secret) VALUES ('${P}','${A}','x')`), /permission denied/),
  'members cannot write channel_provider_secrets');

const SA2 = SA.replace('demo-proj', 'new-proj').replace('demo-proj', 'new-proj');
r = await as(UA, `UPDATE channel_providers SET credentials_encrypted = $1 WHERE id = '${P}' RETURNING credentials_encrypted, config`, [SA2]);
ok(r.rows[0].credentials_encrypted === null && r.rows[0].config.service_account_project_id === 'new-proj',
  'saving a new key from the browser: column stays empty, facts updated');
r = await svc(`SELECT secret FROM channel_provider_secrets WHERE provider_id = '${P}'`);
ok(r.rows[0].secret.includes('new-proj'), '...and the new key replaced the old one server-side');
await as(UA, `UPDATE channel_providers SET credentials_encrypted = '{}' WHERE id = '${P}'`);
r = await svc(`SELECT secret FROM channel_provider_secrets WHERE provider_id = '${P}'`);
ok(r.rows[0].secret.includes('new-proj'), 'saving other settings (no key) does not wipe the stored key');
const P2 = 'ffffffff-0000-0000-0000-0000000000f2';
r = await as(UA, `INSERT INTO channel_providers (id, tenant_id, environment, channel, provider_type, name, credentials_encrypted, config)
  VALUES ('${P2}','${A}','staging','web_push','firebase','Staging FB', $1, '{}') RETURNING credentials_encrypted`, [SA]);
ok(r.rows[0].credentials_encrypted === null, 'new provider rows never store the key in the readable column');
ok((await svc(`SELECT count(*)::int n FROM channel_provider_secrets WHERE provider_id = '${P2}'`)).rows[0].n === 1, '...it goes to the secrets table');
await as(UA, `DELETE FROM channel_providers WHERE id = '${P2}'`);
ok((await svc(`SELECT count(*)::int n FROM channel_provider_secrets WHERE provider_id = '${P2}'`)).rows[0].n === 0, 'deleting a provider deletes its key');

// ---- 2. Enqueue ----------------------------------------------------------------
const content = JSON.stringify({ title: 'Your cart misses you', body: 'Come back', click_url: 'https://shop.test/cart' });
const enqueue = (uid, tenant, ids, key) =>
  as(uid, `SELECT enqueue_web_push($1, 'production', $2::uuid[], $3::jsonb, $4) AS r`, [tenant, ids, content, key]).then((x) => x.rows[0].r);

ok(await throwsWith(enqueue(UV, A, [C1], 'k1'), /permission/), 'a member without journeys.publish cannot send');
ok(await throwsWith(enqueue(UB, A, [C1], 'k1'), /permission/), 'a member of workspace B cannot send in workspace A');
ok(await throwsWith(as(UA, `SELECT enqueue_web_push_internal('${A}','production','{}'::uuid[],'{}'::uuid[],'{"title":"x"}'::jsonb,'k')`), /permission denied/),
  'members cannot call the internal (service) entry point');

let q = await enqueue(UA, A, [C1, C2, C3, CX, CB], 'delivery:1');
ok(q.queued === 3, `queues every active device: 2 for c1 + 1 ecid-linked for c2 (got ${q.queued})`);
ok(q.excluded === 1, 'excluded customer skipped');
ok(q.no_subscription === 2, 'c3 (only an inactive device) and a customer of another workspace count as no subscription');
r = await svc(`SELECT subscriber_id::text, customer_id::text FROM web_push_outbox ORDER BY subscriber_id`);
ok(!r.rows.some((x) => x.subscriber_id.endsWith('5')), 'anonymous subscribers are never used as a fallback');
ok(!r.rows.some((x) => x.subscriber_id.endsWith('7')), 'devices from another workspace are never targeted');
ok(r.rows.find((x) => x.subscriber_id.endsWith('3'))?.customer_id === C2, 'ecid-linked device is attributed to its customer');

q = await enqueue(UA, A, [C1, C2], 'delivery:1');
ok(q.queued === 0 && q.duplicate === 3, 'same idempotency key again → nothing new (double click is safe)');
ok(await throwsWith(as(UA, `SELECT enqueue_web_push($1,'production',$2::uuid[],'{"body":"no title"}'::jsonb,'k2')`, [A, [C1]]), /title/), 'title is required');
ok(await throwsWith(as(UA, `INSERT INTO web_push_outbox (tenant_id, environment, idempotency_key, subscriber_id, content)
  VALUES ('${A}','production','x','d0000000-0000-0000-0000-000000000005','{}')`), /permission denied/), 'members cannot write the outbox directly');
ok((await as(UA, `SELECT count(*)::int n FROM web_push_outbox`)).rows[0].n === 3, 'members can see their workspace outbox (delivery status)');
ok((await as(UB, `SELECT count(*)::int n FROM web_push_outbox`)).rows[0].n === 0, 'members of B see none of A\'s outbox');

await db.exec(`UPDATE tenants SET settings = settings || '{"web_push_daily_cap": 4}' WHERE id = '${A}'`);
q = await enqueue(UA, A, [C1, C2], 'delivery:2');
ok(q.queued === 1 && q.capped === 2 && q.daily_cap === 4, 'daily fair-use cap stops sends past the limit');
await db.exec(`UPDATE tenants SET settings = '{}' WHERE id = '${A}'`);

// ---- 3. Claim / complete ---------------------------------------------------------
ok(await throwsWith(as(UA, `SELECT * FROM claim_web_push_batch(10)`), /permission denied/), 'members cannot claim worker batches');
ok(await throwsWith(as(UA, `SELECT complete_web_push(gen_random_uuid(), 'delivered')`), /permission denied/), 'members cannot complete sends');

let batch = (await svc(`SELECT * FROM claim_web_push_batch(10)`)).rows;
ok(batch.length === 4 && batch.every((b) => b.fcm_token && b.attempts === 1), 'worker claims due rows with their tokens');
ok((await svc(`SELECT count(*)::int n FROM claim_web_push_batch(10)`)).rows[0].n === 0, 'claimed rows are not handed out twice');

const d1 = new Set((await svc(`SELECT id FROM web_push_outbox WHERE idempotency_key = 'delivery:1'`)).rows.map((x) => x.id));
const byTok = (t) => batch.find((b) => b.fcm_token === t && d1.has(b.id));
ok((await svc(`SELECT complete_web_push($1, 'delivered') AS s`, [byTok('tok-c1-laptop').id])).rows[0].s === 'delivered', 'delivered');
r = await db.query(`SELECT event, customer_id::text, metadata FROM engagement_log WHERE message_id = $1`, [byTok('tok-c1-laptop').message_id]);
ok(r.rows[0]?.event === 'delivered' && r.rows[0].customer_id === C1 && r.rows[0].metadata.click_url === 'https://shop.test/cart',
  'delivered is logged with click_url (what push-engage trusts for click tracking)');
ok((await svc(`SELECT complete_web_push($1, 'delivered') AS s`, [byTok('tok-c1-laptop').id])).rows[0].s === 'ignored', 'completing twice is ignored');

ok((await svc(`SELECT complete_web_push($1, 'invalid_token', 'UNREGISTERED') AS s`, [byTok('tok-c1-phone').id])).rows[0].s === 'failed', 'expired token → failed');
r = await db.query(`SELECT subscription_status, token_invalidated_at FROM web_push_subscribers WHERE fcm_token = 'tok-c1-phone'`);
ok(r.rows[0].subscription_status === 'invalid' && r.rows[0].token_invalidated_at, '...and the device is pruned (marked invalid)');

const retryId = byTok('tok-c2-ecid').id;
ok((await svc(`SELECT complete_web_push($1, 'retry', 'HTTP 503') AS s`, [retryId])).rows[0].s === 'queued', 'transient error → re-queued');
r = await svc(`SELECT status, next_attempt_at > now() + interval '20 seconds' AS later FROM web_push_outbox WHERE id = $1`, [retryId]);
ok(r.rows[0].status === 'queued' && r.rows[0].later, '...with a backoff delay');
await db.query(`UPDATE web_push_outbox SET attempts = 4, next_attempt_at = now() - interval '1 second' WHERE id = $1`, [retryId]);
batch = (await svc(`SELECT * FROM claim_web_push_batch(10)`)).rows;
ok(batch.length === 1 && batch[0].attempts === 5, 'retry is picked up again when due');
ok((await svc(`SELECT complete_web_push($1, 'retry', 'HTTP 503') AS s`, [retryId])).rows[0].s === 'failed', 'gives up after 5 attempts');
ok((await db.query(`SELECT count(*)::int n FROM customer_delivery_log WHERE status = 'failed'`)).rows[0].n === 2, 'failures are in the delivery log');

// Stale lock (worker crashed mid-send) is recovered.
const stuck = (await svc(`SELECT id FROM web_push_outbox WHERE idempotency_key = 'delivery:2'`)).rows[0].id;
await db.query(`UPDATE web_push_outbox SET locked_until = now() - interval '1 minute' WHERE id = $1`, [stuck]);
ok((await svc(`SELECT count(*)::int n FROM claim_web_push_batch(10)`)).rows[0].n === 1, 'a send whose worker died is claimed again after its lock expires');

// Inactive device and suspended workspace.
await db.query(`UPDATE web_push_subscribers SET subscription_status = 'active' WHERE fcm_token = 'tok-c1-phone'`);
q = await enqueue(UA, A, [C1], 'delivery:3');
await db.query(`UPDATE web_push_subscribers SET subscription_status = 'inactive' WHERE fcm_token = 'tok-c1-phone'`);
await db.exec(`UPDATE tenants SET status = 'suspended' WHERE id = '${A}'`);
ok((await svc(`SELECT count(*)::int n FROM claim_web_push_batch(10)`)).rows[0].n === 0, 'suspended workspace: queued sends are held');
ok(await throwsWith(svc(`SELECT enqueue_web_push_internal('${A}','production','{${C1}}'::uuid[],'{}'::uuid[],$1::jsonb,'k9')`, [content]), /suspended/),
  'suspended workspace: nothing new can be queued');
await db.exec(`UPDATE tenants SET status = 'active' WHERE id = '${A}'`);
batch = (await svc(`SELECT * FROM claim_web_push_batch(10)`)).rows;
ok(batch.length === 1 && batch[0].fcm_token === 'tok-c1-laptop', 'reactivated: held sends resume; the device unsubscribed meanwhile is skipped');
ok((await db.query(`SELECT status FROM web_push_outbox o JOIN web_push_subscribers s ON s.id = o.subscriber_id WHERE o.idempotency_key = 'delivery:3' AND s.fcm_token = 'tok-c1-phone'`)).rows[0].status === 'skipped',
  '...marked skipped, not sent');

// Re-sending a delivery that failed: failed rows are queued again, delivered ones are not.
q = await enqueue(UA, A, [C1, C2], 'delivery:1');
ok(q.queued === 1 && q.duplicate === 1, `re-run of delivery:1 re-queues only the failed row (c2), not the delivered one (got ${JSON.stringify(q)})`);
r = await svc(`SELECT status, attempts, last_error FROM web_push_outbox WHERE id = $1`, [retryId]);
ok(r.rows[0].status === 'queued' && r.rows[0].attempts === 0 && r.rows[0].last_error === null, '...with a fresh attempt counter');

// Wrapped / unrecognised keys are never destroyed by the move.
const P3 = 'ffffffff-0000-0000-0000-0000000000f3', P4 = 'ffffffff-0000-0000-0000-0000000000f4';
await as(UA, `INSERT INTO channel_providers (id, tenant_id, environment, channel, provider_type, name, credentials_encrypted, config)
  VALUES ('${P3}','${A}','development','web_push','firebase','Wrapped', $1, '{}')`, [JSON.stringify({ service_account_json: SA })]);
r = await svc(`SELECT secret FROM channel_provider_secrets WHERE provider_id = '${P3}'`);
ok(r.rows[0]?.secret && JSON.parse(r.rows[0].secret).type === 'service_account', 'wrapped {"service_account_json": ...} key is unwrapped and moved');
await as(UA, `INSERT INTO channel_providers (id, tenant_id, environment, channel, provider_type, name, credentials_encrypted, config)
  VALUES ('${P4}','${A}','development','web_push','firebase','Odd', 'not-json-but-maybe-a-key', '{}')`);
r = await db.query(`SELECT (SELECT secret FROM channel_provider_secrets WHERE provider_id = '${P4}') s, credentials_encrypted c, config FROM channel_providers WHERE id = '${P4}'`);
ok(r.rows[0].s === 'not-json-but-maybe-a-key' && r.rows[0].c === null && !r.rows[0].config.service_account_configured,
  'unrecognised content is kept server-side (not destroyed) and not marked configured');

// A member of B can't plant a key on A's provider via an ignored upsert.
const PA = 'ffffffff-0000-0000-0000-0000000000fa';
await db.query(`INSERT INTO channel_providers (id, tenant_id, environment, channel, provider_type, name, config) VALUES ('${PA}','${A}','staging','web_push','firebase','A staging','{}')`);
await as(UB, `INSERT INTO channel_providers (id, tenant_id, environment, channel, provider_type, name, credentials_encrypted, config)
  VALUES ('${PA}','${B}','production','web_push','firebase','evil', $1, '{}') ON CONFLICT (id) DO NOTHING`, [SA]);
ok((await db.query(`SELECT count(*)::int n FROM channel_provider_secrets WHERE provider_id = '${PA}'`)).rows[0].n === 0,
  'an upsert from another workspace cannot plant a key on this provider');

// Excluded after enqueue (e.g. while waiting): skipped at claim time, never sent (Codex, PR #5).
q = await enqueue(UA, A, [C1], 'delivery:excl');
await db.query(`INSERT INTO exclusions (tenant_id, environment, customer_id, channel, reason) VALUES ('${A}','production','${C1}', NULL, 'opted out after queueing')`);
const claimedExcl = (await svc(`SELECT * FROM claim_web_push_batch(50)`)).rows.filter((x) => x.customer_id === C1);
const exclRows = (await db.query(`SELECT status, last_error FROM web_push_outbox WHERE idempotency_key = 'delivery:excl'`)).rows;
ok(q.queued >= 1 && claimedExcl.length === 0 && exclRows.every((x) => x.status === 'skipped' && x.last_error === 'customer excluded'),
  'a customer excluded after queueing is skipped at claim time');
await db.query(`DELETE FROM exclusions WHERE customer_id = '${C1}' AND channel IS NULL`);

// Welcome push path: internal enqueue by subscriber id (anonymous device).
q = (await svc(`SELECT enqueue_web_push_internal('${A}','production','{}'::uuid[],'{d0000000-0000-0000-0000-000000000005}'::uuid[],$1::jsonb,'welcome:d5') AS r`, [content])).rows[0].r;
ok(q.queued === 1, 'service role can queue a welcome push to one specific device');

ok((await svc(`SELECT push_worker_tick() AS t`)).rows[0].t === false, 'cron tick is a no-op without Vault secrets (no error)');

for (const f of files.filter((f) => f > '95_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
