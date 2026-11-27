#!/usr/bin/env node
// npm run dev:env  — make sure apps/web and apps/console have a local .env.local.
//
// A new git worktree (every Claude session) starts without .env.local, and the web app then
// opens to a blank page ("supabaseUrl is required"). This copies ONLY the two browser-safe
// values (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) from the main checkout (or another
// worktree) into the app's .env.local. It:
//   - never prints a value, only key names and file paths;
//   - never overwrites an existing .env.local / .env;
//   - refuses a key that is a service-role / secret key (those must never reach a browser);
//   - warns (names only) about secret-looking VITE_* lines in existing files.
// It always exits 0 so it can run before `npm run dev` without blocking anything.
//
//   node scripts/dev/env-sync.mjs            # web + console
//   node scripts/dev/env-sync.mjs --app web  # one app (used by apps/*/package.json "predev")

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { ROOT, MAIN_ROOT, PUBLIC_ENV_KEYS } from './apps.mjs';

const argApp = (() => { const i = process.argv.indexOf('--app'); return i >= 0 ? process.argv[i + 1] : null; })();
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };
const ENV_APPS = ['web', 'console'].filter((a) => !argApp || a === argApp);

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Is this key safe to put in a browser bundle? (anon / publishable only) */
function isPublicKey(key) {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return false;
  if (key.startsWith('sb_publishable_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload.role === 'anon';
  } catch { return false; }
}

const SECRET_LOOKING = /(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|_API_KEY)$/;

function warnSecretLines(file) {
  const vars = parseEnv(readFileSync(file, 'utf8'));
  for (const name of Object.keys(vars)) {
    if (name.startsWith('VITE_') && name !== 'VITE_SUPABASE_ANON_KEY' && SECRET_LOOKING.test(name)) {
      console.warn(`  ! ${slash(file)}: ${name} looks like a secret. VITE_* values can end up in the public JavaScript — delete that line (and rotate the key if it was ever used).`);
    }
  }
  if (vars.VITE_SUPABASE_ANON_KEY && !isPublicKey(vars.VITE_SUPABASE_ANON_KEY)) {
    console.warn(`  ! ${slash(file)}: VITE_SUPABASE_ANON_KEY is not an anon/publishable key. Replace it with the anon key (Supabase → Project Settings → API).`);
  }
}

/** Every checkout of this repo: the main one first, then the worktrees. */
function allCheckouts() {
  const list = [];
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) if (line.startsWith('worktree ')) list.push(resolve(line.slice(9).trim()));
  } catch { /* not a git checkout — nothing to copy from */ }
  return list.length ? list : [ROOT];
}
const slash = (p) => p.split('\\').join('/');
const same = (a, b) => slash(a).toLowerCase() === slash(b).toLowerCase();

function findSource(root, app) {
  // Both apps use the same Supabase project, so console can borrow web's values and vice versa.
  // Look in this checkout's other app first, then in the other checkouts.
  const other = app === 'console' ? 'web' : 'console';
  const candidates = [[root, other], ...allCheckouts().filter((c) => !same(c, root)).flatMap((c) => [[c, app], [c, other]])];
  for (const [co, a] of candidates) {
    for (const f of ['.env.local', '.env']) {
      const file = join(co, 'apps', a, f);
      if (!existsSync(file)) continue;
      const vars = parseEnv(readFileSync(file, 'utf8'));
      if (vars.VITE_SUPABASE_URL && isPublicKey(vars.VITE_SUPABASE_ANON_KEY)) return { file, vars };
    }
  }
  return null;
}

// This checkout, plus the main folder (dev:all serves 5173-5175 from there — see apps.mjs).
const roots = [ROOT, ...(same(MAIN_ROOT, ROOT) ? [] : [MAIN_ROOT])];

for (const root of roots) {
  const where = same(root, ROOT) ? '' : slash(root) + '/';
  for (const app of ENV_APPS) {
    const dir = join(root, 'apps', app);
    if (!existsSync(dir)) continue;
    const existing = ['.env.local', '.env'].map((f) => join(dir, f)).filter(existsSync);
    if (existing.length) {
      existing.forEach(warnSecretLines);
      const vars = Object.assign({}, ...existing.map((f) => parseEnv(readFileSync(f, 'utf8'))));
      const missing = PUBLIC_ENV_KEYS.filter((k) => !vars[k]);
      if (missing.length) console.warn(`  ! ${where}apps/${app}: ${missing.join(', ')} not set — copy apps/${app}/.env.example to .env.local and fill it in.`);
      else log(`  ok ${where}apps/${app}: env present`);
      continue;
    }
    const src = findSource(root, app);
    if (!src) {
      console.warn(`  ! ${where}apps/${app}/.env.local is missing and no other checkout has one. Copy apps/${app}/.env.example to .env.local and fill in the two values (Supabase → Project Settings → API).`);
      continue;
    }
    const body = [
      `# Created by "npm run dev:env" from ${slash(src.file)}`,
      '# Browser-safe values only (the anon key is public by design). Never put secrets in VITE_* vars.',
      ...PUBLIC_ENV_KEYS.map((k) => `${k}=${src.vars[k]}`),
      '',
    ].join('\n');
    writeFileSync(join(dir, '.env.local'), body, { encoding: 'utf8', flag: 'wx' });
    log(`  + ${where}apps/${app}/.env.local created (${PUBLIC_ENV_KEYS.join(', ')}) from ${slash(src.file)}`);
  }
}
