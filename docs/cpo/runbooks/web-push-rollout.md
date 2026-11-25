# Web Push rollout (D-022): dev first, then staging/production

Run the steps in this order. Each step is one action. Order matters: the **new functions
first**, because they still read the old key column until the SQL has run. The old
functions do not understand the new table.

## 1. Deploy 4 edge functions (Supabase dashboard)

For each one: Edge Functions → open the function → Code → replace everything with the file
below → Deploy. **"Enforce JWT verification" must be OFF** for all four.

| Function | Paste file | New? |
|---|---|---|
| `push-worker` | `supabase/web-deploy/push-worker.ts` | **new**: "Deploy a new function", name it exactly `push-worker` |
| `channel-send` | `supabase/web-deploy/channel-send.ts` | existing |
| `push-subscribe` | `supabase/web-deploy/push-subscribe.ts` | existing |
| `push-engage` | `supabase/web-deploy/push-engage.ts` | existing |

Check: Edge Functions → Secrets has `MARBEE_SECRETS_KEY` (already used by the AI gateway).

## 2. Apply SQL 95

```powershell
cd "D:\My Projects\Marbee v2\Marbee\.claude\worktrees\upbeat-mirzakhani-9fbb86"; node scripts/db/apply.mjs apply --target dev --yes
```

It asks for the dev database password (hidden) and applies only `95_web_push_production.sql`.

## 3. Let the database call the worker (SQL editor, once per project)

Paste into the SQL editor. Replace `PASTE_SERVICE_ROLE_KEY` with the project's
**service_role** key (Settings → API Keys → *Legacy API keys* tab → `service_role`) yourself.
Never paste it in chat.

```sql
select vault.create_secret('https://uqffhyaftlwetqigfenp.supabase.co/functions/v1/push-worker', 'push_worker_url');
select vault.create_secret('PASTE_SERVICE_ROLE_KEY', 'push_worker_key');
select extname from pg_extension where extname in ('pg_cron', 'pg_net');
```

The last line must list both `pg_cron` and `pg_net`. If one is missing, enable it under
Database → Extensions, then paste this to schedule the worker:

```sql
select cron.schedule('marbee_push_worker_tick', '* * * * *', 'select public.push_worker_tick();');
```

## 4. Verify (the CTO does this with you)

1. Settings → Channels → Web Push: provider shows "Service account stored server-side (project …)".
2. Test page subscribes → a row appears in Web Analytics → Web Push subscribers.
3. A campaign web-push delivery is sent → close the tab → the notification still arrives.
4. Click it → `engagement_log` has `clicked` for that message.

## Rollback

- Functions: redeploy the previous versions (Edge Functions → function → Deployments → previous).
- SQL (only if needed): put the keys back, then drop the new objects:

```sql
update public.channel_providers p set credentials_encrypted = s.secret
from public.channel_provider_secrets s where s.provider_id = p.id and s.secret not like 'mbs1.%';
drop trigger if exists channel_providers_keep_secrets_server_side on public.channel_providers;
select cron.unschedule('marbee_push_worker_tick');
```

Keys already **sealed** (`mbs1.…`) can only be opened by the functions. After a rollback,
re-paste the service-account JSON in Channels → Web Push.
