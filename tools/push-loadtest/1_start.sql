-- Web Push load test — STEP 1: create fake devices and send one blast (DEV ONLY).
--
-- Creates 20,000 fake browsers under one test customer in the workspace that owns the
-- default Firebase provider, then queues one push to all of them. Firebase rejects fake
-- tokens as fast as real ones, so the timings are realistic and nobody receives anything.
-- Each fake device is then marked invalid by the normal pruning. Clean up with 3_cleanup.sql.
-- Change v_devices below for a bigger/smaller test (max 100,000 = the daily cap).

do $$
declare
  v_devices  int := 20000;
  v_tenant   uuid;
  v_env      text;
  v_customer uuid;
begin
  select tenant_id, environment into v_tenant, v_env
  from public.channel_providers
  where channel = 'web_push' and is_default and status = 'active'
  order by updated_at desc limit 1;
  if v_tenant is null then raise exception 'No default Web Push provider found'; end if;

  if exists (select 1 from public.web_push_subscribers where fcm_token like 'loadtest-%') then
    raise exception 'A previous load test is still there — run 3_cleanup.sql first';
  end if;

  insert into public.customers (tenant_id, environment, email, first_name)
  values (v_tenant, v_env, 'loadtest@marbee.test', 'Load Test')
  returning id into v_customer;

  insert into public.web_push_subscribers (tenant_id, environment, customer_id, fcm_token, browser, os, device, subscription_status, last_seen)
  select v_tenant, v_env, v_customer,
         'loadtest-' || g || '-' || md5(random()::text) || md5(random()::text),
         'LoadTest', 'LoadTest', 'desktop', 'active', now()
  from generate_series(1, v_devices) g;

  perform public.enqueue_web_push_internal(
    v_tenant, v_env, array[v_customer], '{}'::uuid[],
    jsonb_build_object('title', 'Load test', 'body', 'Synthetic throughput test — no real device receives this.'),
    'loadtest-1', null, 'loadtest-1', 'Load test');

  raise notice 'Queued % fake devices for tenant % (%). Now run 2_measure.sql every minute.', v_devices, v_tenant, v_env;
end $$;

select count(*) as queued_for_load_test
from public.web_push_outbox where idempotency_key = 'loadtest-1';
