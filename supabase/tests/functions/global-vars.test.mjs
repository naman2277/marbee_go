// Tests for _shared/global-vars.ts — legacy (pre-SEC-05) values are refused, never leaked.
// Run: node supabase/tests/functions/global-vars.test.mjs
import { registerHooks } from 'node:module';
import { webcrypto } from 'node:crypto';

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
const KEY = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
globalThis.Deno = { env: { get: (k) => (k === 'MARBEE_SECRETS_KEY' ? KEY : undefined) } };

const box = await import('../../functions/_shared/secret-box.ts');
const { loadVariablePlaintext } = await import('../../functions/_shared/global-vars.ts');

const row = (kind, value, scopes = ['all']) => ({
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'v1', kind, value, scopes }, error: null }) }) }) }) }),
    update: () => ({ eq: () => Promise.resolve({ error: null }), then: (r) => r({ error: null }) }),
  }),
});
const sealed = await box.sealSecret('s3cret-value');
const LEGACY = 'mbe1.aXY=.Y2lwaGVydGV4dA==';

const a = await loadVariablePlaintext(row('secret', sealed), 't', 'production', 'X', 'forms');
ok(a?.plaintext === 's3cret-value', 'sealed secret opens to its value');
ok(await loadVariablePlaintext(row('secret', LEGACY), 't', 'production', 'X', 'forms') === null, 'legacy mbe1 secret is refused (not returned as plaintext)');
ok(await loadVariablePlaintext(row('encryption_key', LEGACY), 't', 'production', 'X', 'forms') === null, 'legacy mbe1 encryption key is refused');
ok(await loadVariablePlaintext(row('secret', 'raw-unsealed-text'), 't', 'production', 'X', 'forms') === null, 'any unsealed secret is refused');
const p = await loadVariablePlaintext(row('plain', 'https://api.example.test'), 't', 'production', 'X', 'forms');
ok(p?.plaintext === 'https://api.example.test', 'plain variables still resolve');
ok(await loadVariablePlaintext(row('secret', sealed, ['webhooks']), 't', 'production', 'X', 'forms') === null, 'scope check still applies');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
