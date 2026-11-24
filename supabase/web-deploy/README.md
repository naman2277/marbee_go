# Deploy Edge Functions via Supabase Web Dashboard

Your **Failed to fetch** error happens because Edge Functions are **not deployed yet** (returns 404).

Go to: **https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/functions**

---

---

## Deploy `create-tenant-user` (required for **Add member → Create user**)

1. Click **Deploy a new function**
2. Name: `create-tenant-user` (exact name)
3. Paste the entire contents of: **`supabase/web-deploy/create-tenant-user.ts`**
4. Deploy
5. Open function **Settings** → turn **OFF** "Enforce JWT Verification"
6. Required: secret **`APP_URL`** = your Marbee app URL (e.g. `http://localhost:5173` or production domain) so setup-password links work
7. **Authentication → URL Configuration → Redirect URLs** — add:
   - `http://localhost:5173/setup-password` (local dev)
   - `https://YOUR_DOMAIN/setup-password` (production)

Without redirect URLs whitelisted, create-user fails with a redirect URL error.

Without this function, **Create user** shows "Failed to fetch". **Invite link** still works (database RPC only).

**Admins never set passwords (SEC-12):** new members get an invite email, existing accounts get a join email, and no link is shown to the admin. Auth email (SMTP) must work — configure custom SMTP in **Authentication → Emails** for more than a handful of emails/hour.

**Member account settings:** run **`supabase/sql/41_member_account_settings.sql`** for company, IP allowlist, and folder access fields on member accounts.

**Profile avatars:** run **`supabase/sql/42_profile_avatar.sql`** for avatar URLs on members and self-service profile updates.

**Instance access controls:** run **`supabase/sql/43_member_instance_access.sql`** for Read/Write/Delete per Dev/Stage/Prod on member accounts.

**Edit roles & permissions:** run **`supabase/sql/44_role_management.sql`** to create, update, and delete custom roles from Access management.

Verify (should NOT be 404):

```
https://YOUR_PROJECT.supabase.co/functions/v1/create-tenant-user
```

---

## Deploy `reset-tenant-user-password` (required for **Send reset link** on members)

Emails the member a one-time password-reset link; needs secret **`APP_URL`** and `/setup-password` in Redirect URLs.

1. Click **Deploy a new function**
2. Name: `reset-tenant-user-password` (exact name)
3. Paste the entire contents of: **`supabase/web-deploy/reset-tenant-user-password.ts`**
4. Deploy
5. Open function **Settings** → turn **OFF** "Enforce JWT Verification"

Verify (should NOT be 404):

```
https://YOUR_PROJECT.supabase.co/functions/v1/reset-tenant-user-password
```

---

## Deploy `channel-send` (required to send pushes)

1. Click **Deploy a new function** (or **Create function**)
2. Name: `channel-send` (exact name, lowercase with hyphen)
3. Paste the entire contents of: **`supabase/web-deploy/channel-send.ts`**
4. Deploy
5. Open function **Settings** → turn **OFF** "Enforce JWT Verification" (Verify JWT = disabled)

---

## Optional: `push-subscribe` and `events-ingest`

The Marbee app now saves FCM tokens **directly to the database** — you don't need `push-subscribe` for dashboard testing.

Deploy `events-ingest` later for SDK/event tracking from external sites.

---

## Test again

1. Refresh Marbee → **Settings → Channels**
2. Click **Test Push on This Browser**
3. Expected results:
   - **Without channel-send:** "FCM token obtained and saved to database..."
   - **With channel-send deployed:** "Test push sent! Check your browser notifications."

---

## Deploy `landing-ai` (optional — powers **Landing Studio → AI → Generate page**)

1. Click **Deploy a new function**
2. Name: `landing-ai` (exact name)
3. Paste the entire contents of: **`supabase/functions/landing-ai/index.ts`**
4. Deploy
5. Open function **Settings** → turn **OFF** "Enforce JWT Verification"
6. Add secret **`OPENAI_API_KEY`** (optional secret `OPENAI_LANDING_MODEL`, default `gpt-4o-mini`)

Without this function, "Generate page" still works using an offline template blueprint
(and a `VITE_OPENAI_API_KEY` in `apps/web/.env.local` for direct-from-browser generation in dev).

---

## Deploy `form-submit` (required for **published form** submissions → Customer 360)

1. Click **Deploy a new function**
2. Name: `form-submit` (exact name)
3. Paste the entire contents of: **`supabase/web-deploy/form-submit.ts`**
4. Deploy
5. Open function **Settings** → turn **OFF** "Enforce JWT Verification"

Without this function, live/public form submissions cannot upsert customers (RLS blocks direct client writes).

---

## Deploy `social-publish` (required for **Social Studio** publishing)

1. Click **Deploy a new function**
2. Name: `social-publish` (exact name)
3. Paste the entire contents of: **`supabase/web-deploy/social-publish.ts`**
4. Keep **JWT verification ON** (uses user session)
5. Deploy

Connect accounts under **Settings → Social media**, then compose posts in **Content → Social Studio**.

---

1. Click **Deploy a new function**
2. Name: `tenant-api` (exact name)
3. Paste the entire contents of: **`supabase/web-deploy/tenant-api.ts`**
4. **Turn OFF "Verify JWT"** — custom endpoints authenticate via Bearer API keys, not Supabase JWT
5. Deploy

Invoke URL pattern:

```
POST https://YOUR_PROJECT.supabase.co/functions/v1/tenant-api/{slug}
Authorization: Bearer mk_your_api_key
```

---

## Verify deployment

Open in browser (should NOT be 404):

```
https://uqffhyaftlwetqigfenp.supabase.co/functions/v1/channel-send
```

You may see a JSON error about method — that's OK. **404 = not deployed.**
