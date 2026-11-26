# Pending items (come back to these)

Started 2026-11-27. Each item is either an open decision or open work. Keep each one short, and
remove it here when it lands in the decision log or a PR.

| # | Item | Why it matters | What's needed | Owner | Status |
|---|---|---|---|---|---|
| 1 | **Marbee's permanent SDK domain**, e.g. `cdn.marbee.in` | Every brand's website points at it (the script tag and `marbee-push-sw.js`), so changing it later breaks every install. | Pick a domain and serve `/sdk/v1/*` from it (Cloudflare Pages, D-008). Then set it in the snippet generator. | CEO picks the domain, CTO wires it | Open |
| 2 | **Web Push on Shopify stores** | Shopify can't host a file at the site root, so the standard install doesn't work there. | Plan: `specs/2026-11-27-web-push-shopify.md` (D-025). | CTO; CEO creates the Shopify Partner account | Planning |
| 3 | **Roll out Web Push to staging/production** | Only dev runs it today. | `runbooks/web-push-rollout.md`: deploy functions, SQL 95 + 96, worker secret, mark the default provider. | CEO runs, CTO verifies | Waiting for staging/prod projects |
| 4 | **Campaign UI calls `enqueue_web_push`** | The campaign screens don't exist yet; journeys still step in the browser (D-005). | When the campaign/journey worker is built, wire its push step to `enqueue_web_push`. | CTO | Later (D-005) |
| 5 | **Signed "identify" from the website** | Today only the brand's server (secret API key) can link a browser to a customer. | A signed-identity design (SEC-13) before allowing browser-side identify. | CTO | Later |
| 6 | **Daily fair-use cap per plan** | 100,000 pushes per workspace per day by default. Big brands will need more. | Decide caps per plan (pricing) and set `tenants.settings.web_push_daily_cap`. | CEO | Open |
| 7 | **Restore your normal dev server** | Port 5173 runs the branch worktree, which matches `main` now. | Optional: restart from the main folder after `git pull`. | CEO | Optional |
