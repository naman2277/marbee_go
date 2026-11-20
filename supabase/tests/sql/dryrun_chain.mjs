// Dry-run the numbered SQL chain on PGlite with Supabase stand-ins (auth, storage, extensions).
// Usage: node supabase/tests/sql/dryrun_chain.mjs [--from NN] [--stop-on-error] [--twice]
// Reports the first error per script. Stand-ins mean a PASS here is necessary, not sufficient.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const DIR = 'supabase/sql';
const stopOnError = process.argv.includes('--stop-on-error');
const db = new PGlite();
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE ROLE supabase_auth_admin NOLOGIN; CREATE ROLE postgres_stub NOLOGIN;
  CREATE PUBLICATION supabase_realtime; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions; CREATE SCHEMA vault; CREATE SCHEMA net;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}',
    raw_app_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(), email_confirmed_at timestamptz,
    encrypted_password text, last_sign_in_at timestamptz, banned_until timestamptz, deleted_at timestamptz);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
  CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint,
    allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), owner uuid);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid,
    metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), path_tokens text[]);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
  CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
  -- pgcrypto stand-ins (in both public and extensions, as on Supabase)
  CREATE FUNCTION extensions.gen_salt(text) RETURNS text LANGUAGE sql AS $$ SELECT 'salt' $$;
  CREATE FUNCTION extensions.crypt(text, text) RETURNS text LANGUAGE sql AS $$ SELECT md5($1) $$;
  CREATE FUNCTION extensions.digest(text, text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5($1), 'hex') $$;
  CREATE FUNCTION extensions.gen_random_bytes(int) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5(random()::text), 'hex') $$;
  CREATE FUNCTION public.gen_salt(text) RETURNS text LANGUAGE sql AS $$ SELECT 'salt' $$;
  CREATE FUNCTION public.crypt(text, text) RETURNS text LANGUAGE sql AS $$ SELECT md5($1) $$;
  CREATE FUNCTION public.digest(text, text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5($1), 'hex') $$;
  CREATE FUNCTION public.gen_random_bytes(int) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5(random()::text), 'hex') $$;
  CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
  CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
`);
const strip = (sql) => sql
  .replace(/CREATE\s+EXTENSION[^;]*;/gi, '-- (extension skipped in dry-run);')
  .replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, '-- (default privileges skipped);');
const files = readdirSync(DIR).filter((f) => /^\d+_.*\.sql$/.test(f) && !/^00_/.test(f)).sort();
const from = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : null;
let bad = 0;
const passes = process.argv.includes('--twice') ? 2 : 1;
// --twice re-runs the whole chain on the same database: every script must be safe to re-run.
for (let pass = 1; pass <= passes; pass += 1) {
  if (passes > 1) console.log(`\n--- pass ${pass} ---`);
  for (const f of files) {
    if (from && f < from) continue;
    // 03 links a real user by email — not meaningful in a dry-run.
    if (f.startsWith('03_')) { console.log(`skip  ${f} (links a real user by email)`); continue; }
    try {
      await db.exec(strip(readFileSync(`${DIR}/${f}`, 'utf8')));
      console.log(`ok    ${f}`);
    } catch (e) {
      bad += 1;
      try { await db.exec('ROLLBACK'); } catch { /* no open transaction */ }
      console.log(`ERROR ${f} (pass ${pass}) → ${String(e.message).split('\n')[0]}`);
      if (stopOnError) break;
    }
  }
}
console.log(bad ? `\n${bad} script(s) failed` : '\nALL SCRIPTS RAN');
