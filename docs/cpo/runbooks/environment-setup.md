# Runbook — set up a Marbee environment (staging / production)

**Decision:** D-021 · **Who runs it:** CEO (live-system execution, D-014) · **Time:** ~45 min the first time

The pipeline replaces pasting ~95 SQL scripts and 28 functions by hand. It runs the numbered
scripts in `supabase/sql/` in order, records each one in a ledger table inside the database
(`public._marbee_schema_ledger`), never runs one twice, stops at the first error, and refuses to
touch a database whose history it can't see.

> **Secrets rule:** connection strings, access tokens and keys go into your terminal or the
> Supabase dashboard only — never into chat, files in the repo, or screenshots.

---

## 0. One-time on your machine

```powershell
npm install
scoop install supabase      # Supabase CLI (or https://supabase.com/docs/guides/cli)
```

## 1. Create the project (CEO — vendor account)

Supabase → **New project**. Name it `marbee-staging` (or `marbee-prod-in`), region **Mumbai
(ap-south-1)** for India (D-010), strong DB password saved in your password manager.
Free tier is fine for staging (2 free projects per org).

## 2. Database — check, then build

The connection is encrypted **and** the server is verified against Supabase's root certificate
(`scripts/db/supabase-ca.crt`, public, valid to 2031). If verification fails, the runner refuses to connect.


Copy the connection string from **Connect → Session pooler** (port 5432, *not* 6543).

```powershell
$env:MARBEE_DB_URL = "<paste the Session pooler connection string>"
npm run db:status -- --target staging
```

Expected on a new project: `State: fresh · applied 0 · pending core 88 · pending v2 7`.

```powershell
npm run db:apply -- --target staging --dry-run     # lists the 88 core scripts it will run
npm run db:apply -- --target staging --yes         # builds 01 … 94 (a few minutes)
npm run db:status -- --target staging              # expect: pending core 0
```

If it stops: it prints `STOPPED: core/NN_….sql failed — nothing from this script was kept` and the
database error. Everything before it is kept and recorded. Send me the message (not the connection
string); after the fix, run the same `db:apply` again — it continues from the failed script.

**Verify:** run `supabase/sql/tools/verify_91_suspension.sql` in the SQL editor → all rows `PASS`.

## 3. Scale layer (v2) — separate, deliberate step

v2 (partitioning, JWT fast path, queues, cron) has **never run on a real database yet**. Staging is
its first run. Only after step 2 is complete:

```powershell
npm run db:apply -- --target staging --phase v2 --dry-run
npm run db:apply -- --target staging --phase v2 --yes
```

On a fresh database the runner sets `marbee.copy_legacy = false` automatically (nothing to copy).
v2 needs these Supabase extensions enabled (Database → Extensions) before it runs:
`pg_stat_statements`, `pg_trgm`, `btree_gin`, `pgmq`, `pg_cron`, `pg_net`.
If staging shows any problem with v2, production stays on core only until it's fixed.

## 4. Secrets (Edge Functions → Secrets)

| Secret | Value |
|---|---|
| `MARBEE_SECRETS_KEY` | Generate locally (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), save in password manager **first**. Different per environment. Losing it = sealed secrets unreadable. |
| `APP_URL` | The app's URL for this environment (e.g. `https://staging.marbee.app`) |
| `CONSOLE_ORIGIN` | The Platform Console's URL |
| `FORM_CHALLENGE_SECRET` | Another random value (same command) |
| `OPENAI_API_KEY` | Only if Marbee-paid AI is offered here |

## 5. Auth settings (Authentication)

- **Sign In / Providers → Email:** turn **off** "Allow new users to sign up" (invite-only, D-017).
- **Emails → SMTP:** custom SMTP (SES) — Supabase's built-in mailer only reaches team members.
- **URL Configuration:** Site URL = `APP_URL`; Redirect URLs add `<APP_URL>/setup-password`.

## 6. Edge functions

Create an access token: Supabase → **Account → Access tokens**. Project ref: Project Settings → General.

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<paste token>"
npm run fn:deploy -- --project-ref <ref> --dry-run   # shows 28 commands + which have JWT on
npm run fn:deploy -- --project-ref <ref> --yes
```

JWT settings come from `supabase/functions/manifest.json` (reviewed per function); a function
that isn't listed there can't be deployed. Re-deploy a subset with `--only name1,name2`.

## 7. Platform Console + first admin

Follow the note at the top of `supabase/sql/84_platform_console_credits.sql` to add yourself to
`platform_admins`, then deploy `apps/console` with this environment's URL/anon key.

## 8. Smoke test (I can do this with you)

Console sign-in → create a test workspace → invite yourself → accept → app loads with the
workspace → `npm run db:status` shows nothing pending.

---

## Existing databases (dev)

Dev is listed in `scripts/db/targets.json`, so you only run the command — it asks for the database password (hidden, never stored):

```powershell
node scripts/db/apply.mjs status --target dev
```

Add staging/production to `targets.json` the same way (Session-pooler user + host from Supabase → Connect; not secret) and the same one-line commands work for them.

Dev was built by hand, so it has no ledger. Record what it has **without running anything**:

```powershell
$env:MARBEE_DB_URL = "<dev Session pooler string>"
npm run db:status   -- --target dev               # expect: State: untracked
npm run db:baseline -- --target dev --dry-run
npm run db:baseline -- --target dev --yes          # records core 01 … 93 as "baseline"
```

From then on, new scripts reach dev with `npm run db:apply -- --target dev --yes` like everywhere else.
Only baseline a database you've confirmed is current (`supabase/sql/tools/schema_drift_check.sql`).

## Adding a new SQL script (developers)

Add `supabase/sql/NN_name.sql` with the next number. It's picked up automatically. Never edit a
script that has already been applied anywhere — add a new one; the runner flags edited scripts as
drift. Only list a script in `supabase/sql/manifest.json` if it must **not** run in the pipeline.
