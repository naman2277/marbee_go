-- Web Push load test — STEP 2: progress and throughput. Run every minute until "left" = 0.

select
  count(*)                                                          as total,
  count(*) filter (where status in ('queued', 'sending'))           as left,
  count(*) filter (where status not in ('queued', 'sending'))       as done,
  count(*) filter (where status = 'delivered')                      as delivered,
  count(*) filter (where status = 'failed')                         as failed_or_pruned,
  count(*) filter (where status = 'queued' and attempts > 0)        as waiting_retry,
  min(created_at)::time(0)                                          as queued_at,
  max(updated_at) filter (where status not in ('queued', 'sending'))::time(0) as last_done_at,
  round(extract(epoch from (max(updated_at) filter (where status not in ('queued', 'sending')) - min(created_at)))::numeric, 1) as seconds_so_far,
  round(count(*) filter (where status not in ('queued', 'sending')) * 60.0
        / nullif(extract(epoch from (max(updated_at) filter (where status not in ('queued', 'sending')) - min(created_at))), 0)) as pushes_per_minute,
  (select count(*) from public.web_push_outbox
    where idempotency_key = 'loadtest-1' and status = 'sending' and locked_until > now()) / 250 + 1 as workers_busy_approx,
  (select left(string_agg(distinct last_error, ' | '), 200) from public.web_push_outbox
    where idempotency_key = 'loadtest-1' and last_error is not null) as errors_seen
from public.web_push_outbox
where idempotency_key = 'loadtest-1'
  and customer_id in (select id from public.customers where email = 'loadtest@marbee.test' and first_name = 'Load Test');
