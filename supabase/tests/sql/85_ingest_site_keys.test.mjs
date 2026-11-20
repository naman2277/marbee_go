// Regression test for supabase/sql/85_ingest_site_keys.sql — runs on PGlite (real Postgres in WASM).
// Run: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const script = readFileSync(process.argv[2], 'utf8');
const db = new PGlite();
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures += 1; };
const one = async (q, p) => (await db.query(q, p)).rows[0];
const resolve = async (site, key, origin) =>
  (await one('SELECT resolve_ingest_site($1, $2, $3) AS r', [site, key, origin])).r;

await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE TABLE public.api_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, environment text,
    key_prefix text, key_hash text, scopes text[], expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz);
  -- pgcrypto isn't in PGlite: stub crypt() so 'right-key' matches its stored "hash".
  CREATE FUNCTION crypt(p text, salt text) RETURNS text LANGUAGE sql IMMUTABLE AS
    $$ SELECT CASE WHEN p = 'mk_live_right-key-0001' THEN 'HASH1' ELSE 'nope' END $$;
  -- the original 46 definition: STABLE with an UPDATE inside (the bug)
  CREATE FUNCTION public.verify_api_key(p_raw_key TEXT)
  RETURNS TABLE (key_id UUID, tenant_id UUID, environment TEXT, scopes TEXT[])
  LANGUAGE plpgsql STABLE AS $$
  DECLARE v_row public.api_keys%ROWTYPE;
  BEGIN
    FOR v_row IN SELECT * FROM public.api_keys ak WHERE ak.key_prefix = left(trim(p_raw_key), 8) LOOP
      IF v_row.key_hash = crypt(trim(p_raw_key), v_row.key_hash) THEN
        UPDATE public.api_keys SET last_used_at = NOW() WHERE id = v_row.id;
        RETURN QUERY SELECT v_row.id, v_row.tenant_id, v_row.environment, v_row.scopes; RETURN;
      END IF;
    END LOOP;
  END; $$;
  INSERT INTO api_keys (tenant_id, environment, key_prefix, key_hash, scopes)
    VALUES ('11111111-1111-1111-1111-111111111111', 'production', 'mk_live_', 'HASH1', ARRAY['events:write']);
  CREATE TABLE public.web_analytics_sites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, environment text,
    site_id text, name text, domain text, allowed_origins text[] DEFAULT '{}', write_key text, status text);
  INSERT INTO web_analytics_sites (tenant_id, environment, site_id, name, domain, allowed_origins, write_key, status) VALUES
    ('11111111-1111-1111-1111-111111111111', 'production', 'site_aaaa1111', 'A', 'shop-a.test', ARRAY['localhost:5173', '*.cdn-a.test'], 'mb_live_keyA_12345', 'active'),
    ('22222222-2222-2222-2222-222222222222', 'production', 'site_bbbb2222', 'B', 'https://shop-b.test/', '{}', 'mb_live_keyB_12345', 'paused'),
    ('33333333-3333-3333-3333-333333333333', 'staging',    'site_cccc3333', 'C', 'shop-c.test', '{}', 'mb_live_keyC_12345', 'pending_verification');
`);

// Bug reproduction on the ORIGINAL function
try { await db.query(`SELECT * FROM verify_api_key('mk_live_right-key-0001')`); ok(false, 'original STABLE verify_api_key should fail'); }
catch (e) { ok(/non-volatile/.test(e.message), `original verify_api_key fails on a valid key → "${e.message}"`); }

await db.exec(script);
await db.exec(script);
ok(true, 'script runs twice without error');

// verify_api_key fixed
let k = await one(`SELECT * FROM verify_api_key('mk_live_right-key-0001')`);
ok(k?.tenant_id === '11111111-1111-1111-1111-111111111111', 'valid API key now resolves to its tenant');
ok((await one(`SELECT last_used_at FROM api_keys`)).last_used_at !== null, 'last_used_at recorded');
k = await one(`SELECT * FROM verify_api_key('mk_live_wrong-key-0002')`);
ok(k === undefined, 'wrong API key returns nothing');

// Site keys
let r = await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'https://shop-a.test');
ok(r.ok && r.tenant_id === '11111111-1111-1111-1111-111111111111' && r.environment === 'production', 'valid key from site domain → tenant from site row');
ok((await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'https://www.shop-a.test')).ok, 'www. variant of domain allowed');
ok((await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'http://localhost:5173')).ok, 'explicit allowed origin (with port) allowed');
ok(!(await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'http://localhost:9999')).ok, 'same host, different port refused');
ok((await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'https://img.cdn-a.test')).ok, 'wildcard subdomain allowed');
ok(!(await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'https://cdn-a.test')).ok, 'wildcard does not match the apex');
r = await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'https://evil.test');
ok(!r.ok && r.reason === 'origin_not_allowed', 'other website using the key refused (origin_not_allowed)');
ok(!(await resolve('site_aaaa1111', 'mb_live_keyA_12345', 'https://shop-a.test.evil.test')).ok, 'look-alike suffix domain refused');
ok((await resolve('site_aaaa1111', 'mb_live_keyA_12345', null)).ok, 'server-side call (no Origin) allowed with valid key');
r = await resolve('site_aaaa1111', 'mb_live_WRONG_12345', 'https://shop-a.test');
ok(!r.ok && r.reason === 'invalid_key', 'wrong write key refused');
r = await resolve('site_zzzz9999', 'mb_live_keyA_12345', 'https://shop-a.test');
ok(!r.ok && r.reason === 'invalid_key', 'unknown site refused with the SAME reason (no enumeration)');
r = await resolve('site_bbbb2222', 'mb_live_keyB_12345', 'https://shop-b.test');
ok(!r.ok && r.reason === 'site_paused', 'paused site refused');
r = await resolve('site_cccc3333', 'mb_live_keyC_12345', 'https://shop-c.test');
ok(r.ok && r.environment === 'staging', 'pending_verification site accepted, environment from site row');
ok(!(await resolve('x', 'y', null)).ok, 'too-short inputs refused');

// Uniqueness
try { await db.query(`INSERT INTO web_analytics_sites (tenant_id, environment, site_id, name, domain, write_key, status) VALUES ('22222222-2222-2222-2222-222222222222','production','site_aaaa1111','dup','x.test','k_123456789','active')`); ok(false, 'duplicate site_id must be rejected'); }
catch (e) { ok(/unique|duplicate/i.test(e.message), 'another tenant cannot register the same site_id'); }

// Privileges
for (const role of ['anon', 'authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  try { await db.query(`SELECT resolve_ingest_site('site_aaaa1111','mb_live_keyA_12345',null)`); ok(false, `${role} must not call resolve_ingest_site`); }
  catch (e) { ok(/permission denied/.test(e.message), `${role} cannot call resolve_ingest_site`); }
  try { await db.query(`SELECT * FROM verify_api_key('mk_live_right-key-0001')`); ok(false, `${role} must not call verify_api_key`); }
  catch (e) { ok(/permission denied/.test(e.message), `${role} cannot call verify_api_key`); }
  await db.exec('RESET ROLE');
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
