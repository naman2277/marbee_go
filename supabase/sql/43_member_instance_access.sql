-- Instance access controls on member settings (Read / Write / Delete per environment)
-- Run after 42_profile_avatar.sql

CREATE OR REPLACE FUNCTION public.sanitize_member_settings(p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_ips JSONB := '[]'::jsonb;
  v_journey JSONB := '[]'::jsonb;
  v_asset JSONB := '[]'::jsonb;
  v_instance JSONB := '{}'::jsonb;
  v_item TEXT;
  v_path TEXT;
  v_env TEXT;
  v_env_obj JSONB;
BEGIN
  IF p_settings IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF jsonb_typeof(p_settings->'allowed_ips') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements_text(p_settings->'allowed_ips')
    LOOP
      v_item := trim(v_item);
      IF length(v_item) > 0 AND length(v_item) <= 64 THEN
        v_ips := v_ips || to_jsonb(v_item);
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_settings->'journey_folder_paths') = 'array' THEN
    FOR v_path IN SELECT jsonb_array_elements_text(p_settings->'journey_folder_paths')
    LOOP
      v_path := trim(v_path);
      IF length(v_path) > 0 AND length(v_path) <= 512 THEN
        IF NOT v_path LIKE '/%' THEN
          v_path := '/' || v_path;
        END IF;
        v_journey := v_journey || to_jsonb(v_path);
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_settings->'asset_folder_paths') = 'array' THEN
    FOR v_path IN SELECT jsonb_array_elements_text(p_settings->'asset_folder_paths')
    LOOP
      v_path := trim(v_path);
      IF length(v_path) > 0 AND length(v_path) <= 512 THEN
        IF NOT v_path LIKE '/%' THEN
          v_path := '/' || v_path;
        END IF;
        v_asset := v_asset || to_jsonb(v_path);
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_settings->'instance_access') = 'object' THEN
    FOR v_env IN SELECT unnest(ARRAY['development', 'staging', 'production'])
    LOOP
      v_env_obj := p_settings->'instance_access'->v_env;
      IF jsonb_typeof(v_env_obj) = 'object' THEN
        v_instance := v_instance || jsonb_build_object(
          v_env,
          jsonb_build_object(
            'enabled', coalesce((v_env_obj->>'enabled')::boolean, true),
            'read', coalesce((v_env_obj->>'read')::boolean, true),
            'write', coalesce((v_env_obj->>'write')::boolean, true),
            'delete', coalesce((v_env_obj->>'delete')::boolean, false)
          )
        );
      ELSE
        v_instance := v_instance || jsonb_build_object(
          v_env,
          jsonb_build_object('enabled', true, 'read', true, 'write', true, 'delete', false)
        );
      END IF;
    END LOOP;
  ELSE
    v_instance := jsonb_build_object(
      'development', jsonb_build_object('enabled', true, 'read', true, 'write', true, 'delete', false),
      'staging', jsonb_build_object('enabled', true, 'read', true, 'write', true, 'delete', false),
      'production', jsonb_build_object('enabled', true, 'read', true, 'write', true, 'delete', false)
    );
  END IF;

  v_result := jsonb_build_object(
    'company', left(coalesce(p_settings->>'company', ''), 200),
    'job_title', left(coalesce(p_settings->>'job_title', ''), 120),
    'department', left(coalesce(p_settings->>'department', ''), 120),
    'phone', left(coalesce(p_settings->>'phone', ''), 40),
    'notes', left(coalesce(p_settings->>'notes', ''), 2000),
    'allowed_ips', v_ips,
    'restrict_journey_folders', coalesce((p_settings->>'restrict_journey_folders')::boolean, false),
    'journey_folder_paths', v_journey,
    'restrict_asset_folders', coalesce((p_settings->>'restrict_asset_folders')::boolean, false),
    'asset_folder_paths', v_asset,
    'instance_access', v_instance
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET last_login_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
