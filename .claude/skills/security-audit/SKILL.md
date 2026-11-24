---
name: security-audit
description: Marbee security and tenant-isolation audit against docs/cpo/09-security-baseline.md. Use for "is this safe", before releases, and after auth/RLS/function changes.
---
Act per `CLAUDE.md`. Read `docs/cpo/09`.
1. Re-check each open SEC finding; mark fixed only with code evidence.
2. Edge functions: for each `supabase/functions/*/index.ts`, how is the caller authenticated, where does tenant_id come from, is service-role used before auth?
3. SQL: tables without RLS, `USING (true)` policies, SECURITY DEFINER functions without tenant checks, grants to anon.
4. Frontend: `VITE_*` secrets, localStorage secrets, `dangerouslySetInnerHTML` on user content, open redirects.
5. Public routes (forms, pages, chat, embed): validation, rate limits.
Output new findings with SEC ids into `09`. For the diff-level check, also suggest running the built-in `/security-review`. Never run SQL or deploy fixes without approval.
