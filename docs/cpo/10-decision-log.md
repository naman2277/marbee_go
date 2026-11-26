# 10 — Product & Technology Decision Log

Statuses: **Proposed** (awaiting founder) · **Approved** · **Superseded by D-xxx** · **Rejected**.
Validation: Not started · In progress · Validated · Failed. Never edit a past decision's substance —
supersede it with a new entry.

---

### D-001 · AI CTO operating model and living docs
- **Date:** 2026-11-10 · **Status:** Approved (founder request) · **Validation:** In progress
- **Problem:** Decisions lived in chat history and per-feature memory; different AI agents could contradict each other.
- **Options:** (a) keep chat history; (b) external wiki; (c) docs in repo + `CLAUDE.md` charter.
- **Selected:** (c). `CLAUDE.md` + `docs/cpo/01–11` + `.claude/skills/` review commands.
- **Reason:** Versioned with code, read by every agent automatically, free.
- **Cost:** ₹0. **Risks:** docs go stale → every decision updates docs in the same change.
- **Authority:** Advisory mode until founder defines execution authority (to be recorded as a new decision).

### D-002 · Keep Supabase + React SPA modular monolith
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** Should Marbee migrate (e.g. to Next.js, microservices, separate backend)?
- **Options:** (a) keep; (b) Next.js rewrite; (c) Node/Nest backend + Postgres; (d) microservices.
- **Selected:** (a). **Reason:** 222k lines already built on it; Supabase covers auth, RLS, storage, queues, cron at ~₹2k/month; a rewrite would cost months and fix none of the real problems (security, server execution, tests). Next.js adds nothing for an authenticated SPA; the marketing site can be separate.
- **Migration path:** workers move to a container runtime only if edge-function limits are measured as a bottleneck.

### D-003 · Security hardening (Phase 0) before any new feature
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** SEC-01..07 allow cross-tenant access and secret leakage.
- **Selected:** Fix SEC-01..07 first; immediate dashboard action to disable signups.
- **Cost:** ~1–2 weeks effort (estimate), ₹0 infra. **Risk if deferred:** data breach ends the company's credibility with its first customers.

### D-004 · Freeze non-core modules behind feature flags
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** ~25 modules, few hardened; maintenance load grows with every module.
- **Selected:** Freeze Social, Tasks/Projects, Chatbots, Loyalty/Coupons, Decisioning/Offers, Landing AI, voice/avatar. Hide, don't delete.
- **Reason:** Focus effort on the core loop that sells. **Reversible:** yes, flip a flag.
- **Condition:** unfreeze only with a `/feature-planning` spec citing customer demand.

### D-005 · Server is the execution runtime
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** Blast campaigns and pipeline runs execute in the browser (A5).
- **Selected:** journey-worker + existing pipeline-run-worker via pgmq + pg_cron; browser launches/monitors and previews ≤100 rows.
- **Cost:** ₹0 extra at Stage 1 (edge-function invocations within Pro quota — estimate).

### D-006 · One schema-change path with staging
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** Live schema in `supabase/sql/`, stale `supabase/migrations/`, manual paste, no staging.
- **Selected:** Short term — keep numbered scripts, add a staging project and a `schema_migrations` record table, mark `migrations/` deprecated. Medium term — baseline the live schema into Supabase CLI migrations and apply via CI.
- **Risk:** baselining is a high-risk step; requires approval and a backup.

### D-007 · First ICP: Indian D2C / e-commerce brands
- **Date:** 2026-11-10 · **Status:** Approved — India first; region expansion in D-010 · **Validation:** In progress (5 customer commitments for Dec)
- **Reason:** Measurable ROI (recovered carts), short sales cycle, matches existing channels.
- **Validation plan:** 10 discovery calls; ≥3 agree to a paid design-partner pilot.

### D-008 · Hosting: Cloudflare Pages for the SPA
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Reason:** Free with commercial use allowed (Vercel Hobby is non-commercial — verify current terms).

### D-009 · December go-live plan with release gates
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** 5 committed customers (~100k profiles each) by 31 Dec; 15 by March. Team of two. Nothing deployed.
- **Options:** (a) keep building features and harden later; (b) gated plan, staggered onboarding; (c) delay all customers to Q1.
- **Selected:** (b). Gates G1–G4 in `07-roadmap.md`; customers onboarded one at a time from 15 Dec; scope frozen (D-004).
- **Reason:** (a) puts real data on an insecure system; (c) risks the commitments. (b) meets most of the date without risking a breach.
- **Risk:** customers 4–5 may slip into early January — tell them early.

### D-010 · Region expansion: one Supabase project per region
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** Founder's sequence is India → MENA → APAC → EMEA → NA. Data-protection laws (DPDP India, PDPL UAE/Saudi, GDPR) increasingly expect data to stay in-region.
- **Selected:** Launch India on a Supabase project in **ap-south-1 (Mumbai)**. Each later region gets its own project in-region with the same schema; the app routes a tenant to its region's project. No cross-region data in one database.
- **Why not one global database:** can't satisfy residency, and one outage hits every region.
- **Cost:** each region adds roughly one Pro project (~₹2,200+/month, estimate) — only when that region's first customer signs.
- **Design impact now (P1, cheap):** keep tenant → region mapping in config; never hard-code the Supabase URL beyond one env var; keep schema scripts reproducible (D-006) so a new region is a scripted setup.

### D-011 · Email sending cost is passed through to customers
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Problem:** At committed volumes, managed email via SES (~₹17.5k/month in Dec, ~₹53k in Mar, estimate) exceeds the whole infra budget.
- **Selected:** Each plan includes an email quota; above it, billed per 1,000. Offer BYOP (customer's own ESP/SMTP) as the alternative. Agree this with each customer before their first email send.
- **Reason:** Keeps Marbee's margin positive and the infra budget intact.

### D-012 · December launch scope: Wave 1 / 2 / 3 instead of "all channels, all sources"
- **Date:** 2026-11-10 · **Status:** Proposed · **Validation:** Not started
- **Request (founder):** all channels and all sources for the 5 customers; paid by mid-December.
- **Verdict on the request as stated:** **REJECT.** Verified: only Web Push sends today; no connector syncs real data. All of it is ~6–8 extra weeks of build *on top of* the 4 weeks of security + reliability gates, for a team of two, inside 5 weeks — and three channels depend on approvals Marbee doesn't control (Meta, TRAI DLT, Google RBM).
- **Selected (APPROVE WITH CONDITIONS):**
  - **Wave 1 (15 Dec):** Web Push, Email (SES), WhatsApp (Meta Cloud API, BYOP); sources Web SDK, REST API, server-side CSV import, webhooks (incl. Shopify webhooks), forms.
  - **Wave 2 (early Jan):** SMS (one Indian aggregator, BYOP), Shopify native connector.
  - **Wave 3 (Q1):** RCS, mobile app push, other connectors in order of paying-customer demand.
- **Conditions:** (1) start external approvals this week: SES production access, each customer's Meta Business verification and WhatsApp templates, DLT registration; (2) contracts list Wave 1 as day-1 scope with dated Wave 2; (3) gates G1–G3 still apply; (4) manual invoicing.
- **Why:** Wave 1 covers the channels Indian D2C retention actually runs on (WhatsApp, email, push) and every customer can load data via API/CSV/webhook on day 1, so nobody is blocked; it fits the calendar with the gates intact.
- **Effort (estimate):** Wave 1 channel/source work ~2.5 weeks, done in parallel with the reliability phase (24 Nov – 12 Dec).
- **Risk:** a customer whose main channel is SMS, or who only has a non-Shopify CRM, isn't fully served until January → identify them this week.

### D-013 · Build go-ahead, 10 Dec readiness target
- **Date:** 2026-11-10 · **Status:** Approved (founder) · **Validation:** In progress
- **Decision:** Start building the December plan now (Phase 0 security → reliability + Wave 1). Target: Wave 1 ready **10 Dec**; founder checks with customers **11–15 Dec** and go-live dates are set from that check.
- **Authority:** AI CTO implements approved roadmap items. Running SQL, deploying functions or the app, and anything touching the live project stay with the founder after review. Supersedes the "advisory mode" note in D-001.
- **Risk:** 10 Dec is 2 days tighter than D-009's 12 Dec go-live-readiness → the week-5 buffer is gone; slippage shows up in the weekly status, not at the deadline.

### D-014 · CEO / CTO working model
- **Date:** 2026-11-10 · **Status:** Approved (founder) · **Validation:** In progress
- **Decision:** Founder acts as CEO (ideas, customers, money, contracts); AI acts as CTO and owns feasibility, architecture, cost, security and full development, making the technical call on each idea. The CEO's single action is needed only for: spend / vendor accounts, live-system execution (SQL, deploys, dashboard settings, customer data), merges to `main`, commercial/legal commitments, and security incidents.
- **Delivery loop:** branch → tests → self-review (code + security) → PR with risk/rollback → CEO merges → CEO runs scripted deploy steps → CTO verifies. Security is part of "done" (`09` §4).
- **Supersedes:** the authority notes in D-001 and D-013.
- **Honest limit:** the CTO cannot guarantee zero vulnerabilities; it commits to defence in depth, tests, and immediate reporting.

### D-015 · Monetisation model: hybrid — BYOP for telecom channels, prepaid credits for what Marbee pays for
- **Date:** 2026-11-10 · **Status:** Approved (CTO decision on CEO's question) · **Validation:** Not started
- **Refines:** D-011 (email pass-through becomes email credits).
- **Problem:** Should channels and AI be BYOP, or a credit system (plan fee + monthly credits + prepaid top-ups)?
- **Rule:** *whoever pays the vendor bill decides the model.* If Marbee would carry the vendor cost → prepaid credits. If the vendor bills the customer's own legal entity → BYOP.

| Service | Model | Why |
|---|---|---|
| WhatsApp | **BYOP** (customer's own WhatsApp Business Account on Meta Cloud API; Meta bills the customer) | Reselling requires becoming a Meta BSP/credit-line partner; Meta's per-message pricing changes often; the WABA and templates belong to the brand anyway |
| SMS | **BYOP** (customer's aggregator account, e.g. MSG91/Gupshup/Kaleyra) | DLT registration is in the brand's name; thin margins; telecom compliance stays with the brand |
| RCS | **BYOP** via aggregator | Same as SMS; agent approval is per brand |
| Email | **Managed (Marbee SES) on credits**, plus optional **BYOP** SMTP/ESP | Most D2C brands don't run SES; domain onboarding already built; cost is low and predictable |
| Web Push | **Included**, fair-use | FCM is free |
| AI features | **Credits** (Marbee-managed models); BYOK option for enterprise later | Marbee pays the LLM bill; credits cap abuse and cost |

- **Credit mechanics:**
  - One wallet per tenant, in **Marbee credits (1 credit = ₹1)**, with a published rate card per action (e.g. per 1,000 emails, per AI generation).
  - The plan fee includes a **monthly allowance** that resets each month. **Top-up packs** are prepaid and valid 12 months.
  - Spend order: allowance first, then top-ups.
  - Every debit is an immutable ledger row, atomically checked at send time (the server-side send worker, never the browser).
  - Alerts at 20% and 5% balance. Optional auto top-up later.
  - **At zero balance:** marketing sends pause; **transactional sends** (OTP, order updates) continue against a small overdraft buffer so a brand's customers aren't hurt. Recovered on the next top-up.
  - BYOP channels cost no credits per message; they count toward a plan fair-use limit of "messages orchestrated per month" to cover Marbee's infra.
- **Why not all-BYOP:** email setup friction kills time-to-first-journey, and AI can't sensibly be BYOP for SMBs.
- **Why not all-credits:** reselling WhatsApp/SMS adds partner contracts, telecom compliance, working capital and thin margins. It's a business we'd be forced into, and it's a bad one at our size.
- **Legal/tax (to confirm with CA):** credits usable only for Marbee services, non-transferable, no cash-out → closed-system prepaid instrument (no RBI PPI licence, to confirm). 18% GST invoiced at top-up. Refund policy in the terms.
- **Build plan:** Dec — wallet + ledger + rate card + send-time enforcement + admin "grant credits" (CEO invoices manually via Razorpay link/bank transfer). Feb — self-serve Razorpay top-ups and plan billing.
- **Effort (estimate):** ledger + enforcement ~4–5 days, within Wave 1. Reuses `rtm_usage_daily` and the existing daily spend-cap logic as the starting point.

### D-016 · Marbee Platform Console (internal CEO/CTO dashboard)
- **Date:** 2026-11-10 · **Status:** Approved with conditions (CTO decision on CEO idea) · **Validation:** In progress — v1 built 2026-11-10 (SQL 84 + `platform-admin` + `apps/console`), awaiting staging deploy
- **Problem:** To run 5 → 15 paying tenants we need one place to see every tenant, their usage and credits, manage their admins, and bill them. Nothing like this exists (verified: no platform-admin role in SQL or app).
- **Verdict per requested item:**

| Requested | Verdict | How |
|---|---|---|
| List of all customers (tenants) with every detail: plan, status, users, profiles, created date, region | APPROVE | Tenants table + tenant detail page |
| Sends per channel per month, AI usage, credits balance & history | APPROVE | From the credits ledger (D-015) + daily usage rollups |
| Assign / grant credits | APPROVE | Ledger entry with reason; two-step confirm; audited |
| DB usage | APPROVE WITH CHANGE | Per-tenant **row counts and estimated storage** from a nightly job (Postgres has no exact per-tenant size); total DB size from Postgres |
| Generate bill, generate & send invoices | APPROVE WITH CHANGE | Console builds the **bill summary** (plan + usage + top-ups). The GST invoice is created and sent by **Razorpay Invoices** (or Zoho Books): GST-compliant numbering, PDF, email and payment link without us building tax logic. Dec: CEO clicks through manually; Feb: via API |
| "Customer of customers in the table" | **APPROVE WITH CHANGE — aggregates only** | Counts, growth, consent rates, channel reach. **No browsing of end-customer PII rows.** Marbee is the *data processor* under DPDP; staff reading a brand's customer list is a privacy breach risk and a sales objection. Support access to rows only via break-glass (below) |
| "Admin credentials to login" | **REJECT** | Marbee must never know or store customer passwords. **Replacement:** "Support access": time-boxed (e.g. 60 min), read-only by default, requires the tenant admin's consent toggle, banner shown inside the tenant, every action audited. Built Feb, not Dec |
| Reset password for admin | APPROVE WITH CHANGE | Console **sends a password-reset link** to the admin's email (and can resend invites). It never sets or sees a password |
| Number of users | APPROVE | Part of tenant detail |
| Suspend / reactivate tenant | ADD (CTO) | Needed for non-payment or abuse |

- **Security conditions (non-negotiable):**
  1. **Separate app** `apps/console` on its own subdomain (e.g. `console.marbee.io`). Tenant users never download its code.
  2. **Cloudflare Access** (Zero Trust free tier, to verify) in front: only the CEO's and CTO's identities can even load the page.
  3. **`platform_admins` table**, separate from tenant roles; MFA required. Nobody can make themselves a platform admin from the app; rows are added only by SQL run by the CEO.
  4. All data goes through one **`platform-admin` edge function**. It verifies the platform-admin JWT, then uses the service role, and has an explicit allow-list of operations. The browser never holds the service-role key.
  5. Every console action is written to a **platform audit log** (who, what, which tenant, before/after) that cannot be edited from the console.
  6. Credit grants above a threshold need a typed confirmation; refunds/negative adjustments need a reason.
- **Phasing:**
  - **Dec (Wave 1, ~4–5 days, estimate):** tenant list + detail, usage & credits view, grant credits, suspend, reset-link/resend invite, bill summary export, audit log, security conditions 1–5.
  - **Feb:** Razorpay invoice API, MRR/revenue dashboard, support access (break-glass), DB-usage trends, alerts (low credits, failed sends, abuse).
- **Why build, not buy:** the data is ours and in our database; admin-panel builders (Retool etc.) would need direct database credentials outside our security boundary and add cost. Invoicing *is* bought (Razorpay/Zoho) because GST compliance isn't our product.
- **Capacity impact:** Wave 1 grows by ~4–5 days. To protect 10 Dec, the Shopify webhook presets move to Wave 2 if the schedule slips; reported in the weekly status.

### D-017 · Invite-only access; tenants created by platform admins
- **Date:** 2026-11-20 · **Status:** Approved (CTO decision) · **Validation:** In progress
- **Problem:** Public signup auto-joined every new account to the demo tenant as Tenant Admin (SEC-03). There is also no tenant-provisioning function at all — the demo tenant (script 02) is the only one ever created.
- **Options:** (a) self-serve signup with "create your workspace"; (b) invite-only, tenants created by Marbee platform admins.
- **Selected:** (b). First 5–15 clients are sales-led with assisted onboarding and manual invoicing — nobody needs to self-create a workspace, and every self-serve path is attack surface. Signup disabled; login page sign-in only; people join via invitation.
- **Consequence:** the Platform Console needs **"Create tenant + invite owner"** (tenant provisioning: tenant, environments, roles/permissions, OOTB schemas) — next increment, required before client 1.
- **Revisit:** self-serve signup + trial when inbound demand justifies it (P2).
- **Implementation (2026-11-25):** Platform Console → **New workspace** (owner role only) calls `platform-admin` op `create_tenant` → `platform_provision_tenant()` (sql/94, service role only) creates in ONE transaction: tenant, 3 environments, the 4 system roles (Tenant Admin always gets every permission), the OOTB schemas + fields in all 3 environments, default folders, credit wallet, platform account (region). Template = the demo workspace's **system rows only** (no demo content). Then the owner is invited as Tenant Admin with the same rules as SEC-12 (email only; existing accounts linked + emailed). If the email fails the workspace is kept and **Invite admin** (Members tab, op `invite_owner`) retries. Both actions are audited; the "tenant.create" entry is written inside the same transaction as the workspace (no workspace without its audit row). Tested on PGlite (38 checks incl. isolation, "only service role may call" and audit-failure rollback); live validation pending (run sql/94 on dev, deploy platform-admin).

### D-018 · AI gateway: the browser never holds an AI key
- **Date:** 2026-11-21 · **Status:** Approved (CTO decision) · **Validation:** In progress
- **Problem:** AI provider keys were (a) readable from `VITE_*` variables that get bundled into public JS, (b) stored in plain text in `ai_engine_providers` and readable by every tenant member, (c) cached in localStorage, and (d) used by the browser to call 9 providers directly (SEC-06, SEC-07).
- **Selected:** one edge function, `ai-gateway`, makes every app LLM call. Key order: key typed for testing (settings.manage only, never stored) → tenant's sealed key → Marbee platform key from function secrets, **metered against AI credits** (D-015; tenants without a wallet are allowed while pre-billing). Keys sealed with one server secret `MARBEE_SECRETS_KEY` (AES-256-GCM); column-level privileges stop app users reading/writing the key column.
- **Why:** one choke point for keys, cost metering, rate limits and future model routing; removes 9 browser→provider integrations.
- **Cost:** ₹0 infra. **Risk:** gateway down = AI features down (falls back to the built-in context engine for the assistant).

### D-019 · Global-variable secrets and data keys live only on the server
- **Date:** 2026-11-21 · **Status:** Approved (CTO decision) · **Validation:** In progress
- **Problem (SEC-05):** secret variables and encryption keys were sealed in the browser with a master key kept in ONE admin's localStorage — lost if that storage was cleared, invisible to teammates, and unusable by the server. Consequences found: hosted CAPTCHA could never verify (the sealed envelope was sent to the provider) and public form submissions were stored unencrypted.
- **Selected:** a `global-variables` edge function owns all variable writes and secret access, sealing with the same server master key as AI keys (`MARBEE_SECRETS_KEY`, D-018). Encryption keys are generated server-side and never leave it; field encryption/decryption of form data happens on the server (decrypt needs `customers.read`). Column-level privileges hide the value column from app users.
- **Risk:** losing `MARBEE_SECRETS_KEY` makes every sealed secret and encrypted field unreadable → it must be backed up outside Supabase (password manager) and rotated only with a re-seal plan.

### D-020 · What a suspended workspace means
- **Date:** 2026-11-21 · **Status:** Approved (CTO decision) · **Validation:** Validated on dev 2026-11-21 (sql/91)
- **Problem (TD-12):** the Platform Console can suspend a workspace, but nothing enforced it — members, API/website keys and scheduled pipelines all kept working.
- **Selected:** suspension is a **freeze, not a deletion**: members get no access (immediately — checked on every request, not at token refresh); API keys and website keys stop verifying; no new scheduled runs, and queued/waiting runs are **held** and resume on reactivation; data is kept; the Platform Console still sees everything. `trial` and `active` are unaffected.
- **How:** one `tenant_is_active()` check inside the five tenant-access helpers that every RLS policy and permission check already uses (sql/91; v2/52 fast path + token hook carry the same check).
- **Not yet covered (TD-12b):** public endpoints that find the tenant without a key (form-submit, chatbot-runtime, webhook-trigger, web-analytics-ingest, asset-gate) and the channel/social workers — they still accept work for a suspended tenant. Next increment, via one shared server check.
- **Cost:** ₹0; one primary-key lookup per request.

### D-021 · Environment setup pipeline: scripted SQL with an applied-scripts ledger
- **Date:** 2026-11-24 · **Status:** Approved (CTO decision) · **Validation:** Real-database path validated on dev 2026-11-25 (status → untracked; baseline → 87 recorded; status → tracked, 0 core pending). Codex review fixes: TLS now verified against the pinned Supabase Root 2021 CA (fails closed; wrong CA refused), 100+ script numbers in numeric order. First apply run = staging.
- **Problem:** staging/production must be built from ~95 numbered SQL scripts pasted by hand into the SQL editor, in the right order, skipping three that must never run there (`00_cleanup` drops tables, `03_link_your_user` links one real person, `v2/59` load-test data), plus 27 edge functions pasted one by one with the right JWT setting. Nothing records what a database already has — dev drifted once already (2026-11-20). One mistake on production is a data incident.
- **Options:** (a) keep the manual runbook; (b) move to `supabase/migrations` + `supabase db push` — rewrites the live history and contradicts the "numbered scripts are the schema" rule; (c) **a small runner over the existing numbered scripts** with a ledger table in the database.
- **Selected:** (c). `supabase/sql/manifest.json` defines the order and exclusions; `npm run db:status|db:apply` (Node + `pg`) applies only scripts not yet in `public._marbee_schema_ledger`, each in its own transaction, stops at the first error, records a checksum, warns when an applied script was edited later, and refuses to touch a non-empty database without a ledger unless told to `--baseline` it. Functions: `supabase/functions/manifest.json` lists every function with its JWT setting; `npm run fn:deploy` deploys them with the Supabase CLI (no Docker).
- **Why:** keeps the scripts that are already validated on dev; adds the two missing guarantees (order + "what's applied") with ~300 lines and no paid service.
- **Cost:** ₹0 (`pg` and the Supabase CLI are free). **Risk:** the runner runs SQL as the database owner — it only ever runs on the CEO's machine with a connection string the CEO pastes locally (never committed). v2 layer has never run on a real database; staging is its first run, done as a separate `--phase v2` step.

### D-022 · Web Push: production-ready, then frozen
- **Date:** 2026-11-25 · **Status:** Approved by the founder 2026-11-25 · **Validation:** End-to-end on dev 2026-11-26 with the founder (website subscribe → server-side send → received with the tab closed → click recorded; see D-023)
- **Problem:** the audit (spec `specs/2026-11-25-web-push-production.md`) found 6 P0 gaps. The Firebase service-account private key is readable by every member from the browser. Campaign and journey pushes are sent from the browser with no retries or idempotency. One code path falls back to pushing every anonymous subscriber. There's no website SDK, so brands can't collect subscribers on their own site. The public site key can link a browser to any customer. Expired tokens are never pruned.
- **Selected:** keep FCM; add a server-side outbox (`web_push_outbox`) drained by a `push-worker` edge function on pg_cron; keep the service-account key server-only and sealed (`channel_provider_secrets`); add a plain-JS website SDK + service worker; prune expired tokens, retry with backoff, add a daily fair-use cap (no credit debit, per D-015). After the end-to-end validation, Web Push is **frozen** (bug fixes only).
- **Cost:** ₹0. **Risk / rollback:** see the spec.

### D-023 · Web Push is frozen (feature-complete, bug fixes only)
- **Date:** 2026-11-26 · **Status:** Approved (CTO decision under D-022) · **Validation:** Validated on dev `uqffhyaftlwetqigfenp` with the founder 2026-11-26
- **Evidence:** test site on `localhost:5500` subscribed through the website SDK (site key, origin-checked) → welcome push and a campaign-style push queued with `enqueue_web_push` → pg_cron → `push-worker` → FCM → shown in Chrome with the test tab closed → click recorded as `clicked` in `engagement_log`. Expired token marked failed/pruned; unsubscribed browsers skipped. Tests: `95_web_push.test.mjs` (SQL, PGlite chain), `web-push.test.mjs` (FCM logic). `/code-review` (9 findings fixed) and `/security-review` (none ≥ 8/10; low-confidence trigger hardening applied).
- **What "frozen" means:** no new Web Push features without a new decision entry. Bug fixes, security fixes and copy changes are allowed. The send API that other modules call is `enqueue_web_push(...)` (members) / `enqueue_web_push_internal(...)` (server); campaigns and journeys must use it — never send from the browser.
- **In scope (done):** website SDK + service worker (`/sdk/v1/marbee-push.js`, `marbee-push-sw-core.js`), soft prompt + opt-out that sticks, server-side outbox with idempotency, retries (30 s → 32 min, 5 tries), pruning of 404/410/invalid tokens, daily fair-use cap (100,000 per workspace, `tenants.settings.web_push_daily_cap`), exclusions honoured, server-only sealed Firebase key, welcome push, click tracking, test push, delivery logs.
- **Explicitly out of scope:**
  - Campaign / journey **UI and orchestration** (campaigns UI not built yet; journeys still step in the browser — D-005). They call `enqueue_web_push` when built.
  - **Linking a website visitor to a customer from the browser** ("identify"): unsafe without signed identity (SEC-13). Supported today: the brand's server calls `push-subscribe` with a secret API key + `customer_id`. Signed identify is a future decision.
  - Native mobile app push (Wave 3); Safari/iOS beyond what FCM web supports.
  - Per-customer frequency caps, quiet hours, send-time optimisation, A/B tests, segments/topics broadcast.
  - Per-recipient personalisation rendered on the server (content is snapshotted at enqueue).
  - Open/dismiss analytics and conversion attribution (separate MVP item).
  - Global (cross-isolate) rate limiter (TD-14); moving the outbox to pgmq (v2 layer); other channels' credentials (TD-28).
- **Operational notes:** the worker authenticates cron calls with `PUSH_WORKER_SECRET` (function secret) = Vault `push_worker_key`; staging/production follow `runbooks/web-push-rollout.md`.

### D-024 · Web Push bulk throughput (exception to the D-023 freeze)
- **Date:** 2026-11-26 · **Status:** Approved (CTO decision; founder asked for it and approved the merge 2026-11-26) · **Validation:** SQL + unit tests; dev load test 2026-11-27: 4.7k/min with the first settings (see below), re-test pending
- **Problem:** one worker per minute sending 20 pushes in parallel, with one database call per push, drains roughly 5–9k pushes/minute (estimate). A 1M-subscriber blast would take 2–3 hours.
- **Selected:** (1) the worker records a whole batch's results in one call (`complete_web_push_batch`, same per-row logic); (2) pg_cron starts one worker per ~3,000 due pushes, up to 10 in parallel, and each worker re-starts itself while work remains; (3) per worker: batches of 500, 40 sends in flight, at most 3,000 per run (stays inside the per-invocation CPU limit). Parallel workers are safe because claiming uses SKIP LOCKED.
- **Measured on dev 2026-11-27 (20,000 fake devices, `tools/push-loadtest`):** **~4,700 pushes/minute**, far below the estimate. Cause: Supabase stops a function run after ~2 s of CPU (HTTP **546**). The 5 extra workers started by the cron were all killed, so one worker chain drained the blast; their claimed rows waited 2 minutes before retry. Nothing was lost. pg_net's default 5 s timeout also hid every long run's result.
- **Revised (same decision):** small runs — 250 per claim, 25 in flight, at most 500 per run, 25 s budget; a send starts one worker per ~1,000 pushes (max 10) immediately; the cron tops up to the same target; pg_net waits 60 s for each reply. Throughput to be re-measured with the same load test before merging.
- **Expected (estimate):** ~50k–100k pushes/minute → 1M in roughly 10–20 minutes. FCM allows ~600k/minute per Firebase project. Measure on dev with a synthetic load before relying on it.
- **Not changed:** the API (`enqueue_web_push`), idempotency, retries, pruning, the daily cap (100k per workspace; raise per workspace in `tenants.settings.web_push_daily_cap` for bulk senders).
- **Cost:** ₹0 at current volumes; up to 10 function invocations per minute only while a blast drains (free tier: 500k/month). **Risk:** more concurrent database connections during a blast (10 workers × a few connections) — fine on the current plan; watch during the first real blast. **Rollback:** redeploy the previous push-worker; `select cron.unschedule('marbee_push_worker_tick')` stops everything; the 95 functions still work without 96.
- **Why it does not break the freeze:** performance only — no new feature, no API change. The freeze (D-023) stands for everything else.
