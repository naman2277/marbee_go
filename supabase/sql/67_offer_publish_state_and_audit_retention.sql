-- =============================================================================
-- MARBEE — Offer publish state + per-resource audit retention (30d for offers)
-- Run AFTER 47_loyalty_offers.sql, 27_audit_trail.sql, 28_audit_retention.sql
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. loyalty_offers.published_at — lets the UI detect "live offer has
--    unpublished edits" (updated_at drifting ahead of published_at).
--    A trigger stamps it so it works no matter which path publishes the row
--    (upsert_loyalty_offer RPC, bulk status update, or direct SQL).
-- ---------------------------------------------------------------------------
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.stamp_offer_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- entering the live state (or first insert as live) stamps the publish time
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    NEW.published_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loyalty_offers_published_at ON public.loyalty_offers;
CREATE TRIGGER loyalty_offers_published_at
  BEFORE INSERT OR UPDATE ON public.loyalty_offers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_offer_published_at();

-- backfill: existing live offers are treated as published when last updated
UPDATE public.loyalty_offers
   SET published_at = updated_at
 WHERE status = 'active' AND published_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Per-resource audit retention.
--    Offers (and the rest of the loyalty surface) keep 30 days; everything
--    else stays on the original 7-day window.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_retention_days(p_resource_type TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_resource_type
    WHEN 'loyalty_offer'   THEN 30
    WHEN 'loyalty_program' THEN 30
    WHEN 'loyalty_tier'    THEN 30
    WHEN 'offer_policy'    THEN 30
    ELSE 7
  END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_retention_days(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Purge honours the per-resource window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_audit_logs(p_days INT DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  -- p_days now acts as the floor for resource types without an override
  DELETE FROM public.audit_logs al
  WHERE al.created_at < NOW() - (
    GREATEST(public.audit_retention_days(al.resource_type), GREATEST(p_days, 1)) || ' days'
  )::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_old_audit_logs(INT) TO authenticated;

-- keep the daily 3 AM UTC job pointed at the updated function
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'marbee-purge-audit-logs';
    PERFORM cron.schedule(
      'marbee-purge-audit-logs',
      '0 3 * * *',
      $$SELECT public.purge_old_audit_logs(7)$$
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN OTHERS THEN NULL;
END;
$cron$;

-- ---------------------------------------------------------------------------
-- 4. Reader RPC must widen its window to match, otherwise 30-day offer logs
--    would be retained but invisible (the old body hardcoded 7 days).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fetch_audit_logs_page(
  p_tenant_id UUID,
  p_environment TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20,
  p_sort_by TEXT DEFAULT 'created_at',
  p_sort_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_size INT := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset INT;
  v_total BIGINT;
  v_sort_col TEXT;
  v_sort_asc BOOLEAN;
  v_rows JSONB;
  v_search TEXT := NULLIF(trim(COALESCE(p_search, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied for tenant';
  END IF;

  v_offset := (v_page - 1) * v_size;
  v_sort_col := CASE p_sort_by
    WHEN 'action' THEN 'action'
    WHEN 'resource_type' THEN 'resource_type'
    ELSE 'created_at'
  END;
  v_sort_asc := lower(COALESCE(p_sort_dir, 'desc')) = 'asc';

  SELECT COUNT(*) INTO v_total
  FROM public.audit_logs al
  WHERE al.tenant_id = p_tenant_id
    AND al.environment = COALESCE(NULLIF(p_environment, ''), 'production')
    AND al.created_at >= NOW() - (public.audit_retention_days(al.resource_type) || ' days')::INTERVAL
    AND (p_resource_type IS NULL OR p_resource_type = '' OR al.resource_type = p_resource_type)
    AND (p_resource_id IS NULL OR al.resource_id = p_resource_id)
    AND (p_action IS NULL OR p_action = '' OR al.action = p_action)
    AND (
      v_search IS NULL OR
      al.action ILIKE '%' || v_search || '%' OR
      al.resource_type ILIKE '%' || v_search || '%' OR
      COALESCE(al.metadata->>'resource_name', '') ILIKE '%' || v_search || '%' OR
      COALESCE(al.metadata->>'user_email', '') ILIKE '%' || v_search || '%' OR
      COALESCE(al.metadata->>'summary', '') ILIKE '%' || v_search || '%'
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT al.*
    FROM public.audit_logs al
    WHERE al.tenant_id = p_tenant_id
      AND al.environment = COALESCE(NULLIF(p_environment, ''), 'production')
      AND al.created_at >= NOW() - (public.audit_retention_days(al.resource_type) || ' days')::INTERVAL
      AND (p_resource_type IS NULL OR p_resource_type = '' OR al.resource_type = p_resource_type)
      AND (p_resource_id IS NULL OR al.resource_id = p_resource_id)
      AND (p_action IS NULL OR p_action = '' OR al.action = p_action)
      AND (
        v_search IS NULL OR
        al.action ILIKE '%' || v_search || '%' OR
        al.resource_type ILIKE '%' || v_search || '%' OR
        COALESCE(al.metadata->>'resource_name', '') ILIKE '%' || v_search || '%' OR
        COALESCE(al.metadata->>'user_email', '') ILIKE '%' || v_search || '%' OR
        COALESCE(al.metadata->>'summary', '') ILIKE '%' || v_search || '%'
      )
    ORDER BY
      CASE WHEN v_sort_col = 'created_at' AND v_sort_asc THEN al.created_at END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'created_at' AND NOT v_sort_asc THEN al.created_at END DESC NULLS LAST,
      CASE WHEN v_sort_col = 'action' AND v_sort_asc THEN al.action END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'action' AND NOT v_sort_asc THEN al.action END DESC NULLS LAST,
      CASE WHEN v_sort_col = 'resource_type' AND v_sort_asc THEN al.resource_type END ASC NULLS LAST,
      CASE WHEN v_sort_col = 'resource_type' AND NOT v_sort_asc THEN al.resource_type END DESC NULLS LAST,
      al.created_at DESC
    LIMIT v_size OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'logs', COALESCE(v_rows, '[]'::JSONB),
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'total_pages', GREATEST(CEIL(v_total::NUMERIC / NULLIF(v_size, 0))::INT, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_audit_logs_page(UUID, TEXT, TEXT, UUID, TEXT, TEXT, INT, INT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Index for resource-scoped audit reads (the Offers → Activity Log tab)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_scope
  ON public.audit_logs (tenant_id, environment, resource_type, created_at DESC);

COMMENT ON COLUMN public.loyalty_offers.published_at IS
  'Set automatically when status becomes active. updated_at > published_at means the live offer has unpublished edits.';
COMMENT ON FUNCTION public.audit_retention_days(TEXT) IS
  'Retention window per resource_type — loyalty resources keep 30 days, everything else 7.';
