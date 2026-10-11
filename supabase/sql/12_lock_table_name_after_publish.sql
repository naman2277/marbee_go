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

CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_definitions_table_name_unique
  ON public.schema_definitions (table_name)
  WHERE table_name IS NOT NULL;
