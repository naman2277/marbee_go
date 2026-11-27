# Runbook — apply SQL to a database

**Who:** CEO (live system, D-014) · **Time:** 1–5 minutes · Full setup of a new environment: [environment-setup.md](environment-setup.md)

The runner applies the numbered scripts in `supabase/sql/` in order, records each one in the database's
ledger table, never runs one twice, and stops at the first error. It verifies the server's certificate.

## Steps

1. Open PowerShell in the Marbee folder and get the latest code:

```powershell
git pull
```

2. See what's pending (it asks for the database password — typing is hidden, nothing is stored):

```powershell
node scripts/db/apply.mjs status --target dev
```

3. Apply:

```powershell
node scripts/db/apply.mjs apply --target dev --yes
```

4. Check that nothing is left:

```powershell
node scripts/db/apply.mjs status --target dev
```

Expected: `pending core 0`.

For staging/production replace `dev` with `staging` / `production` (once they're in `scripts/db/targets.json`).
Preview first without running anything: add `--dry-run` instead of `--yes`.

## Where's the password?

Supabase → your project → **Project Settings → Database → Database password**. If you don't have it,
**Reset database password** there (save the new one in your password manager first). Never paste it into chat.

## If it stops

It prints `STOPPED: core/NN_….sql failed — nothing from this script was kept` and the database error.
Everything before that script is kept. Send Claude the **message** (not the password). After the fix,
run the same apply command again; it continues from the failed script.

## Not for this runner

- The v2 scale layer (`supabase/sql/v2/`) only runs with `--phase v2`, on purpose, and is **on hold**
  until the DBA review fixes are in.
- Scripts listed in `supabase/sql/manifest.json` as manual-only (cleanup, link-your-user, load-test data).
- One-off snippets in a runbook (e.g. Vault secrets) go in the SQL editor:
  `https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/sql/new`
