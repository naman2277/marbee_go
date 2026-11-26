-- Web Push load test — STEP 3: remove everything the test created (DEV ONLY).
-- Safe to run more than once. Touches only rows tied to loadtest@marbee.test / loadtest-* tokens.

do $$
declare v_customers uuid[];
begin
  -- Only the test customer(s) this test created — every step below is scoped to them.
  select array_agg(id) into v_customers from public.customers
  where email = 'loadtest@marbee.test' and first_name = 'Load Test';

  -- Stop any remaining sends first.
  update public.web_push_outbox set status = 'skipped', last_error = 'load test cleanup', locked_until = null
  where idempotency_key = 'loadtest-1' and customer_id = any (coalesce(v_customers, '{}'))
    and status in ('queued', 'sending');

  delete from public.engagement_log where customer_id = any (coalesce(v_customers, '{}'));
  delete from public.customer_delivery_log where customer_id = any (coalesce(v_customers, '{}'));
  delete from public.channel_endpoints where subscriber_id in
    (select id from public.web_push_subscribers
     where customer_id = any (coalesce(v_customers, '{}')) and fcm_token like 'loadtest-%');
  delete from public.web_push_subscribers                                      -- outbox rows go with them
  where customer_id = any (coalesce(v_customers, '{}')) and fcm_token like 'loadtest-%';
  delete from public.web_push_outbox
  where idempotency_key = 'loadtest-1' and customer_id = any (coalesce(v_customers, '{}'));
  delete from public.customers where id = any (coalesce(v_customers, '{}'));
end $$;

select
  (select count(*) from public.web_push_subscribers s join public.customers c on c.id = s.customer_id
    where c.email = 'loadtest@marbee.test' and c.first_name = 'Load Test' and s.fcm_token like 'loadtest-%')            as fake_devices_left,
  (select count(*) from public.customers where email = 'loadtest@marbee.test' and first_name = 'Load Test') as test_customers_left,
  (select count(*) from public.web_push_outbox o join public.customers c on c.id = o.customer_id
    where c.email = 'loadtest@marbee.test' and c.first_name = 'Load Test' and o.idempotency_key = 'loadtest-1')         as outbox_rows_left;
