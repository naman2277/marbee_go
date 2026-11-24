#!/usr/bin/env node
// Deploy edge functions with the right JWT setting (D-021). Runbook: docs/cpo/runbooks/environment-setup.md
//
//   npm run fn:deploy -- --project-ref <ref> --dry-run            (print what would run)
//   npm run fn:deploy -- --project-ref <ref> --yes                (deploy all 27)
//   npm run fn:deploy -- --project-ref <ref> --only form-submit,webhook-trigger --yes
//
// Needs the Supabase CLI on PATH and SUPABASE_ACCESS_TOKEN in the environment (Supabase →
// Account → Access tokens). The token is never printed. `--use-api` bundles without Docker.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const ref = value('project-ref');
if (!ref || !/^[a-z0-9]{20}$/.test(ref)) {
  console.error('--project-ref <20-character Supabase project ref> is required (Supabase → Project Settings → General).');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(ROOT, 'supabase/functions/manifest.json'), 'utf8')).functions;
const onDisk = readdirSync(join(ROOT, 'supabase/functions'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(ROOT, 'supabase/functions', d.name, 'index.ts')))
  .map((d) => d.name).sort();

// Every function on disk must be in the manifest (so nothing ships with an unreviewed JWT setting).
const unlisted = onDisk.filter((f) => !manifest[f]);
const missing = Object.keys(manifest).filter((f) => !onDisk.includes(f));
if (unlisted.length || missing.length) {
  if (unlisted.length) console.error(`Not in supabase/functions/manifest.json (add with a JWT decision): ${unlisted.join(', ')}`);
  if (missing.length) console.error(`In the manifest but no supabase/functions/<name>/index.ts: ${missing.join(', ')}`);
  process.exit(2);
}

const only = value('only')?.split(',').map((s) => s.trim()).filter(Boolean);
if (only) {
  const bad = only.filter((f) => !manifest[f]);
  if (bad.length) { console.error(`Unknown function(s): ${bad.join(', ')}`); process.exit(2); }
}
const targets = (only ?? onDisk);
const dryRun = flag('dry-run');

const commandFor = (fn) => ['functions', 'deploy', fn, '--project-ref', ref, '--use-api', ...(manifest[fn].verifyJwt ? [] : ['--no-verify-jwt'])];

console.log(`Project: ${ref} · ${targets.length} function(s) · JWT verification ON for: ${targets.filter((f) => manifest[f].verifyJwt).join(', ') || '(none)'}`);
if (dryRun) {
  for (const fn of targets) console.log(`supabase ${commandFor(fn).join(' ')}`);
  process.exit(0);
}
if (!flag('yes')) { console.error('Re-run with --yes to deploy, or --dry-run to preview.'); process.exit(3); }
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is not set. In PowerShell:  $env:SUPABASE_ACCESS_TOKEN = "sbp_…"  (Supabase → Account → Access tokens)');
  process.exit(2);
}
const cli = spawnSync('supabase', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (cli.status !== 0) {
  console.error('Supabase CLI not found. Install it once:  scoop install supabase   (or see https://supabase.com/docs/guides/cli)');
  process.exit(2);
}

const failed = [];
for (const fn of targets) {
  console.log(`\n→ ${fn} (JWT ${manifest[fn].verifyJwt ? 'on' : 'off'})`);
  const r = spawnSync('supabase', commandFor(fn), { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) failed.push(fn);
}
if (failed.length) {
  console.error(`\nFailed: ${failed.join(', ')} — fix and re-run with --only ${failed.join(',')}`);
  process.exit(1);
}
console.log(`\nDeployed ${targets.length} function(s) to ${ref}.`);
