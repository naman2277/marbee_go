-- =============================================================================
-- MARBEE — Chatbot schema mapping trigger + source tracking
-- Fires when conversation status → 'completed', reads captured data from
-- mb_chatbot_captured_data rows (the source of truth) and pushes into the
-- target schema table. Bypasses edge function entirely — 100% reliable.
-- Additive; safe to re-run. Run AFTER 75_chatbot_module.sql.
-- =============================================================================

-- Add source column to customers table for acquisition tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'source') THEN
    ALTER TABLE public.customers ADD COLUMN source TEXT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Helper: apply a field mapping transformation in PL/pgSQL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chatbot_apply_transform(
  p_transform TEXT,
  p_value     TEXT,
  p_config    JSONB DEFAULT '{}'
)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_digits TEXT;
  v_cc     TEXT;
BEGIN
  -- Handle empty input
  IF p_value IS NULL OR p_value = '' THEN
    IF p_transform = 'default_value' THEN
      RETURN COALESCE(p_config->>'default', '');
    ELSIF p_transform = 'static_value' THEN
      RETURN COALESCE(p_config->>'value', '');
    END IF;
    RETURN COALESCE(p_value, '');
  END IF;

  -- Apply transformation
  IF p_transform = 'lowercase' THEN
    RETURN LOWER(p_value);
  ELSIF p_transform = 'uppercase' THEN
    RETURN UPPER(p_value);
  ELSIF p_transform = 'trim' THEN
    RETURN TRIM(p_value);
  ELSIF p_transform = 'format_phone' THEN
    v_digits := REGEXP_REPLACE(p_value, '[^0-9]', '', 'g');
    v_cc := COALESCE(p_config->>'default_country_code', '');
    IF v_digits = '' THEN RETURN p_value; END IF;
    IF v_cc != '' AND LEFT(p_value, 1) != '+' THEN
      RETURN v_cc || v_digits;
    END IF;
    RETURN '+' || v_digits;
  ELSIF p_transform = 'format_date' THEN
    BEGIN
      RETURN TO_CHAR(p_value::DATE, 'YYYY-MM-DD');
    EXCEPTION WHEN OTHERS THEN
      RETURN p_value;
    END;
  ELSIF p_transform = 'default_value' THEN
    RETURN COALESCE(NULLIF(p_value, ''), p_config->>'default', '');
  ELSIF p_transform = 'static_value' THEN
    RETURN COALESCE(p_config->>'value', '');
  ELSE
    RETURN p_value;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger function: push captured data → target schema on conversation close
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_chatbot_schema_mapping_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bot             RECORD;
  v_schema          RECORD;
  v_mapping         RECORD;
  v_captured        RECORD;
  v_state           JSONB := '{}';
  v_payload         JSONB := '{}';
  v_has_values      BOOLEAN := FALSE;
  v_table_name      TEXT;
  v_insert_mode     TEXT;
  v_upsert_keys     TEXT[];
  v_upsert_tgts     TEXT[];
  v_existing_id     UUID;
  v_val             TEXT;
  v_pending_count   INTEGER;
  v_where_clause    TEXT;
  v_key             TEXT;
  v_bot_name        TEXT;
BEGIN
  -- Only fire on status transition TO 'completed'
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  -- Check if there are any unmapped captured data rows
  SELECT COUNT(*) INTO v_pending_count
  FROM public.mb_chatbot_captured_data
  WHERE conversation_id = NEW.id AND mapped_status IN ('pending', 'failed');

  IF v_pending_count = 0 THEN
    RAISE NOTICE '[schema-trigger] No pending captured data for conversation %', NEW.id;
    RETURN NEW;
  END IF;

  -- Load bot config
  SELECT id, tenant_id, environment, target_schema_id, insert_mode, upsert_key, name
  INTO v_bot
  FROM public.mb_chatbots WHERE id = NEW.chatbot_id;

  IF v_bot IS NULL OR v_bot.target_schema_id IS NULL THEN
    RAISE NOTICE '[schema-trigger] Bot % has no target_schema_id', NEW.chatbot_id;
    RETURN NEW;
  END IF;

  -- Load schema definition
  SELECT table_name, status INTO v_schema
  FROM public.schema_definitions WHERE id = v_bot.target_schema_id;

  IF v_schema IS NULL THEN
    RAISE NOTICE '[schema-trigger] Schema % not found', v_bot.target_schema_id;
    RETURN NEW;
  END IF;
  IF v_schema.status IN ('draft', 'archived') THEN
    RAISE NOTICE '[schema-trigger] Schema % status=% (must be active or published)', v_bot.target_schema_id, v_schema.status;
    RETURN NEW;
  END IF;
  IF v_schema.table_name IS NULL OR v_schema.table_name !~ '^[a-z][a-z0-9_]+$' THEN
    RAISE NOTICE '[schema-trigger] Invalid table_name: %', v_schema.table_name;
    RETURN NEW;
  END IF;

  v_table_name := v_schema.table_name;
  v_insert_mode := COALESCE(v_bot.insert_mode, 'upsert');
  v_bot_name := COALESCE(v_bot.name, v_bot.id::TEXT);

  -- Parse composite upsert key (e.g. "email,mobile")
  v_upsert_keys := string_to_array(COALESCE(v_bot.upsert_key, ''), ',');
  -- Trim whitespace
  FOR i IN 1..COALESCE(array_length(v_upsert_keys, 1), 0) LOOP
    v_upsert_keys[i] := TRIM(v_upsert_keys[i]);
  END LOOP;
  v_upsert_keys := array_remove(v_upsert_keys, '');

  -- Build state from captured data rows (source of truth)
  FOR v_captured IN
    SELECT field_name, field_value
    FROM public.mb_chatbot_captured_data
    WHERE conversation_id = NEW.id AND mapped_status IN ('pending', 'failed')
  LOOP
    IF v_captured.field_name IS NOT NULL AND v_captured.field_value IS NOT NULL AND v_captured.field_value != '' THEN
      v_state := v_state || jsonb_build_object(v_captured.field_name, v_captured.field_value);
    END IF;
  END LOOP;

  -- Add system fields from conversation
  v_state := v_state || jsonb_build_object(
    'sentiment', COALESCE(NEW.sentiment, 'neutral'),
    'intent', COALESCE(NEW.intent, 'general'),
    'lead_status', COALESCE(NEW.lead_status, 'new'),
    'session_id', COALESCE(NEW.session_id::TEXT, ''),
    'summary', COALESCE(NEW.summary, ''),
    'language', COALESCE(NEW.language, '')
  );

  RAISE NOTICE '[schema-trigger] State: %', v_state;

  -- Build payload from field mappings, resolve upsert target fields
  v_upsert_tgts := ARRAY[]::TEXT[];
  FOR v_mapping IN
    SELECT source_field_key, target_field, transformation, transformation_config
    FROM public.mb_chatbot_field_mappings
    WHERE chatbot_id = NEW.chatbot_id
    ORDER BY sort_order
  LOOP
    v_val := public.chatbot_apply_transform(
      v_mapping.transformation,
      v_state->>v_mapping.source_field_key,
      COALESCE(v_mapping.transformation_config, '{}')
    );

    IF v_val IS NOT NULL AND v_val != '' THEN
      v_payload := v_payload || jsonb_build_object(v_mapping.target_field, v_val);
      v_has_values := TRUE;
    END IF;

    -- Track composite upsert target fields
    IF v_mapping.source_field_key = ANY(v_upsert_keys) OR v_mapping.target_field = ANY(v_upsert_keys) THEN
      v_upsert_tgts := array_append(v_upsert_tgts, v_mapping.target_field);
    END IF;
  END LOOP;

  IF NOT v_has_values THEN
    RAISE NOTICE '[schema-trigger] No mapped fields produced values for conversation %', NEW.id;
    RETURN NEW;
  END IF;

  -- Add source + tenant/environment to payload
  v_payload := v_payload || jsonb_build_object(
    'tenant_id', v_bot.tenant_id,
    'environment', v_bot.environment,
    'source', 'chatbot:' || v_bot_name
  );

  RAISE NOTICE '[schema-trigger] Insert into % with payload %, upsert_tgts=%', v_table_name, v_payload, v_upsert_tgts;

  -- Upsert / insert with composite key support
  v_existing_id := NULL;
  IF (v_insert_mode = 'update' OR v_insert_mode = 'upsert') AND array_length(v_upsert_tgts, 1) > 0 THEN
    -- Build dynamic WHERE clause for all upsert key fields
    v_where_clause := format('tenant_id = %L AND environment = %L', v_bot.tenant_id, v_bot.environment);
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
      EXECUTE format('SELECT id FROM %I WHERE %s LIMIT 1', v_table_name, v_where_clause)
      INTO v_existing_id;
      RAISE NOTICE '[schema-trigger] Upsert lookup: existing_id=%', v_existing_id;
    END IF;
  END IF;

  BEGIN
    IF v_existing_id IS NOT NULL AND (v_insert_mode = 'update' OR v_insert_mode = 'upsert') THEN
      EXECUTE format(
        'UPDATE %I SET %s, updated_at = NOW() WHERE id = $1',
        v_table_name,
        (SELECT string_agg(format('%I = %L', key, value #>> '{}'), ', ')
         FROM jsonb_each(v_payload)
         WHERE key NOT IN ('tenant_id', 'environment'))
      ) USING v_existing_id;
      RAISE NOTICE '[schema-trigger] Updated row % in %', v_existing_id, v_table_name;
    ELSIF v_insert_mode != 'update' THEN
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)',
        v_table_name, v_table_name
      ) USING v_payload;
      RAISE NOTICE '[schema-trigger] Inserted into %', v_table_name;
    ELSE
      RAISE NOTICE '[schema-trigger] insert_mode=update but no existing row for upsert keys=%', v_upsert_keys;
      RETURN NEW;
    END IF;

    -- Mark captured data as mapped
    UPDATE public.mb_chatbot_captured_data
    SET mapped_status = 'mapped', updated_at = NOW()
    WHERE conversation_id = NEW.id AND mapped_status IN ('pending', 'failed');

    RAISE NOTICE '[schema-trigger] Marked % rows as mapped', v_pending_count;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[schema-trigger] DB write failed for conversation %: %', NEW.id, SQLERRM;
    UPDATE public.mb_chatbot_captured_data
    SET mapped_status = 'failed', updated_at = NOW()
    WHERE conversation_id = NEW.id AND mapped_status IN ('pending', 'failed');
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Attach trigger to conversations table
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_chatbot_schema_mapping_on_complete ON public.mb_chatbot_conversations;
CREATE TRIGGER trg_chatbot_schema_mapping_on_complete
  AFTER UPDATE OF status ON public.mb_chatbot_conversations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.trg_fn_chatbot_schema_mapping_on_complete();

-- ---------------------------------------------------------------------------
-- RPC: Diagnose + force-process captured data for a conversation
-- Returns a JSON object with step-by-step diagnostic info and the final result.
-- Callable from the frontend: supabase.rpc('chatbot_process_captured_data', { p_conversation_id: '...' })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chatbot_process_captured_data(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv            RECORD;
  v_bot             RECORD;
  v_schema          RECORD;
  v_mapping         RECORD;
  v_captured        RECORD;
  v_state           JSONB := '{}';
  v_payload         JSONB := '{}';
  v_has_values      BOOLEAN := FALSE;
  v_table_name      TEXT;
  v_insert_mode     TEXT;
  v_upsert_keys     TEXT[];
  v_upsert_tgts     TEXT[];
  v_existing_id     UUID;
  v_val             TEXT;
  v_pending_count   INTEGER;
  v_mapping_count   INTEGER;
  v_diag            JSONB := '{}';
  v_debug_maps      JSONB := '[]';
  v_where_clause    TEXT;
  v_key             TEXT;
  v_bot_name        TEXT;
BEGIN
  -- Step 1: Load conversation
  SELECT id, chatbot_id, status, sentiment, intent, lead_status, session_id, summary, language, captured_data
  INTO v_conv
  FROM public.mb_chatbot_conversations WHERE id = p_conversation_id;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'step', 'conversation', 'detail', 'Conversation not found');
  END IF;
  v_diag := v_diag || jsonb_build_object('conversation_status', v_conv.status, 'chatbot_id', v_conv.chatbot_id);

  -- Step 2: Count pending/failed captured data
  SELECT COUNT(*) INTO v_pending_count
  FROM public.mb_chatbot_captured_data
  WHERE conversation_id = p_conversation_id AND mapped_status IN ('pending', 'failed');

  v_diag := v_diag || jsonb_build_object('pending_captured_rows', v_pending_count);

  IF v_pending_count = 0 THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'captured_data', 'detail', 'No pending/failed captured data rows found');
  END IF;

  -- Step 3: Load bot
  SELECT id, tenant_id, environment, target_schema_id, insert_mode, upsert_key, enable_data_capture, name
  INTO v_bot
  FROM public.mb_chatbots WHERE id = v_conv.chatbot_id;

  IF v_bot IS NULL THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'bot', 'detail', 'Bot not found');
  END IF;
  v_diag := v_diag || jsonb_build_object(
    'target_schema_id', v_bot.target_schema_id,
    'insert_mode', v_bot.insert_mode,
    'upsert_key', v_bot.upsert_key,
    'enable_data_capture', v_bot.enable_data_capture
  );

  IF v_bot.target_schema_id IS NULL THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'target_schema', 'detail', 'Bot has no target_schema_id configured');
  END IF;

  -- Step 4: Load schema
  SELECT id, table_name, status INTO v_schema
  FROM public.schema_definitions WHERE id = v_bot.target_schema_id;

  IF v_schema IS NULL THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'schema_lookup', 'detail', format('Schema %s not found in schema_definitions', v_bot.target_schema_id));
  END IF;
  v_diag := v_diag || jsonb_build_object('schema_table_name', v_schema.table_name, 'schema_status', v_schema.status);

  IF v_schema.status IN ('draft', 'archived') THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'schema_status', 'detail', format('Schema status is "%s" — must be "active" or "published"', v_schema.status));
  END IF;
  IF v_schema.table_name IS NULL OR v_schema.table_name !~ '^[a-z][a-z0-9_]+$' THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'table_name', 'detail', format('Table name "%s" is invalid', v_schema.table_name));
  END IF;

  v_table_name := v_schema.table_name;
  v_insert_mode := COALESCE(v_bot.insert_mode, 'upsert');
  v_bot_name := COALESCE(v_bot.name, v_bot.id::TEXT);

  -- Parse composite upsert key
  v_upsert_keys := string_to_array(COALESCE(v_bot.upsert_key, ''), ',');
  FOR i IN 1..COALESCE(array_length(v_upsert_keys, 1), 0) LOOP
    v_upsert_keys[i] := TRIM(v_upsert_keys[i]);
  END LOOP;
  v_upsert_keys := array_remove(v_upsert_keys, '');

  -- Step 5: Build state from captured data rows
  FOR v_captured IN
    SELECT field_name, field_value
    FROM public.mb_chatbot_captured_data
    WHERE conversation_id = p_conversation_id AND mapped_status IN ('pending', 'failed')
  LOOP
    IF v_captured.field_name IS NOT NULL AND v_captured.field_value IS NOT NULL AND v_captured.field_value != '' THEN
      v_state := v_state || jsonb_build_object(v_captured.field_name, v_captured.field_value);
    END IF;
  END LOOP;

  v_state := v_state || jsonb_build_object(
    'sentiment', COALESCE(v_conv.sentiment, 'neutral'),
    'intent', COALESCE(v_conv.intent, 'general'),
    'lead_status', COALESCE(v_conv.lead_status, 'new'),
    'session_id', COALESCE(v_conv.session_id::TEXT, ''),
    'summary', COALESCE(v_conv.summary, ''),
    'language', COALESCE(v_conv.language, '')
  );
  v_diag := v_diag || jsonb_build_object('state', v_state);

  -- Step 6: Load and apply field mappings
  SELECT COUNT(*) INTO v_mapping_count
  FROM public.mb_chatbot_field_mappings WHERE chatbot_id = v_conv.chatbot_id;

  v_diag := v_diag || jsonb_build_object('field_mapping_count', v_mapping_count);

  IF v_mapping_count = 0 THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'mappings', 'detail', 'No field mappings configured for this bot');
  END IF;

  v_upsert_tgts := ARRAY[]::TEXT[];
  FOR v_mapping IN
    SELECT source_field_key, target_field, transformation, transformation_config
    FROM public.mb_chatbot_field_mappings
    WHERE chatbot_id = v_conv.chatbot_id
    ORDER BY sort_order
  LOOP
    v_val := public.chatbot_apply_transform(
      v_mapping.transformation,
      v_state->>v_mapping.source_field_key,
      COALESCE(v_mapping.transformation_config, '{}')
    );

    v_debug_maps := v_debug_maps || jsonb_build_object(
      'source', v_mapping.source_field_key,
      'target', v_mapping.target_field,
      'transform', v_mapping.transformation,
      'raw_value', v_state->>v_mapping.source_field_key,
      'transformed', v_val
    );

    IF v_val IS NOT NULL AND v_val != '' THEN
      v_payload := v_payload || jsonb_build_object(v_mapping.target_field, v_val);
      v_has_values := TRUE;
    END IF;

    -- Track composite upsert target fields
    IF v_mapping.source_field_key = ANY(v_upsert_keys) OR v_mapping.target_field = ANY(v_upsert_keys) THEN
      v_upsert_tgts := array_append(v_upsert_tgts, v_mapping.target_field);
    END IF;
  END LOOP;

  v_diag := v_diag || jsonb_build_object('mapping_debug', v_debug_maps, 'payload', v_payload, 'upsert_target_fields', to_jsonb(v_upsert_tgts));

  IF NOT v_has_values THEN
    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'payload_empty', 'detail', 'No mapped fields produced values — check source_field_key matches captured field_name');
  END IF;

  -- Add source + tenant/environment
  v_payload := v_payload || jsonb_build_object(
    'tenant_id', v_bot.tenant_id,
    'environment', v_bot.environment,
    'source', 'chatbot:' || v_bot_name
  );

  -- Step 7: Insert/upsert with composite key support
  v_existing_id := NULL;
  IF (v_insert_mode = 'update' OR v_insert_mode = 'upsert') AND array_length(v_upsert_tgts, 1) > 0 THEN
    v_where_clause := format('tenant_id = %L AND environment = %L', v_bot.tenant_id, v_bot.environment);
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
      BEGIN
        EXECUTE format('SELECT id FROM %I WHERE %s LIMIT 1', v_table_name, v_where_clause) INTO v_existing_id;
      EXCEPTION WHEN OTHERS THEN
        RETURN v_diag || jsonb_build_object('ok', false, 'step', 'upsert_lookup', 'detail', format('Upsert lookup failed: %s', SQLERRM));
      END;
    END IF;
  END IF;

  BEGIN
    IF v_existing_id IS NOT NULL AND (v_insert_mode = 'update' OR v_insert_mode = 'upsert') THEN
      EXECUTE format(
        'UPDATE %I SET %s, updated_at = NOW() WHERE id = $1',
        v_table_name,
        (SELECT string_agg(format('%I = %L', key, value #>> '{}'), ', ')
         FROM jsonb_each(v_payload)
         WHERE key NOT IN ('tenant_id', 'environment'))
      ) USING v_existing_id;

      UPDATE public.mb_chatbot_captured_data
      SET mapped_status = 'mapped', updated_at = NOW()
      WHERE conversation_id = p_conversation_id AND mapped_status IN ('pending', 'failed');

      RETURN v_diag || jsonb_build_object('ok', true, 'step', 'done', 'detail', format('Updated row %s in %s', v_existing_id, v_table_name));

    ELSIF v_insert_mode != 'update' THEN
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)',
        v_table_name, v_table_name
      ) USING v_payload;

      UPDATE public.mb_chatbot_captured_data
      SET mapped_status = 'mapped', updated_at = NOW()
      WHERE conversation_id = p_conversation_id AND mapped_status IN ('pending', 'failed');

      RETURN v_diag || jsonb_build_object('ok', true, 'step', 'done', 'detail', format('Inserted into %s', v_table_name));

    ELSE
      RETURN v_diag || jsonb_build_object('ok', false, 'step', 'no_existing_row', 'detail', format('insert_mode=update but no existing row for upsert keys=%s', v_upsert_keys));
    END IF;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.mb_chatbot_captured_data
    SET mapped_status = 'failed', updated_at = NOW()
    WHERE conversation_id = p_conversation_id AND mapped_status IN ('pending', 'failed');

    RETURN v_diag || jsonb_build_object('ok', false, 'step', 'db_write', 'detail', format('INSERT/UPDATE failed: %s', SQLERRM));
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chatbot_process_captured_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chatbot_process_captured_data(UUID) TO service_role;
