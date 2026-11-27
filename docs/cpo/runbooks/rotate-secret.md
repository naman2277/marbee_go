# Runbook — add or rotate a secret

**Who:** CEO (secrets, D-014) · Never paste a secret into chat, a file in the repo, or a screenshot.

## Add or change an edge-function secret

1. Make the value. For a random secret, this puts 32 random bytes on your clipboard without showing them:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | Set-Clipboard
```

2. **Save it in your password manager first** (name it `Marbee <env> <SECRET_NAME>`).
3. Open **Edge Functions → Secrets**: `https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/functions/secrets`
4. Add or edit the secret name exactly as given (e.g. `FORM_CHALLENGE_SECRET`), paste the value, **Save**.
   Functions pick it up on their next call; no redeploy needed.
5. Tell Claude "set `<NAME>` on dev". Claude verifies through the feature or the function logs.

## Secrets that come in pairs: change both together

| Function secret | Must equal | Where |
|---|---|---|
| `PUSH_WORKER_SECRET` | Vault `push_worker_key` | SQL editor: `select vault.update_secret((select id from vault.secrets where name='push_worker_key'), 'PASTE');` with the value from your clipboard, run once, then clear the editor |
| service-role key (after a reset in Project Settings → API) | Vault `pipeline_worker_key`, `email_domains_key` | same `vault.update_secret` pattern for each name |

If only one side changes, the cron calls are refused (401) and Web Push, pipelines or DNS re-checks quietly stop.

## Special case: `MARBEE_SECRETS_KEY`: do NOT simply replace it

Everything sealed with it (workspace AI keys, secret variables, Firebase keys) becomes unreadable with a
new key. Rotation needs a re-seal step that doesn't exist yet. If you think it leaked, tell Claude
immediately (security incident, D-014 item 5). Don't change it yourself.

## When a key leaked (any key)

1. Revoke/regenerate it **at the vendor** (OpenAI, AWS, Firebase…). That is what actually stops misuse.
2. Put the new value in the secret, steps above.
3. Tell Claude: which key, roughly when, where it was exposed. Claude records the incident.

## Public values (not secret)

`APP_URL`, `CONSOLE_ORIGIN`, `OPENAI_FORM_MODEL`: just type the value; no password manager needed.
