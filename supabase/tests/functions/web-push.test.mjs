// Tests for _shared/web-push.ts (D-022). Run: node supabase/tests/functions/web-push.test.mjs
import { generateKeyPairSync } from 'node:crypto';

let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

const wp = await import('../../functions/_shared/web-push.ts');

// ---------------------------------------------------------------- service account
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const SA = { type: 'service_account', project_id: 'marbee-dev-push', client_email: 'fcm@marbee-dev-push.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' };
ok(wp.parseServiceAccount(JSON.stringify(SA)).project_id === 'marbee-dev-push', 'valid service account parses');
ok(throwsWith(() => wp.parseServiceAccount('{bad'), /not valid JSON/), 'rejects broken JSON');
ok(throwsWith(() => wp.parseServiceAccount(JSON.stringify({ ...SA, type: 'authorized_user' })), /service_account/), 'rejects non service-account JSON');
ok(throwsWith(() => wp.parseServiceAccount(JSON.stringify({ ...SA, private_key: 'abc...' })), /truncated/), 'rejects truncated keys');
ok(throwsWith(() => wp.parseServiceAccount(JSON.stringify({ ...SA, project_id: 'your-project' })), /placeholder/), 'rejects placeholder project');
ok(throwsWith(() => wp.parseServiceAccount(JSON.stringify({ ...SA, project_id: '../evil' })), /valid Firebase project/), 'rejects project ids that could change the FCM URL');

// ---------------------------------------------------------------- content
const c = wp.normalizeContent({
  title: 'x'.repeat(300), body: 'Hi', click_url: 'javascript:alert(1)', icon_url: 'https://cdn.test/i.png', image_url: 'data:image/png;base64,AAA',
  actions: [{ title: 'Buy', url: 'https://shop.test/buy' }, { title: 'Later', url: '/later' }, { title: 'Third' }], ttl_seconds: 99999999,
});
ok(c.title.length === 200, 'title capped at 200 chars');
ok(c.click_url === undefined, 'javascript: click URLs are dropped');
ok(c.image_url === undefined && c.icon_url === 'https://cdn.test/i.png', 'only http(s) image URLs kept');
ok(c.actions.length === 2 && c.actions[1].url === '/later' && c.actions[0].action === 'action_1', 'max 2 actions, relative URLs allowed, ids assigned');
ok(c.ttl_seconds === 2419200, 'TTL capped at FCM max (28 days)');
ok(wp.normalizeContent({ title: 'a', track_opens: false }).track_clicks === false, 'track_opens:false switches click tracking off');
ok(wp.normalizeContent({ title: 'a', clickAction: 'https://s.test/p' }).click_url === 'https://s.test/p', 'accepts the app\'s clickAction name');

const msg = wp.buildFcmMessage('tok-1', c, { message_id: 'm1', tenant_id: 't1', environment: 'production', engage_url: 'https://x.supabase.co/functions/v1/push-engage' });
ok(msg.message.token === 'tok-1' && !('notification' in msg.message), 'data-only message (no auto-drawn duplicate)');
ok(Object.values(msg.message.data).every((v) => typeof v === 'string'), 'all data values are strings (FCM requirement)');
ok(msg.message.data.engage_url.endsWith('/push-engage') && msg.message.data.message_id === 'm1', 'carries message id + engage URL for click tracking');
ok(JSON.parse(msg.message.data.actions_json).length === 2, 'actions travel as JSON');
ok(msg.message.webpush.headers.TTL === '2419200', 'TTL header set');
ok(new TextEncoder().encode(JSON.stringify(msg.message.data)).length < 4096, 'payload fits FCM\'s 4 KB data limit for normal content');
const huge = wp.normalizeContent({
  title: 'T'.repeat(200), body: 'B'.repeat(1000), click_url: 'https://s.test/' + 'c'.repeat(1900),
  icon_url: 'https://s.test/' + 'i'.repeat(1900), image_url: 'https://s.test/' + 'm'.repeat(1900),
  actions: [{ title: 'A', url: 'https://s.test/' + 'a'.repeat(1900) }, { title: 'B', url: 'https://s.test/' + 'b'.repeat(1900) }],
});
const big = wp.buildFcmMessage('tok', huge, { message_id: 'm', tenant_id: 't', environment: 'production' }).message.data;
ok(new TextEncoder().encode(JSON.stringify(big)).length <= wp.MAX_DATA_BYTES, 'oversized content is trimmed under the FCM limit');
ok(big.click_url.length > 1900 && big.title.length === 200, '...keeping the title and the main link intact');

// ---------------------------------------------------------------- classification
const err = (status, code, message = 'x') => JSON.stringify({ error: { status, message, details: code ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: code }] : [] } });
ok(wp.classifyFcmResponse(200, '').outcome === 'delivered', '200 → delivered');
ok(wp.classifyFcmResponse(404, err('NOT_FOUND', 'UNREGISTERED')).outcome === 'invalid_token', '404 UNREGISTERED → prune');
ok(wp.classifyFcmResponse(410, '').outcome === 'invalid_token', '410 Gone → prune');
ok(wp.normalizeContent({ title: 'a', click_url: '//evil.example/x' }).click_url === undefined, 'protocol-relative URLs are rejected');
ok(wp.normalizeContent({ title: 'a', click_url: '/\\evil.example' }).click_url === undefined, 'backslash host trick rejected');
ok(wp.normalizeContent({ title: 'a', click_url: '/cart?x=1' }).click_url === '/cart?x=1', 'site-relative paths kept');
ok(wp.classifyFcmResponse(400, err('INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token')).outcome === 'invalid_token', 'invalid token → prune');
ok(wp.classifyFcmResponse(400, err('INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value at message.data')).outcome === 'failed', 'bad payload → failed, not pruned');
ok(wp.classifyFcmResponse(403, err('PERMISSION_DENIED', 'SENDER_ID_MISMATCH')).outcome === 'invalid_token', 'sender mismatch → prune');
ok(wp.classifyFcmResponse(403, err('PERMISSION_DENIED', 'THIRD_PARTY_AUTH_ERROR')).outcome === 'failed', 'auth/config error → failed');
let r = wp.classifyFcmResponse(429, err('RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'), '120');
ok(r.outcome === 'retry' && r.retryAfterSeconds === 120, '429 → retry honouring Retry-After');
ok(wp.classifyFcmResponse(429, '', null).retryAfterSeconds === 60, '429 without Retry-After waits 60 s');
ok(wp.classifyFcmResponse(503, err('UNAVAILABLE', 'UNAVAILABLE')).outcome === 'retry', '503 → retry');
ok(wp.classifyFcmResponse(500, 'oops').outcome === 'retry', '500 non-JSON → retry');
ok(wp.classifyFcmResponse(401, err('UNAUTHENTICATED')).outcome === 'retry', '401 → retry with a fresh token');
ok(/UNREGISTERED/.test(wp.classifyFcmResponse(404, err('NOT_FOUND', 'UNREGISTERED', 'Requested entity was not found.')).error), 'error text names the FCM code');
ok(/pruned/.test(wp.explainFcmError('FCM 404 UNREGISTERED: x')), 'explains pruning');
ok(/Service accounts/.test(wp.explainFcmError('Google OAuth failed: invalid_grant UNAUTHENTICATED')), 'explains bad server key');

ok(wp.backoffSeconds(1) === 30 && wp.backoffSeconds(2) === 120 && wp.backoffSeconds(4) === 1920 && wp.backoffSeconds(9) === 3600, 'backoff 30s → 2m → 8m → 32m, capped 1h');
ok(wp.backoffSeconds(1, 600) === 600, 'Retry-After wins when larger');

// ---------------------------------------------------------------- OAuth + send (mocked network)
const sa = wp.parseServiceAccount(JSON.stringify(SA));
let oauthCalls = 0; const sent = [];
const fakeFetch = async (url, init) => {
  if (url.startsWith('https://oauth2.googleapis.com')) {
    oauthCalls += 1;
    const assertion = new URLSearchParams(init.body).get('assertion');
    const [, claim] = assertion.split('.');
    const c2 = JSON.parse(Buffer.from(claim, 'base64url').toString());
    ok(c2.iss === SA.client_email && c2.scope.includes('firebase.messaging'), 'JWT assertion signed for the service account + FCM scope');
    return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
  }
  sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
  const tok = JSON.parse(init.body).message.token;
  if (tok === 'dead') return new Response(err('NOT_FOUND', 'UNREGISTERED'), { status: 404 });
  if (tok === 'net') throw new TypeError('fetch failed');
  return new Response('{"name":"projects/x/messages/1"}', { status: 200 });
};
const ctx = { message_id: 'm', tenant_id: 't', environment: 'production' };
r = await wp.sendFcm(sa, 'alive', c, ctx, { fetchFn: fakeFetch });
ok(r.outcome === 'delivered', 'send → delivered');
ok(sent[0].url === 'https://fcm.googleapis.com/v1/projects/marbee-dev-push/messages:send' && sent[0].auth === 'Bearer ya29.test', 'FCM v1 endpoint + bearer token');
r = await wp.sendFcm(sa, 'dead', c, ctx, { fetchFn: fakeFetch });
ok(r.outcome === 'invalid_token', 'expired token comes back as invalid_token');
r = await wp.sendFcm(sa, 'net', c, ctx, { fetchFn: fakeFetch });
ok(r.outcome === 'retry' && /Network/.test(r.error), 'network failure → retry, never throws');
ok(oauthCalls === 1, 'OAuth token cached across sends');
await wp.getFcmAccessToken(sa, { fetchFn: fakeFetch, force: true });
ok(oauthCalls === 2, 'force refresh fetches a new token');
const badOauth = async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }), { status: 400 });
wp.forgetFcmAccessToken(sa);
r = await wp.sendFcm(sa, 'alive', c, ctx, { fetchFn: badOauth });
ok(r.outcome === 'failed' && /invalid_grant/.test(r.error), 'revoked key → failed (no endless retries)');

// ---------------------------------------------------------------- loading + re-sealing the key
const store = { secret: JSON.stringify(SA) }; let updates = 0;
const fakeDb = {
  from: () => {
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: store.secret ? { secret: store.secret } : null, error: null }),
      update: (v) => { updates += 1; store.secret = v.secret; return { eq: async () => ({ error: null }) }; },
    };
    return q;
  },
};
const box = {
  isSealed: (s) => s.startsWith('mbs1.'),
  sealSecret: async (s) => `mbs1.${Buffer.from(s).toString('base64')}`,
  openSecret: async (s) => (s.startsWith('mbs1.') ? Buffer.from(s.slice(5), 'base64').toString() : s),
};
let raw = await wp.loadServiceAccountJson(fakeDb, { id: 'p1', credentials_encrypted: null }, box);
ok(JSON.parse(raw).project_id === 'marbee-dev-push' && store.secret.startsWith('mbs1.') && updates === 1, 'legacy plaintext key is returned and re-sealed');
raw = await wp.loadServiceAccountJson(fakeDb, { id: 'p1', credentials_encrypted: null }, box);
ok(JSON.parse(raw).project_id === 'marbee-dev-push' && updates === 1, 'sealed key opens without rewriting');
store.secret = null;
raw = await wp.loadServiceAccountJson(fakeDb, { id: 'p1', credentials_encrypted: '{}' }, box);
ok(raw === null, 'no key anywhere → null');
raw = await wp.loadServiceAccountJson(fakeDb, { id: 'p1', credentials_encrypted: JSON.stringify(SA) }, box);
ok(raw && JSON.parse(raw).type === 'service_account', 'before sql/95 runs: falls back to the old column');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
