-- Lock custom schema table_name after first publish
-- Run in Supabase SQL Editor (safe to re-run)

CREATE OR REPLACE FUNCTION public.prevent_schema_table_name_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.is_system = FALSE
    AND COALESCE(OLD.current_version, 0) > 0
    AND NEW.table_name IS DISTINCT FROM OLD.table_name
  THEN
    RAISE EXCEPTION 'Table name cannot be changed after publish';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.is_system = FALSE
    AND NEW.table_name IS NOT NULL
    AND NEW.table_name !~ '^cs_[a-z0-9_]+$'
  THEN
    RAISE EXCEPTION 'Invalid table name: %', NEW.table_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schema_table_name_lock ON public.schema_definitions;
CREATE TRIGGER trg_schema_table_name_lock
  BEFORE UPDATE ON public.schema_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_schema_table_name_change();

-- Uniqueness applies to CUSTOM tables (cs_*) only: built-in (system) schemas exist once per
-- tenant/environment and legitimately share physical tables such as real_time_triggers.
-- (Fixed 2026-11-20: the original index covered every table_name and failed on any database
-- with more than one tenant/environment.) Each cs_* table must have exactly one owning schema —
-- schema-records relies on that for tenant isolation (SEC-01).
DROP INDEX IF EXISTS public.idx_schema_definitions_table_name_unique;

DO $$
DECLARE v_dupes TEXT;
BEGIN
  SELECT string_agg(table_name || ' (' || n || ' schemas)', ', ') INTO v_dupes
  FROM (SELECT table_name, count(*) AS n FROM public.schema_definitions
        WHERE table_name ~ '^cs_' GROUP BY table_name HAVING count(*) > 1) d;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Custom tables claimed by more than one schema: % — resolve before re-running 12.', v_dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_definitions_custom_table_unique
  ON public.schema_definitions (table_name)
  WHERE table_name ~ '^cs_';
