# 02 — Current Architecture Assessment (baseline 2026-11-10)

All facts here are **verified** against commit `7920146` unless labelled otherwise.

## 1. Inventory

| Layer | What exists |
|---|---|
| Frontend | `apps/web` — React 19 SPA, Vite 8, TypeScript 6, Tailwind 4, TanStack Query, React Flow, react-router 7. ~719 source files, **~222k lines** (components 107k, lib 69k, pages 46k). 90+ routes incl. 13 `/dev/*` harnesses and public routes (`/forms/:slug`, `/pages/:slug`, `/b/:slug`, `/embed/:slug`, `/chat/...`). |
| Shared | `packages/shared` — shared TS types. |
| Database | Supabase Postgres. Live schema = `supabase/sql/00–83_*.sql` (~12k lines, ~122 `CREATE TABLE`, ~114 RLS enables) + `supabase/sql/v2/52–59` scale layer (partitioning, JWT-claim RLS, rollups, pgmq queues, pg_cron, tuning, load-test seed). `supabase/migrations/` (9 files) is stale. |
| Server logic | 24 Deno edge functions (ingest, workers, channel-send, AI proxies, form submit, tenant API, webhooks, chatbot runtime, email domains via SES). Shared helpers in `_shared/`. |
| Deploy | Manual: SQL pasted in Supabase SQL editor; functions via `scripts/deploy-functions.*` or pasted from `supabase/web-deploy/`. Live project ref appears in `web-deploy/README.md`. No CI. Frontend hosting not found in repo (assumption: not deployed, or deployed manually). |
| Tests | **None** in `apps/web`. A `supabase/sql/tests` folder exists (not reviewed in depth). |

## 2. Module map (what's built)

Data: schemas + registry/versioning, explorer, ERD/lineage, connectors (marketplace, wizard, sync monitor),
data jobs/pipelines (v1 + workflow-v2), job center, schedules, data quality.
Customer: customer 360, audiences, cohorts (AI-native builder), subscriptions, identity.
Engagement: journeys (new AJO-style builder + legacy campaign canvas), campaigns over pipelines,
real-time messaging (RTM), content templates per channel (Email, WhatsApp, RCS, SMS, Web Push), social studio.
Content: assets/files, forms, landing pages, chatbots.
Decisioning: offers, eligibility rules, decision engine v3, coupons, loyalty.
Analytics: command center, insights, web analytics, journey analytics.
Platform: RBAC + roles, members/invites, API keys + API hub, global variables, audit log, AI engine
config, email sending domains (SES), tasks/projects/notifications.

**Observation:** this covers most of the blueprint's P1 + P2 + P3 roadmap. Breadth is far ahead of depth.

## 3. Strengths

- **Right core stack.** Supabase + React SPA is a cheap, capable modular monolith for Stage 1–3. Keep it.
- **Tenant model in the schema.** `tenant_id` + `environment` on tables, `user_tenant_ids()` helper, RLS enabled on nearly every table.
- **Scale work already designed.** v2 layer (monthly partitioning of events, JWT-claim RLS, rollups, pgmq, cron) is the right direction for 100–1,000 tenants.
- **Queue-based ingestion path.** `events-ingest` enqueues to pgmq and a worker evaluates triggers.
- **Strong product thinking in UIs.** Studios for journeys, cohorts, email, landing, forms with dev harnesses.

## 4. Critical weaknesses

| # | Issue | Evidence | Impact |
|---|---|---|---|
| A1 | **Public edge functions trust caller-supplied `tenant_id` while using the service-role key** (bypasses RLS). | `schema-records` (read/insert/update/delete with `tenant_id` from body), `events-ingest`/`push-subscribe` (`x-tenant-id` header via `resolveTenantContext`), `push-engage` (body). | Anyone with the public anon key can read/alter any tenant's records or inject events that trigger real sends. **Cross-tenant data breach risk.** |
| A2 | **Any signup becomes Tenant Admin of the demo tenant.** | `05_auto_link_new_users.sql` trigger + `enable_signup = true` in `config.toml`. | If the demo tenant holds real data, any stranger gets admin. |
| A3 | **API key validation checks only the 8-char prefix**, no hash compare. | `_shared/supabase.ts` `validateApiKey` ("In production: bcrypt compare"). | Guessable/forgeable API auth. |
| A4 | **Secrets live in the browser.** | Tenant master key generated and kept in `localStorage` (`global-variables.ts`); `VITE_OPENAI_API_KEY` read client-side (`audience-ai.ts`, others); AI provider keys saved from the client into `ai_engine_providers.api_key_encrypted` (appears to be the raw value — confirm). | Keys leak via bundle/XSS; secrets unreadable on other devices/by teammates; "encrypted" column may be plaintext. |
| A5 | **Engines run in the browser.** | `JourneysPage` → `launchBlastCampaign` → `processCampaignTick` loop (client); `DataJobDetailPage` runs `pipeline-engine.executeNode` client-side. Server equivalents exist (`pipeline-run-worker`, `rtm-worker`). | Sends stop if the tab closes; duplicated logic in two runtimes; no idempotency guarantee; customer data pulled into the browser. |
| A6 | **localStorage as a silent fallback store** in ~15 lib modules (AI config, decisions, cohorts, coupons, automations, web analytics, social config…). | `grep localStorage.setItem`. | Work appears saved but exists only on one browser; teammates see different data. |
| A7 | **No automated tests, no CI, manual SQL deploys.** | No `*.test.*` files; deploy by paste. | Every change risks regressions; schema drift between environments is invisible. |
| A8 | **Two migration trails.** | `supabase/sql/` (live) vs `supabase/migrations/` (stale). | Confusion for agents/devs; `supabase db reset` doesn't reproduce prod. |

## 5. Moderate weaknesses

- **Very large components** (e.g. `EmailTemplateStudio.tsx` 8,045 lines, `TaskManagerPortal.tsx` 3,456) — hard to change safely.
- **Thin shared UI kit** (`components/ui/index.tsx` ≈ 98 lines, 7 primitives) vs 107k lines of components → inconsistent UI (4 competing primary colours, see `06-design-system.md`).
- **Legacy + new duplicates:** campaign canvas vs journey builder (`/campaigns/:id/legacy`), workflow v1 vs v2, decision engine v2 vs v3.
- **CORS `*`** on all functions — acceptable for public ingest endpoints only.
- **`connector-test`** has no caller auth and the service client is used for `test_link`; connector tests make outbound requests (possible SSRF) — needs review.

## 6. Verdict

The **foundation choice is correct** and should not be replaced. The **product is not production-safe yet**:
A1–A4 are must-fix before any real customer data, A5–A8 are must-fix before the first paying customer.
The biggest strategic risk is **scope**: ~25 modules built, few hardened. The next phase should be
**consolidate and harden**, not expand. See `03-gap-analysis.md` and `07-roadmap.md`.
