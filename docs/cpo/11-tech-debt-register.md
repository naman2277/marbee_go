# 11 — Technical Debt Register

Severity H/M/L. Security findings live in `09-security-baseline.md`; this register covers maintainability and reliability.

| ID | Sev | Debt | Location | Plan |
|---|---|---|---|---|
| TD-01 | H | Engines duplicated in browser and server (pipeline, journey blast) | `lib/pipeline-engine.ts`, `lib/journey-runner.ts`, `functions/pipeline-run-worker` | D-005 |
| TD-02 | H | localStorage fallback stores in ~15 lib modules | `lib/ai-engine-config.ts`, `decision-engine.ts`, `cohorts/store.ts`, `coupons.ts`, `automations.ts`, `web-analytics.ts`, … | Remove; fail visibly |
| TD-03 | H | No automated tests / CI | repo | Vitest + GitHub Actions (Roadmap Phase 1) |
| TD-04 | H | Two migration trails, manual SQL deploy, no staging | `supabase/sql`, `supabase/migrations` | D-006 |
| TD-05 | M | Giant components (8k-line `EmailTemplateStudio.tsx`, 3.4k `TaskManagerPortal.tsx`, several >1.2k) | `components/*` | Split only when next touched |
| TD-06 | M | Duplicate generations: legacy campaign canvas vs journey builder; workflow v1 vs v2; decision engine v2 vs v3; audiences vs cohorts | various | Pick one each; hide/remove the other after migration |
| TD-07 | M | Thin UI kit, 4+ primary colours | `components/ui`, `index.css` | `06-design-system.md` §4 |
| TD-08 | M | Unpinned edge-function imports (`esm.sh/@supabase/supabase-js@2`, `deno.land/std@0.208.0`) | `supabase/functions` | Pin exact versions, use `deno.json` import map |
| TD-09 | M | Duplicate function sources (`functions/` and `web-deploy/` copies) can drift | `supabase/web-deploy` | **Started 2026-11-20:** `npm run bundle:functions -- <name>` generates paste copies from source (schema-records, events-ingest, push-subscribe, push-engage, web-analytics-ingest done). Regenerate the rest when next touched. |
| TD-10 | L | Dev-only Vite middleware writes JSON files to `.marbee_data` | `apps/web/vite.config.ts` | Keep dev-only; ensure never used in prod |
| TD-11 | **H** | **Production build is broken (verified 2026-11-20):** `tsc -p apps/web/tsconfig.app.json` reports **1,102 type errors** across many files (top: EmailTemplateStudio 43, AiEngineSettingsPage 30, WebAnalyticsPage 29). `npm run build` runs `tsc -b` first, so it fails; `vite dev` hides it. | `apps/web` | Must be green before the first deploy (G2). Fix by file, highest counts first; add CI so it never regresses. |
| TD-12 | H | Tenant suspension (`tenants.status = 'suspended'`) is not enforced: users of a suspended tenant keep access. Needs `user_tenant_ids()` / `user_has_tenant_access()` (01 and v2/52 versions) and the JWT hook to exclude suspended tenants | `supabase/sql/01`, `v2/52` | Phase 0 (changes core tenant-access helpers → own reviewed script) |
| TD-13 | M | `reset-tenant-user-password` embeds `profiles(email)` from `tenant_users`, but there's no FK between them → the embed likely fails at runtime | `supabase/functions/reset-tenant-user-password` | Fix with SEC-12 (switch to reset link) |
| TD-14 | L | `platform-admin` rate limit is per-isolate memory (a backstop only); Cloudflare Access + MFA are the primary controls | `supabase/functions/platform-admin` | Move to a DB/edge rate limiter if the console gets more users |
| TD-15 | M | **Fresh-database build: FIXED 2026-11-20** — scripts 20–22 now guard their legacy-column migrations; `npm run sql:dryrun` builds 01→85 on a fresh database with zero errors. **Remaining:** 9 scripts are not safe to run twice (01, 04, 29, 31, 36, 37, 47, 48, 75 — duplicate policies/triggers/constraints; 36/37 redefine a function later changed by 42). | `supabase/sql` | Accepted: environments are built through a migrations ledger that applies each script exactly once (D-006 / bootstrap pipeline). Never re-run those 9 by hand. Check: `node supabase/tests/sql/dryrun_chain.mjs --twice`. |
