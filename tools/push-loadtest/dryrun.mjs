// Dry-run of the load-test scripts on PGlite (full 01..NN chain). The worker is simulated by
// claiming and completing batches in SQL. Run: node tools/push-loadtest/dryrun.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 15, src.indexOf('`);', src.indexOf('await db.exec(`')));
const db = new PGlite();
await db.exec(stub);
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
for (const f of readdirSync('supabase/sql').filter((f) => /^\d+_.*\.sql$/.test(f) && !/^0[03]_/.test(f)).sort()) {
  await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
}
const T = 'aaaaaaaa-0000-0000-0000-00000000000a';
await db.exec(`INSERT INTO tenants (id, name, slug, status) VALUES ('${T}','A','tenant-a','active');
  INSERT INTO channel_providers (tenant_id, environment, channel, provider_type, name, config, is_default, status)
  VALUES ('${T}','production','web_push','firebase','FB','{}', true, 'active');`);
const run = (f) => db.exec(readFileSync(`tools/push-loadtest/${f}`, 'utf8').replace('v_devices  int := 20000', 'v_devices  int := 2000'));

await run('1_start.sql');
let r = (await db.query(`SELECT count(*)::int n FROM web_push_outbox WHERE idempotency_key = 'loadtest-1'`)).rows[0].n;
ok(r === 2000, `start queues one push per fake device (${r})`);
try { await run('1_start.sql'); ok(false, 'second start must refuse'); } catch (e) { ok(/previous load test/.test(e.message), 'second start refuses until cleanup'); }

// Simulated worker: claim + complete as invalid_token (what FCM answers for fake tokens).
for (;;) {
  const b = (await db.query(`SELECT id FROM claim_web_push_batch(500)`)).rows;
  if (!b.length) break;
  await db.query(`SELECT complete_web_push_batch($1::jsonb)`, [JSON.stringify(b.map((x) => ({ id: x.id, outcome: 'invalid_token', error: 'FCM 400 INVALID_ARGUMENT: The registration token is not a valid FCM registration token' })))]);
}
const m = (await db.query(readFileSync('tools/push-loadtest/2_measure.sql', 'utf8'))).rows[0];
ok(Number(m.total) === 2000 && Number(m.left) === 0 && Number(m.failed_or_pruned) === 2000, `measure reports progress (${JSON.stringify({ total: m.total, left: m.left, failed: m.failed_or_pruned, ppm: m.pushes_per_minute })})`);
ok((await db.query(`SELECT count(*)::int n FROM web_push_subscribers WHERE fcm_token LIKE 'loadtest-%' AND subscription_status = 'invalid'`)).rows[0].n === 2000, 'fake devices are pruned by the normal path');

// Another workspace that happens to use the same key must be untouched by cleanup (Codex, PR #7).
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';
await db.exec(`INSERT INTO tenants (id, name, slug, status) VALUES ('${B}','B','tenant-b','active');
  INSERT INTO customers (id, tenant_id, environment, email) VALUES ('cbcbcbcb-0000-0000-0000-0000000000cb','${B}','production','loadtest@marbee.test');
  INSERT INTO web_push_subscribers (id, tenant_id, environment, customer_id, fcm_token) VALUES ('dbdbdbdb-0000-0000-0000-0000000000db','${B}','production','cbcbcbcb-0000-0000-0000-0000000000cb','tok-b');
  INSERT INTO web_push_outbox (tenant_id, environment, idempotency_key, subscriber_id, customer_id, content) VALUES ('${B}','production','loadtest-1','dbdbdbdb-0000-0000-0000-0000000000db','cbcbcbcb-0000-0000-0000-0000000000cb','{"title":"real"}');`);
const before = (await db.query(`SELECT count(*)::int n FROM engagement_log WHERE customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE email = 'loadtest@marbee.test')`)).rows[0].n;
const cRes = await db.exec(readFileSync('tools/push-loadtest/3_cleanup.sql', 'utf8')); const c = cRes[cRes.length - 1].rows[0];
ok(Number(c.fake_devices_left) === 0 && Number(c.test_customers_left) === 0 && Number(c.outbox_rows_left) === 0, 'cleanup removes devices, customer and outbox rows');
ok((await db.query(`SELECT count(*)::int n FROM engagement_log`)).rows[0].n === before, 'cleanup leaves every other engagement row alone');
await db.exec(readFileSync('tools/push-loadtest/3_cleanup.sql', 'utf8'));
ok(true, 'cleanup is safe to run twice');
ok((await db.query(`SELECT status FROM web_push_outbox WHERE tenant_id = '${B}'`)).rows[0]?.status === 'queued', 'cleanup never touches another workspace (same key, same email)');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
