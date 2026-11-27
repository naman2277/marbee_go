# Runbook — create the staging project

**Who:** CEO (vendor account, D-014) · **Cost:** ₹0 (Supabase free tier allows 2 free projects per org;
dev is one, staging is the other) · **Time:** ~10 minutes, then the build in [environment-setup.md](environment-setup.md)

> Free projects **pause after ~7 days without activity**. A paused staging just needs **Restore project**
> in the dashboard. Production will be a paid project (decision + cost entry first, D-014 item 1).

## 1. Create it

1. `https://supabase.com/dashboard/projects` → **New project**.
2. Organization: the same one as dev. Name: `marbee-staging`. Region: **South Asia (Mumbai)** (ap-south-1, D-010).
3. Database password: **Generate a password** → save it in your password manager as `Marbee staging DB` → **Create**.
4. Wait for it to finish (~2 minutes). Copy the **project ref** from the URL
   (`/dashboard/project/<ref>`, 20 letters). The ref is not secret; you can send it to Claude.

## 2. Add it to `scripts/db/targets.json`

Supabase → **Connect** (top bar) → **Session pooler**. From the connection string you need only two parts,
**not the password**:

- the user, `postgres.<ref>`
- the host, `aws-0-ap-south-1.pooler.supabase.com` (or whatever it shows)

Send those two to Claude, who adds this entry in a PR (it's public information, not a secret):

```json
"staging": {
  "user": "postgres.<ref>",
  "host": "aws-0-ap-south-1.pooler.supabase.com",
  "port": 5432,
  "database": "postgres"
}
```

After it's merged and you've pulled, check you can reach it (asks for the staging password):

```powershell
node scripts/db/apply.mjs status --target staging
```

Expected: `State: fresh`.

## 3. Build it

Follow [environment-setup.md](environment-setup.md) from step 2 (database), then the staging checklist in
[environments.md](environments.md) §5. Use **new** random secrets for staging (never copy dev's).

## 4. Tell Claude

"Staging is up, ref `<ref>`." Claude then updates [environments.md](environments.md) §1 and runs the smoke test with you.
