// Tests for _shared/webhook-sig.ts and _shared/tenant-guard.ts (SEC-18 / TD-12b).
// Run: node supabase/tests/functions/tenant-guard.test.mjs
import { registerHooks } from 'node:module';
import { createHmac } from 'node:crypto';

// Remote (esm.sh) imports can't load in Node: stub them; the tests pass fake clients anyway.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('https://')) {
      return { url: 'data:text/javascript,export const createClient = () => ({});', shortCircuit: true };
    }
    return next(specifier, context);
  },
});

let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const SERVICE_KEY = 'service-role-key-for-tests-0123456789';
globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? SERVICE_KEY : undefined) } };

const sig = await import('../../functions/_shared/webhook-sig.ts');
const guard = await import('../../functions/_shared/tenant-guard.ts');
const { AuthError } = await import('../../functions/_shared/auth.ts');

// ---------------------------------------------------------------- HMAC
const secret = 'whsec_test_secret';
const body = '{"event":"order.created","id":42}';
const hex256 = createHmac('sha256', secret).update(body).digest('hex');
const b64256 = createHmac('sha256', secret).update(body).digest('base64');
const hex512 = createHmac('sha512', secret).update(body).digest('hex');
ok(await sig.verifyHmacSignature(secret, body, 'SHA256', hex256), 'HMAC: bare hex accepted');
ok(await sig.verifyHmacSignature(secret, body, 'SHA256', hex256.toUpperCase()), 'HMAC: upper-case hex accepted');
ok(await sig.verifyHmacSignature(secret, body, 'SHA256', `sha256=${hex256}`), 'HMAC: GitHub-style "sha256=" prefix accepted');
ok(await sig.verifyHmacSignature(secret, body, 'SHA256', b64256), 'HMAC: base64 accepted');
ok(await sig.verifyHmacSignature(secret, body, 'SHA512', hex512), 'HMAC: SHA-512 accepted');
ok(await sig.verifyHmacSignature(secret, new TextEncoder().encode(body), 'SHA256', hex256), 'HMAC: raw bytes body accepted');
ok(!(await sig.verifyHmacSignature(secret, body + ' ', 'SHA256', hex256)), 'HMAC: tampered body rejected');
ok(!(await sig.verifyHmacSignature('other-secret', body, 'SHA256', hex256)), 'HMAC: wrong secret rejected');
ok(!(await sig.verifyHmacSignature(secret, body, 'SHA256', 'present-but-garbage')), 'HMAC: a merely present header is rejected (old bug)');
ok(!(await sig.verifyHmacSignature(secret, body, 'SHA256', '')), 'HMAC: empty signature rejected');
ok(!(await sig.verifyHmacSignature('', body, 'SHA256', hex256)), 'HMAC: no configured secret rejected');
ok(!(await sig.verifyHmacSignature(secret, body, 'SHA512', hex256)), 'HMAC: algorithm mismatch rejected');
ok(sig.constantTimeEqual('abc', 'abc') && !sig.constantTimeEqual('abc', 'abd') && !sig.constantTimeEqual('abc', 'abcd'), 'constantTimeEqual basics');

// ---------------------------------------------------------------- service caller
const req = (auth) => new Request('https://x.test', { headers: auth ? { authorization: auth } : {} });
ok(guard.isServiceCaller(req(`Bearer ${SERVICE_KEY}`)), 'service caller: service key accepted');
ok(!guard.isServiceCaller(req('Bearer some-user-jwt')), 'service caller: other token rejected');
ok(!guard.isServiceCaller(req(`Bearer ${SERVICE_KEY}x`)), 'service caller: near-miss rejected');
ok(!guard.isServiceCaller(req()), 'service caller: no header rejected');

// ---------------------------------------------------------------- tenant checks (fake client)
const fake = ({ active = true, rpcError = false, user = 'u1', perms = [] } = {}) => ({
  rpc: async (fn, args) => {
    if (rpcError) return { data: null, error: { message: 'db down' } };
    if (fn === 'tenant_is_active') return { data: active, error: null };
    if (fn === 'user_has_permission_as') return { data: active && perms.includes(args.p_permission), error: null };
    return { data: null, error: { message: 'unknown rpc' } };
  },
  auth: { getUser: async () => (user ? { data: { user: { id: user } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
});
const status = async (p) => { try { await p; return 'ok'; } catch (e) { return e instanceof AuthError ? e.status : 'other'; } };

ok(await guard.tenantIsActive(fake(), 't1') === true, 'tenantIsActive: active → true');
ok(await guard.tenantIsActive(fake({ active: false }), 't1') === false, 'tenantIsActive: suspended → false');
ok(await status(guard.tenantIsActive(fake({ rpcError: true }), 't1')) === 503, 'tenantIsActive: DB error fails CLOSED (503)');
ok(await status(guard.assertTenantActive(fake({ active: false }), 't1')) === 403, 'assertTenantActive: suspended → 403');
ok(await status(guard.assertTenantActive(fake(), 't1')) === 'ok', 'assertTenantActive: active passes');

const signed = req('Bearer user-jwt');
ok(await status(guard.requireMemberWithPermission(fake(), req(), 't1', ['content.manage'])) === 401, 'member check: not signed in → 401');
ok(await status(guard.requireMemberWithPermission(fake({ user: null }), signed, 't1', ['content.manage'])) === 401, 'member check: bad session → 401');
ok(await status(guard.requireMemberWithPermission(fake({ perms: [] }), signed, 't1', ['content.manage'])) === 403, 'member check: no permission → 403');
ok(await status(guard.requireMemberWithPermission(fake({ perms: ['settings.manage'] }), signed, 't1', ['journeys.publish', 'settings.manage'])) === 'ok', 'member check: any listed permission passes');
ok(await status(guard.requireMemberWithPermission(fake({ active: false, perms: ['content.manage'] }), signed, 't1', ['content.manage'])) === 403, 'member check: suspended workspace → 403');
ok(await status(guard.requireMemberWithPermission(fake({ rpcError: true }), signed, 't1', ['content.manage'])) === 503, 'member check: DB error fails CLOSED (503)');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
