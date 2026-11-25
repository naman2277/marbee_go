// Tests for scripts/db/core.mjs (D-021) on PGlite with the real numbered scripts.
// Run: node supabase/tests/sql/runner.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { loadPlan, status, apply, LEDGER } from '../../../scripts/db/core.mjs';

let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const throwsWith = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };

const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 15, src.indexOf('`);', src.indexOf('await db.exec(`')));
// PGlite has no extensions/default-privilege support — same stripping as the dry-run chain.
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
const newDb = async () => {
  const pg = new PGlite();
  await pg.exec(stub);
  return { pg, db: { exec: (sql) => pg.exec(strip(sql)), query: (sql, params) => pg.query(sql, params) } };
};

const { manifest, plan } = loadPlan('.');
const core = plan.filter((s) => s.phase === 'core');
ok(!plan.some((s) => /00_cleanup|03_link_your_user|59_loadtest_seed/.test(s.id)), 'manifest excludes cleanup, link-your-user and load-test seed');
ok(core[0].id === 'core/01_marbee_schema.sql' && core.some((s) => s.id === 'core/93_my_workspace_status.sql'), 'core phase runs 01 … 93 in order');
ok(plan.findIndex((s) => s.phase === 'v2') > plan.findIndex((s) => s.id === 'core/93_my_workspace_status.sql'), 'v2 phase comes after all core scripts');
ok(plan.find((s) => s.file === '68_cleanup_merged_deleted_customers.sql')?.selfTx === true, 'script with its own BEGIN/COMMIT is detected');

// Numbering past 99: picked up and ordered numerically (Codex review on PR #2)
{
  const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tmp = mkdtempSync(join(tmpdir(), 'marbee-plan-'));
  mkdirSync(join(tmp, 'supabase/sql/v2'), { recursive: true });
  copyFileSync('supabase/sql/manifest.json', join(tmp, 'supabase/sql/manifest.json'));
  for (const f of ['1000_d.sql', '100_c.sql', '11_a.sql', '99_b.sql', '00_cleanup.sql']) writeFileSync(join(tmp, 'supabase/sql', f), 'SELECT 1;');
  const order = loadPlan(tmp).plan.map((s) => s.file).join(',');
  ok(order === '11_a.sql,99_b.sql,100_c.sql,1000_d.sql', `scripts numbered 100+ are included and run in numeric order (${order})`);
}

// 1) Fresh database
const A = await newDb();
let st = await status(A.db, plan);
ok(st.state === 'fresh' && st.pending.length === plan.length && !st.hasLedger, 'fresh database: everything pending, no ledger created by status');
const dry = await apply(A.db, plan, { manifest, phases: ['core'], dryRun: true });
ok(dry.wouldRun.length === core.length && (await status(A.db, plan)).state === 'fresh', 'dry run lists every core script and changes nothing');

// 2) v2 needs all of core first
ok(await throwsWith(apply(A.db, plan, { manifest, phases: ['v2'] }), /needs phase "core"/), 'v2 refused until core is fully applied');

// 3) Apply in two steps (resume)
let r = await apply(A.db, plan, { manifest, phases: ['core'], through: '10' });
ok(r.ran.length > 0 && r.ran.at(-1).startsWith('core/10_'), `partial run stops at --through 10 (${r.ran.length} scripts)`);
r = await apply(A.db, plan, { manifest, phases: ['core'] });
st = await status(A.db, plan);
ok(st.state === 'tracked' && st.pending.filter((s) => s.phase === 'core').length === 0, `resume applies the rest (${r.ran.length} more); core fully applied`);
ok(r.ran[0] && !r.ran[0].startsWith('core/01_'), 'already-applied scripts are not run again');
const again = await apply(A.db, plan, { manifest, phases: ['core'] });
ok(again.ran.length === 0 && again.skipped === core.length, 'second full run is a no-op');
const { rows: cnt } = await A.pg.query(`SELECT count(*)::int n, count(*) FILTER (WHERE mode = 'applied')::int a FROM ${LEDGER}`);
ok(cnt[0].n === core.length && cnt[0].a === core.length, 'ledger has one "applied" row per core script');
ok((await A.pg.query(`SELECT count(*)::int n FROM ${LEDGER} WHERE script = 'core/68_cleanup_merged_deleted_customers.sql'`)).rows[0].n === 1, 'self-transaction script recorded');

// 4) Ledger is invisible to app users
await A.pg.exec(`SET ROLE authenticated`);
let denied = false;
try { await A.pg.query(`SELECT * FROM ${LEDGER}`); } catch (e) { denied = /permission denied/.test(e.message); }
await A.pg.exec(`RESET ROLE`);
ok(denied, 'app users (authenticated) cannot read the ledger');

// 5) Drift: an applied script edited later is reported, not re-run
const edited = plan.map((s) => (s.id === 'core/12_lock_table_name_after_publish.sql' ? { ...s, checksum: 'edited' } : s));
st = await status(A.db, edited);
ok(st.drift.length === 1 && st.drift[0].id.includes('12_lock'), 'edited applied script reported as drift');
ok((await apply(A.db, edited, { manifest, phases: ['core'] })).ran.length === 0, 'drifted script is not re-run');

// 6) Failure stops the run and keeps nothing from the failing script
const broken = [...plan.filter((s) => s.phase === 'core'),
  { id: 'core/94_good.sql', phase: 'core', file: '94_good.sql', sql: 'CREATE TABLE public.t94 (id int);', checksum: 'g', selfTx: false },
  { id: 'core/95_bad.sql', phase: 'core', file: '95_bad.sql', sql: 'CREATE TABLE public.t95 (id int); SELECT 1/0;', checksum: 'b', selfTx: false },
  { id: 'core/96_after.sql', phase: 'core', file: '96_after.sql', sql: 'CREATE TABLE public.t96 (id int);', checksum: 'a', selfTx: false }];
let err;
try { await apply(A.db, broken, { manifest, phases: ['core'] }); } catch (e) { err = e; }
const has = async (t) => (await A.pg.query(`SELECT to_regclass('public.${t}') IS NOT NULL AS x`)).rows[0].x;
ok(err?.script === 'core/95_bad.sql' && /nothing from this script was kept/.test(err.message), 'failing script reported by name');
ok(await has('t94') && !(await has('t95')) && !(await has('t96')), 'earlier script kept, failing script rolled back, later script not run');
ok((await A.pg.query(`SELECT count(*)::int n FROM ${LEDGER} WHERE script IN ('core/95_bad.sql','core/96_after.sql')`)).rows[0].n === 0, 'ledger records neither the failed nor the skipped script');

// 7) Untracked database (schema present, no ledger) — refused, then baselined
const B = await newDb();
for (const s of core) await B.db.exec(s.sql); // built by hand, like dev today
ok((await status(B.db, plan)).state === 'untracked', 'hand-built database detected as untracked');
ok(await throwsWith(apply(B.db, plan, { manifest, phases: ['core'] }), /no ledger/), 'apply refuses to touch an untracked database');
const bl = await apply(B.db, plan, { manifest, phases: ['core'], baseline: true });
st = await status(B.db, plan);
ok(bl.recorded.length === core.length && st.state === 'tracked' && st.pending.every((s) => s.phase === 'v2'), 'baseline records core as applied without running anything');
ok((await B.pg.query(`SELECT count(*)::int n FROM ${LEDGER} WHERE mode = 'baseline'`)).rows[0].n === core.length, 'baseline rows are marked "baseline"');

// 8) Baseline on an empty database is refused
const C = await newDb();
ok(await throwsWith(apply(C.db, plan, { manifest, phases: ['core'], baseline: true }), /empty database/), 'baseline refused on an empty database');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
