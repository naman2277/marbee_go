// Build 01..89 on PGlite; prove app users can't read/write AI keys while the settings page still works.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 15, src.indexOf('`);', src.indexOf('await db.exec(`')));
const db = new PGlite();
await db.exec(stub);
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
const files = readdirSync('supabase/sql').filter((f) => /^\d+_.*\.sql$/.test(f) && !/^0[03]_/.test(f)).sort();
for (const f of files.filter((f) => f < '89_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const T = 'aaaaaaaa-0000-0000-0000-00000000000a', U = 'a1a1a1a1-0000-0000-0000-0000000000a1', R = 'aaaaaaaa-0000-0000-0000-0000000000a1';
await db.exec(`INSERT INTO tenants (id, name, slug) VALUES ('${T}','A','tenant-a');
  INSERT INTO auth.users (id, email) VALUES ('${U}','a@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES ('${R}','${T}','Admin','admin-a');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES ('${T}','${U}','${R}','active');
  INSERT INTO ai_engine_providers (tenant_id, environment, provider, provider_name, model_name, api_key_encrypted, is_default)
    VALUES ('${T}','production','openai','OpenAI','gpt-4o-mini','sk-legacy-plaintext-abcd1234', true);`);
const asUser = async (sql) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`RESET ROLE`); }
};
let r = await asUser(`SELECT api_key_encrypted FROM ai_engine_providers`);
ok(r.rows[0]?.api_key_encrypted === 'sk-legacy-plaintext-abcd1234', 'BEFORE 89: any member can read the raw key (the hole)');

await db.exec(strip(readFileSync('supabase/sql/89_ai_provider_keys_server_only.sql', 'utf8')));
await db.exec(strip(readFileSync('supabase/sql/89_ai_provider_keys_server_only.sql', 'utf8')));
ok(true, '89 runs (twice)');
try { await asUser(`SELECT api_key_encrypted FROM ai_engine_providers`); ok(false, 'reading the key must fail'); }
catch (e) { ok(/permission denied/.test(e.message), 'AFTER 89: members cannot read the key column'); }
try { await asUser(`SELECT * FROM ai_engine_providers`); ok(false, 'select * must fail (includes key)'); }
catch (e) { ok(/permission denied/.test(e.message), 'AFTER 89: SELECT * is refused too (app must list columns)'); }
r = await asUser(`SELECT provider, model_name, api_key_last4, status FROM ai_engine_providers`);
ok(r.rows.length === 1 && r.rows[0].api_key_last4 === '1234', 'members still see provider settings + last 4 characters');
try { await asUser(`UPDATE ai_engine_providers SET api_key_encrypted = 'sk-evil' WHERE tenant_id = '${T}'`); ok(false, 'writing the key must fail'); }
catch (e) { ok(/permission denied/.test(e.message), 'members cannot write the key column (only the gateway can)'); }
try {
  await asUser(`INSERT INTO ai_engine_providers (tenant_id, environment, provider, provider_name, model_name, status, temperature, max_tokens, is_default)
    VALUES ('${T}','production','gemini','Gemini','gemini-2.0-flash','unconfigured', 0.7, 2048, false)
    ON CONFLICT (tenant_id, environment, provider, model_name) DO UPDATE SET status = EXCLUDED.status, temperature = EXCLUDED.temperature`);
  ok(true, 'settings page can still create/update models (without the key column)');
} catch (e) { ok(false, `model upsert failed → ${e.message}`); }
await db.exec('SET ROLE service_role');
r = await db.query(`SELECT api_key_encrypted FROM ai_engine_providers WHERE provider = 'openai'`);
ok(r.rows[0].api_key_encrypted.startsWith('sk-legacy'), 'service role (edge functions) can still read it');
await db.exec('RESET ROLE');
for (const f of files.filter((f) => f > '89_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
