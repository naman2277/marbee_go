# Runbook — run Marbee on your PC

All local apps talk to the **dev** Supabase project. Commands are for PowerShell, run from the repo folder.

> **If PowerShell says `npm.ps1 cannot be loaded because running scripts is disabled`:** type `npm.cmd`
> instead of `npm` (e.g. `npm.cmd run dev:all`). Same program, not blocked by Windows' script policy.
> This applies to every `npm` command in these runbooks.

**Keep the apps alive:** run `npm run dev:all` in a Terminal tab you own and leave it open. Servers that a
Claude session starts (`preview_start`) stop when that session restarts or is archived.

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

**Port rule:** 5173, 5174 and 5175 **always serve the main Marbee folder** (`D:\My Projects\Marbee v2\Marbee`),
so they show what is merged, even when `dev:all` is run from a Claude session's worktree. A session's
unmerged branch is previewed on **5181** instead, never on 5173.

| App | Link | What it is |
|---|---|---|
| web | http://localhost:5173 | the Marbee app, from the **main folder** |
| console | http://localhost:5174 | Platform Console (real sign-in + MFA), main folder |
| console-mock | http://localhost:5175 | Console with sample data (no sign-in), main folder |
| web-branch | http://localhost:5181 | a session's **branch preview** (only exists when run from a worktree) |
| push-test-site | http://localhost:5500 | fake brand site for Web Push tests (start on its own: `npm run dev:push-site`) |

The main folder shows the latest merged work only after you update it there: `git pull`.

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

- `marbee-web` (5173), `marbee-console` (5174), `marbee-console-mock` (5175), `push-test-site` (5500):
  these always run the **main folder**, never your branch. If one is already up, use it as it is.
- `marbee-web-branch` (5181): **your branch**. Use this to preview unmerged work.
- `web-landing` (5199), `marbee-web-journeys` (63158): your branch on extra ports.

**Never serve a branch on 5173.** It hides merged features from the founder. Ports are strict: if one is busy,
the start fails instead of silently moving to another port. Check with `npm run health`.

The list of apps lives in one file, `scripts/dev/apps.mjs`. Add a new app there **and** in
`.claude/launch.json`.

If something breaks: [troubleshooting.md](troubleshooting.md).
