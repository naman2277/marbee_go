# 03 — Product Gap Analysis

Gaps between what exists (`02`) and what a sellable, safe product needs. Priority: P0 essential ·
P1 MVP · P2 post-launch · P3 enterprise.

## 1. Security & trust gaps

| Gap | Priority |
|---|---|
| Edge functions derive tenant from verified JWT / hashed API key, never header/body (A1, A3) | **P0** |
| Remove auto-admin-to-demo-tenant signup; real "create organization" onboarding (A2) | **P0** |
| Server-side secrets: master key in Supabase Vault / function secret; AI keys only in edge functions (A4) | **P0** |
| Rate limiting on public endpoints (ingest, form submit, push subscribe, chat) | P1 |
| RLS regression tests (one tenant can never read another) | P1 |
| Audit-log coverage for admin actions (exists in part) | P1 |
| SSO/SAML, data residency, per-tenant projects | P3 |

## 2. Reliability gaps

| Gap | Priority |
|---|---|
| Blast/journey execution moved fully server-side with idempotent sends (A5) | **P0** before first paid send |
| Remove localStorage fallbacks; fail loudly if the table is missing (A6) | P1 |
| Error monitoring (frontend + functions) | P1 |
| One reproducible migration path + staging project (A7, A8) | P1 |
| Automated tests on engines (audience eval, journey step, pipeline nodes) | P1 |
| Backups verified + restore drill | P1 (before real customer data) |
| CI: lint + typecheck + tests on every PR | P1 |

## 3. Commercial gaps (nothing exists yet — verified no billing module)

| Gap | Priority |
|---|---|
| Self-serve tenant creation + onboarding checklist (connect data → audience → journey) | P1 |
| Plans, limits & usage metering (profiles, sends, AI calls) — `/settings/usage` route exists, enforcement not verified | P1 |
| Billing (Razorpay subscriptions for India) | P2 (invoice manually for first pilots) |
| Product analytics on Marbee itself (activation funnel) | P1 |
| Public marketing site, docs, SDK install guide | P1 |
| Attribution: revenue influenced per journey (the north-star metric) | P1 |

## 4. Product depth gaps (core loop)

The core loop that sells is: **ingest → profile → audience → journey → send → measure**. Before adding any
new module, each step needs to be end-to-end real, server-executed and tested for one channel set.

| Step | State (assessment) | Gap |
|---|---|---|
| Ingest | SDK, events-ingest, connectors, forms | Auth hardening; Shopify/WooCommerce connector for ICP (verify if exists) |
| Profile | Customer 360, identity fields | Identity-merge rules verified under load |
| Audience | Audiences + cohorts (two systems) | Pick one; server-side evaluation for large tenants |
| Journey | New builder + legacy canvas | Server execution, waits/resume (73 exists), frequency caps & quiet hours |
| Send | channel-send, Web Push, SES pending | Delivery receipts, retries, per-tenant provider creds stored server-side |
| Measure | Many dashboards | Conversion attribution to journey, rollups from v2 |

## 5. Over-built areas (opportunity cost)

Social Studio, Task/Project manager, Chatbot builder, Loyalty, Decision engine v3, Landing AI, AI voice /
avatar (`ai-voice-engine.ts`, `runway-avatar.ts`). These are not in the ICP's first purchase decision.
**Recommendation:** freeze (keep code, hide behind feature flags), don't delete. See D-004.
