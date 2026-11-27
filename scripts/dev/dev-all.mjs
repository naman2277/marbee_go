#!/usr/bin/env node
// npm run dev:all  — start every Marbee app in one terminal. Ctrl+C stops them all.
//
//   npm run dev:all                       # web 5173 + console 5174 + console-mock 5175
//   npm run dev:all -- web console-mock   # only the ones you name (push-test-site too)
//
// An app whose port already answers is skipped ("already running"), so it is safe to run twice.
// Check them any time with:  npm run health
// No extra npm packages: plain Node child processes.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { APPS, ROOT, appByName, probe } from './apps.mjs';

const isWin = process.platform === 'win32';
const names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const unknown = names.filter((n) => !appByName(n));
if (unknown.length) {
  console.error(`Unknown app: ${unknown.join(', ')}. Choose from: ${APPS.map((a) => a.name).join(', ')}`);
  process.exit(2);
}
const chosen = names.length ? names.map(appByName) : APPS.filter((a) => a.inDevAll);

if (!existsSync(join(ROOT, 'node_modules'))) {
  console.error('Dependencies are not installed here yet. Run this once, then try again:\n  npm install');
  process.exit(1);
}

// Fill in a missing .env.local (browser-safe values only) before anything starts.
execFileSync(process.execPath, [join(ROOT, 'scripts/dev/env-sync.mjs')], { stdio: 'inherit', cwd: ROOT });

const colors = [36, 35, 33, 32];
const children = [];

for (const [i, app] of chosen.entries()) {
  const tag = `\x1b[${colors[i % colors.length]}m[${app.name}:${app.port}]\x1b[0m`;
  const already = await probe(app);
  if (already.ok) { console.log(`${tag} already running at http://localhost:${app.port} — skipped`); continue; }

  // Windows needs a shell to find npm.cmd; pass one fixed command string (args come from apps.mjs, never from input).
  const opts = { cwd: join(ROOT, app.cwd), env: { ...process.env, FORCE_COLOR: '1' } };
  const child = isWin
    ? spawn([app.cmd, ...app.args].join(' '), { ...opts, shell: true })
    : spawn(app.cmd, app.args, opts);
  children.push(child);
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) out.write(`${tag} ${l}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => console.log(`${tag} stopped${code ? ` (exit ${code})` : ''}`));
}

if (!children.length) { console.log('Nothing to start.'); process.exit(0); }
console.log(`\nStarting ${children.length} app(s). Open the links above when they say "ready". Press Ctrl+C to stop all.\n`);

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // On Windows npm runs through cmd.exe, so kill the whole process tree.
    if (isWin) { try { execFileSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ } }
    else c.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
