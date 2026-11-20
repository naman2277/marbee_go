// Regression test for supabase/sql/12_lock_table_name_after_publish.sql (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const script = readFileSync(process.argv[2], 'utf8');
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const fresh = async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE public.schema_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
    environment text, slug text, table_name text, is_system boolean DEFAULT false, current_version int DEFAULT 0);`);
  return db;
};
// The dev project's situation: system schemas share real_time_triggers across tenants/environments.
let db = await fresh();
await db.exec(`INSERT INTO schema_definitions (environment, slug, table_name, is_system) VALUES
  ('production','rtt','real_time_triggers',true), ('staging','rtt','real_time_triggers',true),
  ('production','acme','cs_acme_orders',false);`);
try { await db.exec(script); await db.exec(script); ok(true, 'runs (twice) with shared system tables present'); }
catch (e) { ok(false, `failed with shared system tables → ${e.message}`); }
try { await db.exec(`INSERT INTO schema_definitions (environment, slug, table_name) VALUES ('production','evil','cs_acme_orders')`); ok(false, 'second owner of a cs_ table must be rejected'); }
catch (e) { ok(/unique|duplicate/i.test(e.message), 'second schema claiming the same cs_ table is rejected'); }
try { await db.exec(`INSERT INTO schema_definitions (environment, slug, table_name, is_system) VALUES ('development','rtt','real_time_triggers',true)`); ok(true, 'another system schema on a shared table is allowed'); }
catch (e) { ok(false, `system schema insert failed → ${e.message}`); }
try { await db.exec(`UPDATE schema_definitions SET table_name='cs_renamed' WHERE slug='acme'`); }
catch { /* not published yet (current_version 0) so rename allowed */ }
await db.exec(`UPDATE schema_definitions SET current_version = 1 WHERE slug IN ('acme')`);
try { await db.exec(`UPDATE schema_definitions SET table_name='cs_other' WHERE slug='acme'`); ok(false, 'rename after publish must be blocked'); }
catch (e) { ok(/cannot be changed after publish/.test(e.message), 'table rename after publish blocked'); }
// Pre-existing duplicate custom tables → clear error, nothing created.
db = await fresh();
await db.exec(`INSERT INTO schema_definitions (environment, slug, table_name) VALUES ('production','a','cs_dup'),('production','b','cs_dup')`);
try { await db.exec(script); ok(false, 'duplicate cs_ owners must stop the script'); }
catch (e) { ok(/claimed by more than one schema: cs_dup/.test(e.message), 'duplicate cs_ owners → clear error message'); }
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
