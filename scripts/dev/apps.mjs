// The one list of Marbee's local apps: name, port, how to start it, how to tell it's healthy.
// Used by dev-all.mjs (npm run dev:all), health.mjs (npm run health) and env-sync.mjs (npm run dev:env).
// .claude/launch.json uses the same ports, so `preview_start` and `npm run dev:all` never clash.
// Runbook: docs/cpo/runbooks/local-dev.md

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This checkout (the main folder, or a Claude session's worktree). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The main Marbee folder. `git worktree list` always lists it first. */
export const MAIN_ROOT = (() => {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    const first = out.split(/\r?\n/).find((l) => l.startsWith('worktree '));
    return first ? resolve(first.slice(9).trim()) : ROOT;
  } catch { return ROOT; }
})();

/** True in a Claude session's worktree: its own branch must never take the main ports. */
export const IS_WORKTREE = MAIN_ROOT.toLowerCase() !== ROOT.toLowerCase();

/**
 * Port rule (founder, 2026-11-28): 5173 ALWAYS serves the main folder, so merged work is what you see there.
 * A worktree's own web app (a branch preview) runs on 5181 instead.
 *
 * @typedef {{ name: string, port: number, root: string, cwd: string, cmd: string, args: string[],
 *   kind: 'vite' | 'static', needsEnv: boolean, inDevAll: boolean, launchName: string, what: string }} AppDef
 */

/** @type {AppDef[]} */
export const APPS = [
  {
    name: 'web', port: 5173, root: MAIN_ROOT, cwd: 'apps/web', cmd: 'npm', args: ['run', 'dev', '--', '--port', '5173', '--strictPort'],
    kind: 'vite', needsEnv: true, inDevAll: true, launchName: 'marbee-web',
    what: 'Marbee app from the MAIN folder (what is merged)',
  },
  ...(IS_WORKTREE ? [{
    name: 'web-branch', port: 5181, root: ROOT, cwd: 'apps/web', cmd: 'npm', args: ['run', 'dev', '--', '--port', '5181', '--strictPort'],
    kind: /** @type {'vite'} */ ('vite'), needsEnv: true, inDevAll: true, launchName: 'marbee-web-branch',
    what: "this worktree's branch (preview, not merged yet)",
  }] : []),
  {
    name: 'console', port: 5174, root: MAIN_ROOT, cwd: 'apps/console', cmd: 'npm', args: ['run', 'dev', '--', '--strictPort'],
    kind: 'vite', needsEnv: true, inDevAll: true, launchName: 'marbee-console',
    what: 'Platform Console (real sign-in + MFA, dev Supabase)',
  },
  {
    name: 'console-mock', port: 5175, root: MAIN_ROOT, cwd: 'apps/console', cmd: 'npm', args: ['run', 'dev:mock'],
    kind: 'vite', needsEnv: false, inDevAll: true, launchName: 'marbee-console-mock',
    what: 'Platform Console with sample data (no sign-in, no backend)',
  },
  {
    name: 'push-test-site', port: 5500, root: MAIN_ROOT, cwd: '.', cmd: 'node', args: ['tools/push-test-site/serve.mjs'],
    kind: 'static', needsEnv: false, inDevAll: false, launchName: 'push-test-site',
    what: 'Fake brand website for Web Push SDK tests (start on demand)',
  },
];

/** Browser-safe keys only. Anything else in a source .env is never copied. */
export const PUBLIC_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

export const appByName = (n) => APPS.find((a) => a.name === n);

/**
 * Does the app answer on its port with ITS page? (connection refused / another program → not ok)
 * @param {AppDef} app
 */
export async function probe(app, timeoutMs = 4000) {
  const base = `http://localhost:${app.port}`;
  try {
    const res = await fetch(base + '/', { signal: AbortSignal.timeout(timeoutMs) });
    const html = await res.text();
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    if (app.kind === 'vite') {
      if (!html.includes('id="root"') || !html.includes('/@vite/client')) return { ok: false, why: 'port answers, but not with this app (another program on the port?)' };
      const entry = await fetch(base + '/src/main.tsx', { signal: AbortSignal.timeout(timeoutMs) });
      if (!entry.ok) return { ok: false, why: `page loads but app code fails to compile (HTTP ${entry.status}) — see its terminal` };
    }
    return { ok: true, why: '' };
  } catch (e) {
    const code = e?.cause?.code ?? e?.name;
    if (code === 'ECONNREFUSED') return { ok: false, why: 'not running (connection refused)' };
    if (code === 'TimeoutError') return { ok: false, why: `no answer within ${timeoutMs / 1000}s` };
    return { ok: false, why: String(code ?? e) };
  }
}
