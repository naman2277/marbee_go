## Web Push: production-ready, then frozen (D-022, D-023)

This makes Web Push ready for production and validates it end to end on dev with the founder.

### What changes
- **Server-side send.** Campaign and journey send nodes now queue pushes with `enqueue_web_push`. The new `web_push_outbox` table is drained by the new `push-worker` function, which pg_cron calls every minute and the queue step also triggers right away. Sends are idempotent per delivery and device, retry with backoff (5 tries), and expired tokens (404/410/invalid) are pruned. A daily fair-use cap applies (D-015). The old browser send loop is gone, along with its "send to every anonymous subscriber" fallback.
- **Website SDK.** `/sdk/v1/marbee-push.js` plus `marbee-push-sw-core.js`:
  - authenticates with the site key (origin-checked);
  - shows a soft prompt before the browser's own prompt, and an unsubscribe sticks;
  - links a browser to a customer only on the server (by website id, or by a secret API key);
  - sends the welcome push from the server (closes TD-21);
  - reports clicks to `push-engage`, which now has a rate limit;
  - sends data-only messages, so a notification is never shown twice.
- **Security.**
  - **SEC-22:** the Firebase service-account private key moves to `channel_provider_secrets`, which app users cannot read. Functions re-seal it with `MARBEE_SECRETS_KEY`. A trigger catches any key saved from the browser, including old wrapped formats, and never deletes unrecognised content.
  - **SEC-23:** the Web Analytics snippet no longer sends visitor tokens to public ntfy.sh topics. The founder confirmed the old snippet was only ever on test pages.
  - Secret form fields turn off spellcheck, Grammarly and autofill.
- **Web Analytics → Web Push** now reads real subscribers, sends a real test push, and "Clear test tokens" removes only fake tokens.

### Tests
- `supabase/tests/sql/95_web_push.test.mjs` (PGlite chain, 54 checks): key isolation, enqueue permissions and workspace isolation, idempotency, re-sending failures, exclusions, daily cap, claim/complete, retries, pruning, suspended workspaces, keys never destroyed, cross-workspace secret planting blocked.
- `supabase/tests/functions/web-push.test.mjs`: FCM error classification, URL validation, OAuth token caching, sending with a mocked network, key loading and re-sealing.
- `npm run build`, `npm run test:functions` and `npm run test:sql:chain` pass. `/code-review` found 9 issues, all fixed. `/security-review` found nothing at 8/10 or higher; low-confidence hardening was applied anyway.

### End-to-end on dev (2026-11-26, with the founder)
1. Subscribed on a test site (`localhost:5500`) through the SDK.
2. The welcome push and a campaign-style push were queued and sent by pg_cron → `push-worker` → FCM, and arrived in Chrome with the tab closed.
3. Clicks were recorded as `clicked`. An expired token was pruned, and unsubscribed browsers were skipped.

**Already done on dev:** 4 functions deployed, SQL 95 applied, `PUSH_WORKER_SECRET` set, Vault `push_worker_url` / `push_worker_key` set, `pg_cron` and `pg_net` enabled.

### Risk
- **Medium:** SQL 95 moves stored Firebase keys. The move is a copy; legacy plaintext still works, and unrecognised values are kept, not deleted.
- **Deploy order matters:** deploy the functions **before** SQL 95.
- If the Vault and function secrets don't match, sends stay queued and are not lost. They go out once the two match.

### Rollback
- **Functions:** redeploy the previous versions from the dashboard.
- **SQL:** run the block in `docs/cpo/runbooks/web-push-rollout.md`. It restores the keys, drops the trigger and unschedules the cron job.

### Deploy steps (staging / production)
Follow `docs/cpo/runbooks/web-push-rollout.md`:
1. Deploy `push-worker` (new), `channel-send`, `push-subscribe` and `push-engage`, all with JWT verification OFF.
2. `node scripts/db/apply.mjs apply --target <env> --yes` (applies 95).
3. Create `PUSH_WORKER_SECRET` and set it as a function secret, and set the same value in Vault together with `push_worker_url`. Enable `pg_cron` and `pg_net`.
4. Mark the Firebase provider as **default** in Channels → Web Push.

### Out of scope (frozen, see D-023)
- The campaign UI and journey orchestration (they call `enqueue_web_push` when built).
- Browser-side "identify" (needs signed identity, SEC-13).
- Native app push.
- Frequency caps and quiet hours; server-side personalisation; open/dismiss analytics.
- A global rate limiter (TD-14), pgmq, and other channels' credentials (TD-28).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
