# Runbook — run Marbee on your PC

All local apps talk to the **dev** Supabase project. Commands are for PowerShell, run from the repo folder.

## Start everything

First time in a folder (or after `git pull` changed `package.json`):

```powershell
npm install
```

Then:

```powershell
npm run dev:all
```

This starts three apps in one window. Ctrl+C stops all of them.

| App | Link | What it is |
|---|---|---|
| web | http://localhost:5173 | the Marbee app |
| console | http://localhost:5174 | Platform Console (real sign-in + MFA) |
| console-mock | http://localhost:5175 | Console with sample data (no sign-in) |
| push-test-site | http://localhost:5500 | fake brand site for Web Push tests (start on its own: `npm run dev:push-site`) |

Start only some of them: `npm run dev:all -- web console`. If an app is already running, it is skipped,
not started twice.

## Is everything working?

```powershell
npm run health
```

Each app shows **UP** or **DOWN** (with the reason), then whether the Supabase settings are filled in and
whether the dev project answers. Nothing secret is printed.

## Settings files (`.env.local`)

Each app reads `apps/<app>/.env.local` (git-ignored). Only two values: `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (public by design). The list is in each app's `.env.example`.

A new folder (every Claude session's worktree) has no `.env.local`. `npm run dev` / `dev:all` fills it
automatically from your main Marbee folder, **copying only those two values**. To run that step on its own:

```powershell
npm run dev:env
```

It refuses to copy a service-role/secret key, never overwrites an existing file, and warns (names only)
about secret-looking `VITE_*` lines. **Never** put an API key in a `VITE_*` variable: it ends up in the
public JavaScript.

## For Claude sessions

`.claude/launch.json` has the same apps by name, so `preview_start` works in any worktree:
`marbee-web` (5173), `marbee-console` (5174), `marbee-console-mock` (5175), `push-test-site` (5500),
plus `web-landing` (5199) and `marbee-web-journeys` (63158) — the web app on spare ports for when 5173
is taken by another session. Ports are strict: if one is busy, the start fails instead of silently
moving to another port. Check with `npm run health`.

The list of apps lives in one file, `scripts/dev/apps.mjs`. Add a new app there **and** in
`.claude/launch.json`.

If something breaks: [troubleshooting.md](troubleshooting.md).
