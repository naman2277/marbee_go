# Web Push broadcast to subscribers (spec · 2026-11-27 · D-026 proposed)

## PROBLEM
A marketer can't send a push from Marbee to the people who subscribed. Every send targets
**customers**, but website visitors subscribe **anonymously** — they're linked to a customer only
if the brand's server does it with a secret API key. And there's no screen to send from: the
campaign UI isn't built (D-005), so all test sends so far went through SQL.
"Send to all my subscribers" (flash sale, new arrivals, price drop) is the most common use of web
push for D2C brands — without it Web Push can't launch.

## RECOMMENDATION
A **Broadcasts** screen in the Web Push hub: compose → choose who → see how many devices → send now
or schedule → see results. It reuses the existing server queue (`web_push_outbox` → `push-worker`,
~39.6k pushes/min), so sending stays server-side, idempotent, retried, capped and pruned.

## WHY
- Smallest change that makes Web Push usable by a marketer without waiting for the full campaign
  builder; the campaign builder can later reuse the same server functions.
- No new infrastructure, ₹0.

## PRODUCT DESIGN
- **Where:** Web Analytics → Web Push → new tab **Broadcasts** (list + "New broadcast").
- **Compose:** pick a Web Push template (existing WebPush studio) *or* write inline: title, body,
  link, icon, image, up to 2 buttons. Live device preview (existing `WebPushPreview`).
- **Who (audience):**
  - All active subscribers (default)
  - Filters (combine with AND): browser · OS · device type · subscribed in the last N days ·
    active in the last N days · linked customers only / anonymous only
  - A Marbee **audience (cohort)** → its customers' subscribed devices (uses `cohort_members`)
- **Before sending:** "This will reach **N devices** (M linked customers, K excluded)". Send a
  test to my own browser. A confirm dialog repeating the count.
- **When:** now, or a date/time (stored on the server; nothing depends on the browser).
  A scheduled broadcast can be cancelled until it starts.
- **Results** per broadcast: devices queued · delivered · failed/expired · clicked · click rate,
  and status (scheduled / sending / sent / cancelled).
- **States:** no subscribers yet → link to the install card; over the daily cap → shows how many
  will be held; provider not configured → link to Channels.

## TECHNICAL ARCHITECTURE
```
Broadcasts UI ──rpc──► web_push_audience_count(filter)            (preview count)
              ──rpc──► web_push_broadcast_send(broadcast_id)       (journeys.publish)
                         └─ set-based insert into web_push_outbox (key 'broadcast:<id>',
                            delivery_id = broadcast id, next_attempt_at = scheduled time)
                         └─ push_worker_top_up() (starts workers now; cron covers schedules)
push-worker (unchanged) ──► FCM ──► device ──► click ──► push-engage (unchanged)
Results  ──rpc──► web_push_broadcast_stats(broadcast_id)  (outbox + engagement_log)
```
- One shared internal enqueue path for "by customers" (existing) and "by filter" (new), so the
  daily cap, exclusions, idempotency and workspace checks stay in one place.
- Scheduling uses the outbox's existing `next_attempt_at`; cancel = mark the broadcast's queued
  rows `skipped`.
- Large audiences (100k+) are inserted set-based in one statement; no browser loop.

## DATABASE & API (new script `97_web_push_broadcasts.sql`)
- `web_push_broadcasts`: id, tenant_id, environment, name, content jsonb, audience jsonb,
  status, scheduled_at, created_by, sent_at, cancelled_at, timestamps. RLS: members read their
  workspace; writes only through the RPCs below.
- RPCs (SECURITY DEFINER, `search_path` pinned, member + permission checked):
  `web_push_audience_count`, `web_push_broadcast_save` (draft), `web_push_broadcast_send`,
  `web_push_broadcast_cancel`, `web_push_broadcast_stats`.
- Index on `web_push_outbox (tenant_id, delivery_id)` already exists (sql/95).
- No change to the website SDK, push-subscribe, push-worker or push-engage.

## COST IMPACT
₹0. Same worker and Firebase path; Supabase invocations ≈ 1 per ~500 pushes during a send.

## SCALABILITY
Measured send rate ~39.6k/min (D-024) → 100k subscribers in ~2.5 minutes. The insert of 100k
outbox rows is one set-based statement (estimate: a few seconds). Daily cap still applies per
workspace (pending #6: per-plan caps).

## RISKS (+ rollback)
- **Sending to everyone by mistake** → count preview + confirm dialog + test send; permission
  `journeys.publish` required; scheduled sends cancellable.
- **Daily cap surprise** → the preview shows how many would be held by the cap.
- **Cohort membership freshness** → `cohort_members` must be refreshed; the preview shows the
  cohort's last refresh time (assumption: cohorts refresh today — verify during build).
- **Rollback:** hide the tab; SQL 97 only adds objects (drop them); nothing else changes.

## IMPLEMENTATION PLAN
1. SQL 97 + PGlite tests: filters, cohort targeting, isolation, permission, idempotency, cap,
   schedule + cancel, stats (1 day).
2. Broadcasts UI: list, composer (reusing WebPush studio + preview), audience builder with live
   count, schedule, confirm, results (1–1.5 days).
3. Build, `/code-review`, `/security-review`, Codex.
4. E2E on dev with the founder: broadcast to all → arrives → click counted; scheduled send fires;
   cancel stops it; cohort-targeted send reaches only that cohort.

**Estimate:** ~2.5–3 days.

## ACCEPTANCE CRITERIA
- A marketer sends a push to **all subscribers** from the UI; it arrives (tab closed) and the
  click shows in the results.
- A filtered send and a cohort send reach only the matching devices (SQL tests + one dev check).
- A scheduled broadcast fires at its time with the browser closed; a cancelled one never sends.
- Clicking Send twice never sends twice. Members of another workspace can't count, send or read.
- Build, tests, reviews clean.

## FINAL DECISION (CTO)
**APPROVE WITH CONDITIONS.** Conditions: recorded as D-026 — a **launch-blocking exception** to
the Web Push freeze (D-023); the campaign builder (D-005) later reuses these server functions
instead of adding a second send path.
