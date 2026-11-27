#!/usr/bin/env node
// npm run health  — is each local app answering, and can it reach Supabase?
//
// For each app: GET http://localhost:<port>/ must return the app's HTML (a Vite page with
// <div id="root"> and the dev client), so "connection refused" or a different program on the
// port both show as DOWN. Then, if apps/web/.env.local is set, checks that the dev Supabase
// project answers (GET <url>/auth/v1/health with the public anon key). Prints no values.
//
//   npm run health                  # all apps
//   npm run health -- web console   # some
// Exit code 0 only when every dev:all app (or every app you name) is UP and Supabase answers.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPS, ROOT, appByName, probe } from './apps.mjs';

/** Env of one app folder (root = the checkout that app runs from: main folder or this worktree). */
function readEnv(app, root = ROOT) {
  const vars = {};
  for (const f of ['.env', '.env.local']) {
    const file = join(root, 'apps', app, f);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return vars;
}

async function main() {
  const names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const chosen = names.length ? names.map((n) => appByName(n)).filter(Boolean) : APPS;
  let allOk = true;
  console.log('Marbee local health check\n');
  for (const app of chosen) {
    const r = await probe(app);
    // Apps that dev:all doesn't start (push-test-site) only count when you name them.
    const optional = (!app.inDevAll || app.name === 'web-branch') && !names.length;
    if (!r.ok && !optional) allOk = false;
    const mark = r.ok ? '\x1b[32mUP  \x1b[0m' : optional ? '\x1b[90mOFF \x1b[0m' : '\x1b[31mDOWN\x1b[0m';
    const hint = app.name === 'web-branch' ? 'npm.cmd run dev:all -- web-branch' : 'npm.cmd run dev:push-site';
    const note = r.ok ? '' : optional ? `— optional; start with: ${hint}` : '— ' + r.why;
    console.log(`  ${mark} ${app.name.padEnd(15)} http://localhost:${app.port}  ${note}`);
  }

  // Env + backend reachability (names only, never values).
  console.log('');
  // One line per app folder that needs Supabase settings (main folder, and this worktree's branch).
  const seen = new Set();
  for (const app of APPS.filter((a) => a.needsEnv)) {
    const dir = app.cwd.split('/').pop();
    const key = `${app.root}|${dir}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `${app.root === ROOT ? '' : 'main folder '}apps/${dir}${app.name === 'web-branch' ? ' (branch)' : ''}`;
    const v = readEnv(dir, app.root);
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !v[k]);
    if (missing.length) allOk = false;
    console.log(missing.length ? `  \x1b[31mENV \x1b[0m ${label}: missing ${missing.join(', ')} — run: npm.cmd run dev:env` : `  \x1b[32mENV \x1b[0m ${label}: Supabase URL + anon key set`);
  }
  const web = readEnv('web', appByName('web').root);
  if (web.VITE_SUPABASE_URL && web.VITE_SUPABASE_ANON_KEY) {
    const host = new URL(web.VITE_SUPABASE_URL).host;
    try {
      const res = await fetch(web.VITE_SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/health', {
        headers: { apikey: web.VITE_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(6000),
      });
      console.log(res.ok ? `  \x1b[32mAPI \x1b[0m Supabase ${host} answers (auth healthy)` : `  \x1b[31mAPI \x1b[0m Supabase ${host} answered HTTP ${res.status} (paused project? wrong anon key?)`);
      if (!res.ok) allOk = false;
    } catch (e) {
      allOk = false;
      console.log(`  \x1b[31mAPI \x1b[0m Supabase ${host} unreachable (${e?.cause?.code ?? e?.name}) — internet down, or project paused?`);
    }
  }

  if (!allOk) console.log('\nStart apps with:  npm.cmd run dev:all     Runbook: docs/cpo/runbooks/local-dev.md');
  process.exit(allOk ? 0 : 1);
}

await main();
