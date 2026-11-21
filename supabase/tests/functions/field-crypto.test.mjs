// Server field-crypto (Deno module) vs browser crypto-vault: same format both ways.
// Run: node supabase/tests/functions/field-crypto.test.mjs
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
globalThis.Deno = { env: { get: () => undefined } };
const server = await import('../../functions/_shared/field-crypto.ts');
const browser = await import('../../../apps/web/src/lib/crypto-vault.ts');

const key = server.generateDataKey();
const data = { email: 'asha@example.test', phone: '+91 98765 43210', consent: true, plan: { tier: 'gold' }, untouched: 'visible' };
const fields = ['email', 'phone', 'consent', 'plan'];

const enc = await server.encryptFieldsWithKey(data, fields, key);
ok(fields.every((f) => String(enc[f]).startsWith('mbe1.')), 'server encrypts every selected field into an mbe1 envelope');
ok(enc.untouched === 'visible', 'unselected fields stay as they are');
ok(!JSON.stringify(enc).includes('asha@example.test'), 'no plaintext personal data in the stored payload');
ok(JSON.stringify(await browser.decryptFields(enc, fields, key)) === JSON.stringify(data), 'BROWSER decrypts what the SERVER encrypted (same format)');
const encB = await browser.encryptFields(data, fields, key);
ok(JSON.stringify(await server.decryptFieldsWithKey(encB, fields, key)) === JSON.stringify(data), 'SERVER decrypts what the BROWSER encrypted (existing data stays readable)');
ok(JSON.stringify(await server.encryptFieldsWithKey(enc, fields, key)) === JSON.stringify(enc), 'already-encrypted fields are not double-encrypted');
const other = server.generateDataKey();
ok((await server.decryptFieldsWithKey(enc, ['email'], other)).email === '[decryption failed]', 'a different key cannot read the data');
ok(await server.dataKeyFingerprint(key) === await browser.keyFingerprint(key), 'fingerprints match the browser format');
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
