-- =============================================================================
-- MARBEE v2 REVAMP — PART 53: TIME PARTITIONING OF APPEND-ONLY TABLES
-- Run AFTER 52. Re-runnable: if a table is already partitioned it is skipped.
--
-- Converts the unbounded log tables to native monthly RANGE partitions:
--   events, engagement_log, customer_delivery_log,
--   journey_instance_events, audit_logs, web_analytics_events
--
-- Wins: DROP PARTITION retention (no bulk DELETE), small per-partition indexes,
--       fast autovacuum, partition pruning on every tenant+time query,
--       BRIN index on the time column (~tiny).
--
-- Legacy data: each old table is kept as <name>_v1_backup and its rows are
-- copied into the new partitioned table. Set marbee.copy_legacy = 'false' before
-- running to skip the copy (fresh/reset installs):
--   SELECT set_config('marbee.copy_legacy', 'false', false);
-- Drop the *_v1_backup tables once you have verified the migration.
-- =============================================================================

-- NOTE: run with  psql -v ON_ERROR_STOP=1 -f ...  (or paste into the Dashboard
-- SQL editor, which stops on the first error by default).

DO $$
DECLARE
  v_copy boolean := coalesce(nullif(current_setting('marbee.copy_legacy', true), ''), 'true')::boolean;
BEGIN
  RAISE NOTICE 'marbee.copy_legacy = % (set to false to skip copying legacy rows)', v_copy;
END$$;

-- Rename every index on a (just-renamed) table so its names don't collide with
-- the fresh partitioned table we're about to create. Index names are schema-
-- scoped in Postgres, so this is required.
CREATE OR REPLACE FUNCTION public._v2_rename_indexes(p_relname text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE r record; v_new text;
BEGIN
  FOR r IN
    SELECT c.relname AS idx
    FROM pg_index x
    JOIN pg_class c  ON c.oid = x.indexrelid
    JOIN pg_class t  ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = p_relname
  LOOP
    v_new := left(r.idx, 55) || '_v1bak';
    IF to_regclass(format('public.%I', v_new)) IS NULL THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.idx, v_new);
    END IF;
  END LOOP;
END;
$fn$;

-- Generic converter for the "simple" shape (id + tenant_id + time col + payload).
-- Per-table index/policy/publication specifics are applied right after each call.
CREATE OR REPLACE FUNCTION public._v2_make_partitioned(
  p_table       text,      -- 'events'
  p_time_col    text,      -- 'timestamp'
  p_retain_months int,
  p_body_ddl    text       -- full column list DDL *without* trailing PK line
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_part boolean;
  v_copy    boolean := coalesce(nullif(current_setting('marbee.copy_legacy', true), ''), 'true')::boolean;
BEGIN
  SELECT p.partrelid IS NOT NULL INTO v_is_part
  FROM pg_class c
  LEFT JOIN pg_partitioned_table p ON p.partrelid = c.oid
  WHERE c.oid = format('public.%I', p_table)::regclass;

  IF v_is_part THEN
    RAISE NOTICE 'public.% already partitioned — skipping', p_table;
    RETURN;
  END IF;

  BEGIN EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', p_table);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  EXECUTE format('ALTER TABLE public.%I RENAME TO %I', p_table, p_table || '_v1_backup');
  PERFORM public._v2_rename_indexes(p_table || '_v1_backup');

  EXECUTE format($f$
    CREATE TABLE public.%I (
      %s,
      PRIMARY KEY (id, %I)
    ) PARTITION BY RANGE (%I)
  $f$, p_table, p_body_ddl, p_time_col, p_time_col);

  -- catch-all so any timestamp is insertable even before monthly children exist
  EXECUTE format('CREATE TABLE public.%I PARTITION OF public.%I DEFAULT', p_table || '_pdefault', p_table);

  -- current month + 3 ahead, register retention policy
  PERFORM public._ensure_time_partitions(format('public.%I', p_table)::regclass, 3, p_retain_months);
  INSERT INTO public._partition_policy(parent, months_ahead, retain_months, partition_key)
  VALUES (format('public.%I', p_table), 3, p_retain_months, p_time_col)
  ON CONFLICT (parent) DO UPDATE
    SET retain_months = excluded.retain_months, partition_key = excluded.partition_key, updated_at = now();

  IF v_copy THEN
    EXECUTE format('INSERT INTO public.%I SELECT * FROM public.%I', p_table, p_table || '_v1_backup');
    RAISE NOTICE 'copied legacy rows into public.% (from %_v1_backup)', p_table, p_table;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- events  (partition key: timestamp) — retain 13 months
-- -----------------------------------------------------------------------------
SELECT public._v2_make_partitioned('events', 'timestamp', 13, $body$
  id            uuid NOT NULL DEFAULT public.uuid_generate_v7(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment   text NOT NULL DEFAULT 'production',
  event_type    text NOT NULL,
  customer_id   uuid,
  anonymous_id  text,
  ecid          text,
  "timestamp"   timestamptz NOT NULL DEFAULT now(),
  source        text,
  properties    jsonb NOT NULL DEFAULT '{}',
  context       jsonb NOT NULL DEFAULT '{}'
$body$);

DO $$ BEGIN
  IF to_regclass('public.events') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'public.events'::regclass) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_brin_ts ON public.events USING brin ("timestamp") WITH (pages_per_range = 32)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_tenant_type ON public.events (tenant_id, environment, event_type, "timestamp" DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_customer ON public.events (tenant_id, environment, customer_id, "timestamp" DESC) WHERE customer_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_props_gin ON public.events USING gin (properties jsonb_path_ops)';
    EXECUTE 'ALTER TABLE public.events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS events_tenant_access ON public.events';
    EXECUTE 'CREATE POLICY events_tenant_access ON public.events FOR ALL TO authenticated
               USING (tenant_id IN (SELECT public.user_tenant_ids()))
               WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))';
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.events'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- engagement_log  (partition key: timestamp) — retain 13 months
-- -----------------------------------------------------------------------------
SELECT public._v2_make_partitioned('engagement_log', 'timestamp', 13, $body$
  id          uuid NOT NULL DEFAULT public.uuid_generate_v7(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'production',
  customer_id uuid,
  channel     text NOT NULL,
  message_id  text NOT NULL,
  event       text NOT NULL CHECK (event IN ('sent','delivered','opened','clicked','failed','unsubscribed','converted')),
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}',
  journey_id  uuid,
  campaign_id uuid
$body$);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'public.engagement_log'::regclass) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_engagement_brin_ts ON public.engagement_log USING brin ("timestamp") WITH (pages_per_range = 32)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_engagement_tenant ON public.engagement_log (tenant_id, environment, "timestamp" DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_engagement_tenant_event ON public.engagement_log (tenant_id, environment, event, "timestamp" DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_engagement_customer ON public.engagement_log (customer_id, "timestamp" DESC) WHERE customer_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_engagement_journey ON public.engagement_log (journey_id, "timestamp" DESC) WHERE journey_id IS NOT NULL';
    EXECUTE 'ALTER TABLE public.engagement_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS engagement_tenant_access ON public.engagement_log';
    EXECUTE 'CREATE POLICY engagement_tenant_access ON public.engagement_log FOR ALL TO authenticated
               USING (tenant_id IN (SELECT public.user_tenant_ids()))
               WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))';
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_log'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- customer_delivery_log  (partition key: timestamp) — retain 13 months
-- -----------------------------------------------------------------------------
SELECT public._v2_make_partitioned('customer_delivery_log', 'timestamp', 13, $body$
  id          uuid NOT NULL DEFAULT public.uuid_generate_v7(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'production',
  customer_id uuid,
  delivery_id uuid,
  journey_id  uuid,
  campaign_id uuid,
  channel     text NOT NULL,
  provider    text,
  message_id  text,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL,
  error_code  text
$body$);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'public.customer_delivery_log'::regclass) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cdl_brin_ts ON public.customer_delivery_log USING brin ("timestamp") WITH (pages_per_range = 32)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cdl_tenant ON public.customer_delivery_log (tenant_id, environment, "timestamp" DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cdl_customer ON public.customer_delivery_log (customer_id, "timestamp" DESC) WHERE customer_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cdl_delivery ON public.customer_delivery_log (delivery_id) WHERE delivery_id IS NOT NULL';
    EXECUTE 'ALTER TABLE public.customer_delivery_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS customer_delivery_tenant_access ON public.customer_delivery_log';
    EXECUTE 'CREATE POLICY customer_delivery_tenant_access ON public.customer_delivery_log FOR ALL TO authenticated
               USING (tenant_id IN (SELECT public.user_tenant_ids()))
               WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))';
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- journey_instance_events  (partition key: timestamp) — retain 6 months
-- v1 had no tenant_id; we add it (denormalized) + backfill from journey_instances.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_copy boolean := coalesce(nullif(current_setting('marbee.copy_legacy', true), ''), 'true')::boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'public.journey_instance_events'::regclass) THEN
    RAISE NOTICE 'journey_instance_events already partitioned — skipping'; RETURN;
  END IF;

  ALTER TABLE public.journey_instance_events RENAME TO journey_instance_events_v1_backup;
  PERFORM public._v2_rename_indexes('journey_instance_events_v1_backup');

  CREATE TABLE public.journey_instance_events (
    id          uuid NOT NULL DEFAULT public.uuid_generate_v7(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    instance_id uuid NOT NULL REFERENCES public.journey_instances(id) ON DELETE CASCADE,
    node_id     text,
    event_type  text NOT NULL,
    "timestamp" timestamptz NOT NULL DEFAULT now(),
    details     jsonb NOT NULL DEFAULT '{}',
    PRIMARY KEY (id, "timestamp")
  ) PARTITION BY RANGE ("timestamp");

  CREATE TABLE public.journey_instance_events_pdefault
    PARTITION OF public.journey_instance_events DEFAULT;

  PERFORM public._ensure_time_partitions('public.journey_instance_events'::regclass, 3, 6);
  INSERT INTO public._partition_policy(parent, retain_months, partition_key)
  VALUES ('public.journey_instance_events', 6, 'timestamp')
  ON CONFLICT (parent) DO UPDATE SET retain_months = 6, partition_key = 'timestamp';

  CREATE INDEX idx_jie_brin_ts ON public.journey_instance_events USING brin ("timestamp") WITH (pages_per_range = 32);
  CREATE INDEX idx_jie_instance ON public.journey_instance_events (instance_id, "timestamp" DESC);
  CREATE INDEX idx_jie_tenant ON public.journey_instance_events (tenant_id, "timestamp" DESC);

  ALTER TABLE public.journey_instance_events ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS journey_instance_events_tenant_access ON public.journey_instance_events;
  CREATE POLICY journey_instance_events_tenant_access ON public.journey_instance_events FOR ALL TO authenticated
    USING (tenant_id IN (SELECT public.user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

  CREATE TRIGGER trg_jie_inherit_tenant
    BEFORE INSERT ON public.journey_instance_events
    FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_tenant_id('public.journey_instances', 'instance_id');

  IF v_copy THEN
    INSERT INTO public.journey_instance_events (id, tenant_id, instance_id, node_id, event_type, "timestamp", details)
    SELECT e.id, ji.tenant_id, e.instance_id, e.node_id, e.event_type, e."timestamp", e.details
    FROM public.journey_instance_events_v1_backup e
    JOIN public.journey_instances ji ON ji.id = e.instance_id;
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- audit_logs  (partition key: created_at) — retain 24 months
-- -----------------------------------------------------------------------------
SELECT public._v2_make_partitioned('audit_logs', 'created_at', 24, $body$
  id            uuid NOT NULL DEFAULT public.uuid_generate_v7(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment   text NOT NULL DEFAULT 'production',
  user_id       uuid,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   uuid,
  metadata      jsonb NOT NULL DEFAULT '{}',
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
$body$);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'public.audit_logs'::regclass) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_brin_ts ON public.audit_logs USING brin (created_at) WITH (pages_per_range = 32)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs (tenant_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs (tenant_id, resource_type, resource_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (tenant_id, user_id, created_at DESC) WHERE user_id IS NOT NULL';
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS audit_logs_member_read ON public.audit_logs';
    EXECUTE 'CREATE POLICY audit_logs_member_read ON public.audit_logs FOR SELECT TO authenticated
               USING (tenant_id IN (SELECT public.user_tenant_ids()))';
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- web_analytics_events  (partition key: server_timestamp) — retain 6 months
-- SCHEMA-AGNOSTIC: this repo has two historical column sets for this table
-- (supabase/sql/50 vs migrations/20260824000001). We clone the LIVE table with
-- LIKE so partitioning works against whichever one is installed. LIKE copies
-- columns + defaults + CHECK + NOT NULL, but NOT the PK/UNIQUE/FK — we re-add a
-- composite PK, the dedupe unique index (with the partition key), and the tenant
-- FK for cascade cleanup.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_copy boolean := coalesce(nullif(current_setting('marbee.copy_legacy', true), ''), 'true')::boolean;
BEGIN
  IF to_regclass('public.web_analytics_events') IS NULL THEN
    RAISE NOTICE 'web_analytics_events not present — skipping'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'public.web_analytics_events'::regclass) THEN
    RAISE NOTICE 'web_analytics_events already partitioned — skipping'; RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'web_analytics_events'
      AND column_name = 'server_timestamp'
  ) THEN
    RAISE NOTICE 'web_analytics_events has no server_timestamp column — skipping'; RETURN;
  END IF;

  ALTER TABLE public.web_analytics_events RENAME TO web_analytics_events_v1_backup;
  PERFORM public._v2_rename_indexes('web_analytics_events_v1_backup');

  EXECUTE '
    CREATE TABLE public.web_analytics_events
      (LIKE public.web_analytics_events_v1_backup
        INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED)
    PARTITION BY RANGE (server_timestamp)';

  ALTER TABLE public.web_analytics_events ALTER COLUMN id SET DEFAULT public.uuid_generate_v7();
  ALTER TABLE public.web_analytics_events ADD PRIMARY KEY (id, server_timestamp);

  CREATE TABLE public.web_analytics_events_pdefault PARTITION OF public.web_analytics_events DEFAULT;
  PERFORM public._ensure_time_partitions('public.web_analytics_events'::regclass, 3, 6);
  INSERT INTO public._partition_policy(parent, retain_months, partition_key)
  VALUES ('public.web_analytics_events', 6, 'server_timestamp')
  ON CONFLICT (parent) DO UPDATE SET retain_months = 6, partition_key = 'server_timestamp';

  BEGIN
    ALTER TABLE public.web_analytics_events
      ADD CONSTRAINT web_analytics_events_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'wae tenant FK skipped: %', SQLERRM; END;

  CREATE UNIQUE INDEX uq_wae_dedupe ON public.web_analytics_events (tenant_id, site_id, event_id, server_timestamp);
  CREATE INDEX idx_wae_brin_ts ON public.web_analytics_events USING brin (server_timestamp) WITH (pages_per_range = 32);
  CREATE INDEX idx_wae_site_time ON public.web_analytics_events (site_id, server_timestamp DESC);
  CREATE INDEX idx_wae_session ON public.web_analytics_events (session_id);
  CREATE INDEX idx_wae_tenant_time ON public.web_analytics_events (tenant_id, environment, server_timestamp DESC);

  ALTER TABLE public.web_analytics_events ENABLE ROW LEVEL SECURITY;
  -- recreate the tenant read policy under both historical names, + service_role bypass
  DROP POLICY IF EXISTS web_analytics_events_tenant_access ON public.web_analytics_events;
  DROP POLICY IF EXISTS auth_read_events ON public.web_analytics_events;
  CREATE POLICY web_analytics_events_tenant_access ON public.web_analytics_events FOR ALL TO authenticated
    USING (tenant_id IN (SELECT public.user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
  DROP POLICY IF EXISTS service_role_all_events ON public.web_analytics_events;
  CREATE POLICY service_role_all_events ON public.web_analytics_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);

  IF v_copy THEN
    INSERT INTO public.web_analytics_events
    SELECT * FROM public.web_analytics_events_v1_backup;
  END IF;
END$$;

DROP FUNCTION IF EXISTS public._v2_make_partitioned(text, text, int, text);
DROP FUNCTION IF EXISTS public._v2_rename_indexes(text);

DO $$ BEGIN RAISE NOTICE 'v2/53 complete: 6 log tables partitioned monthly. Verify with: SELECT * FROM public.partition_health;'; END $$;
