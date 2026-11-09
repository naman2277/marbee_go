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
| TD-09 | M | Duplicate function sources (`functions/` and `web-deploy/` copies) can drift | `supabase/web-deploy` | Generate web-deploy copies from source or retire after CLI deploy works |
| TD-10 | L | Dev-only Vite middleware writes JSON files to `.marbee_data` | `apps/web/vite.config.ts` | Keep dev-only; ensure never used in prod |
| TD-11 | L | Typecheck/build status unknown at baseline | `apps/web` | Run `npm run build` in CI and record result |
| TD-12 | H | Tenant suspension (`tenants.status = 'suspended'`) is not enforced: users of a suspended tenant keep access. Needs `user_tenant_ids()` / `user_has_tenant_access()` (01 and v2/52 versions) and the JWT hook to exclude suspended tenants | `supabase/sql/01`, `v2/52` | Phase 0 (changes core tenant-access helpers → own reviewed script) |
| TD-13 | M | `reset-tenant-user-password` embeds `profiles(email)` from `tenant_users`, but there's no FK between them → the embed likely fails at runtime | `supabase/functions/reset-tenant-user-password` | Fix with SEC-12 (switch to reset link) |
| TD-14 | L | `platform-admin` rate limit is per-isolate memory (a backstop only); Cloudflare Access + MFA are the primary controls | `supabase/functions/platform-admin` | Move to a DB/edge rate limiter if the console gets more users |
