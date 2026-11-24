# Marbee Console (internal)

Platform console for the CEO/CTO: tenants, usage, credits, members, bill summaries, audit log.
Spec: [`docs/cpo/specs/2026-11-10-platform-console-v1.md`](../../docs/cpo/specs/2026-11-10-platform-console-v1.md) · Decisions D-015, D-016.

**Security model:** separate app + Cloudflare Access in front + Supabase login with mandatory TOTP
two-factor + `platform_admins` allow-list + a single edge function (`platform-admin`) with an explicit
operation list. The browser never holds the service-role key. Every change is in an append-only audit log.

## Local development

```bash
cp apps/console/.env.example apps/console/.env.local   # set your Supabase URL + anon key
npm run dev:console                                    # http://localhost:5174
```

UI-only work without a backend: add `VITE_CONSOLE_MOCK=1` to `.env.local`. It loads sample data, works
only under `vite dev`, and is stripped from production builds.

## Go-live steps (CEO) — staging first, then production

1. **Database:** run `supabase/sql/84_platform_console_credits.sql` in the SQL editor.
   Regression test (local, no database needed): `npm run test:sql`.
2. **Make yourself an admin** (SQL editor, your own email):
   ```sql
   INSERT INTO public.platform_admins (user_id, email, role)
   SELECT id, email, 'owner' FROM auth.users WHERE email = 'you@yourdomain.com'
   ON CONFLICT (user_id) DO UPDATE SET status = 'active', role = 'owner';
   ```
3. **Two-factor:** Supabase Dashboard → Authentication → Multi-Factor → enable TOTP (on by default in most projects).
4. **Edge function:** set secrets, then deploy with JWT verification **on**:
   ```bash
   supabase secrets set CONSOLE_ORIGIN=https://console.yourdomain.com APP_URL=https://app.yourdomain.com
   supabase functions deploy platform-admin
   ```
5. **Hosting:** Cloudflare Pages → new project → root `apps/console`, build `npm run build`, output `dist`.
   Env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Custom domain `console.yourdomain.com`.
   `public/_headers` applies CSP and security headers automatically.
6. **Cloudflare Access:** Zero Trust → Access → Applications → self-hosted → `console.yourdomain.com`,
   policy "Allow" for your and the CTO's emails only.
7. **Verify:** sign in → set up TOTP → tenants list loads. Then confirm the gate refuses a tenant user:
   sign in as a normal tenant admin → expect "not a platform admin".

## Known limits (v1)

- Suspension is recorded but not yet enforced on tenant users (TD-12, Phase 0).
- Credits are only debited once the Wave 1 email/AI workers call `credit_debit`.
- Invoices: export the bill summary, create the GST invoice in Razorpay/Zoho (API in Feb).
- Support access (consented, time-boxed) — Feb.
