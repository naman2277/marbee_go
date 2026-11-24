# 04 — Recommended Technology Architecture

**Decision:** keep the current stack; harden it. No migration to Next.js, no microservices, no new
database. (D-002)

## 1. Shape

```
Browser (React SPA, Vite)          Public SDK / webhooks / forms
   │  design · preview · monitor        │  events · subscribe · submit
   │  (user JWT, anon key)              │  (publishable site key or API key)
   ▼                                    ▼
Supabase PostgREST + RLS          Edge Functions (Deno)  ── auth layer: verify JWT or hashed API key
   │  CRUD on config tables             │  → derive tenant_id/env from credential
   │                                    │  → rate limit → enqueue
   └──────────────► Postgres ◄──────────┘
                      │  pgmq queues · pg_cron · partitions · rollups (v2 layer)
                      ▼
               Worker functions (pipeline-run-worker, rtm-worker, events-worker, journey-worker*)
                      │  idempotent, retry with backoff, dead-letter
                      ▼
               Channel providers (BYOP): FCM · WhatsApp BSP · SMS · SES · …
```
`*` journey-worker = recommendation; today blast/journey ticks run in the browser.

## 2. Rules

| Concern | Rule | Why |
|---|---|---|
| Tenancy | Shared database, `tenant_id` on every row, RLS via JWT claim (`custom_access_token_hook`, v2/52). Service-role only inside functions that have already authenticated the caller. | Cheapest model that is safe; dedicated projects are a P3 enterprise upsell. |
| Execution | Anything that sends, transforms customer data at volume, or must survive a closed tab runs in a worker. Browser may run **preview on ≤100 sample rows** only. | Reliability, idempotency, no PII bulk in browser. |
| Queues | pgmq (already in v2/56). Redis only when measured queue latency or throughput needs it. | Avoid a second datastore and its bill. |
| Scheduling | pg_cron triggers workers (61, v2/57). | Built in, free. |
| Secrets | Supabase Vault / function secrets. Tenant provider credentials encrypted server-side; client sees masked values only. | No key leaves the server. |
| AI | All LLM calls via edge functions with per-tenant metering and a cheap default model; local rule-based fallback kept. | Cost control, key safety. |
| Files | Supabase Storage, private buckets + signed URLs (`asset-gate`). CDN via Supabase/Cloudflare. | Already built. |
| Observability | Sentry (frontend + functions) free tier; Supabase logs; a `job_runs` health page (exists in part). | Cheap and enough for Stage 1–2. |
| Hosting | SPA on Cloudflare Pages (free, commercial use allowed). | Static hosting; no server to run. |
| Schema change | One path: numbered `supabase/sql/` scripts, applied to **staging first**, recorded in a `schema_migrations` table. Move to Supabase CLI migrations once staging exists (D-006). | Reproducible environments. |

## 3. Growth path (planning scenarios — validate with load tests)

| Stage | Tenants | Additions |
|---|---|---|
| 1 MVP | 1–10 | Supabase Pro (small compute), Cloudflare Pages, Sentry free, staging on free project |
| 2 Early growth | 10–100 | Apply v2 partitioning + rollups, compute upgrade, PITR backups, read-heavy dashboards on rollups |
| 3 Expansion | 100–1,000 | Supavisor transaction pooling (already supported), dedicated worker runtime (e.g. Fly.io/Railway container) if edge-function limits bite, Redis if queues demand it |
| 4 Enterprise | 1,000+ | Read replicas, per-tenant projects for large customers, SSO, SLAs, warehouse sync |

Exit criteria for moving to the next stage are measured (p95 latency, queue lag, DB CPU), not tenant count.
