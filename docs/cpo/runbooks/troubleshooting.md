# Runbook — when a dev server or sign-in breaks

Start here every time:

```powershell
npm run health
```

It tells you which app is down and whether Supabase answers. Then find your symptom below.

## "This site can't be reached" / `ERR_CONNECTION_REFUSED` on localhost

**Cause:** the dev server isn't running. It stops when its terminal window closes, the PC restarts, or a
Claude session ends and stops the server it started.

**Fix:**

```powershell
npm run dev:all
```

Wait for "ready", then reload the page. If it says a port is already in use, a different program has the
port. Run `npm run health`; if the app shows UP, just use it.

## Blank white page on localhost:5173

**Cause:** usually `apps/web/.env.local` is missing (common in a fresh folder). Health shows `ENV … missing`.

**Fix:** `npm run dev:env`, then stop (Ctrl+C) and run `npm run dev:all` again. Still blank? Press F12 →
Console and send Claude the red error line.

## Invite / reset link says `otp_expired` ("Email link is invalid or has expired")

**Cause:** the links are **one-time** and **expire** (1 hour by default). Common ways to burn one:
it was clicked twice; an email scanner or link preview opened it first; it was older than an hour; or a
newer email was sent, which cancels the older link.

**Fix:**
1. Ask for **one** fresh link (Console → workspace → resend invite, or Members → Send reset link). Don't click resend repeatedly.
2. Open the **newest** email only, click the link **once**, and finish setting the password in that tab.
3. The link must lead to `http://localhost:5173/...` on dev. If it leads elsewhere, check Site URL / Redirect URLs
   and `APP_URL` ([environments.md](environments.md) §5).
4. Link opens "connection refused"? The dev server is off. Start it (above) and request a **new** link,
   because the first click may have used it up.

## Email never arrives / "Email rate limit exceeded"

**Cause:** dev uses Supabase's **built-in mailer**. It is for testing only: it sends **only to members of
your Supabase team**, and only **a few emails per hour** for the whole project (currently 2/hour, per Supabase
docs; the dashboard shows the current number under Authentication → Rate Limits). Every invite, reset or
resend counts.

**Fix:**
- Wait an hour, then send **one** email.
- Test with an address that is a member of your Supabase organization.
- Check what happened: Auth logs (`https://supabase.com/dashboard/project/uqffhyaftlwetqigfenp/logs/auth-logs`), search the address.
- The real fix is custom SMTP (SES), which is **parked**. Until then, workspace-invite testing in the Console waits on it.

## Console: "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set"

`npm run dev:env`, then restart the console. Want to look at screens without signing in? Use console-mock: http://localhost:5175.

## Console: sign-in works but every action fails (CORS / "Failed to fetch")

`CONSOLE_ORIGIN` secret must include `http://localhost:5174` ([environments.md](environments.md) §2).

## Anything else

Send Claude: the page URL, what you clicked, the red line from F12 → Console, and the `npm run health` output.
None of these contain secrets.
