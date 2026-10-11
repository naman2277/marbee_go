-- =============================================================================
-- MARBEE v2 REVAMP — PART 59: SYNTHETIC LOAD GENERATOR (optional)
-- Run AFTER 52..58. Use ONLY on a dev / staging database.
--
--   SELECT public.marbee_generate_load(
--     p_tenants        => 1000,
--     p_customers_each => 5000,
--     p_events_each    => 20000,
--     p_days_back      => 30
--   );
--
-- Then benchmark:
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.mv_command_center_today WHERE tenant_id = '...';
--   EXPLAIN (ANALYZE, BUFFERS) SELECT id,email,updated_at FROM public.customers
--     WHERE tenant_id='...' AND environment='production' ORDER BY updated_at DESC LIMIT 50;
--
-- Cleanup:  SELECT public.marbee_purge_load();
-- =============================================================================

CREATE OR REPLACE FUNCTION public.marbee_generate_load(
  p_tenants        int DEFAULT 100,
  p_customers_each int DEFAULT 2000,
  p_events_each    int DEFAULT 5000,
  p_days_back      int DEFAULT 30
)
RETURNS TABLE (tenants int, customers bigint, events bigint, engagement bigint, elapsed interval)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_role  uuid;
  v_tid   uuid;
  v_i     int;
  v_cust  bigint := 0;
  v_evt   bigint := 0;
  v_eng   bigint := 0;
  v_event_types text[] := ARRAY['page_view','add_to_cart','cart_abandoned','purchase','login','search'];
  v_channels    text[] := ARRAY['web_push','email','sms','whatsapp'];
BEGIN
  FOR v_i IN 1 .. p_tenants LOOP
    INSERT INTO public.tenants (name, slug, plan, status)
    VALUES ('LoadTest '||v_i, 'loadtest-'||v_i||'-'||substr(md5(random()::text),1,6), 'growth', 'active')
    RETURNING id INTO v_tid;

    INSERT INTO public.roles (tenant_id, name, slug, is_system)
    VALUES (v_tid, 'Tenant Admin', 'tenant_admin', true)
    RETURNING id INTO v_role;

    INSERT INTO public.environments (tenant_id, name, is_default)
    VALUES (v_tid, 'production', true);

    -- customers
    INSERT INTO public.customers (tenant_id, environment, email, first_name, last_name, status, created_at, updated_at)
    SELECT v_tid, 'production',
           'u'||g||'_'||substr(md5(random()::text),1,8)||'@load.test',
           'First'||g, 'Last'||g, 'active',
           now() - (random()*p_days_back||' days')::interval,
           now() - (random()*p_days_back||' days')::interval
    FROM generate_series(1, p_customers_each) g;
    v_cust := v_cust + p_customers_each;

    -- events (spread across the window so partition pruning is exercised)
    INSERT INTO public.events (tenant_id, environment, event_type, anonymous_id, "timestamp", properties)
    SELECT v_tid, 'production',
           v_event_types[1 + (random()*(array_length(v_event_types,1)-1))::int],
           'anon_'||(random()*100000)::int,
           now() - (random()*p_days_back||' days')::interval,
           jsonb_build_object('value', (random()*500)::int, 'sku', 'SKU-'||(random()*9999)::int)
    FROM generate_series(1, p_events_each) g;
    v_evt := v_evt + p_events_each;

    -- engagement (~ half of events volume)
    INSERT INTO public.engagement_log (tenant_id, environment, channel, message_id, event, "timestamp", metadata)
    SELECT v_tid, 'production',
           v_channels[1 + (random()*(array_length(v_channels,1)-1))::int],
           gen_random_uuid()::text,
           (ARRAY['sent','delivered','opened','clicked','failed','converted'])[1 + (random()*5)::int],
           now() - (random()*p_days_back||' days')::interval,
           '{}'::jsonb
    FROM generate_series(1, greatest(p_events_each/2, 1)) g;
    v_eng := v_eng + greatest(p_events_each/2, 1);

    IF v_i % 50 = 0 THEN
      RAISE NOTICE '  seeded % / % tenants (%.1f s)', v_i, p_tenants,
        extract(epoch FROM clock_timestamp() - v_start);
    END IF;
  END LOOP;

  PERFORM public.run_partition_maintenance();
  PERFORM public.refresh_rollups(now() - (p_days_back||' days')::interval);
  EXECUTE 'ANALYZE public.events'; EXECUTE 'ANALYZE public.engagement_log'; EXECUTE 'ANALYZE public.customers';

  RETURN QUERY SELECT p_tenants, v_cust, v_evt, v_eng, clock_timestamp() - v_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.marbee_purge_load()
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE v_n bigint;
BEGIN
  DELETE FROM public.tenants WHERE slug LIKE 'loadtest-%';   -- cascades everywhere
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.refresh_rollups(now() - interval '400 days');
  RETURN v_n;
END;
$$;

DO $$ BEGIN RAISE NOTICE 'v2/59 loaded: SELECT public.marbee_generate_load(1000, 5000, 20000, 30);'; END $$;
