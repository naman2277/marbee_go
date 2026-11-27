// Build 01..97 on PGlite, then 98 (twice). Proves: the campaign report counts delivered /
// failed / clicked per broadcast, splits clicks by CTA (body vs buttons) and by browser / OS /
// device, explains failures, lists recent clicks with the customer, and is workspace-only.
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
for (const f of files.filter((f) => f < '98_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const s98 = strip(readFileSync('supabase/sql/98_web_push_broadcast_report.sql', 'utf8'));
await db.exec(s98);
await db.exec(s98);
ok(true, '98 runs (twice)');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a', B = 'bbbbbbbb-0000-0000-0000-00000000000b';
const UA = 'a1a1a1a1-0000-0000-0000-0000000000a1', UB = 'b1b1b1b1-0000-0000-0000-0000000000b1';
const C1 = 'c1c1c1c1-0000-0000-0000-0000000000c1';
const sub = (n) => `d0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`
  INSERT INTO tenants (id, name, slug, status) VALUES ('${A}','A','tenant-a','active'), ('${B}','B','tenant-b','active');
  INSERT INTO auth.users (id, email) VALUES ('${UA}','a@test'), ('${UB}','b@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1','${A}','Admin','tenant_admin'),
    ('bbbbbbbb-0000-0000-0000-0000000000b1','${B}','Admin','tenant_admin');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES ('${A}','${UA}','aaaaaaaa-0000-0000-0000-0000000000a1','active'),
    ('${B}','${UB}','bbbbbbbb-0000-0000-0000-0000000000b1','active');
  INSERT INTO customers (id, tenant_id, environment, email, first_name, last_name) VALUES ('${C1}','${A}','production','c1@x','Asha','Rao');
  INSERT INTO web_push_subscribers (id, tenant_id, environment, customer_id, fcm_token, browser, os, device, subscription_status) VALUES
    ('${sub(1)}','${A}','production','${C1}','t1','Chrome','Windows','desktop','active'),
    ('${sub(2)}','${A}','production',NULL,'t2','Chrome','Android','mobile','active'),
    ('${sub(3)}','${A}','production',NULL,'t3','Firefox','Windows','desktop','active'),
    ('${sub(4)}','${A}','production',NULL,'t4',NULL,NULL,NULL,'active');
`);
const as = async (uid, sql, params) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
};
const content = JSON.stringify({ title: 'Flash sale', body: '50% off', click_url: 'https://shop.test/sale',
  actions: [{ action: 'shop', title: 'Shop now', url: 'https://shop.test/shop' }, { action: 'later', title: 'Later' }] });
const sent = (await as(UA, `SELECT web_push_broadcast_send($1,'production','eeeeeeee-0000-0000-0000-000000000001','Flash sale',$2::jsonb,'{"kind":"all"}'::jsonb) AS r`, [A, content])).rows[0].r;
const bid = sent.broadcast_id;
const report = (uid) => as(uid, `SELECT web_push_broadcast_report($1) AS r`, [bid]).then((x) => x.rows[0].r);

let r = await report(UA);
ok(r.summary.targeted === 4 && r.summary.queued === 4 && r.broadcast.status === 'sending', `before sending: 4 queued (${JSON.stringify(r.summary)})`);
ok(r.timeline.length === 0 && r.by_action.length === 0, 'no timeline / clicks yet');

await db.query(`SELECT count(*) FROM claim_web_push_batch(100)`);
const rows = (await db.query(`SELECT id, subscriber_id, message_id FROM web_push_outbox WHERE delivery_id = $1 ORDER BY subscriber_id`, [bid])).rows;
for (const x of rows) {
  if (x.subscriber_id === sub(4)) await db.query(`SELECT complete_web_push($1,'failed','FCM 500: internal')`, [x.id]);
  else await db.query(`SELECT complete_web_push($1,'delivered')`, [x.id]);
}
const msg = (n) => rows.find((x) => x.subscriber_id === sub(n)).message_id;
await db.query(`INSERT INTO engagement_log (tenant_id, environment, channel, message_id, event, customer_id, timestamp)
  VALUES ($1,'production','web_push',$2,'clicked',$3, now() + interval '30 seconds')`, [A, msg(1), C1]);
await db.query(`INSERT INTO engagement_log (tenant_id, environment, channel, message_id, event, metadata, timestamp)
  VALUES ($1,'production','web_push',$2,'clicked','{"clicked_action":"shop"}', now() + interval '90 seconds')`, [A, msg(2)]);

r = await report(UA);
const s = r.summary;
ok(s.targeted === 4 && s.delivered === 3 && s.failed === 1 && s.clicked === 2 && s.queued === 0, `summary ${JSON.stringify(s)}`);
ok(s.clicked_known === 1 && s.clicked_anonymous === 1, 'known vs anonymous clickers');
ok(s.median_seconds_to_click >= 30 && s.p90_seconds_to_click >= s.median_seconds_to_click, `time to click ${s.median_seconds_to_click}s / ${s.p90_seconds_to_click}s`);
ok(r.broadcast.status === 'sent' && r.broadcast.content.actions.length === 2, 'broadcast + content returned');
const act = Object.fromEntries(r.by_action.map((x) => [x.action, x.clicks]));
ok(act.body === 1 && act.shop === 1, `clicks by CTA ${JSON.stringify(act)}`);
const br = Object.fromEntries(r.by_browser.map((x) => [x.name, x]));
ok(br.Chrome.targeted === 2 && br.Chrome.clicked === 2 && br.Firefox.delivered === 1 && br.Unknown.delivered === 0, 'by browser (unknown bucket too)');
ok(r.by_os.find((x) => x.name === 'Windows').targeted === 2 && r.by_device.find((x) => x.name === 'mobile').clicked === 1, 'by OS / device');
ok(r.issues.length === 1 && r.issues[0].status === 'failed' && /FCM 500/.test(r.issues[0].reason) && r.issues[0].count === 1, `failure reasons ${JSON.stringify(r.issues)}`);
ok(r.timeline.length >= 1 && r.timeline.reduce((a, x) => a + x.delivered, 0) === 3 && r.timeline.reduce((a, x) => a + x.clicked, 0) === 2 && r.bucket === 300, `timeline (5-min buckets) ${JSON.stringify(r.timeline)}`);
ok(r.recent_clicks.length === 2 && r.recent_clicks[0].action === 'shop' && r.recent_clicks[1].customer === 'Asha Rao', 'recent clicks, newest first, with customer');

ok(await throwsWith(report(UB), /not found/), 'other workspace cannot read the report');
ok(await throwsWith(as(UA, `SELECT web_push_broadcast_report('00000000-0000-0000-0000-000000000000') AS r`), /not found/), 'unknown id → not found');
await db.exec(`SET ROLE anon;`);
ok(await throwsWith(db.query(`SELECT web_push_broadcast_report($1)`, [bid]), /permission denied/), 'anon cannot call it');
await db.exec(`RESET ROLE;`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
