#!/usr/bin/env node
// Environment setup pipeline — CLI (D-021). Runbook: docs/cpo/runbooks/environment-setup.md
//
//   npm run db:status   -- --target staging
//   npm run db:apply    -- --target staging --yes                 (core phase: 01 … 93)
//   npm run db:apply    -- --target staging --phase v2 --yes      (scale layer, after core)
//   npm run db:baseline -- --target dev --yes                     (record an existing DB)
//
// Connection: the database connection string comes ONLY from the environment variable
// MARBEE_DB_URL (Supabase → Connect → "Session pooler" or "Direct connection"). It is
// never printed, logged or written to disk by this script. Do not use the transaction
// pooler (port 6543): scripts need a real session.

import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPlan, status, apply } from './core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const usage = `Usage: node scripts/db/apply.mjs <status|apply|baseline> --target <name> [--phase core|v2] [--through NN] [--dry-run] [--yes]
  MARBEE_DB_URL must hold the target's connection string (never commit it).`;

if (!['status', 'apply', 'baseline'].includes(command)) { console.error(usage); process.exit(2); }
const target = value('target');
if (!target) { console.error('--target <name> is required (e.g. staging, production, dev) — it is printed so you can confirm where you are pointing.\n' + usage); process.exit(2); }
/** Ask for the database password without showing it on screen. */
async function askHidden(question) {
  const { createInterface } = await import('node:readline');
  if (!process.stdin.isTTY) {
    // Piped input (e.g. automation): read one line.
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) { rl.close(); return line; }
    return '';
  }
  return new Promise((resolveAnswer) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); }; // hide typed/pasted characters
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolveAnswer(answer); });
  });
}

// Known environments (scripts/db/targets.json) need only the password, asked for here.
// Anything else uses MARBEE_DB_URL.
const targets = JSON.parse((await import('node:fs')).readFileSync(resolve(ROOT, 'scripts/db/targets.json'), 'utf8'));
let url;
if (targets[target]) {
  const t = targets[target];
  const password = (await askHidden(`Database password for "${target}" (input hidden, never stored): `)).trim();
  if (!password) { console.error('No password entered.'); process.exit(2); }
  url = `postgresql://${encodeURIComponent(t.user)}:${encodeURIComponent(password)}@${t.host}:${t.port}/${t.database}`;
} else {
  url = process.env.MARBEE_DB_URL;
  if (!url) {
    console.error(`"${target}" is not in scripts/db/targets.json and MARBEE_DB_URL is not set. Add the environment's Session-pooler user/host to targets.json (not secret), or set MARBEE_DB_URL.`);
    process.exit(2);
  }
}

let host = '?';
let port = '?';
try { const u = new URL(url); host = u.hostname; port = u.port || '5432'; } catch { console.error('MARBEE_DB_URL is not a valid postgres:// URL.'); process.exit(2); }
if (port === '6543') { console.error('This is the transaction pooler (port 6543). Use the Session pooler or Direct connection string — scripts need a real session.'); process.exit(2); }

const phase = value('phase') ?? 'core';
if (!['core', 'v2'].includes(phase)) { console.error('--phase must be core or v2'); process.exit(2); }
const through = value('through');
const dryRun = flag('dry-run');

const local = /^(localhost|127\.0\.0\.1|::1)$/.test(host);
// TLS with full certificate verification (fail closed). Supabase signs its database and
// pooler certificates with its own root CA, which is not in Node's default store, so we pin
// it: scripts/db/supabase-ca.crt (public certificate — Supabase → Project Settings →
// Database → SSL configuration → Download certificate), or MARBEE_DB_CA=<path>.
let ssl = false;
if (!local) {
  const { existsSync, readFileSync } = await import('node:fs');
  const caPath = process.env.MARBEE_DB_CA || resolve(ROOT, 'scripts/db/supabase-ca.crt');
  if (!existsSync(caPath)) {
    console.error(`Refusing to connect without verifying the database's certificate.\n` +
      `Download Supabase's CA certificate (Supabase → Project Settings → Database → SSL configuration → Download certificate)\n` +
      `and save it as scripts/db/supabase-ca.crt (it is public; safe to commit), or set MARBEE_DB_CA to its path.`);
    process.exit(2);
  }
  ssl = { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true, servername: host };
}
const client = new pg.Client({
  connectionString: url,
  ssl,
  application_name: `marbee-db-${command}`,
});
const db = {
  exec: (sql) => client.query(sql).then(() => undefined),
  query: (sql, params) => client.query(sql, params),
};

const { manifest, plan } = loadPlan(ROOT);
console.log(`Target: ${target}  (host ${host.replace(/^(.{4}).*(\..{6,})$/, '$1…$2')}, port ${port})`);

try {
  await client.connect();
  await client.query('SET statement_timeout = 0');
  const st = await status(db, plan);
  const pend = (ph) => st.pending.filter((s) => s.phase === ph);
  console.log(`State: ${st.state} · applied ${st.applied.length} · pending core ${pend('core').length} · pending v2 ${pend('v2').length}`);
  if (st.drift.length) console.log(`Edited after apply (not re-run, review): ${st.drift.map((d) => d.id).join(', ')}`);
  if (st.unknown.length) console.log(`In ledger but not in this repo: ${st.unknown.join(', ')}`);

  if (command === 'status') {
    const next = st.pending.slice(0, 8).map((s) => s.id);
    if (next.length) console.log(`Next: ${next.join(', ')}${st.pending.length > 8 ? ', …' : ''}`);
  } else {
    if (!dryRun && !flag('yes')) {
      console.error(`\nThis will ${command === 'baseline' ? 'RECORD scripts as applied (without running them)' : 'RUN SQL'} on "${target}". Re-run with --yes to proceed, or --dry-run to preview.`);
      process.exit(3);
    }
    const res = await apply(db, plan, {
      manifest, phases: [phase], through, dryRun,
      baseline: command === 'baseline',
      appliedBy: `scripts/db ${command} (${process.env.USERNAME || process.env.USER || 'unknown'})`,
      log: (m) => console.log(m),
    });
    if (dryRun) console.log(`Dry run — would ${command === 'baseline' ? 'record' : 'run'} ${res.wouldRun.length}: ${res.wouldRun.join(', ') || '(nothing)'}`);
    else if (command === 'baseline') console.log(`Recorded ${res.recorded.length} script(s) as baseline.`);
    else console.log(`Done — ran ${res.ran.length}, already applied ${res.skipped}.`);
  }
} catch (e) {
  console.error(`\nSTOPPED: ${e.message}`);
  if (e.ran?.length) console.error(`Completed before the failure: ${e.ran.length} script(s) (recorded in the ledger).`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
