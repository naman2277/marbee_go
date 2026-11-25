-- =============================================================================
-- 94 — Workspace (tenant) provisioning for the Platform Console (D-017)
-- =============================================================================
-- Until now the demo workspace (script 02) was the only tenant ever created, and its
-- set-up was spread over ~20 scripts. This adds ONE function that creates a complete,
-- empty workspace in a single transaction:
--
--   tenant row · environments (development, staging, production=default)
--   system roles + their permissions · Tenant Admin gets EVERY permission
--   out-of-the-box schemas + fields in all three environments
--   default file folders · credit wallet · platform account row (region)
--
-- Reference ("template") = the system rows of the demo workspace
-- 00000000-0000-0000-0000-000000000001. Every script that adds an OOTB schema, field or
-- role permission patches those rows, so copying them keeps new workspaces current
-- without repeating each patch here. Only system rows are copied (is_system = TRUE);
-- demo content (customers, journeys, forms, connectors…) is never copied.
-- The template's PRODUCTION schemas are used for all three environments: the demo's
-- dev/staging copies are behind production (later scripts patched production only).
--
-- Callable by the service role only (the platform-admin edge function). Re-runnable.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.platform_provision_tenant(
  p_name     TEXT,
  p_slug     TEXT,
  p_plan     TEXT DEFAULT 'starter',
  p_status   TEXT DEFAULT 'trial',
  p_region   TEXT DEFAULT 'in',
  p_template UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name   TEXT := btrim(coalesce(p_name, ''));
  v_slug   TEXT := lower(btrim(coalesce(p_slug, '')));
  v_tenant UUID;
  v_admin_role UUID;
  v_env    TEXT;
  n_roles  INT;
  n_schemas INT := 0;
  n_fields  INT := 0;
  n INT;
BEGIN
  -- ---- validate ------------------------------------------------------------
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Workspace name must be 2–120 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' OR v_slug ~ '--' THEN
    RAISE EXCEPTION 'Slug must be 3–48 characters: lowercase letters, digits and single hyphens, not at the ends'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_slug = ANY (ARRAY['demo','admin','api','app','www','console','marbee','support','help','status',
                         'staging','production','development','dev','test','root','system','platform']) THEN
    RAISE EXCEPTION 'Slug "%" is reserved', v_slug USING ERRCODE = 'check_violation';
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('starter','growth','enterprise') THEN
    RAISE EXCEPTION 'Plan must be starter, growth or enterprise' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('trial','active') THEN
    RAISE EXCEPTION 'A new workspace starts as trial or active' USING ERRCODE = 'check_violation';
  END IF;
  IF p_region IS NULL OR p_region NOT IN ('in','mena','apac','emea','na') THEN
    RAISE EXCEPTION 'Region must be in, mena, apac, emea or na' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'A workspace with slug "%" already exists', v_slug USING ERRCODE = 'unique_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE tenant_id = p_template AND slug = 'tenant_admin' AND is_system)
     OR NOT EXISTS (SELECT 1 FROM public.schema_definitions
                    WHERE tenant_id = p_template AND environment = 'production' AND is_system) THEN
    RAISE EXCEPTION 'Provisioning template % is missing its system roles or schemas', p_template;
  END IF;

  -- ---- tenant + environments ------------------------------------------------
  INSERT INTO public.tenants (name, slug, plan, status)
  VALUES (v_name, v_slug, p_plan, p_status)
  RETURNING id INTO v_tenant;

  INSERT INTO public.environments (tenant_id, name, is_default) VALUES
    (v_tenant, 'development', FALSE),
    (v_tenant, 'staging',     FALSE),
    (v_tenant, 'production',  TRUE);

  -- ---- roles + permissions --------------------------------------------------
  INSERT INTO public.roles (tenant_id, name, slug, description, is_system)
  SELECT v_tenant, r.name, r.slug, r.description, TRUE
  FROM public.roles r
  WHERE r.tenant_id = p_template AND r.is_system;
  GET DIAGNOSTICS n_roles = ROW_COUNT;

  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT nr.id, rp.permission_id
  FROM public.roles tr
  JOIN public.role_permissions rp ON rp.role_id = tr.id
  JOIN public.roles nr ON nr.tenant_id = v_tenant AND nr.slug = tr.slug
  WHERE tr.tenant_id = p_template AND tr.is_system
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_admin_role FROM public.roles WHERE tenant_id = v_tenant AND slug = 'tenant_admin';
  -- The workspace owner's role always has every permission, even ones added after the template.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_admin_role, p.id FROM public.permissions p
  ON CONFLICT DO NOTHING;

  -- ---- out-of-the-box schemas, all three environments -----------------------
  FOREACH v_env IN ARRAY ARRAY['development','staging','production'] LOOP
    INSERT INTO public.schema_definitions
      (tenant_id, environment, name, slug, table_name, is_system, description, status, current_version, published_at)
    SELECT v_tenant, v_env, sd.name, sd.slug, sd.table_name, TRUE, sd.description, sd.status, sd.current_version,
           CASE WHEN sd.published_at IS NULL THEN NULL ELSE now() END
    FROM public.schema_definitions sd
    WHERE sd.tenant_id = p_template AND sd.environment = 'production' AND sd.is_system;
    GET DIAGNOSTICS n = ROW_COUNT;
    n_schemas := n_schemas + n;

    -- Fields; a reference to another schema is re-pointed at the new workspace's copy.
    INSERT INTO public.schema_fields
      (schema_id, name, field_type, is_required, is_primary_key, is_nullable, is_pii, is_indexed,
       default_value, description, sort_order, references_schema_id, references_field)
    SELECT nsd.id, sf.name, sf.field_type, sf.is_required, sf.is_primary_key, sf.is_nullable, sf.is_pii,
           sf.is_indexed, sf.default_value, sf.description, sf.sort_order, nref.id, sf.references_field
    FROM public.schema_definitions tsd
    JOIN public.schema_fields sf ON sf.schema_id = tsd.id
    JOIN public.schema_definitions nsd
      ON nsd.tenant_id = v_tenant AND nsd.environment = v_env AND nsd.slug = tsd.slug
    LEFT JOIN public.schema_definitions tref ON tref.id = sf.references_schema_id
    LEFT JOIN public.schema_definitions nref
      ON nref.tenant_id = v_tenant AND nref.environment = v_env AND nref.slug = tref.slug
    WHERE tsd.tenant_id = p_template AND tsd.environment = 'production' AND tsd.is_system;
    GET DIAGNOSTICS n = ROW_COUNT;
    n_fields := n_fields + n;
  END LOOP;

  -- ---- files, credits, account ----------------------------------------------
  INSERT INTO public.file_folders (tenant_id, path, name, parent_path, is_system) VALUES
    (v_tenant, '/Documents', 'Documents', '/', FALSE),
    (v_tenant, '/Images',    'Images',    '/', FALSE),
    (v_tenant, '/Videos',    'Videos',    '/', FALSE),
    (v_tenant, '/Archives',  'Archives',  '/', FALSE),
    (v_tenant, '/Workflows', 'Workflows', '/', TRUE),
    (v_tenant, '/Workflows/File Arrival Sample Files', 'File Arrival Sample Files', '/Workflows', TRUE)
  ON CONFLICT (tenant_id, environment, path) DO NOTHING;

  INSERT INTO public.credit_wallets (tenant_id) VALUES (v_tenant) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO public.platform_tenant_accounts (tenant_id, region) VALUES (v_tenant, p_region)
  ON CONFLICT (tenant_id) DO UPDATE SET region = EXCLUDED.region, updated_at = now();

  RETURN jsonb_build_object(
    'tenant_id', v_tenant,
    'slug', v_slug,
    'tenant_admin_role_id', v_admin_role,
    'roles', n_roles,
    'schemas', n_schemas,
    'fields', n_fields
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.platform_provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.platform_provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

COMMENT ON FUNCTION public.platform_provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) IS
  'D-017: create a complete empty workspace (service role / platform-admin only). See supabase/sql/94_tenant_provisioning.sql.';
