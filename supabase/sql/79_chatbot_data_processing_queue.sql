-- =============================================================================
-- MARBEE — Chatbot data processing queue
-- Queues captured data for deferred schema mapping (scheduled / workflow triggers).
-- Immediate processing (on_complete) still runs inline in close_session.
-- Additive; safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mb_chatbot_data_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.mb_chatbot_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'workflow')),
  process_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow_id UUID,
  workflow_node_id UUID,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mb_data_queue_pending
  ON public.mb_chatbot_data_processing_queue (status, process_after)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_mb_data_queue_bot
  ON public.mb_chatbot_data_processing_queue (chatbot_id);

CREATE INDEX IF NOT EXISTS idx_mb_data_queue_conversation
  ON public.mb_chatbot_data_processing_queue (conversation_id);

ALTER TABLE public.mb_chatbot_data_processing_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mb_data_queue_tenant_access" ON public.mb_chatbot_data_processing_queue;
CREATE POLICY "mb_data_queue_tenant_access" ON public.mb_chatbot_data_processing_queue FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.mb_chatbot_data_processing_queue TO authenticated;

DROP TRIGGER IF EXISTS trg_mb_data_queue_updated_at ON public.mb_chatbot_data_processing_queue;
CREATE TRIGGER trg_mb_data_queue_updated_at BEFORE UPDATE ON public.mb_chatbot_data_processing_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cron function: process pending queue items whose process_after has passed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_chatbot_data_queue(batch_size INTEGER DEFAULT 50)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  processed INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT q.id, q.chatbot_id, q.conversation_id, q.tenant_id, q.environment,
           q.trigger_type, q.workflow_id, q.workflow_node_id
    FROM public.mb_chatbot_data_processing_queue q
    WHERE q.status = 'pending'
      AND q.process_after <= NOW()
    ORDER BY q.process_after
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.mb_chatbot_data_processing_queue
    SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
    WHERE id = rec.id;

    BEGIN
      -- Execute schema mapping for this conversation
      PERFORM public.execute_chatbot_schema_mapping(rec.chatbot_id, rec.conversation_id, rec.tenant_id, rec.environment);

      UPDATE public.mb_chatbot_data_processing_queue
      SET status = 'completed', processed_at = NOW(), updated_at = NOW()
      WHERE id = rec.id;

      processed := processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.mb_chatbot_data_processing_queue
      SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
          last_error = SQLERRM,
          process_after = CASE WHEN attempts >= 3 THEN process_after ELSE NOW() + INTERVAL '5 minutes' END,
          updated_at = NOW()
      WHERE id = rec.id;
    END;
  END LOOP;

  RETURN processed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_chatbot_data_queue(INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- DB-level schema mapping function (called by the queue processor)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_chatbot_schema_mapping(
  p_chatbot_id UUID,
  p_conversation_id UUID,
  p_tenant_id UUID,
  p_environment TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bot RECORD;
  v_schema RECORD;
  v_mapping RECORD;
  v_captured RECORD;
  v_state JSONB := '{}';
  v_payload JSONB := '{}';
  v_table_name TEXT;
  v_insert_mode TEXT;
  v_upsert_keys TEXT[];
  v_upsert_tgts TEXT[];
  v_existing_id UUID;
  v_has_values BOOLEAN := FALSE;
  v_where_clause TEXT;
  v_key TEXT;
BEGIN
  -- Get bot config
  SELECT target_schema_id, insert_mode, upsert_key, name
  INTO v_bot
  FROM public.mb_chatbots WHERE id = p_chatbot_id;

  IF v_bot IS NULL OR v_bot.target_schema_id IS NULL THEN
    RAISE NOTICE 'Schema mapping skipped: no target schema configured';
    RETURN;
  END IF;

  -- Get schema
  SELECT table_name, status INTO v_schema
  FROM public.schema_definitions WHERE id = v_bot.target_schema_id;

  IF v_schema IS NULL OR v_schema.status IN ('draft', 'archived') OR v_schema.table_name !~ '^[a-z][a-z0-9_]+$' THEN
    RAISE NOTICE 'Schema mapping skipped: schema not found or invalid table name';
    RETURN;
  END IF;

  v_table_name := v_schema.table_name;
  v_insert_mode := COALESCE(v_bot.insert_mode, 'upsert');

  -- Parse composite upsert key
  v_upsert_keys := string_to_array(COALESCE(v_bot.upsert_key, ''), ',');
  FOR i IN 1..COALESCE(array_length(v_upsert_keys, 1), 0) LOOP
    v_upsert_keys[i] := TRIM(v_upsert_keys[i]);
  END LOOP;
  v_upsert_keys := array_remove(v_upsert_keys, '');

  -- Build state from captured data rows (source of truth)
  FOR v_captured IN
    SELECT field_name, field_value
    FROM public.mb_chatbot_captured_data
    WHERE conversation_id = p_conversation_id AND mapped_status IN ('pending', 'failed')
  LOOP
    IF v_captured.field_name IS NOT NULL AND v_captured.field_value IS NOT NULL AND v_captured.field_value != '' THEN
      v_state := v_state || jsonb_build_object(v_captured.field_name, v_captured.field_value);
    END IF;
  END LOOP;

  -- Build payload from field mappings
  v_upsert_tgts := ARRAY[]::TEXT[];
  FOR v_mapping IN
    SELECT source_field_key, target_field, transformation, transformation_config
    FROM public.mb_chatbot_field_mappings
    WHERE chatbot_id = p_chatbot_id
  LOOP
    IF v_state ? v_mapping.source_field_key AND v_state->>v_mapping.source_field_key IS NOT NULL AND v_state->>v_mapping.source_field_key != '' THEN
      v_payload := v_payload || jsonb_build_object(v_mapping.target_field, v_state->>v_mapping.source_field_key);
      v_has_values := TRUE;
    END IF;
    IF v_mapping.source_field_key = ANY(v_upsert_keys) OR v_mapping.target_field = ANY(v_upsert_keys) THEN
      v_upsert_tgts := array_append(v_upsert_tgts, v_mapping.target_field);
    END IF;
  END LOOP;

  IF NOT v_has_values THEN
    RAISE NOTICE 'Schema mapping skipped: no captured values matched any field mapping';
    RETURN;
  END IF;

  -- Add source + tenant/environment
  v_payload := v_payload || jsonb_build_object('tenant_id', p_tenant_id, 'environment', p_environment, 'source', 'chatbot:' || COALESCE(v_bot.name, p_chatbot_id::TEXT));

  -- Composite upsert lookup
  v_existing_id := NULL;
  IF (v_insert_mode = 'upsert' OR v_insert_mode = 'update') AND array_length(v_upsert_tgts, 1) > 0 THEN
    v_where_clause := format('tenant_id = %L AND environment = %L', p_tenant_id, p_environment);
    FOR i IN 1..array_length(v_upsert_tgts, 1) LOOP
      v_key := v_upsert_tgts[i];
      IF v_payload ? v_key AND (v_payload->>v_key) IS NOT NULL THEN
        v_where_clause := v_where_clause || format(' AND %I = %L', v_key, v_payload->>v_key);
      ELSE
        v_where_clause := NULL;
        EXIT;
      END IF;
    END LOOP;
    IF v_where_clause IS NOT NULL THEN
      EXECUTE format('SELECT id FROM %I WHERE %s LIMIT 1', v_table_name, v_where_clause) INTO v_existing_id;
    END IF;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    EXECUTE format('UPDATE %I SET %s, updated_at = NOW() WHERE id = $1',
      v_table_name,
      (SELECT string_agg(format('%I = %L', key, value #>> '{}'), ', ') FROM jsonb_each(v_payload) WHERE key NOT IN ('tenant_id', 'environment'))
    ) USING v_existing_id;
  ELSE
    EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)', v_table_name, v_table_name) USING v_payload;
  END IF;

  -- Update captured_data rows status
  UPDATE public.mb_chatbot_captured_data
  SET mapped_status = 'mapped', updated_at = NOW()
  WHERE conversation_id = p_conversation_id AND mapped_status IN ('pending', 'failed');

END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_chatbot_schema_mapping(UUID, UUID, UUID, TEXT) TO service_role;

-- Schedule cron (if pg_cron is available) to process queued items every minute
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('process-chatbot-data-queue');
    PERFORM cron.schedule(
      'process-chatbot-data-queue',
      '* * * * *',
      'SELECT public.process_chatbot_data_queue(50)'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — schedule public.process_chatbot_data_queue() yourself.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule cron: %', SQLERRM;
END $cron$;
