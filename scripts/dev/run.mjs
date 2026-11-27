#!/usr/bin/env node
// node scripts/dev/run.mjs <app>  — run ONE app in the foreground (used by .claude/launch.json).
// Same folders and ports as dev:all (scripts/dev/apps.mjs): web/console/console-mock always serve the
// MAIN Marbee folder; web-branch serves this worktree's branch on 5181.

import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { APPS, appByName } from './apps.mjs';

const app = appByName(process.argv[2] ?? '');
if (!app) {
  console.error(`Usage: node scripts/dev/run.mjs <app>. Apps here: ${APPS.map((a) => a.name).join(', ')}`);
  process.exit(2);
}
console.log(`[${app.name}] ${join(app.root, app.cwd).replace(/\\/g, '/')} → http://localhost:${app.port}`);

const isWin = process.platform === 'win32';
const opts = { cwd: join(app.root, app.cwd), stdio: 'inherit' };
const child = isWin
  ? spawn([app.cmd, ...app.args].join(' '), { ...opts, shell: true }) // fixed args from apps.mjs only
  : spawn(app.cmd, app.args, opts);

const stop = () => {
  if (child.exitCode !== null) return;
  if (isWin) { try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  else child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
child.on('exit', (code) => process.exit(code ?? 0));
