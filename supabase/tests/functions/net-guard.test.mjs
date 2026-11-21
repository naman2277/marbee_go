// SSRF guard tests (supabase/functions/_shared/net-guard.ts). Run: node supabase/tests/functions/net-guard.test.mjs
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
// Fake DNS so the test is deterministic and offline.
const DNS = {
  'api.example.com': { A: ['93.184.216.34'] },
  'evil-rebind.example.com': { A: ['93.184.216.34', '10.0.0.5'] },
  'sneaky.example.com': { A: ['169.254.169.254'] },
  'v6only.example.com': { AAAA: ['2606:2800:220:1::1'] },
  'v6private.example.com': { AAAA: ['fd00::1'] },
};
globalThis.Deno = { env: { get: () => undefined }, resolveDns: async (h, t) => { const r = DNS[h]?.[t]; if (!r) { const e = new Error('no records'); e.name = 'NotFound'; throw e; } return r; } };
const g = await import('../../functions/_shared/net-guard.ts');
const blocked = async (u) => { try { await g.assertPublicHttpUrl(u); return false; } catch (e) { return e instanceof g.BlockedUrlError; } };

for (const u of [
  'http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:5432', 'http://localhost:8080', 'http://10.1.2.3',
  'http://192.168.1.1', 'http://172.16.0.1', 'http://100.64.0.1', 'http://0.0.0.0', 'http://[::1]/', 'http://[fd00::1]',
  'http://[fe80::1]', 'http://[::ffff:127.0.0.1]', 'http://[::ffff:169.254.169.254]', 'http://[::ffff:7f00:1]', 'http://[64:ff9b::a9fe:a9fe]', 'http://metadata.google.internal/', 'http://db.internal',
  'http://printer.local', 'http://intranet', 'ftp://api.example.com', 'file:///etc/passwd', 'http://user:pw@api.example.com',
  'http://evil-rebind.example.com', 'http://sneaky.example.com', 'http://v6private.example.com', 'http://doesnotexist.example.com',
]) ok(await blocked(u), `blocked  ${u}`);

for (const u of ['https://api.example.com/v1/ping', 'http://api.example.com:8080/x', 'https://93.184.216.34', 'https://v6only.example.com'])
  ok(!(await blocked(u)), `allowed  ${u}`);

// Runtime where DNS lookups are not permitted: must NOT block legitimate public hosts,
// but must still block internal names / IPs.
globalThis.Deno.resolveDns = async () => { const e = new Error('Requires net access'); e.name = 'PermissionDenied'; throw e; };
ok(!(await blocked('https://api.partner.com/v1')), 'DNS unavailable: public hostname still allowed (no false blocks)');
ok(await blocked('http://169.254.169.254/') && await blocked('http://localhost/') && await blocked('http://db.internal/'), 'DNS unavailable: metadata IP, localhost, internal names still blocked');
ok(g.isPrivateAddress('172.31.255.255') && !g.isPrivateAddress('172.32.0.1'), '172.16/12 boundary handled exactly');
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
