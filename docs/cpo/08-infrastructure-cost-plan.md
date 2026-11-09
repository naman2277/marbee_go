# 08 — Infrastructure & Cost Plan

**Budget (founder, 2026-11-10):** free wherever possible + ₹5,000–10,000/month.
All prices are **estimates** from general knowledge, at ~₹88/USD — **verify current vendor pricing before committing.**

## 1. Stage 1 (now → first 10 customers)

| Item | Free / experiment | Production choice | Est. monthly |
|---|---|---|---|
| Database, auth, storage, functions | Supabase Free (pauses when idle, no backups) | **Supabase Pro** (daily backups, no pausing) | ~$25 ≈ ₹2,200 |
| Staging environment | Supabase Free project | Same | ₹0 |
| Frontend hosting | Cloudflare Pages | Cloudflare Pages (free, commercial use OK) | ₹0 |
| Domain + DNS | — | Domain; Cloudflare DNS free | ~₹100 (₹1,200/yr) |
| Error monitoring | Sentry free developer tier | Same | ₹0 |
| CI | GitHub Actions free minutes | Same | ₹0 |
| Web Push | Firebase Cloud Messaging | Same | ₹0 |
| Email | — | Amazon SES (~$0.10 per 1,000 emails) | ~₹100–900 at 10k–100k emails |
| WhatsApp / SMS | BYOP — customer pays their provider | Same | ₹0 to Marbee |
| AI (LLM) | Local rule-based fallback | Small model via edge function, hard monthly cap | cap ₹1,000 |
| Transactional auth email | Supabase built-in (rate-limited) | SES via custom SMTP | included above |
| **Total** | | | **≈ ₹3,500–4,500** |

Headroom of ~₹5,000 under the cap is reserved for: Supabase compute upgrade if DB CPU is high, or PITR
backups once real customer data is significant.

## 1a. Projection for the committed volume (added 2026-11-10)

Inputs: Dec = 5 tenants × 100k profiles (500k); Mar = 15 tenants (1.5M).
**Assumptions to confirm with customers:** ~10–20 tracked events per profile per month; ~4 marketing emails
per profile per month. Supabase quota/price figures are from memory — **verify on supabase.com/pricing**.

| Driver | Dec 2026 (500k) | Mar 2027 (1.5M) | Note |
|---|---|---|---|
| Events stored / month | 5–10M rows (~5–10 GB) | 15–30M rows | Needs 90-day raw retention + rollups (v2/53, v2/55) |
| Database compute | Small–Medium add-on, ~₹2,500–5,500 | Medium–Large, ~₹5,500–10,000 | Size from the G3 load test, not guesswork |
| Disk beyond included | ~₹300–1,000 | ~₹1,000–3,000 | Retention policy keeps this flat |
| Edge-function calls | Within Pro quota **only if the SDK batches events** | Same | One call per event would exceed quota |
| Web Push (FCM) | ₹0 | ₹0 | |
| WhatsApp/SMS | ₹0 to Marbee (BYOP) | ₹0 | |
| **Email via SES** | ~2M emails ≈ **₹17,500** | ~6M ≈ **₹53,000** | **Biggest cost. Must be billed to customers** (pass-through or included quota per plan), or offered as BYOP SMTP/ESP |
| **Infra excluding email** | **≈ ₹5,500–9,000** | **≈ ₹9,000–15,000** | Within budget in Dec; March exceeds ₹10k, justified by 15 paying tenants |

**Implication:** email and AI are sold as prepaid credits (D-015), so their vendor cost is always covered
before it's incurred. Indicative rate card (estimate, CEO to set final): email ≈ 2× SES cost, roughly
₹150–200 per 10,000 emails; AI ≈ 3–5× model cost per generation.
The rest of the platform fits the ₹5–10k budget through December.

## 2. When to spend more (triggers, not dates)

| Trigger (measured) | Spend |
|---|---|
| DB CPU > 70% sustained or p95 query > 500ms | Supabase compute upgrade (~$10–60 more) |
| First customer with contractual data obligations | PITR add-on |
| Edge-function timeouts on workers | Small container on Fly.io/Railway (~$5–10) for workers |
| Queue lag > 1 min sustained after tuning | Consider Redis (Upstash pay-per-use) |
| > 5 team members on Sentry / log volume | Paid observability tier |

## 3. Cost controls (mandatory)

- Per-tenant metering of sends and AI calls; hard caps on AI spend per tenant per month.
- No client-side LLM calls (also a security rule).
- Dashboards read rollup tables (v2/55), not raw events.
- Turn off unused Supabase extensions/cron jobs in staging.
- Monthly `/cost-audit` updates the register below.

## 4. Cost register

| Month | Item | Actual cost | Notes |
|---|---|---|---|
| 2026-11 | (baseline) | unknown | Founder to fill current Supabase plan & bills |
