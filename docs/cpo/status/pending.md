# Pending items (come back to these)

Started 2026-11-27. Each item is either an open decision or open work. Keep each one short, and
remove it here when it lands in the decision log or a PR.

| # | Item | Why it matters | What's needed | Owner | Status |
|---|---|---|---|---|---|
| 1 | **Marbee's permanent SDK domain**, e.g. `cdn.marbee.in` | Every brand's website points at it (the script tag and `marbee-push-sw.js`), so changing it later breaks every install. | Pick a domain and serve `/sdk/v1/*` from it (Cloudflare Pages, D-008). Then set it in the snippet generator. | CEO picks the domain, CTO wires it | Open |
| 2 | **Web Push on Shopify stores** (D-025, proposed) | Shopify can't host a file at the site root, so the standard install doesn't work there. | Plan ready: `specs/2026-11-27-web-push-shopify.md`, one Marbee Shopify app (app proxy + app embed), ~2.5–3 days, ₹0. Needs: CEO verdict, a Shopify Partner account and a dev store; then a ½-day spike before building. | CEO decides; CTO builds | **Parked 2026-11-27**: plan done, waiting for verdict |
| 3 | **Roll out Web Push to staging/production** | Only dev runs it today. | `runbooks/web-push-rollout.md`: deploy functions, SQL 95 + 96, worker secret, mark the default provider. | CEO runs, CTO verifies | Waiting for staging/prod projects |
| 4 | **Campaign UI calls `enqueue_web_push`** | The campaign screens don't exist yet; journeys still step in the browser (D-005). | When the campaign/journey worker is built, wire its push step to `enqueue_web_push`. | CTO | Later (D-005) |
| 5 | **Signed "identify" from the website** | Today only the brand's server (secret API key) can link a browser to a customer. | A signed-identity design (SEC-13) before allowing browser-side identify. | CTO | Later |
| 6 | **Daily fair-use cap per plan** | 100,000 pushes per workspace per day by default. Big brands will need more. | Decide caps per plan (pricing) and set `tenants.settings.web_push_daily_cap`. | CEO | Open |
| 7 | **Restore your normal dev server** | Port 5173 runs the branch worktree, which matches `main` now. | Optional: restart from the main folder after `git pull`. | CEO | Optional |
| 8 | **Broadcast to subscribers (launch blocker)** (D-026, approved, built as Campaigns → Web Push Campaigns + report) | Marketers can't send a push from the UI, and anonymous website subscribers can't be targeted at all. "Send to all subscribers" is the main use of web push. | Plan ready: `specs/2026-11-27-web-push-broadcast.md`, a Broadcasts screen (compose, audience/filters/cohort, count, schedule, results) on the existing queue. ~2.5–3 days, ₹0. | CEO: run SQL 95, 97, 98 + deploy push-engage on dev, then test | In dev test |
| 9 | **Test on other browsers** | Only desktop Chrome is verified. | 30-minute check on dev: Firefox, Edge, Safari (macOS), iPhone (home-screen web app only). | CEO + CTO | Open |
| 10 | **Test a push step in the journey builder UI** | The code queues it correctly, but no journey has run through the UI. | One journey with a web-push step on dev; confirm it arrives and shows in logs. | CEO + CTO | Open |
| 11 | **Delivery and click reporting screen** | The numbers are stored (`engagement_log`, outbox), but no report screen has been checked. | Built for broadcasts (Web Push campaign report, SQL 98); check journey/campaign reports when those screens exist. | CTO | Broadcasts done |
| 12 | **Error monitoring (Sentry)** | Failures in the worker or SDK should alert us, not wait for a customer to notice. | Roadmap item (G2); wire push-worker and the SDK when Sentry lands. | CTO | Roadmap |
| 13 | **Privacy policy wording for push** | Brands collect browser push subscriptions; the policy should say so. | Short clause for Marbee's terms and a template line for brands. | CEO (legal) | Open |

**Launch readiness (Web Push), 2026-11-27:** engine verified on dev. **Blockers before the first customer:** #1 SDK domain, #3 production rollout, #8 broadcast; plus #2 if the first brand is on Shopify. **Should do before launch:** #9, #10.
