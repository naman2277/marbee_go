# Runbook — deploy an edge function

**Who:** CEO (live system, D-014) · **Time:** ~3 minutes per function

Today there is no Supabase CLI on your PC, so dev deploys are a **dashboard paste**. (With the CLI,
`npm run fn:deploy` deploys all functions with the right settings in one go; see [tooling.md](tooling.md).)

## Dashboard paste (dev)

1. Claude tells you the function name, e.g. `push-worker`, and that its file is ready.
   The file to paste is **`supabase/web-deploy/<name>.ts`**: one file with all shared code included.
2. Open: `https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/functions`
3. **Existing function:** click it → **Code** tab → select all → paste the whole file → **Deploy**.
   **New function:** **Deploy a new function** → **Via Editor** → name it exactly as given → paste → **Deploy**.
4. Function → **Settings** → **Enforce JWT Verification** must match `supabase/functions/manifest.json`
   (`verifyJwt: true` = ON, `false` = OFF). Claude names the setting each time.
5. Check it answers. Paste in PowerShell (replace `<name>`):

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" https://uqffhyaftlwetqigfenp.supabase.co/functions/v1/<name>
```

Any number **except 404** means it's deployed (401/400/405 are normal without a signed-in user).

## For Claude: making the paste file

The `web-deploy/` copy is generated, never hand-edited:

```powershell
npm run bundle:functions -- <name>
```

Re-bundle every time `supabase/functions/<name>/` or a `_shared/` file it imports changes, and commit
the result in the same PR. *Verified 2026-11-27:* these functions have **no** `web-deploy/` copy yet:
`audience-ai`, `events-worker`, `form-ai`, `jev-ai`, `landing-ai`, `platform-admin`. Bundle them before
asking the CEO to paste them.

## Staging / production

Don't paste by hand: use the pipeline in [environment-setup.md](environment-setup.md) §6
(needs the Supabase CLI).

## Roll back

Paste the previous version: `git show <old-commit>:supabase/web-deploy/<name>.ts` (Claude produces it),
then the same steps.
