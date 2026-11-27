# Environments — inventory and checklist

**Owner:** CTO keeps this current · **Who changes live settings:** CEO (D-014) · **Last verified:** 2026-11-27

> **Names only, never values.** This file is public (the repo is public). Keys, passwords, tokens and
> connection strings live only in the Supabase dashboard and your password manager.

## 1. What exists

| | dev | staging | production |
|---|---|---|---|
| Supabase project | `uqffhyaftlwetqigfenp` (Tokyo, ap-northeast-1) — *verified* | **not created yet** (plan: `marbee-staging`, Mumbai ap-south-1, free tier) | **not created yet** (plan: Mumbai ap-south-1, D-010) |
| In `scripts/db/targets.json` | yes — *verified* | add when created ([create-staging.md](create-staging.md)) | add when created |
| Web app URL (`APP_URL`) | `http://localhost:5173` | TBD (e.g. `https://staging.<domain>`) | TBD |
| Console URL (`CONSOLE_ORIGIN`) | `http://localhost:5174` | TBD | TBD (D-016: `console.<domain>`) |
| SQL ledger | baselined, tracked — *verified 2026-11-25* | fresh | fresh |
| Email sending | Supabase built-in mailer (team members only, ~2 emails/hour) | custom SMTP (SES) — **parked** | custom SMTP (SES) — **parked** |

Local apps (all talk to **dev**): web 5173, console 5174, console-mock 5175 (no backend),
push-test-site 5500. See [local-dev.md](local-dev.md).

## 2. Edge-function secrets (Edge Functions → Secrets)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are **built in** —
Supabase sets them; never add or change them. Everything below you set yourself, **per environment,
different value in each**. *Verified* by reading every `Deno.env.get` in `supabase/functions/` on 2026-11-27.

| Secret | Kind | Needed by | If missing |
|---|---|---|---|
| `MARBEE_SECRETS_KEY` | secret (32 random bytes, base64) | anything that seals keys: `ai-gateway`, `channel-send`, `chatbot-runtime`, `global-variables`, `push-worker`, `form-submit` (via field crypto) | sealed keys/variables can't be read; Web Push provider fails. **Losing it = every sealed secret is unreadable.** Back it up first. |
| `APP_URL` | public URL | `platform-admin` (workspace-owner invite + reset links), `create-tenant-user`, `reset-tenant-user-password` | console invite/reset says "APP_URL secret is not set"; member links fall back to `SITE_URL` or `http://localhost:5173` |
| `CONSOLE_ORIGIN` | public URL(s), comma-separated | `platform-admin` (CORS allow-list) | Console calls are refused from the browser |
| `PUSH_WORKER_SECRET` | secret (random) | `push-worker` | cron can't trigger Web Push sends. **Must equal** Vault `push_worker_key`. |
| `FORM_CHALLENGE_SECRET` | secret (random) | `form-submit` (anti-bot challenge) | form bot-protection challenge can't be signed |
| `OPENAI_API_KEY` | secret | `audience-ai`, `form-ai`, `landing-ai`, `ai-gateway` (Marbee-paid AI) | AI features say not configured (workspace's own key in Settings → AI Engine still works) |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CUSTOM_LLM_API_KEY` | secret, optional | `ai-gateway`, `chatbot-runtime` (platform fallback per provider) | that provider only works with a workspace's own key |
| `JEV_API_KEY` | secret, optional | `jev-ai`, `ai-gateway` | Jev provider unavailable |
| `OPENAI_FORM_MODEL`, `OPENAI_LANDING_MODEL` | public, optional | `form-ai`, `landing-ai` | defaults used |
| `SITE_URL` | public URL, optional (legacy) | fallback for `APP_URL` in member functions | — use `APP_URL` |
| `SES_REGION`, `SES_AWS_ACCESS_KEY_ID`, `SES_AWS_SECRET_ACCESS_KEY`, `SES_CONFIGURATION_SET`, `SES_MAIL_FROM_SUBDOMAIN`, `EMAIL_DMARC_RUA` | SES (**parked**) | `email-domains` | domain onboarding can't call SES |
| `SUPABASE_DB_POOL_URL` | secret, optional | `_shared/supabase.ts` (pooled DB connection) | falls back to built-in `SUPABASE_DB_URL` |

**Firebase / VAPID:** not function secrets. Each workspace's Firebase web config (public) is in
`channel_providers.config`; its service-account key is sealed server-side in `channel_provider_secrets`
(with `MARBEE_SECRETS_KEY`). Marbee never holds a VAPID private key.

## 3. Vault secrets (Database → Vault) — used by pg_cron / pg_net

| Name | Value (describe, don't paste here) | Used by |
|---|---|---|
| `pipeline_worker_url` / `pipeline_worker_key` | `https://<ref>.supabase.co/functions/v1/pipeline-run-worker` / service-role key | sql 61, 72, 73, 91 (pipeline sweeps, form triggers, waits, suspension) |
| `email_domains_url` / `email_domains_key` | `…/functions/v1/email-domains` / service-role key | sql 81 (DNS re-check cron) |
| `push_worker_url` / `push_worker_key` | `…/functions/v1/push-worker` / same value as `PUSH_WORKER_SECRET` | sql 95 (Web Push cron) |

Crons no-op (silently) when their Vault pair is missing — check this first if "nothing happens".

## 4. Auth settings (Authentication)

| Setting | dev | staging / production |
|---|---|---|
| URL Configuration → **Site URL** | `http://localhost:5173` | that env's `APP_URL` |
| URL Configuration → **Redirect URLs** | `http://localhost:5173/**` | `<APP_URL>/**` (or at least `<APP_URL>/setup-password`) |
| Sign In / Providers → Email → Allow new users to sign up | off (invite-only, D-017) | off |
| Emails → SMTP | built-in (limited) | custom SMTP (SES) before any real user |
| Multi-factor → TOTP | on (Console requires MFA) | on |

## 5. Checklist per environment

### dev — confirm today (CEO, ~5 minutes, read-only unless something is wrong)

1. Open **Authentication → URL Configuration**:
   `https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/auth/url-configuration`
   - Site URL is exactly `http://localhost:5173`
   - Redirect URLs contains `http://localhost:5173/**`
   - If either is different: fix it and press **Save**.
2. Open **Edge Functions → Secrets**:
   `https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/functions/secrets`
   - These names exist: `APP_URL`, `CONSOLE_ORIGIN`, `MARBEE_SECRETS_KEY`, `PUSH_WORKER_SECRET`, `FORM_CHALLENGE_SECRET`.
   - The dashboard shows a **digest** (fingerprint), not the value. `APP_URL` should show digest starting
     `4e90ec8f9d9b` (= `http://localhost:5173`); `CONSOLE_ORIGIN` should start `6709d982e189`
     (= `http://localhost:5174`). *Assumption:* the dashboard digest is SHA-256 of the value. If it
     doesn't match, or you're unsure, just set the value again — these two are not secret.
3. Open **Database → Vault** (Integrations → Vault): the six names in §3 exist.
4. On your PC: `npm run health` → everything UP and "Supabase … answers".

### staging (when created — [create-staging.md](create-staging.md))

- [ ] Project in Mumbai, free tier; DB password in password manager
- [ ] Added to `scripts/db/targets.json` (user + host only)
- [ ] `db:apply` core → `pending core 0`; v2 only as a separate, deliberate step
- [ ] Extensions: `pg_cron`, `pg_net`, `pgmq`, `pg_trgm`, `btree_gin`, `pg_stat_statements`
- [ ] Secrets §2: `MARBEE_SECRETS_KEY` (new, backed up), `APP_URL`, `CONSOLE_ORIGIN`, `PUSH_WORKER_SECRET`, `FORM_CHALLENGE_SECRET`
- [ ] Vault §3: all six
- [ ] Auth §4: Site URL, Redirect URLs, sign-up off, MFA on; SMTP when email is unparked
- [ ] Functions deployed with manifest JWT settings
- [ ] Smoke test: console sign-in → create workspace → invite → accept → app loads

### production

Same as staging, plus: custom SMTP live, custom domain, backups/PITR decision (cost entry in
`08-infrastructure-cost-plan.md`), and only after staging has passed the smoke test.
