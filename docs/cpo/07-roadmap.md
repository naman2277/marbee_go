# 07 — Development Roadmap (proposed; re-planned 2026-11-10 for the December commitment)

**Fixed constraints (founder, 2026-11-10):** 5 customers × ~100k profiles live by **31 Dec 2026**;
15 customers (~1.5M profiles) by **March 2027**; team = founder + AI CTO; nothing deployed yet, dummy data only.

**Honest assessment:** the original plan (Phases 0–2) was ~8–12 weeks of effort; we have ~7 weeks to the end
of December, including the holiday period. It is achievable **only** if (a) scope stays frozen to the core loop,
(b) customers are onboarded one after another, not together, and (c) the security gates below are never skipped.
Effort figures are **estimates**.

## Release gates (cannot be skipped)

| Gate | Before | Criteria |
|---|---|---|
| G1 Security | Any real customer data enters the system | SEC-01..07 fixed; tenant-isolation test passes; no secrets in bundle/localStorage |
| G2 Production | First customer goes live | Separate prod + staging projects (Mumbai region); daily backups + one test restore; Sentry; sends run server-side |
| G3 Scale | Customer 2 onwards | Load test at 500k profiles + projected event volume passes on prod-sized compute |
| G4 Growth | Customer 6 onwards (Jan–Mar) | Usage metering + email cost pass-through; v2 partitioning + retention in prod |

## Schedule

| Weeks | Dates | Work | Gate |
|---|---|---|---|
| 1–2 | 10 Nov – 21 Nov | **Phase 0 security:** shared `authenticate()` helper; refactor public functions; hashed API keys; org-creation signup replacing demo auto-admin; secrets server-side; isolation test script | G1 |
| 3–5 | 24 Nov – 12 Dec | **Wave 1 build (D-012, D-015, D-016):** SES send worker, WhatsApp adapter, server-side CSV import, Shopify webhook presets, credits wallet + ledger, Platform Console v1. **Reliability:** prod + staging Supabase projects (ap-south-1), schema applied from scripts with `schema_migrations`; journey/blast worker server-side with idempotency; remove localStorage fallbacks in MVP modules; Vitest on core engines; GitHub Actions CI; Sentry; Cloudflare Pages | G2 |
| 5 | 8 Dec – 10 Dec | **Go-live readiness (target 10 Dec, D-013):** feature flags hiding frozen modules; guardrails (frequency cap, quiet hours, consent); data-import path for the customers' sources; load test at 500k profiles | G3 |
| 6 | 11 Dec – 19 Dec | **Customer check 11–15 Dec** (founder), then **customer 1 live**; fix what breaks | — |
| 7–8 | 22 Dec – 2 Jan | **Customers 2–5**, one every 2–3 days; daily health check. **Wave 2 build:** SMS adapter + Shopify native connector, live early Jan | — |
| Jan | | Attribution + revenue-per-journey dashboard; usage metering + plan limits; SES at volume with bounce handling | — |
| Feb | | Billing (Razorpay) + console invoices API, MRR dashboard, support access (D-016); v2 partitioning, rollups and event retention in prod; compute sizing for 1.5M profiles; design-kit components on MVP screens | G4 |
| Mar | | Customers 6–15; PITR backups; first MENA-readiness review (D-010) | — |

## Risks to the December date

1. **Unknown channel and data needs of the 5 customers** — each different connector or channel adds days. Mitigation: get their requirements this week; serve the common subset first.
2. **Holiday weeks (24 Dec – 1 Jan)** — customers may not have staff to onboard. Mitigation: aim to have customers 1–3 live by 23 Dec.
3. **Two-person team** — no slack for new features. Mitigation: D-004 freeze enforced; any customer request goes through `/feature-planning`, default verdict DEFER until after go-live.
4. **First real load** — volumes never tested on real data. Mitigation: G3 load test plus staggered onboarding.

**Fallback (recommendation):** if G2 slips past 12 Dec, go live with customers 1–3 in December and 4–5 in the first
week of January rather than skipping a gate. Tell those customers early.

## After March (P2/P3)

SMS/RCS BYOP · Shopify connector (if not present) · A/B tests · unfreeze modules on demand · MENA region
project (D-010) · then APAC, EMEA (GDPR), NA · SSO/SAML and enterprise features.
