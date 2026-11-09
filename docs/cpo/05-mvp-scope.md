# 05 — MVP Scope (proposed)

**MVP definition:** what a design-partner D2C brand needs to recover revenue with automated journeys,
safely, without us in the loop. Everything else is frozen behind feature flags (not deleted).

## IN — "Core loop" (P0/P1)

| Area | Included | Notes |
|---|---|---|
| Onboarding | Create org, invite team, roles (existing RBAC), onboarding checklist | Replace demo-tenant auto-link |
| Data in | Web SDK + events API, CSV import, file/connector ingestion (core set), forms | Auth-hardened |
| Profiles | Customer 360, timeline, consent | |
| Audiences | **One** builder (cohort builder, AI-assisted) | Retire duplicate audience path later |
| Journeys | New journey builder: entry (event/audience/schedule), wait, condition, send, exit; versioned publish | Server-executed; legacy canvas hidden |
| Channels | Web Push (FCM), WhatsApp (BYOP), Email (SES managed) | SMS/RCS P2 |
| Templates | Per-channel templates + personalization | |
| Guardrails | Frequency cap, quiet hours, consent check | Required to avoid spamming end-customers |
| Measure | Delivery + engagement + **conversion attributed to journey**, command center | |
| Admin | API keys (hashed), channel config, audit log, usage page | |

## December launch readiness (verified 2026-11-10, D-012)

Founder request: all channels and all sources, customers paying by mid-December.

### Channels — what actually sends today

| Channel | Today (verified) | Work to production | Outside lead time (customer side) | Wave |
|---|---|---|---|---|
| Web Push | **Sends** via FCM (`channel-send`, `rtm-process`) | Harden + delivery stats | None | **1 — 15 Dec** |
| Email (SES) | Domain/DKIM onboarding only; **no send** | Send worker, bounces/complaints, unsubscribe, ~4–5 days | Domain DNS; SES production access for Marbee's AWS account (apply **now**) | **1 — 15 Dec** |
| WhatsApp (Meta Cloud API, BYOP) | Templates UI only; **no send** | Adapter, template sync, delivery/read webhooks, ~3–4 days | Meta Business verification + template approval (days–weeks) | **1 — 15 Dec** |
| SMS (one Indian aggregator, BYOP) | **No send** | Generic HTTP adapter + DLR webhook, ~2–3 days | **TRAI DLT** registration of sender ID + templates (1–2 weeks) | **2 — early Jan** |
| RCS | **No send** | Google RBM adapter, ~3–4 days | RBM agent approval by Google/carriers (weeks) | **3 — Q1** |
| Mobile app push (iOS/Android SDK) | Not built | Native SDKs | App releases by customer | **3 — on demand** |

`rtm-process.ts:110` skips every non-web-push channel with "adapter is not available yet (P2)".

### Sources — what actually brings data in today

| Source | Today (verified) | Work | Wave |
|---|---|---|---|
| Web SDK events | `events-ingest` + queue | Auth hardening (SEC-02), batching | **1** |
| REST API | `tenant-api` | Hashed keys (SEC-04) | **1** |
| CSV/XLSX import | Browser-side parse writes rows to `customers` | Move to server-side batch import (100k rows must not depend on a browser tab), ~3 days | **1** |
| Webhooks (incl. Shopify/WooCommerce webhooks) | `webhook-trigger` | Mapping presets for Shopify order/cart events, ~2 days | **1** |
| Forms | `form-submit` | — | **1** |
| Shopify native connector (OAuth + backfill) | Catalogue entry + HTTP probe only; **no sync** | ~6–8 days | **2 — early Jan** |
| HubSpot, Salesforce, Google Sheets, Stripe, BigQuery, Snowflake, S3, Zendesk, GA4, Meta Ads, Google Ads | Catalogue entries + HTTP probe only; **no sync** | ~3–8 days each | **3 — Q1, ordered by customer demand**; until then via CSV/API/webhook |

### Commercial rule

Contracts and invoices for December state exactly what is live on day 1 (Wave 1) and the dated plan for
Wave 2. Payment is taken for working capability, not catalogue entries. Invoice manually (Razorpay payment
link / GST invoice) — building billing is not on the December path.

## FROZEN — behind flags, no new investment until a paying customer asks

Social Studio · Tasks/Projects · Chatbots · Loyalty & Coupons · Decision Engine / Offers · Landing-page AI ·
AI voice/avatar · Lineage/ERD advanced views · Web analytics platform (keep SDK events only).

Freezing is reversible (D-004); each unfreeze needs a `/feature-planning` spec citing customer demand.

## Acceptance criteria for "MVP ready"

1. A new brand can sign up, create its org, install the SDK and see events in under 1 hour (unassisted).
2. An abandoned-cart journey sends Web Push + WhatsApp + Email, survives the browser being closed, and
   never double-sends on retry.
3. Automated test proves tenant A cannot read or write tenant B through PostgREST **and** every edge function.
4. No secret is present in the built JS bundle or localStorage (scripted check).
5. Dashboard shows sends → clicks → conversions → revenue per journey.
6. Staging + production projects; schema changes applied by script, backups verified by a restore.
