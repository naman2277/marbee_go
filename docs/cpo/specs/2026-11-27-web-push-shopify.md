# Web Push on Shopify stores (spec · 2026-11-27 · D-025 proposed)

## PROBLEM
Web Push needs a small worker file served from the **brand's own domain**. Shopify doesn't let
merchants upload files to the site root, and theme files are served from `cdn.shopify.com` (a
different domain, which browsers refuse for a push worker). Today a Shopify brand — our ICP
(D-007) — cannot use Marbee Web Push at all.

## RECOMMENDATION
Ship it as part of **one Marbee Shopify app** — the same app the Wave 2 Shopify connector needs
anyway (`05-mvp-scope.md`: OAuth + backfill, early Jan). For push the app provides two things:

1. **App proxy** `https://<store>/apps/marbee/…` → a new edge function `shopify-proxy` that serves
   the push worker file **from the store's own domain**. Shopify forwards the request and signs
   it (HMAC); the function verifies the signature before answering.
2. **App embed block** (theme app extension) that adds the Marbee push script to every storefront
   page — no theme-code editing. The merchant switches it on once (Theme settings → App embeds).

## WHY
- It is the only same-domain hosting Shopify allows (verified on shopify.dev, 2026-11-27: app
  proxies at `/apps|a|tools|community/<subpath>`; non-Liquid responses "returned directly to the
  client").
- It's the same approach the established push apps on Shopify use (assumption — not verified).
- One app, built once, also carries the connector in January: no throw-away work.

## PRODUCT DESIGN
- **Merchant journey:**
  1. Install the Marbee app (an install link for design partners; App Store listing later).
  2. In Marbee → Web Analytics, register the store (domain + `*.myshopify.com`). The app
     settings show the site ID and write key; the merchant pastes them into the app embed.
     After the Wave 2 OAuth connector, this is filled automatically.
  3. In Shopify: Theme settings → App embeds → switch on "Marbee Web Push" → Save. The app can
     deep-link straight to this switch.
  4. Visitors see the same soft prompt → browser prompt → welcome push as on any other site.
- **What visitors see:** notifications show the store's domain, exactly as on non-Shopify sites.
- **Marbee screens:** the Web Push install card gets a "Shopify" tab with the three steps above
  in place of the "upload a file" step.

## TECHNICAL ARCHITECTURE
```
Store page ── app embed injects marbee-push.js (data-sw="/apps/marbee/sw.js") ──► push-subscribe (unchanged)
Browser ── GET https://<store>/apps/marbee/sw.js ──► Shopify app proxy (signs request)
       ──► edge fn shopify-proxy: verify HMAC (SHOPIFY_APP_SECRET) → return worker JS (application/javascript)
Worker scope = /apps/marbee/  (Shopify strips Service-Worker-Allowed). Push delivery does not depend on scope.
```
- **SDK change (small):** when `data-sw` is set, register with that file's folder as the scope
  instead of `/`. Without this the registration fails on Shopify.
- **Worker content:** `shopify-proxy` serves the full worker core (bundled into the function), so
  Shopify installs **don't depend on item 1** (the SDK domain).
- **Signature check:** hex SHA-256 HMAC of the sorted `key=value` pairs (minus `signature`),
  joined with no delimiter, keyed with the app secret; constant-time compare; reject stale
  `timestamp` (> 5 min). Unit-tested against Shopify's documented example.
- **App code:** a small Shopify CLI app in `apps/shopify/` (app config + theme extension with
  one app embed block). No server UI beyond the proxy at this stage.

## DATABASE & API
- No schema change for push. Stores are registered as normal Web Analytics sites (domain +
  allowed origins incl. `https://<store>.myshopify.com`).
- New edge function `shopify-proxy` (JWT verification OFF; authenticated by the Shopify
  signature). Secret `SHOPIFY_APP_SECRET` (edge-function secret, never in the browser).

## COST IMPACT
₹0. Shopify Partner account and development stores are free; custom/unlisted app distribution is
free. Shopify App Store listing (later) has no listing fee (assumption — check at listing time).

## SCALABILITY
The worker file is fetched once per browser and cached; proxy load is negligible next to page
views. Sending is unchanged (~39.6k/min, D-024).

## RISKS (+ rollback)
- **Assumption to verify first:** Shopify returns our JavaScript unchanged with its
  `Content-Type` (documented only implicitly), and doesn't cache it wrongly. → Spike on a dev
  store **before** building the rest (½ day).
- **Scope `/apps/marbee/`:** push works regardless of scope (web standard), but verified only in
  the spike.
- Merchant forgets to switch on the app embed → the Shopify tab shows a live "not detected"
  check.
- **Rollback:** uninstall the app / switch off the embed; delete the `shopify-proxy` function.
  Nothing else changes.

## IMPLEMENTATION PLAN
1. **CEO:** create a Shopify Partner account (free) and a development store. *(blocks everything)*
2. **Spike (½ day):** minimal app with the proxy → confirm the worker registers from
   `/apps/marbee/sw.js` and a test push arrives on the dev store.
3. `shopify-proxy` edge function + HMAC unit tests (½ day).
4. SDK scope change + test page (2 h).
5. Theme app extension with the app embed block (½ day).
6. Marbee install card: Shopify tab + "not detected" check (½ day).
7. End-to-end on the dev store with the founder → review → PR.

**Estimate:** ~2.5–3 days after the Partner account exists.

## ACCEPTANCE CRITERIA
- On a Shopify development store, with **no theme-code edits**: visitor gets the soft prompt,
  subscribes, receives the welcome push and a server-side send; the click is recorded.
- Requests to `/apps/marbee/*` without a valid Shopify signature are refused.
- The push SDK still works unchanged on non-Shopify sites (regression test page).
- Build, tests, `/code-review` and `/security-review` clean.

## FINAL DECISION (CTO)
**APPROVE WITH CONDITIONS.** Conditions:
1. The founder creates the Shopify Partner account and a dev store.
2. The ½-day spike confirms the two assumptions before the rest is built.
3. This is recorded as D-025 — a **distribution adapter** for frozen Web Push (no new push
   features), and the first piece of the Wave 2 Shopify app.
