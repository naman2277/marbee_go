-- =============================================================================
-- MARBEE — Custom schema publishing, versioning, FK metadata, data job runs
-- Run AFTER 01_marbee_schema.sql (safe to re-run)
-- =============================================================================

ALTER TABLE public.schema_definitions
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.schema_fields
  ADD COLUMN IF NOT EXISTS references_schema_id UUID REFERENCES public.schema_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS references_field TEXT DEFAULT 'id';

-- NOTE: PostgREST embed must use schema_fields!schema_fields_schema_id_fkey(*)
-- because references_schema_id creates a second FK to schema_definitions.

CREATE TABLE IF NOT EXISTS public.schema_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID NOT NULL REFERENCES public.schema_definitions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_notes TEXT,
  published_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schema_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.data_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.data_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_schema_versions_schema ON public.schema_versions (schema_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_data_job_runs_job ON public.data_job_runs (job_id, started_at DESC);

ALTER TABLE public.schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schema_versions_tenant_access" ON public.schema_versions;
CREATE POLICY "schema_versions_tenant_access" ON public.schema_versions FOR ALL
  USING (schema_id IN (SELECT id FROM public.schema_definitions WHERE tenant_id IN (SELECT public.user_tenant_ids())));

DROP POLICY IF EXISTS "data_job_runs_tenant_access" ON public.data_job_runs;
CREATE POLICY "data_job_runs_tenant_access" ON public.data_job_runs FOR ALL
  USING (job_id IN (SELECT id FROM public.data_jobs WHERE tenant_id IN (SELECT public.user_tenant_ids())));

GRANT ALL ON public.schema_versions TO authenticated;
GRANT ALL ON public.data_job_runs TO authenticated;

-- Map schema field types → Postgres types
CREATE OR REPLACE FUNCTION public.field_type_to_sql(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'string' THEN 'TEXT'
    WHEN 'email' THEN 'TEXT'
    WHEN 'phone' THEN 'TEXT'
    WHEN 'uuid' THEN 'UUID'
    WHEN 'number' THEN 'NUMERIC'
    WHEN 'boolean' THEN 'BOOLEAN'
    WHEN 'date' THEN 'DATE'
    WHEN 'timestamp' THEN 'TIMESTAMPTZ'
    WHEN 'enum' THEN 'TEXT'
    WHEN 'json' THEN 'JSONB'
    ELSE 'TEXT'
  END;
$$;

-- Publish a custom schema: CREATE/ALTER physical table + version snapshot
CREATE OR REPLACE FUNCTION public.publish_custom_schema(
  p_schema_id UUID,
  p_change_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema public.schema_definitions%ROWTYPE;
  v_field public.schema_fields%ROWTYPE;
  v_ref public.schema_definitions%ROWTYPE;
  v_table_name TEXT;
  v_col_parts TEXT[] := ARRAY[]::TEXT[];
  v_pk_field TEXT;
  v_has_user_pk BOOLEAN := FALSE;
  v_new_version INT;
  v_snapshot JSONB;
  v_tenant_prefix TEXT;
BEGIN
  SELECT * INTO v_schema FROM public.schema_definitions WHERE id = p_schema_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schema not found';
  END IF;

  IF v_schema.is_system THEN
    RAISE EXCEPTION 'System schemas cannot be published';
  END IF;

  IF v_schema.tenant_id NOT IN (SELECT public.user_tenant_ids()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schema_fields WHERE schema_id = p_schema_id) THEN
    RAISE EXCEPTION 'Add at least one field before publishing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.schema_fields WHERE schema_id = p_schema_id AND is_primary_key
  ) INTO v_has_user_pk;

  v_tenant_prefix := replace(substring(v_schema.tenant_id::text, 1, 8), '-', '');
  v_table_name := COALESCE(v_schema.table_name, 'cs_' || v_tenant_prefix || '_' || v_schema.slug);

  IF v_table_name !~ '^cs_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid generated table name: %', v_table_name;
  END IF;

  FOR v_field IN
    SELECT * FROM public.schema_fields WHERE schema_id = p_schema_id ORDER BY sort_order, name
  LOOP
    IF v_field.name !~ '^[a-z][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'Invalid field name: %', v_field.name;
    END IF;

    IF v_field.is_primary_key THEN
      v_pk_field := v_field.name;
      v_col_parts := v_col_parts || format(
        '%I %s PRIMARY KEY',
        v_field.name,
        public.field_type_to_sql(v_field.field_type)
      );
    ELSE
      v_col_parts := v_col_parts || format(
        '%I %s%s',
        v_field.name,
        public.field_type_to_sql(v_field.field_type),
        CASE WHEN v_field.is_required THEN ' NOT NULL' ELSE '' END
      );
    END IF;
  END LOOP;

  IF NOT v_has_user_pk THEN
    v_pk_field := 'id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v_table_name
  ) THEN
    IF v_has_user_pk THEN
      EXECUTE format(
        'CREATE TABLE public.%I (
          tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          environment TEXT NOT NULL DEFAULT ''production'',
          %s,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )',
        v_table_name,
        array_to_string(v_col_parts, ', ')
      );
    ELSE
      EXECUTE format(
        'CREATE TABLE public.%I (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          environment TEXT NOT NULL DEFAULT ''production'',
          %s,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )',
        v_table_name,
        array_to_string(v_col_parts, ', ')
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX idx_%I_tenant_env ON public.%I (tenant_id, environment)',
      v_table_name, v_table_name
    );

    FOR v_field IN
      SELECT * FROM public.schema_fields
      WHERE schema_id = p_schema_id AND is_indexed AND NOT is_primary_key
    LOOP
      EXECUTE format(
        'CREATE INDEX idx_%I_%I ON public.%I (%I)',
        v_table_name, v_field.name, v_table_name, v_field.name
      );
    END LOOP;

    FOR v_field IN
      SELECT * FROM public.schema_fields
      WHERE schema_id = p_schema_id AND references_schema_id IS NOT NULL
    LOOP
      SELECT * INTO v_ref FROM public.schema_definitions WHERE id = v_field.references_schema_id;
      IF v_ref.table_name IS NOT NULL THEN
        BEGIN
          EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT fk_%I_%I FOREIGN KEY (%I) REFERENCES public.%I (%I)',
            v_table_name,
            v_table_name,
            v_field.name,
            v_field.name,
            v_ref.table_name,
            COALESCE(v_field.references_field, 'id')
          );
        EXCEPTION WHEN duplicate_object THEN
          NULL;
        END;
      END IF;
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);

    BEGIN
      EXECUTE format(
        'CREATE POLICY tenant_access ON public.%I FOR ALL USING (tenant_id IN (SELECT public.user_tenant_ids()))',
        v_table_name
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    EXECUTE format('GRANT ALL ON public.%I TO authenticated', v_table_name);

    BEGIN
      EXECUTE format(
        'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        v_table_name, v_table_name
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  ELSE
    FOR v_field IN
      SELECT * FROM public.schema_fields WHERE schema_id = p_schema_id ORDER BY sort_order, name
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table_name AND column_name = v_field.name
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD COLUMN %I %s%s',
          v_table_name,
          v_field.name,
          public.field_type_to_sql(v_field.field_type),
          CASE WHEN v_field.is_required THEN ' NOT NULL DEFAULT ''''' ELSE '' END
        );
      END IF;
    END LOOP;
  END IF;

  v_new_version := v_schema.current_version + 1;

  SELECT jsonb_build_object(
    'schema', to_jsonb(v_schema),
    'fields', COALESCE(
      (SELECT jsonb_agg(to_jsonb(sf) ORDER BY sf.sort_order, sf.name)
       FROM public.schema_fields sf WHERE sf.schema_id = p_schema_id),
      '[]'::jsonb
    ),
    'table_name', v_table_name
  ) INTO v_snapshot;

  INSERT INTO public.schema_versions (schema_id, version_number, snapshot, change_notes, published_by)
  VALUES (p_schema_id, v_new_version, v_snapshot, p_change_notes, auth.uid());

  UPDATE public.schema_definitions
  SET
    table_name = v_table_name,
    status = 'published',
    current_version = v_new_version,
    published_at = NOW(),
    updated_at = NOW()
  WHERE id = p_schema_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'table_name', v_table_name,
    'version', v_new_version,
    'primary_key', v_pk_field
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_custom_schema(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_custom_schema(UUID, TEXT) TO authenticated;
