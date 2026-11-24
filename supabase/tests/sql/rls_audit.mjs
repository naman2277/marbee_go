// Build the full chain on PGlite (via dryrun_chain stand-ins) and list public tables
// that have no RLS, or RLS with no policies. Usage: node supabase/tests/sql/rls_audit.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 'await db.exec(`'.length, src.indexOf('`);', src.indexOf('await db.exec(`')));
const db = new PGlite();
await db.exec(stub);
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
for (const f of readdirSync('supabase/sql').filter((f) => /^\d+_.*\.sql$/.test(f) && !/^0[03]_/.test(f)).sort()) {
  try { await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8'))); } catch (e) { console.log(`(chain error in ${f}: ${e.message.split('\n')[0]})`); try { await db.exec('ROLLBACK'); } catch {} }
}
const r = await db.query(`
  SELECT c.relname AS table, c.relrowsecurity AS rls,
         (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
         EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema='public' AND k.table_name=c.relname AND k.column_name='tenant_id') AS has_tenant_id,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_select
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  ORDER BY c.relname`);
const noRls = r.rows.filter((x) => !x.rls);
const noPolicies = r.rows.filter((x) => x.rls && Number(x.policies) === 0);
console.log(`tables: ${r.rows.length} | RLS on: ${r.rows.length - noRls.length} | RLS OFF: ${noRls.length} | RLS on but 0 policies: ${noPolicies.length}\n`);
console.log('RLS OFF (open to the API unless privileges are revoked):');
for (const x of noRls) console.log(`  ${x.table}${x.has_tenant_id ? '  [tenant data]' : ''}`);
console.log('\nRLS on, no policies (service-role only — fine if intended):');
for (const x of noPolicies) console.log(`  ${x.table}${x.has_tenant_id ? '  [tenant data]' : ''}`);
