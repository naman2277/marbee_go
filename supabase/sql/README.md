# Marbee — Supabase SQL Setup

Run these scripts **in order** in your Supabase project:

**Dashboard → SQL Editor → New query → paste → Run**

| Order | File | Purpose |
|-------|------|---------|
| 0 | `00_cleanup.sql` | **Only if a previous run failed** — drops partial objects |
| 1 | `01_marbee_schema.sql` | All tables, functions, RLS policies |
| 2 | `02_marbee_seed.sql` | Demo tenant, journeys, sample data |
| 3 | Sign up in the app | Create your auth user |
| 4 | `03_link_your_user.sql` | Link your email to demo tenant |
| 4 | `04_storage_buckets.sql` | Asset storage buckets (for Asset Library) |
| 5 | `05_auto_link_new_users.sql` | Auto-link signups to demo tenant + fix existing users |
| 6..51 | `06_*.sql` … `51_realtime_messages.sql` | Incremental feature schema (run in order) |
| 60 | `60_pipeline_execution_model.sql` | Pipeline (data_jobs) execution model — versions, node runs, structured logs, artifacts. Separates definition from run. Run after 01–51; independent of `v2/`. |
| 61 | `61_pipeline_worker_cron.sql` | **Optional** — cron fallback that re-kicks pipeline runs stuck in `queued`. Needs `pg_cron` + `pg_net` + two Vault secrets; no-ops without them. |
| **v2** | `v2/52_*.sql` … `v2/58_tuning_grants.sql` | **Scale revamp** — partitioning, JWT-fast RLS, rollups, queues, cron, tuning. See [`v2/README.md`](v2/README.md). Run after 01–51. |

## Connect the React app

Create `apps/web/.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_DEMO_TENANT_ID=00000000-0000-0000-0000-000000000001
```

Get URL and anon key from: **Supabase Dashboard → Project Settings → API**

Then run:

```bash
npm run dev
```

## Demo tenant ID

```
00000000-0000-0000-0000-000000000001
```

Use this as `VITE_DEMO_TENANT_ID` in your env file.

## Tables created (28)

**Platform:** tenants, environments, profiles, roles, tenant_users, api_keys, audit_logs

**Customer:** customers, customer_identities, web_push_subscribers, channel_endpoints, exclusions

**Events:** events, engagement_log, deliveries, customer_delivery_log

**Journeys:** journeys, journey_versions, journey_instances, journey_instance_events, real_time_triggers

**Content:** assets, forms, form_submissions, landing_pages

**Data:** schema_definitions, schema_fields, connectors, connector_runs, data_jobs, channel_providers

## Troubleshooting

**"Permission denied" / empty data in app**
→ Run `03_link_your_user.sql` with your signup email

**"relation already exists"**
→ Tables already created; skip Part 1 or drop schema first (destructive)

**Realtime not updating**
→ Dashboard → Database → Replication → enable for `events`, `engagement_log`
