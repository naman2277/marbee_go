# Web Push: production-ready, then frozen (spec · 2026-11-25)

Status: **Proposed**. Waiting for the founder's verdict (D-022). No code until then.

## Audit: what exists today (verified against code, 2026-11-25)

| Area | What the code does | Where |
|---|---|---|
| Provider config | Firebase web config (api key, project, sender id, app id, VAPID **public** key) in `channel_providers.config`. These are public values, so they're fine in the browser. The VAPID private key stays inside the tenant's Firebase project and Marbee never holds it. | `channel-providers.ts:148` |
| Service-account key | The Firebase **service-account private key** is stored as **plaintext** in `channel_providers.credentials_encrypted`. Any workspace member can read and write it (RLS `FOR ALL`), and the browser does read it. | `01_marbee_schema.sql:565,690`; `web-push-config.ts:125`; `channel-providers.ts:47` |
| Subscription capture | Only inside the Marbee app: a signed-in member's browser upserts straight into `web_push_subscribers`. There is **no website SDK or service worker for a customer's own site**. `push-subscribe` (site-key authenticated) exists, but nothing calls it. | `firebase-push.ts:79`; `public/firebase-messaging-sw.js`; `public/sdk/v1/` (analytics only) |
| Customer linking | `push-subscribe` accepts `customer_id` from the body under the **public** site key, so anyone can attach their own browser to any customer and receive that customer's pushes. | `push-subscribe/index.ts:52` |
| Campaign / journey send | Runs **in the browser**: a loop over subscribers, one `channel-send` call each. Closing the tab stops it. There are no retries and no idempotency, so a double click sends twice. | `workflow-engine.ts:435`; `journey-runner.ts:305`; `firebase-push.ts:245` |
| Wrong recipients | If no audience member has a subscription, the code falls back to **every anonymous subscriber in the workspace**. | `firebase-push.ts:144` |
| Real-time (RTM) send | Server-side, through `channel-send` with the service role. Fine. | `_shared/rtm-process.ts:259` |
| Expired tokens | An FCM 404 `UNREGISTERED` only produces an error message. The subscriber stays `active` and gets retried on every send. | `channel-send/index.ts:493` |
| Devices | `channel-send` reaches only a customer's most recent device. | `channel-send/index.ts:286` |
| OAuth | Gets a new Google token for every message. | `channel-send/index.ts:509` |
| Click tracking | The service worker opens `/push/open` on the **Marbee** origin, which calls `push-engage` (which only accepts messages Marbee actually sent, SEC-14). It works, but every click goes through a Marbee redirect. | `PushOpenPage.tsx`, `push-engage` |
| Duplicate display | The FCM message carries a `notification` block **and** the service worker shows its own, so a doubled notification is possible once the Firebase SW library initialises. | `channel-send/index.ts:445`, SW |
| Welcome push | Blocked since SEC-19 (TD-21). | `web-push-sdk.ts:57` |
| Consent | Browser permission plus an `active` subscription, and `exclusions` are honoured. `customers.consent_web_push` defaults to FALSE and nothing sets it. | `01:186`, `channel-send:302` |
| Credits | Per D-015, Web Push is **included, fair-use**, so there's nothing to debit. There is also no fair-use cap. | `10-decision-log.md:119` |
| Rate limits | `push-subscribe` has a per-isolate limit of 30/min/IP. `push-engage` has none. | `_shared/ingest-auth.ts` |
| Composer / preview | The WebPush studio exists and its content resolves in `resolveWebPushDeliveryContent`. Working, no gaps found. | `channel-studio/WebPush*.tsx`, `content-templates.ts:390` |

## Gap list

**P0 (blocks production)**
1. Service-account private key readable and writable by every member from the browser.
2. Campaign and journey sends execute in the browser (D-005), with no durability, retries or idempotency.
3. Wrong-recipient fallback that sends to all anonymous subscribers.
4. No subscription capture on a customer's website (no website SDK or service worker).
5. Public site key can link a browser to any `customer_id`, so a stranger can receive another customer's pushes.
6. Expired or invalid tokens (404/410 `UNREGISTERED`, invalid token, sender mismatch) are never pruned.

**P1 (MVP quality)**
7. Retries with backoff on 429/5xx/network errors; per-subscriber idempotency key.
8. Reach all of a customer's active devices.
9. Per-workspace daily fair-use cap (default 100,000 pushes/day); rate limit on `push-engage`.
10. Welcome push sent server-side from `push-subscribe` (closes TD-21).
11. Click tracked directly from the service worker (no Marbee redirect). `/push/open` kept for old notifications.
12. Data-only FCM messages (no doubled notifications); cache the OAuth token per workspace; stop duplicate `channel_endpoints` rows.

**P2 (after freeze, not in this work)**: listed under "Out of scope" below.

## 12-part plan

**PROBLEM.** Web Push is the one channel that sends today, but a D2C brand can't collect subscribers on its own site. Blast sends die when the tab closes. The Firebase private key is exposed to every member, and one code path can push to the wrong people.

**RECOMMENDATION.** Keep FCM (protect what works: D-012 and existing tenant configs). Add a **server-side push outbox** drained by a `push-worker` edge function on pg_cron. Move the service-account key into a **server-only, sealed** secrets table. Ship a **plain-JS website push SDK + service worker**. Then freeze.

**WHY.** It reuses patterns already proven here: sealed secrets (`secret-box`, sql/89–90), cron + Vault + `pg_net` (sql/61), and site-key auth (sql/85). It doesn't wait for the v2 pgmq layer (52–58, not yet on dev), and it costs ₹0.

**PRODUCT DESIGN.**
- *Brand's site:* paste a two-line snippet (`<script src=".../sdk/v1/marbee-push.js" data-site-id data-write-key>`) and drop `marbee-push-sw.js` at the site root. The SDK shows a soft prompt, then the browser permission prompt, then subscribes. `MarbeePush.identify()` is not offered: linking to a customer happens through the analytics SDK's `ecid`, or server-to-server with a secret API key.
- *Marketer:* Channels → Web Push. Saving the service-account JSON goes to the server, and afterwards the page shows only "Configured · project X · client email". A new "Website install" card shows the snippet for the selected site. Campaign and journey send nodes now **queue** the push and return immediately with counts (queued / no subscription / excluded / duplicate). The deliveries panel shows delivered / failed / clicked from the existing logs.
- *States:* not configured · configured · send queued · sending · delivered / failed (with reason) · token pruned.

**TECHNICAL ARCHITECTURE.**
```
Brand site ── marbee-push.js ──► push-subscribe (site key, origin check) ──► web_push_subscribers
Campaign / journey node (browser or server) ──► rpc enqueue_web_push ──► web_push_outbox
pg_cron (every min) + immediate kick ──► push-worker (service role only)
   claim batch (SKIP LOCKED) → open sealed SA → FCM v1 → complete_web_push()
       200 → delivered · 404/410/invalid token → failed + subscriber 'invalid' · 429/5xx → retry with backoff (max 5)
SW notificationclick ──► push-engage (clicked; real messages only) ──► opens click_url
RTM real-time ──► channel-send (unchanged route, gains pruning + sealed key)
```
Pure logic (FCM response classification, backoff, message building) lives in `_shared/web-push.ts` with node unit tests.

**DATABASE & API** (one new script, `supabase/sql/95_web_push_production.sql`, idempotent):
- `channel_provider_secrets(provider_id PK → channel_providers, tenant_id, secret TEXT)`: **no grants** to anon or authenticated. Existing Firebase keys are copied in, then `channel_providers.credentials_encrypted` is set to NULL for `provider_type='firebase'`. `channel-send` re-seals legacy plaintext on first use.
- `web_push_outbox`: tenant_id, environment, idempotency_key, subscriber_id, customer_id, message_id, content jsonb, journey_id, delivery_id, delivery_name, status (queued / sending / delivered / failed / skipped), attempts, next_attempt_at, locked_until, last_error, timestamps; `UNIQUE (tenant_id, environment, idempotency_key, subscriber_id)`. RLS: members can read their own tenant's rows; there are no write grants.
- `enqueue_web_push(tenant, env, customer_ids uuid[], content jsonb, idempotency_key, journey_id, delivery_id, delivery_name)`: SECURITY DEFINER; requires `user_has_permission(tenant,'journeys.publish')` or the service role. It resolves every active device for each customer (by `customer_id` or a linked `ecid`), skips exclusions, enforces the daily cap and returns counts.
- `claim_web_push_batch(limit)` and `complete_web_push(id, outcome, error)`: service_role only. On completion it writes `engagement_log` and `customer_delivery_log` and prunes the subscriber, all in the same transaction.
- `push_worker_tick()` + cron job `marbee_push_worker_tick` (Vault `push_worker_url` / `push_worker_key`; no-ops if they're missing).
- Edge functions: **new** `push-worker`; **changed** `channel-send` (new `save_credentials` action, sealed key, pruning, data-only messages, OAuth cache), `push-subscribe` (`config` action returning public config, server-side welcome push, ignores `customer_id` unless the caller uses a secret API key, no duplicate endpoints), `push-engage` (rate limit).

**COST IMPACT.** ₹0. FCM is free; edge-function calls and cron runs fit within the current plan (estimate: about 1,440 worker ticks a day plus one invocation per 100 sends).

**SCALABILITY.** Each tick drains 500 sends with concurrency 20 inside about 50 seconds, so roughly 30k sends/min per worker loop at Stage 1 (estimate; FCM's own limit is around 600k/min per project). The immediate kick on enqueue keeps small sends near real time. The v2 pgmq layer can replace the outbox later without changing the API.

**RISKS + ROLLBACK.**
- The key move breaks a provider if `MARBEE_SECRETS_KEY` isn't set. Mitigation: the move is a copy, not a seal, and `channel-send` still reads legacy plaintext. Rollback: `UPDATE channel_providers SET credentials_encrypted = s.secret FROM channel_provider_secrets s ...` (script included in the PR), then redeploy the old functions.
- The worker's Vault secrets aren't set, so nothing gets sent. Mitigation: `enqueue` returns the counts and the panel shows "queued"; the deploy steps include the Vault SQL.
- Customer sites must host the service-worker file at their root (an industry-standard requirement); this is documented in the install card.
- Rollback for 95: drop the cron job, drop the outbox + secrets tables, restore the column. Old browser code paths are not deleted until the end-to-end test passes.

**IMPLEMENTATION PLAN** (each step builds and is testable):
1. SQL 95 + PGlite chain test (grants, isolation, idempotency, claim/complete, pruning, cap).
2. `_shared/web-push.ts` + unit tests; `channel-send` sealed key + pruning + data-only + OAuth cache.
3. `push-worker` + cron wiring.
4. Browser: `enqueueWebPush()` replaces the browser send loop in `workflow-engine` and `journey-runner`; remove the anonymous fallback; Channels page saves the key through the server.
5. `push-subscribe` config / welcome / linking fixes; website SDK + service worker; install card.
6. End-to-end on dev with the founder → `/code-review`, `/security-review` → PR → decision-log freeze entry.

**ACCEPTANCE CRITERIA.**
- A member's browser cannot read or write the service-account key (SQL test plus a live check).
- On a test page using the website SDK: subscribe → a campaign web-push delivery with the tab **closed after enqueue** → notification received → click recorded as `clicked` in `engagement_log` for the right workspace. The founder sees it on dev.
- Re-running the same delivery sends nothing new (idempotent).
- A token deleted in the browser gets marked `invalid` after the next send attempt.
- A member of workspace B can't enqueue for, or read the outbox of, workspace A.
- `npm run build`, `test:sql:chain` and `test:functions` pass; `/code-review` and `/security-review` are clean.

**FINAL DECISION (CTO).** **APPROVE WITH CONDITIONS.** Conditions: the founder approves SQL 95 and the four function deploys; `MARBEE_SECRETS_KEY` is already set on dev (verify at deploy); a Firebase project for dev testing is available.

## Out of scope (will be listed in the freeze entry)
Native mobile app push (Wave 3) · Safari/iOS behaviour beyond what FCM web supports · dismiss/close analytics · conversion attribution (separate MVP item) · per-customer frequency caps, quiet hours, send-time optimisation, A/B tests · per-recipient personalisation rendered server-side (content is snapshotted at enqueue) · FCM topics / broadcast · moving other channels' credentials server-side (new TD) · full server-side journey orchestration (D-005 journey-worker; only the push **send** moves server-side here) · global rate limiter (TD-14) · migrating the outbox to pgmq (v2).
