// Build 01..96 on PGlite, then 97 (twice). Proves: broadcasts reach exactly the filtered /
// audience devices of their own workspace, need journeys.publish, never send twice, can be
// scheduled and cancelled, respect exclusions and the daily cap, and report results.
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
for (const f of files.filter((f) => f < '97_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const s97 = strip(readFileSync('supabase/sql/97_web_push_broadcasts.sql', 'utf8'));
await db.exec(s97);
await db.exec(s97);
ok(true, '97 runs (twice)');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a', B = 'bbbbbbbb-0000-0000-0000-00000000000b';
const UA = 'a1a1a1a1-0000-0000-0000-0000000000a1', UV = 'a2a2a2a2-0000-0000-0000-0000000000a2', UB = 'b1b1b1b1-0000-0000-0000-0000000000b1';
const C1 = 'c1c1c1c1-0000-0000-0000-0000000000c1', C2 = 'c2c2c2c2-0000-0000-0000-0000000000c2', CX = 'cdcdcdcd-0000-0000-0000-0000000000cd';
const sub = (n) => `d0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`
  INSERT INTO tenants (id, name, slug, status) VALUES ('${A}','A','tenant-a','active'), ('${B}','B','tenant-b','active');
  INSERT INTO auth.users (id, email) VALUES ('${UA}','a@test'), ('${UV}','v@test'), ('${UB}','b@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1','${A}','Admin','tenant_admin'),
    ('aaaaaaaa-0000-0000-0000-0000000000a2','${A}','Viewer','viewer-a'), ('bbbbbbbb-0000-0000-0000-0000000000b1','${B}','Admin','tenant_admin');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES ('${A}','${UA}','aaaaaaaa-0000-0000-0000-0000000000a1','active'),
    ('${A}','${UV}','aaaaaaaa-0000-0000-0000-0000000000a2','active'), ('${B}','${UB}','bbbbbbbb-0000-0000-0000-0000000000b1','active');
  INSERT INTO customers (id, tenant_id, environment, email) VALUES ('${C1}','${A}','production','c1@x'), ('${C2}','${A}','production','c2@x'), ('${CX}','${A}','production','cx@x');
  INSERT INTO exclusions (tenant_id, environment, customer_id, channel, reason) VALUES ('${A}','production','${CX}','web_push','opted out');
  INSERT INTO web_push_subscribers (id, tenant_id, environment, customer_id, fcm_token, browser, os, device, subscription_status, created_at, last_seen) VALUES
    ('${sub(1)}','${A}','production','${C1}','t1','Chrome','Windows','desktop','active', now() - interval '40 days', now()),
    ('${sub(2)}','${A}','production','${C2}','t2','Safari','macOS','desktop','active', now() - interval '2 days', now() - interval '20 days'),
    ('${sub(3)}','${A}','production',NULL,'t3','Chrome','Android','mobile','active', now() - interval '1 day', now()),
    ('${sub(4)}','${A}','production',NULL,'t4','Firefox','Windows','desktop','active', now(), now()),
    ('${sub(5)}','${A}','production',NULL,'t5','Chrome','Windows','desktop','inactive', now(), now()),
    ('${sub(6)}','${A}','production','${CX}','t6','Chrome','Windows','desktop','active', now(), now()),
    ('${sub(7)}','${B}','production',NULL,'t7','Chrome','Windows','desktop','active', now(), now());
`);
const as = async (uid, sql, params) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
};
const count = (uid, filter, ids = null) => as(uid, `SELECT web_push_audience_count($1,'production',$2::jsonb,$3::uuid[]) AS r`, [A, JSON.stringify(filter), ids]).then((x) => x.rows[0].r);
const content = JSON.stringify({ title: 'Flash sale', body: '50% off today', click_url: 'https://shop.test/sale' });
const send = (uid, key, filter = {}, ids = null, at = null, tenant = A) =>
  as(uid, `SELECT web_push_broadcast_send($1,'production',$2,'Flash sale',$3::jsonb,'{"kind":"all"}'::jsonb,$4::jsonb,$5::uuid[],$6::timestamptz) AS r`,
    [tenant, key, content, JSON.stringify(filter), ids, at]).then((x) => x.rows[0].r);
const K = (n) => `eeeeeeee-0000-0000-0000-${String(n).padStart(12, '0')}`;

// ---- counts -------------------------------------------------------------------------
let r = await count(UA, {});
ok(r.devices === 5 && r.linked === 3 && r.anonymous === 2 && r.excluded === 1, `all active devices of this workspace only (${JSON.stringify(r)})`);
ok((await count(UA, { browsers: ['Chrome'] })).devices === 3, 'filter by browser');
ok((await count(UA, { devices: ['mobile'] })).devices === 1, 'filter by device type');
ok((await count(UA, { os: ['Windows'], browsers: ['Chrome'] })).devices === 2, 'filters combine with AND');
ok((await count(UA, { subscribed_within_days: 7 })).devices === 4, 'subscribed in the last N days');
ok((await count(UA, { active_within_days: 7 })).devices === 4, 'active in the last N days');
ok((await count(UA, { linked: 'linked' })).devices === 3 && (await count(UA, { linked: 'anonymous' })).devices === 2, 'linked vs anonymous');
ok((await count(UA, {}, [C1, C2])).devices === 2, 'audience (customer list) → only their devices');
ok((await count(UA, {}, [])).devices === 0, 'an empty audience reaches nobody (never "everyone")');
ok((await count(UV, {})).devices === 5, 'any member can preview the count');
ok(await throwsWith(count(UB, {}), /access/), 'a member of another workspace cannot count');
ok(await throwsWith(count(UA, { linked: 'maybe' }), /linked must be/), 'bad filter is rejected');

// ---- send ---------------------------------------------------------------------------
ok(await throwsWith(send(UV, K(1)), /permission/), 'viewer cannot send');
ok(await throwsWith(send(UB, K(1)), /permission/), 'member of another workspace cannot send here');
r = await send(UA, K(1));
ok(r.queued === 4 && r.excluded === 1 && r.already_sent === false, `broadcast to all: 4 queued, excluded customer skipped (${JSON.stringify(r)})`);
const bid = r.broadcast_id;
r = await send(UA, K(1));
ok(r.already_sent === true && r.broadcast_id === bid, 'same compose session sent twice → one broadcast, no second send');
ok((await db.query(`SELECT count(*)::int n FROM web_push_outbox WHERE delivery_id = $1`, [bid])).rows[0].n === 4, '...outbox still has exactly 4 rows');
ok((await db.query(`SELECT count(*)::int n FROM web_push_outbox WHERE tenant_id = '${B}'`)).rows[0].n === 0, 'other workspace untouched');

r = await send(UA, K(2), { browsers: ['Firefox'] });
ok(r.queued === 1, 'filtered broadcast queues only matching devices');
r = await send(UA, K(3), {}, [C2]);
ok(r.queued === 1, 'audience broadcast reaches only the audience\'s devices');

// ---- schedule + cancel --------------------------------------------------------------
r = await send(UA, K(4), { linked: 'anonymous' }, null, new Date(Date.now() + 3600e3).toISOString());
const sched = r.broadcast_id;
ok(r.queued === 2, 'scheduled broadcast queued');
ok((await db.query(`SELECT bool_and(next_attempt_at > now() + interval '50 minutes') ok FROM web_push_outbox WHERE delivery_id = $1`, [sched])).rows[0].ok, '...for its scheduled time');
await db.exec('SET ROLE service_role');
const claimed = (await db.query(`SELECT delivery_id FROM claim_web_push_batch(100)`)).rows;
await db.exec('RESET ROLE');
ok(!claimed.some((x) => x.delivery_id === sched), 'the worker does not pick it up before its time');
let list = (await as(UA, `SELECT * FROM web_push_broadcast_list($1,'production',50)`, [A])).rows;
ok(list.find((x) => x.id === sched)?.status === 'scheduled', 'list shows it as scheduled');
ok(await throwsWith(as(UV, `SELECT web_push_broadcast_cancel($1)`, [sched]), /not found/), 'viewer cannot cancel');
ok(await throwsWith(as(UB, `SELECT web_push_broadcast_cancel($1)`, [sched]), /not found/), 'other workspace cannot cancel (or see it)');
r = (await as(UA, `SELECT web_push_broadcast_cancel($1) AS r`, [sched])).rows[0].r;
ok(r.cancelled === 2, 'cancel stops the queued pushes');
ok((await db.query(`SELECT bool_and(status = 'skipped') ok FROM web_push_outbox WHERE delivery_id = $1`, [sched])).rows[0].ok, '...they are skipped, never sent');

// ---- results ------------------------------------------------------------------------
// Simulate the worker for the first broadcast: 3 delivered, 1 expired; one click.
// (the scheduling check above already claimed the first broadcast's rows: they are 'sending')
const ours = (await db.query(`SELECT id, message_id FROM web_push_outbox WHERE delivery_id = $1 AND status = 'sending' ORDER BY id`, [bid])).rows;
ok(ours.length === 4, 'first broadcast was claimed by the worker');
await db.exec('SET ROLE service_role');
for (const [i, x] of ours.entries()) await db.query(`SELECT complete_web_push($1, $2)`, [x.id, i === 0 ? 'invalid_token' : 'delivered']);
await db.exec('RESET ROLE');
const clickMsg = ours[1].message_id;
await db.query(`INSERT INTO engagement_log (tenant_id, environment, channel, message_id, event) VALUES ('${A}','production','web_push',$1,'clicked')`, [clickMsg]);
list = (await as(UA, `SELECT * FROM web_push_broadcast_list($1,'production',50)`, [A])).rows;
const b1 = list.find((x) => x.id === bid);
ok(b1.status === 'sent' && b1.delivered === 3 && b1.failed === 1 && b1.clicked === 1 && b1.queued === 0, `results: ${JSON.stringify({ s: b1.status, d: b1.delivered, f: b1.failed, c: b1.clicked })}`);
ok(list.find((x) => x.id === sched).status === 'cancelled', 'cancelled broadcast shows as cancelled');
ok((await as(UV, `SELECT count(*)::int n FROM web_push_broadcasts`)).rows[0].n === 4, 'members can read their broadcasts');
ok((await as(UB, `SELECT count(*)::int n FROM web_push_broadcasts`)).rows[0].n === 0, 'other workspace sees none');
ok(await throwsWith(as(UB, `SELECT * FROM web_push_broadcast_list($1,'production',50)`, [A]), /access/), 'other workspace cannot list');
ok(await throwsWith(as(UA, `INSERT INTO web_push_broadcasts (tenant_id, environment, client_key, name, content) VALUES ('${A}','production','${K(9)}','x','{}')`), /permission denied/), 'no direct writes');
ok(await throwsWith(as(UA, `SELECT web_push_fill_broadcast_targets($1,'production','{}'::jsonb,NULL)`, [A]), /permission denied/), 'members cannot call the internal target builder');

// ---- daily cap ------------------------------------------------------------------------
await db.exec(`UPDATE tenants SET settings = settings || '{"web_push_daily_cap": 8}' WHERE id = '${A}'`);
r = await count(UA, {});
ok(r.cap_remaining === 2, `preview shows remaining cap (${r.cap_remaining})`);
r = await send(UA, K(5));
ok(r.queued === 2 && r.capped === 1, `cap holds the rest (${JSON.stringify(r)})`);

// ---- websites ------------------------------------------------------------------------
await db.exec(`
  INSERT INTO web_analytics_sites (tenant_id, environment, site_id, name, domain, write_key, verification_token, status) VALUES
    ('${A}','production','site-a','Shop A','a.test','wk-aaaaaaaa','vt-a','active'),
    ('${A}','production','site-b','Shop B','b.test','wk-bbbbbbbb','vt-b','active'),
    ('${B}','production','site-x','Other','x.test','wk-xxxxxxxx','vt-x','active');
  UPDATE web_push_subscribers SET site_id = 'site-a' WHERE id IN ('${sub(1)}','${sub(2)}','${sub(6)}');
  UPDATE web_push_subscribers SET site_id = 'site-b' WHERE id IN ('${sub(3)}','${sub(4)}');
`);
const live = (await db.query(`SELECT site_id, count(*)::int n FROM web_push_subscribers WHERE tenant_id = '${A}' AND subscription_status = 'active' GROUP BY 1`)).rows;
const liveN = (site) => live.find((x) => x.site_id === site)?.n ?? 0;
ok((await count(UA, { sites: ['site-a'] })).devices === liveN('site-a'), `filter by website A (${liveN('site-a')})`);
ok((await count(UA, { sites: ['site-b'] })).devices === liveN('site-b'), `filter by website B (${liveN('site-b')})`);
ok((await count(UA, { sites: ['site-x'] })).devices === 0, "another workspace's website reaches nobody");
const sites = (await as(UA, `SELECT web_push_site_counts($1,'production') AS r`, [A])).rows[0].r;
ok(sites.length === 2 && sites.find((x) => x.site_id === 'site-a').devices === liveN('site-a') && sites.find((x) => x.site_id === 'site-a').name === 'Shop A', `website list with devices ${JSON.stringify(sites)}`);
ok(await throwsWith(as(UB, `SELECT web_push_site_counts($1,'production')`, [A]), /access/), 'other workspace cannot list websites');

// ---- folders -------------------------------------------------------------------------
const folder = (uid, op, path, name = null) => as(uid, `SELECT web_push_folder_save($1,'production',$2,$3,$4) AS r`, [A, op, path, name]).then((x) => x.rows[0].r);
ok((await folder(UA, 'create', '/', ' sale 2026 ')).path === '/sale 2026', 'create folder (trimmed)');
ok((await folder(UA, 'create', '/sale 2026', 'diwali')).path === '/sale 2026/diwali', 'create subfolder');
ok(await throwsWith(folder(UA, 'create', '/', 'a/b'), /no "\/"/), 'slash in a name is refused');
ok(await throwsWith(folder(UV, 'create', '/', 'x'), /permission/), 'viewer cannot create folders');
await as(UA, `SELECT web_push_broadcast_move($1,'/sale 2026/diwali')`, [bid]);
ok(await throwsWith(as(UA, `SELECT web_push_broadcast_move($1,'/nope')`, [bid]), /not found/), 'cannot move into a missing folder');
ok(await throwsWith(as(UB, `SELECT web_push_broadcast_move($1,'/')`, [bid]), /not found/), 'other workspace cannot move it');
await folder(UA, 'rename', '/sale 2026', 'sale 2027');
const fl = (await as(UA, `SELECT path, parent_path FROM web_push_campaign_folders ORDER BY path`)).rows;
ok(JSON.stringify(fl.map((x) => x.path)) === '["/sale 2027","/sale 2027/diwali"]' && fl[1].parent_path === '/sale 2027', `rename moves subfolders ${JSON.stringify(fl)}`);
list = (await as(UA, `SELECT * FROM web_push_broadcast_list($1,'production',50)`, [A])).rows;
ok(list.find((x) => x.id === bid).folder_path === '/sale 2027/diwali', 'rename moves campaigns inside');
const before = list.length;
await folder(UA, 'delete', '/sale 2027');
list = (await as(UA, `SELECT * FROM web_push_broadcast_list($1,'production',50)`, [A])).rows;
ok(list.find((x) => x.id === bid).folder_path === '/' && list.length === before, 'delete keeps campaigns (moved up to the parent)');
ok((await as(UA, `SELECT count(*)::int n FROM web_push_campaign_folders`)).rows[0].n === 0, 'folder and subfolders deleted');
ok((await as(UB, `SELECT count(*)::int n FROM web_push_campaign_folders`)).rows[0].n === 0, 'folders are per workspace');
await folder(UA, 'create', '/', 'q4');
const inFolder = (await as(UA, `SELECT web_push_broadcast_send($1,'production',$2,'In folder',$3::jsonb,'{"kind":"all"}'::jsonb,'{"sites":["site-b"]}'::jsonb,NULL,NULL,'/q4') AS r`, [A, K(8), content])).rows[0].r;
const row = (await db.query(`SELECT folder_path FROM web_push_broadcasts WHERE id = $1`, [inFolder.broadcast_id])).rows[0];
ok(row.folder_path === '/q4' && inFolder.devices === liveN('site-b'), `send into a folder, to website B only (${JSON.stringify(inFolder)})`);

for (const f of files.filter((f) => f > '97_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
