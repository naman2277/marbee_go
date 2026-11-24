# Spec — Platform Console v1 + Credits Ledger (D-015, D-016)

**Status:** Approved, in build · **Owner:** AI CTO · **Target:** inside Wave 1 (before 10 Dec)

## 1. Problem
The CEO and CTO need to operate paying tenants: see each tenant's health and usage, grant credits,
help admins regain access, suspend tenants and produce a monthly bill — without touching the database by hand
and without weakening tenant privacy.

## 2. Users
Platform admins only (CEO, CTO). Never tenant users.

## 3. Screens
| Screen | Content | Actions |
|---|---|---|
| Sign in | Email + password → TOTP enrol (first time) / TOTP code | — |
| Tenants | Table: name, slug, plan, status, region, users, profiles, credits balance, this month's sends, created | Search, filter by status/plan |
| Tenant detail — Overview | Plan, status, created, environments, counts (users, profiles, events 30d, deliveries 30d), estimated storage | Suspend / reactivate (typed confirm), change plan |
| Tenant detail — Usage | Month picker; sends per channel (sent/delivered/failed); AI credits used | — |
| Tenant detail — Credits | Wallet (allowance, top-up, overdraft limit), ledger history | Grant credits (amount, bucket, reason, typed confirm above 10,000), set monthly allowance |
| Tenant detail — Users | Members: email, role, status, last login | Send password-reset link, resend invite |
| Tenant detail — Bill | Month: plan fee + top-ups purchased + usage summary → CSV/print | Export |
| Audit log | Every console action across tenants | Filter by tenant/actor |

States: loading skeletons, empty states, error with retry, success toasts. Desktop-first; usable at tablet width.

## 4. Architecture
- `apps/console`: separate Vite + React SPA, separate deploy (`console.<domain>`), behind Cloudflare Access.
- Talks **only** to the edge function `platform-admin` (never PostgREST directly).
- `platform-admin`: verifies the JWT with `auth.getUser`, requires `aal2` (MFA), requires an active
  `platform_admins` row, rate-limits by user, then dispatches to an **explicit allow-list of operations**.
  Only then uses the service role. Every mutating op writes `platform_audit_log`.
- CORS restricted to `CONSOLE_ORIGIN` secret.

## 5. Data (script `supabase/sql/84_platform_console_credits.sql`)
- `platform_admins(user_id, email, role, status, created_at)` — inserted only by SQL run by the CEO.
- `platform_audit_log` — append-only (trigger blocks UPDATE/DELETE).
- `credit_wallets(tenant_id, allowance_balance, topup_balance, monthly_allowance, overdraft_limit, …)`.
- `credit_ledger` — immutable entries; unique `idempotency_key`; `balance_after` per entry.
- `credit_rate_card(service, unit, credits_per_unit)` — CEO sets values.
- `platform_tenant_stats` — nightly / on-demand snapshot of counts + estimated bytes per tenant.
- Functions: `credit_grant`, `credit_debit` (atomic, row-locked, allowance first, transactional overdraft),
  `credit_set_allowance`, `platform_refresh_tenant_stats`, `platform_tenant_usage(tenant, month)`.
- All new tables: RLS on, **no policies** → unreachable via the anon/authenticated API; EXECUTE on functions
  revoked from `anon`, `authenticated`, `public`, granted to `service_role` only.

## 6. Security
Covered by D-016 conditions 1–6. No password viewing/setting; reset via Supabase recovery link sent to the
member's email. No end-customer PII returned — counts only.

## 7. Known limits in v1
- **Suspension** sets `tenants.status = 'suspended'` and is shown everywhere, but tenant users are **not yet
  blocked**; enforcement lands with Phase 0 (TD-12) because it changes the core tenant-access helpers.
- Top-up expiry after 12 months is recorded (`expires_at`) but not yet swept (Feb).
- `credit_debit` exists but isn't called by senders yet; the SES/WhatsApp workers will call it (Wave 1).
- Invoices: bill summary export only; Razorpay invoice API in Feb.

## 8. Acceptance criteria
1. A non-platform-admin (including any tenant admin) calling `platform-admin` gets 403 for every operation.
2. A platform admin without MFA (aal1) gets 403.
3. The anon/authenticated API cannot select from any new table or execute any new function.
4. Granting credits twice with the same idempotency key creates one ledger entry.
5. `credit_debit` never takes balance below `-overdraft_limit` and only uses overdraft for transactional sends.
6. Every mutating console action appears in the audit log; the log can't be updated or deleted.
7. `npm run build` passes for `apps/console`.

## 9. Rollback
Console: un-deploy the app. Function: delete `platform-admin`. SQL: rollback block at the bottom of script 84
(drops only the new objects; touches no existing table data).

## 10. CEO steps after merge
1. Run `84_platform_console_credits.sql` in staging, then production.
2. Insert your platform-admin row (snippet in the script header).
3. Set function secrets `CONSOLE_ORIGIN`, `APP_URL`; deploy `platform-admin`.
4. Deploy `apps/console` to Cloudflare Pages; put Cloudflare Access in front.
