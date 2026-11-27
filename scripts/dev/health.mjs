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

function readEnv(app) {
  const vars = {};
  for (const f of ['.env', '.env.local']) {
    const file = join(ROOT, 'apps', app, f);
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
    const optional = !app.inDevAll && !names.length;
    if (!r.ok && !optional) allOk = false;
    const mark = r.ok ? '\x1b[32mUP  \x1b[0m' : optional ? '\x1b[90mOFF \x1b[0m' : '\x1b[31mDOWN\x1b[0m';
    const note = r.ok ? '' : optional ? '— optional; start with: npm run dev:push-site' : '— ' + r.why;
    console.log(`  ${mark} ${app.name.padEnd(15)} http://localhost:${app.port}  ${note}`);
  }

  // Env + backend reachability (names only, never values).
  console.log('');
  for (const a of ['web', 'console']) {
    const v = readEnv(a);
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !v[k]);
    console.log(missing.length ? `  \x1b[31mENV \x1b[0m apps/${a}: missing ${missing.join(', ')} — run: npm run dev:env` : `  \x1b[32mENV \x1b[0m apps/${a}: Supabase URL + anon key set`);
  }
  const web = readEnv('web');
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

  if (!allOk) console.log('\nStart apps with:  npm run dev:all     Runbook: docs/cpo/runbooks/local-dev.md');
  process.exit(allOk ? 0 : 1);
}

await main();
