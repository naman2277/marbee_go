// Build 01..87 on PGlite, then insert the exact records web-analytics-ingest builds (TD-19).
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
for (const f of files.filter((f) => f < '87_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const T = 'aaaaaaaa-0000-0000-0000-00000000000a';
await db.exec(`INSERT INTO tenants (id, name, slug) VALUES ('${T}','A','tenant-a')`);
const eventRow = (geoOk) => `INSERT INTO web_analytics_events (tenant_id, environment, site_id, event_id, session_id, anonymous_id,
  customer_id, event_name, url, path, hostname, referrer, page_title, user_agent, device_type, browser, os,
  country_code, country_name, city, region, ip_hash, is_bot, properties, server_timestamp)
  VALUES ('${T}','production','site_aaaaaaaaaaaa', gen_random_uuid()::text, 's1', 'a1', NULL, 'page_view',
  'http://x.test/', '/', 'x.test', NULL, 'Home', 'UA', 'desktop', 'Chrome', 'Windows',
  ${geoOk ? "'IN','India','Pune','MH','abc123'" : 'NULL, NULL, NULL, NULL, NULL'}, false, '{}', now())`;
try { await db.exec(eventRow(true)); ok(false, 'before 87 the function-shaped insert should fail'); }
catch (e) { ok(/region/.test(e.message), `before 87: insert fails → "${e.message}" (the production bug)`); }

await db.exec(strip(readFileSync('supabase/sql/87_web_analytics_schema_align.sql', 'utf8')));
await db.exec(strip(readFileSync('supabase/sql/87_web_analytics_schema_align.sql', 'utf8')));
ok(true, '87 runs (twice)');
try { await db.exec(eventRow(true)); ok(true, 'event insert with geolocation works'); } catch (e) { ok(false, `event insert failed → ${e.message}`); }
try { await db.exec(eventRow(false)); ok(true, 'event insert WITHOUT geolocation/IP works'); } catch (e) { ok(false, `no-geo insert failed → ${e.message}`); }
const session = `INSERT INTO web_analytics_sessions (tenant_id, environment, site_id, session_id, anonymous_id, start_time, end_time,
  duration_sec, active_time_sec, page_count, pages_visited, max_scroll_depth, click_count, rage_click_count, form_submit_count,
  js_error_count, converted, device_type, browser, os, country_code, country_name, city, region, referrer, utm_source, utm_medium,
  utm_campaign, landing_page, exit_page, is_bot, updated_at)
  VALUES ('${T}','production','site_aaaaaaaaaaaa','s1','a1', now() - interval '5 min', now(), 300, 240, 3, ARRAY['/','/a','/b'],
  80, 12, 0, 1, 0, true, 'desktop','Chrome','Windows', NULL, NULL, NULL, NULL, NULL, 'google','cpc','diwali','/','/b', false, now())
  ON CONFLICT (tenant_id, site_id, session_id) DO UPDATE SET duration_sec = EXCLUDED.duration_sec`;
try { await db.exec(session); await db.exec(session); ok(true, 'session upsert with every field the function sends works (and re-upserts)'); }
catch (e) { ok(false, `session upsert failed → ${e.message}`); }
for (const f of files.filter((f) => f > '87_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
