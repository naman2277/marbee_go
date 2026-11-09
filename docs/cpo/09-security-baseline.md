# 09 — Security Baseline

## 1. Open findings (baseline 2026-11-10)

Severity: **Critical** = cross-tenant data exposure or account takeover · High · Medium.
"Verified" = seen in code; deployment state in the live project is **not** verified.

| ID | Sev | Finding | Location | Fix (recommendation) |
|---|---|---|---|---|
| SEC-01 | Critical | `schema-records` uses the service-role client and trusts `tenant_id` from the request body for read/insert/update/delete. Callable with the public anon key. | `supabase/functions/schema-records/index.ts` | Authenticate the user JWT, check tenant membership, or drop service-role and use the caller's JWT so RLS applies. |
| SEC-02 | Critical | Ingest endpoints take tenant from `x-tenant-id` header / body with service-role writes; events can trigger real-time sends. | `events-ingest`, `push-subscribe`, `push-engage`; `_shared/supabase.ts resolveTenantContext` | Publishable per-site key (maps to tenant, allowed origins, rate limit) for SDK; hashed secret API key for server-to-server. |
| SEC-03 | Critical | New signups auto-join demo tenant as **Tenant Admin**; signup enabled. | `supabase/sql/05_auto_link_new_users.sql`, `supabase/config.toml` | Disable public signup now (Supabase dashboard); replace trigger with org-creation flow. Check live project for unknown users in the demo tenant. |
| SEC-04 | High | API key validation matches the 8-char prefix only; no hash comparison. | `_shared/supabase.ts validateApiKey` | Store SHA-256(key); compare hash; rotate keys. |
| SEC-05 | High | Tenant master key generated and stored in browser `localStorage`. | `apps/web/src/lib/global-variables.ts` | Seal/unseal in an edge function using a server secret (Vault). |
| SEC-06 | High | LLM keys read in the browser (`VITE_OPENAI_API_KEY`); if set at build time they ship in the JS bundle. | `audience-ai.ts`, `cohorts/ai.ts`, `ai-crm-context.ts`, others | All AI calls through edge functions; remove `VITE_OPENAI_*` from production env. |
| SEC-07 | High (confirm) | AI provider API key appears to be saved from the client into `api_key_encrypted` without encryption. | `apps/web/src/lib/ai-engine-config.ts` ~L461 | Write via edge function that encrypts; client reads masked value only. |
| SEC-08 | Medium | `connector-test` has no caller auth and makes outbound requests from config → possible SSRF / abuse. | `supabase/functions/connector-test` | Require JWT; block private IP ranges. |
| SEC-09 | Medium | CORS `*` on all functions. | `_shared/supabase.ts corsHeaders` | Keep `*` only for public ingest; app endpoints restrict to app origin. |
| SEC-10 | Medium | Docs instruct disabling "Enforce JWT Verification" on admin functions. | `supabase/web-deploy/README.md` | Verify each such function authenticates internally (create-tenant-user appears to). |
| SEC-11 | Medium | No rate limiting on public endpoints. | forms, ingest, chat | Per-key / per-IP limits in the auth helper. |
| SEC-12 | Medium | Tenant admins can set another member's password directly (permission-checked); the admin then knows that user's password. | `supabase/functions/reset-tenant-user-password` | Replace with "send reset link"; keep direct set only for first provisioning, forced change on next login. |

**Exposure today (founder, 2026-11-10):** dummy data only and nothing publicly deployed, so none of these is
an active breach. They are **launch blockers**: gate G1 in `07-roadmap.md` — no real customer data until fixed.
Still recommended now (reversible): disable public signups in the Supabase dashboard.

**Compliance by region (D-010):** India DPDP Act at launch (consent records, purpose limitation, deletion on
request, breach notification). PDPL (UAE/Saudi) before MENA, GDPR before EMEA — each reviewed before that region's first customer.

## 2. Standing rules (apply to all new code)

1. Every edge function begins with `authenticate(req)` → tenant/env/scopes from a verified credential.
2. Service-role client only after authentication, and every query filters by the authenticated `tenant_id`.
3. Every new table: `tenant_id`, `environment`, RLS enabled, policies using the JWT-claim helpers, an isolation test.
4. No secrets in: `VITE_*` vars, localStorage/sessionStorage, client-written columns, logs, URLs.
5. Customer provider credentials are encrypted server-side and only ever returned masked.
6. Public pages (forms, landing, chat): input validation, size limits, rate limits, captcha option for forms.
7. Uploaded files: type/size allow-list, private bucket, signed URLs.
8. Audit log for: role changes, key creation/revocation, channel credential changes, journey publish, data deletion.
9. Deletion/retention: honour customer delete requests across profiles, events and send logs (DPDP Act readiness).
10. `npm audit` / Dependabot weekly; pin edge-function import versions (today `supabase-js@2` is unpinned).

## 3. High-risk change protocol

Schema/data SQL, RLS, auth, secrets, deletions, deploys → written plan with rollback → founder approval in
chat → staging first → verify → production → record in decision log.

## 4. Security programme (CEO requirement, 2026-11-10: "everything secure — no escalations, data privacy, attacks, data security")

| Threat | Controls Marbee commits to | When |
|---|---|---|
| **Privilege escalation** (user → admin, tenant A → tenant B) | Roles checked server-side only (RLS + function checks), never trusted from the client; tenant from verified credential; no self-assignable roles; signup creates its own org only; automated isolation + role tests in CI | Phase 0 |
| **Data leaks between customers** | RLS on every table; service-role only after auth; per-tenant tests on every function; region-separated projects (D-010) | Phase 0 → ongoing |
| **Account takeover** | Strong password policy (exists), MFA for tenant admins, session expiry, rate-limited login, audit of role/key changes | Phase 1 |
| **Attacks on public endpoints** (spam, abuse, DoS cost attacks) | Site keys with allowed origins, per-key/IP rate limits, payload size limits, captcha option on forms, Cloudflare in front of the app | Phase 0–1 |
| **Injection / XSS / SSRF** | Parameterised queries only (PostgREST/RPC), table-name allow-lists, sanitised HTML for templates & landing pages, CSP headers, outbound-URL blocklist for connectors/webhooks | Phase 1 |
| **Secret leakage** | Secrets only in Supabase Vault / function secrets; bundle + repo secret scanning in CI; credentials returned masked | Phase 0 |
| **Data privacy (DPDP, later PDPL/GDPR)** | Consent stored per channel; purpose-limited processing; customer data export + delete on request; retention limits (raw events 90 days); data-processing agreement template for customers; PII never in logs/URLs | Phase 1–2 |
| **Data loss** | Daily backups, verified restore drill before first customer, PITR before contractual data, soft-delete for user actions | G2 |
| **Supply chain** | Pinned dependency versions, Dependabot, `npm audit` in CI, no unvetted packages | Phase 1 |
| **Detection & response** | Sentry + audit log + alerts on auth failures / unusual exports; incident runbook: contain → assess → notify CEO immediately → customers within legal timelines | Phase 1 |

**CEO-side hygiene (only the CEO can do these):** 2FA on GitHub, Supabase, AWS, Google/Firebase, Meta,
domain registrar; never paste secrets or keys into chat or code; keep live-project access to as few
accounts as possible.
