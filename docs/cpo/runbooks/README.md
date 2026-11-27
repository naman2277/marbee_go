# Runbooks — how to run, test and operate Marbee

Copy-paste steps for the founder and for Claude sessions. PowerShell, one command per box.
**Never** put a password, key or token into chat or into these files (the repo is public).

| I want to… | Runbook |
|---|---|
| Start the apps on my PC / check they work | [local-dev.md](local-dev.md) |
| Fix a dead localhost, blank page, expired link, missing email | [troubleshooting.md](troubleshooting.md) |
| Know what each environment has and must have | [environments.md](environments.md) |
| Apply SQL to a database | [apply-sql.md](apply-sql.md) |
| Deploy an edge function | [deploy-edge-function.md](deploy-edge-function.md) |
| Read function / sign-in / cron logs | [function-logs.md](function-logs.md) |
| Add or rotate a secret | [rotate-secret.md](rotate-secret.md) |
| Create the staging project | [create-staging.md](create-staging.md) |
| Build a whole environment (DB + secrets + functions) | [environment-setup.md](environment-setup.md) |
| Roll out Web Push to a new environment | [web-push-rollout.md](web-push-rollout.md) |
| Decide on gh / Supabase CLI / Deno | [tooling.md](tooling.md) |

Quick commands: `npm run dev:all` · `npm run health` · `npm run dev:env`.
