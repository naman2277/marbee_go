// Tests supabase/functions/_shared/secret-box.ts in Node (WebCrypto + a Deno.env shim).
// Run: node supabase/tests/functions/secret-box.test.mjs
import { randomBytes } from 'node:crypto';
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const env = { MARBEE_SECRETS_KEY: randomBytes(32).toString('base64') };
globalThis.Deno = { env: { get: (k) => env[k] } };
const box = await import('../../functions/_shared/secret-box.ts');

const secret = 'sk-test-THIS-IS-A-FAKE-KEY-1234';
const sealed = await box.sealSecret(secret);
ok(sealed.startsWith('mbs1.') && sealed.split('.').length === 3, 'sealed value has the mbs1 envelope');
ok(!sealed.includes(secret) && !sealed.includes('1234'), 'sealed value contains no plaintext');
ok(await box.openSecret(sealed) === secret, 'round trip returns the original');
ok(await box.sealSecret(secret) !== sealed, 'same secret sealed twice gives different ciphertext (random IV)');
ok(await box.openSecret('sk-legacy-plaintext-key') === 'sk-legacy-plaintext-key', 'legacy plaintext passes through (re-sealed by caller)');
ok(await box.openSecret('') === null && await box.openSecret(null) === null, 'empty / null → null');
const parts = sealed.split('.');
const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}AAA=`;
try { await box.openSecret(tampered); ok(false, 'tampered ciphertext must throw'); } catch { ok(true, 'tampered ciphertext is rejected'); }
env.MARBEE_SECRETS_KEY = randomBytes(32).toString('base64');
try { await box.openSecret(sealed); ok(false, 'wrong master key must throw'); } catch { ok(true, 'a different master key cannot open it'); }
env.MARBEE_SECRETS_KEY = '';
try { await box.sealSecret('x'); ok(false, 'missing master key must throw'); } catch (e) { ok(/MARBEE_SECRETS_KEY/.test(e.message), 'missing MARBEE_SECRETS_KEY → clear error, nothing stored'); }
ok(box.last4(secret) === '1234' && box.last4('abc') === '', 'last4 shows only the last 4 characters');
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
