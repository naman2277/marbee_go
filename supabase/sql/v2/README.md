# Marbee DB v2 Revamp — Scale to 1000+ tenants

These scripts are an **additive upgrade layer** on top of `supabase/sql/01..51`.
They transform the existing schema in place — no table is dropped, every legacy
table that gets partitioned is kept as `<name>_v1_backup`.

## Run order

```bash
# after ALL numbered scripts in supabase/sql (01..91 and later) — v2/52 must run after 91 (TD-12)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/52_extensions_helpers.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/53_partitioning.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/54_indexes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/55_rollups.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/56_queues_idempotency.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/57_cron.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/58_tuning_grants.sql
# optional, dev/staging only:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/59_loadtest_seed.sql
```

Fresh / reset install (skip copying legacy rows into the partitioned tables):

```sql
SELECT set_config('marbee.copy_legacy', 'false', false);   -- run once in the same session before 53
```

When legacy rows *are* copied, anything older than the current month lands in each
table's `*_pdefault` partition (still fully queryable). To redistribute it into
monthly partitions afterwards, create the back-months with
`_ensure_time_partitions('public.events'::regclass, 0)` per month and
`ALTER TABLE ... DETACH/ATTACH`, or just let retention age the default out.

## What each script does

| File | Change | Why it matters at 1000+ tenants |
|---|---|---|
| `52_extensions_helpers` | `pg_stat_statements`, `pg_trgm`, `btree_gin`; `uuid_generate_v7()`; `custom_access_token_hook`; **rewrites `user_tenant_ids()` / `current_tenant_id()` / `user_has_permission()` to read the JWT claim first** | Every existing `tenant_id IN (SELECT user_tenant_ids())` policy stops scanning `tenant_users` per row — it becomes a single-value InitPlan. No policy rewrites required. |
| `53_partitioning` | `events`, `engagement_log`, `customer_delivery_log`, `journey_instance_events`, `audit_logs`, `web_analytics_events` → **native monthly RANGE partitions** with BRIN + tenant/time btree indexes; v7 UUID PKs. `web_analytics_events` is cloned with `LIKE` so it partitions against whichever of its two historical column sets is installed. | Retention becomes `DROP PARTITION` (instant) instead of month-long `DELETE`s. Partition pruning + small per-month indexes keep dashboard queries flat as volume grows. |
| `54_indexes` | ~60 defensive `CREATE INDEX IF NOT EXISTS` — every FK, every list filter, JSONB `gin`, trigram search | Kills seq scans on `deliveries`, `form_submissions`, `api_keys`, `tenant_users(user_id)`, `journey_instances(tenant_id)`, customer search, etc. |
| `55_rollups` | Replaces the full-recompute `mv_command_center_today` with `rollup_*_daily` tables + `refresh_rollups(since)`; keeps the old view name as a thin view | Command Center reads O(days), not O(all engagement rows). No `REFRESH MATERIALIZED VIEW` locks. |
| `56_queues_idempotency` | `pgmq` queues (`q_events_process`, `q_rtm_send`, …) with a table-queue fallback + uniform `mq_*` wrappers; unified `idempotency_keys` ledger | Event → trigger fan-out moves off the ingest request path. One idempotency surface for RTM + webhooks. |
| `57_cron` | `pg_cron` jobs: partition lookahead/retention (hourly), `refresh_rollups` (2 min), idempotency sweep, `ANALYZE` hot tables | Keeps partitions ahead of ingest and analytics fresh with no app involvement. |
| `58_tuning_grants` | Per-table `autovacuum_*` + `fillfactor`; `statement_timeout` for `authenticated`/`anon`; revokes `anon` write grants; `perf_slow_queries` view | Bounds worst-case query cost, controls bloat on churn tables, tightens the public surface. |
| `59_loadtest_seed` | `marbee_generate_load()` / `marbee_purge_load()` | Reproducible 1000-tenant benchmark. |

## App / Edge changes shipped alongside

- `supabase/config.toml` — registers `custom_access_token_hook` so issued JWTs carry
  `tenant_id`, `app_role`, `perms`.
- `apps/web/src/contexts/AuthContext.tsx` — reads `tenant_id` from the JWT claim
  (falls back to the `tenant_users` query).
- `apps/web/src/lib/home-analytics.ts` — `fetchInsightsMetrics` (7/30/90-day view)
  reads `rollup_engagement_daily` instead of scanning raw `engagement_log`; the
  `events` KPI count uses an estimate. Falls back to the raw path on pre-v2 DBs.
- `supabase/functions/events-ingest/index.ts` — enqueues to `q_events_process`
  via `mq_send_batch` instead of the inline per-trigger loop (falls back to inline
  if the RPC is unavailable).
- `supabase/functions/_shared/supabase.ts` — `getPooledConnectionString()` helper
  + note to use the Supavisor **transaction-mode** URL (`:6543`) for raw PG.

## Verify

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/tests/rls_isolation.sql
psql "$DATABASE_URL" -c "SELECT * FROM public.partition_health;"
psql "$DATABASE_URL" -c "SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'marbee_%';"
```

## Rollback

- Drop the `v2` objects: partitioned tables can be swapped back
  (`ALTER TABLE events RENAME TO events_v2; ALTER TABLE events_v1_backup RENAME TO events;`).
- `custom_access_token_hook` is inert until enabled in `config.toml` / Dashboard;
  disable it there to stop stamping claims. The rewritten helper functions still
  work without the claim (they fall back to `tenant_users`).
