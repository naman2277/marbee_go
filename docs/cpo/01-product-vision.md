# 01 — Product Vision

## 1. One-line vision

Marbee is a multi-tenant **Customer Engagement Platform**: collect customer data, understand customers,
decide what to say, orchestrate journeys and deliver on every channel — **Connect → Understand → Decide →
Orchestrate → Engage → Measure** (from `docs/PRODUCT_BLUEPRINT.md`, verified).

## 2. The problem we solve

Mid-market brands want what Adobe Journey Optimizer, Braze or MoEngage offer — unified profiles,
automated journeys, multi-channel sends — but those tools are expensive, slow to set up and priced for
enterprise budgets. Cheaper tools (basic email/WhatsApp blasters) lack data unification and journeys.

**Marbee's bet (recommendation):** enterprise-grade journey + data capability at a mid-market price, with
**BYOP (Bring Your Own Provider)** so customers keep their own WhatsApp/SMS/email contracts and Marbee
doesn't carry messaging cost or margin risk.

## 3. Target customer (India first — confirmed 2026-11-10, D-007)

**Region sequence (confirmed):** India → MENA → APAC → EMEA → North America. Each new region brings
data-protection law and data-location expectations (India DPDP Act; UAE/Saudi PDPL; GDPR in EMEA),
so regions are added as separate Supabase projects, not by mixing data in one database (D-010).

Primary ICP recommendation for the first 10 customers:

| Attribute | Recommendation |
|---|---|
| Segment | Indian D2C / e-commerce and consumer-subscription brands |
| Size | ₹5–100 crore revenue, 50k–2M customer records |
| Buyer | Head of growth / CRM / retention marketing |
| Pain | Abandoned carts, repeat purchase, win-back; data scattered across Shopify/website/CRM |
| Current tool | WhatsApp/SMS blaster + spreadsheet segments, or a costly MoEngage/WebEngage contract |

Why this ICP: short sales cycles, measurable ROI (recovered revenue), channels Marbee already has
(Web Push, WhatsApp, SMS, Email), and no enterprise-security procurement gate on day one.

**Personas:** (1) CRM/retention marketer — builds audiences and journeys daily; (2) Growth head — reads
dashboards, approves campaigns; (3) Developer/integrator — installs SDK, connects data, uses API;
(4) Tenant admin — users, roles, channels, billing.

## 4. Differentiation (what we must be better at)

1. **Time to first journey** under 1 day (connect data → audience → journey → send), versus weeks for incumbents.
2. **BYOP channels** — no per-message markup, customer keeps provider relationships.
3. **AI-native building** — describe an audience or journey in words, get a draft (cohort AI, journey AI exist).
4. **Fair pricing** by profiles/MTUs, not seats + message volume.

## 5. Business model (recommendation, to validate)

| Plan | For | Indicative price (estimate) | Limits |
|---|---|---|---|
| Starter | First pilots | ₹9,999/month | 25k profiles, 3 users, Web Push + 1 BYOP channel, 10 active journeys |
| Growth | Core ICP | ₹24,999/month | 250k profiles, 10 users, all channels, AI assist, unlimited journeys |
| Enterprise | Later | Custom | SSO, dedicated project, SLA, audit export |

Usage metric: **monthly tracked profiles**. Overage per 10k profiles.

**Channel & AI model (D-015):** WhatsApp, SMS and RCS are **BYOP**: the brand's own provider bills them,
and Marbee charges no per-message fee. Email (Marbee-managed SES) and AI run on **prepaid credits**
(1 credit = ₹1): each plan includes a monthly allowance, and top-up packs are bought before sending. Web Push is included.
First 3–5 customers: discounted design-partner pricing in exchange for weekly feedback.

## 6. Success metrics

- North star: **revenue influenced per tenant per month** (attributed conversions from journeys).
- Activation: % of new tenants that publish a live journey within 7 days.
- Retention: logo retention at 90 days; weekly active marketers per tenant.
- Unit economics: infra cost per tenant < 10% of plan price.

## 7. What Marbee is not (scope guard)

Not a CRM, not a helpdesk, not a social media manager, not an ad platform, not a data warehouse.
Modules that drift into these (social studio, task manager, chatbot builder) must justify themselves
against the ICP before more investment — see `05-mvp-scope.md`.
