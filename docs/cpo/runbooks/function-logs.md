# Runbook — check an edge function's logs

**Who:** anyone with dashboard access · read-only

1. Open (replace `<name>`, e.g. `platform-admin`):
   `https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/functions/<name>/logs`
2. Two tabs:
   - **Invocations**: one line per call with its HTTP status. Look for 4xx/5xx around the time it broke.
   - **Logs**: what the function printed (`console.log` / `console.error`), including "Server misconfigured: X is not set".
3. Narrow the time range at the top to the minutes around the problem.

**Sign-in problems** are in the Auth logs, not function logs:
`https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/logs/auth-logs`. Search for the email address.

**Cron jobs** (pipeline sweeps, Web Push worker): SQL editor →

```sql
select jobname, status, return_message, start_time
from cron.job_run_details join cron.job using (jobid)
order by start_time desc limit 20;
```

## What to send Claude

The function name, the time, the status code and the error line, as a screenshot or copied text. Crop
out anything that looks like a key or token (long random strings, `eyJ…`). Logs never need to include secrets.

## Common messages

| You see | Means | Fix |
|---|---|---|
| `Server misconfigured: APP_URL is not set` (or another name) | a function secret is missing | [rotate-secret.md](rotate-secret.md) → "Add a secret"; names in [environments.md](environments.md) §2 |
| `MARBEE_SECRETS_KEY must be 32 bytes` | the key is malformed | regenerate as in [rotate-secret.md](rotate-secret.md); **read the warning there first** |
| 401 on every call | JWT setting doesn't match the manifest, or the caller isn't signed in | check function **Settings → Enforce JWT Verification** against `supabase/functions/manifest.json` |
| 404 | function not deployed under that name | [deploy-edge-function.md](deploy-edge-function.md) |
| CORS error in the browser console (Console app) | the origin isn't in `CONSOLE_ORIGIN` | set `CONSOLE_ORIGIN` to include the console's URL |
