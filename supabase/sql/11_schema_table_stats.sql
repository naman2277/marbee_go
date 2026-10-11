-- Schema table record counts + disk usage for the schema list UI
-- Run in Supabase SQL Editor (safe to re-run)

CREATE OR REPLACE FUNCTION public.get_schema_table_stats(
  p_tenant_id UUID,
  p_environment TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_result JSONB := '[]'::jsonb;
  v_count BIGINT;
  v_size BIGINT;
  v_index BIGINT;
BEGIN
  IF p_tenant_id NOT IN (SELECT public.user_tenant_ids()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_rec IN
    SELECT slug, table_name
    FROM public.schema_definitions
    WHERE tenant_id = p_tenant_id
      AND environment = p_environment
      AND table_name IS NOT NULL
    ORDER BY name
  LOOP
    IF v_rec.table_name !~ '^(customers|customer_identities|events|engagement_log|deliveries|exclusions|web_push_subscribers|real_time_triggers|cs_[a-z0-9_]+)$' THEN
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format(
        'SELECT count(*)::bigint FROM public.%I WHERE tenant_id = $1 AND environment = $2',
        v_rec.table_name
      ) INTO v_count USING p_tenant_id, p_environment;

      SELECT
        COALESCE(pg_total_relation_size(c.oid), 0),
        COALESCE(pg_indexes_size(c.oid), 0)
      INTO v_size, v_index
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_rec.table_name;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'slug', v_rec.slug,
        'table_name', v_rec.table_name,
        'record_count', COALESCE(v_count, 0),
        'size_bytes', COALESCE(v_size, 0),
        'index_bytes', COALESCE(v_index, 0)
      ));
    EXCEPTION WHEN OTHERS THEN
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'slug', v_rec.slug,
        'table_name', v_rec.table_name,
        'record_count', 0,
        'size_bytes', 0,
        'index_bytes', 0
      ));
    END;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_schema_table_stats(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_schema_table_stats(UUID, TEXT) TO authenticated;
