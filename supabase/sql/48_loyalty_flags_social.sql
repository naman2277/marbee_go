-- Customer loyalty flags + OOTB schema registration + Social media automation
-- Run after 47_loyalty_offers.sql

-- -----------------------------------------------------------------------------
-- Loyalty flags on customer records (denormalized snapshot, synced from loyalty_members)
-- -----------------------------------------------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_member BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS loyalty_program_id UUID REFERENCES public.loyalty_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loyalty_program_name TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_tier_slug TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_tier_name TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_points_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_lifetime_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_status TEXT
    CHECK (loyalty_status IS NULL OR loyalty_status IN ('active', 'suspended', 'churned')),
  ADD COLUMN IF NOT EXISTS loyalty_enrolled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_loyalty_member
  ON public.customers (tenant_id, environment, loyalty_member)
  WHERE loyalty_member = TRUE;

CREATE INDEX IF NOT EXISTS idx_customers_loyalty_tier
  ON public.customers (tenant_id, environment, loyalty_tier_slug)
  WHERE loyalty_tier_slug IS NOT NULL;

-- Sync customer loyalty flags when membership changes
CREATE OR REPLACE FUNCTION public.sync_customer_loyalty_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier public.loyalty_tiers%ROWTYPE;
  v_prog public.loyalty_programs%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.customers SET
      loyalty_member = FALSE,
      loyalty_program_id = NULL,
      loyalty_program_name = NULL,
      loyalty_tier_slug = NULL,
      loyalty_tier_name = NULL,
      loyalty_points_balance = 0,
      loyalty_lifetime_points = 0,
      loyalty_status = NULL,
      loyalty_enrolled_at = NULL
    WHERE id = OLD.customer_id;
    RETURN OLD;
  END IF;

  SELECT * INTO v_tier FROM public.loyalty_tiers WHERE id = NEW.tier_id;
  SELECT * INTO v_prog FROM public.loyalty_programs WHERE id = NEW.program_id;

  UPDATE public.customers SET
    loyalty_member = NEW.status = 'active',
    loyalty_program_id = NEW.program_id,
    loyalty_program_name = v_prog.name,
    loyalty_tier_slug = v_tier.slug,
    loyalty_tier_name = v_tier.name,
    loyalty_points_balance = NEW.points_balance,
    loyalty_lifetime_points = NEW.lifetime_points,
    loyalty_status = NEW.status,
    loyalty_enrolled_at = NEW.enrolled_at
  WHERE id = NEW.customer_id;

  UPDATE public.loyalty_programs lp
  SET member_count = (
    SELECT COUNT(*) FROM public.loyalty_members lm
    WHERE lm.program_id = lp.id AND lm.status = 'active'
  )
  WHERE lp.id = NEW.program_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loyalty_members_sync_customer ON public.loyalty_members;
CREATE TRIGGER loyalty_members_sync_customer
  AFTER INSERT OR UPDATE OR DELETE ON public.loyalty_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_customer_loyalty_flags();

-- Enroll a customer in a loyalty program
CREATE OR REPLACE FUNCTION public.enroll_customer_loyalty(
  p_tenant_id UUID,
  p_environment TEXT,
  p_customer_id UUID,
  p_program_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_tier_id UUID;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'loyalty.write');

  SELECT id INTO v_tier_id
  FROM public.loyalty_tiers
  WHERE program_id = p_program_id
  ORDER BY sort_order ASC
  LIMIT 1;

  INSERT INTO public.loyalty_members (
    tenant_id, environment, program_id, customer_id, tier_id, status
  ) VALUES (
    p_tenant_id,
    COALESCE(NULLIF(p_environment, ''), 'production'),
    p_program_id,
    p_customer_id,
    v_tier_id,
    'active'
  )
  ON CONFLICT (program_id, customer_id) DO UPDATE SET
    status = 'active',
    tier_id = COALESCE(public.loyalty_members.tier_id, EXCLUDED.tier_id)
  RETURNING id INTO v_member_id;

  RETURN v_member_id;
END;
$$;

-- Register loyalty fields on Customer OOTB schema
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('20000000-0000-0000-0000-000000000001', 'loyalty_member', 'boolean', FALSE, FALSE, FALSE, TRUE, 28, 'Enrolled in a loyalty program'),
  ('20000000-0000-0000-0000-000000000001', 'loyalty_program_name', 'string', FALSE, FALSE, FALSE, FALSE, 29, 'Active loyalty program name'),
  ('20000000-0000-0000-0000-000000000001', 'loyalty_tier_slug', 'string', FALSE, FALSE, FALSE, TRUE, 30, 'Current loyalty tier slug'),
  ('20000000-0000-0000-0000-000000000001', 'loyalty_tier_name', 'string', FALSE, FALSE, FALSE, FALSE, 31, 'Current loyalty tier display name'),
  ('20000000-0000-0000-0000-000000000001', 'loyalty_points_balance', 'integer', FALSE, FALSE, FALSE, TRUE, 32, 'Current points balance'),
  ('20000000-0000-0000-0000-000000000001', 'loyalty_lifetime_points', 'integer', FALSE, FALSE, FALSE, FALSE, 33, 'Lifetime points earned'),
  ('20000000-0000-0000-0000-000000000001', 'loyalty_status', 'string', FALSE, FALSE, FALSE, TRUE, 34, 'Loyalty membership status'),
  ('20000000-0000-0000-0000-000000000001', 'loyalty_enrolled_at', 'datetime', FALSE, FALSE, FALSE, FALSE, 35, 'Loyalty enrollment date')
ON CONFLICT (schema_id, name) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  is_indexed = EXCLUDED.is_indexed,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description;

-- Register loyalty + social tables as OOTB schemas
INSERT INTO public.schema_definitions (id, tenant_id, environment, name, slug, table_name, is_system, description, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Loyalty Programs', 'loyalty_programs', 'loyalty_programs', TRUE, 'Loyalty program definitions', 'active'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', 'Loyalty Members', 'loyalty_members', 'loyalty_members', TRUE, 'Customer loyalty enrollments', 'active'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', 'Loyalty Offers', 'loyalty_offers', 'loyalty_offers', TRUE, 'Offer catalog for decisioning', 'active'),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'production', 'Offer Decision Policies', 'offer_decision_policies', 'offer_decision_policies', TRUE, 'Best Offer Decisioning policies', 'active'),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'production', 'Social Posts', 'social_posts', 'social_posts', TRUE, 'Scheduled and published social content', 'active')
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'name', 'string', TRUE, FALSE, FALSE, TRUE, 1, 'Program name'),
  ('a0000000-0000-0000-0000-000000000001', 'slug', 'string', TRUE, FALSE, FALSE, TRUE, 2, 'URL-safe identifier'),
  ('a0000000-0000-0000-0000-000000000001', 'status', 'string', TRUE, FALSE, FALSE, TRUE, 3, 'Program status'),
  ('a0000000-0000-0000-0000-000000000002', 'customer_id', 'uuid', TRUE, FALSE, FALSE, TRUE, 1, 'Linked customer profile'),
  ('a0000000-0000-0000-0000-000000000002', 'points_balance', 'integer', TRUE, FALSE, FALSE, TRUE, 2, 'Current points'),
  ('a0000000-0000-0000-0000-000000000002', 'status', 'string', TRUE, FALSE, FALSE, TRUE, 3, 'Membership status'),
  ('a0000000-0000-0000-0000-000000000003', 'name', 'string', TRUE, FALSE, FALSE, TRUE, 1, 'Offer name'),
  ('a0000000-0000-0000-0000-000000000003', 'offer_type', 'string', TRUE, FALSE, FALSE, TRUE, 2, 'Offer type'),
  ('a0000000-0000-0000-0000-000000000003', 'status', 'string', TRUE, FALSE, FALSE, TRUE, 3, 'Offer status'),
  ('a0000000-0000-0000-0000-000000000005', 'content', 'string', TRUE, FALSE, FALSE, FALSE, 1, 'Post body text'),
  ('a0000000-0000-0000-0000-000000000005', 'platforms', 'array', TRUE, FALSE, FALSE, TRUE, 2, 'Target platforms'),
  ('a0000000-0000-0000-0000-000000000005', 'status', 'string', TRUE, FALSE, FALSE, TRUE, 3, 'Post status')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Clone new schema fields to dev/staging
DO $$
DECLARE v_env TEXT;
BEGIN
  FOREACH v_env IN ARRAY ARRAY['development', 'staging'] LOOP
    INSERT INTO public.schema_definitions (tenant_id, environment, name, slug, table_name, is_system, description, status)
    SELECT tenant_id, v_env, name, slug, table_name, is_system, description, status
    FROM public.schema_definitions
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
      AND environment = 'production' AND slug IN ('loyalty_programs', 'loyalty_members', 'loyalty_offers', 'offer_decision_policies', 'social_posts')
    ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

    INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description)
    SELECT new_sd.id, sf.name, sf.field_type, sf.is_required, sf.is_primary_key, sf.is_pii, sf.is_indexed, sf.sort_order, sf.description
    FROM public.schema_fields sf
    JOIN public.schema_definitions prod_sd ON sf.schema_id = prod_sd.id AND prod_sd.environment = 'production'
    JOIN public.schema_definitions new_sd ON new_sd.slug = prod_sd.slug AND new_sd.environment = v_env AND new_sd.tenant_id = prod_sd.tenant_id
    WHERE prod_sd.slug IN ('loyalty_programs', 'loyalty_members', 'loyalty_offers', 'offer_decision_policies', 'social_posts')
    ON CONFLICT (schema_id, name) DO NOTHING;

    INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description)
    SELECT new_sd.id, sf.name, sf.field_type, sf.is_required, sf.is_primary_key, sf.is_pii, sf.is_indexed, sf.sort_order, sf.description
    FROM public.schema_fields sf
    JOIN public.schema_definitions prod_sd ON sf.schema_id = prod_sd.id AND prod_sd.slug = 'customer' AND prod_sd.environment = 'production'
    JOIN public.schema_definitions new_sd ON new_sd.slug = 'customer' AND new_sd.environment = v_env AND new_sd.tenant_id = prod_sd.tenant_id
    WHERE sf.name LIKE 'loyalty_%'
    ON CONFLICT (schema_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order, description = EXCLUDED.description;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Social media accounts & posts
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (slug, name, description, category) VALUES
  ('social.manage', 'Manage social media', 'Connect accounts and publish social posts', 'social')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE v_tenant UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM public._grant_role_perm(v_tenant, 'tenant_admin', 'social.manage');
  PERFORM public._grant_role_perm(v_tenant, 'marketing_manager', 'social.manage');
END;
$$;

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'facebook', 'instagram', 'x')),
  account_name TEXT NOT NULL,
  account_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  profile_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'expired', 'disconnected', 'error')),
  config JSONB NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, platform)
);

CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  content TEXT NOT NULL,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  link_url TEXT,
  platforms TEXT[] NOT NULL,
  account_ids UUID[] NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  external_post_ids JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_schedule
  ON public.social_posts (tenant_id, environment, status, scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_accounts_tenant" ON public.social_accounts FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "social_posts_tenant" ON public.social_posts FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.social_accounts TO authenticated;
GRANT ALL ON public.social_posts TO authenticated;

CREATE TRIGGER social_accounts_updated_at BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.list_social_accounts(p_tenant_id UUID, p_environment TEXT)
RETURNS SETOF public.social_accounts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'social.manage');
  RETURN QUERY SELECT * FROM public.social_accounts sa
  WHERE sa.tenant_id = p_tenant_id AND sa.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  ORDER BY sa.platform;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_social_account(
  p_tenant_id UUID, p_environment TEXT, p_platform TEXT,
  p_account_name TEXT, p_account_id TEXT, p_access_token TEXT,
  p_refresh_token TEXT, p_token_expires_at TIMESTAMPTZ,
  p_profile_image_url TEXT, p_config JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'social.manage');
  IF p_platform NOT IN ('linkedin', 'facebook', 'instagram', 'x') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  INSERT INTO public.social_accounts (
    tenant_id, environment, platform, account_name, account_id,
    access_token, refresh_token, token_expires_at, profile_image_url,
    status, config, connected_at
  ) VALUES (
    p_tenant_id, COALESCE(NULLIF(p_environment, ''), 'production'), p_platform,
    trim(p_account_name), NULLIF(trim(p_account_id), ''),
    p_access_token, p_refresh_token, p_token_expires_at, p_profile_image_url,
    CASE WHEN p_access_token IS NOT NULL AND length(trim(p_access_token)) > 0 THEN 'connected' ELSE 'disconnected' END,
    COALESCE(p_config, '{}'::JSONB), NOW()
  )
  ON CONFLICT (tenant_id, environment, platform) DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_id = COALESCE(EXCLUDED.account_id, social_accounts.account_id),
    access_token = COALESCE(EXCLUDED.access_token, social_accounts.access_token),
    refresh_token = COALESCE(EXCLUDED.refresh_token, social_accounts.refresh_token),
    token_expires_at = EXCLUDED.token_expires_at,
    profile_image_url = EXCLUDED.profile_image_url,
    status = EXCLUDED.status,
    config = social_accounts.config || EXCLUDED.config,
    connected_at = CASE WHEN EXCLUDED.status = 'connected' THEN NOW() ELSE social_accounts.connected_at END,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_social_account(p_tenant_id UUID, p_platform TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'social.manage');
  UPDATE public.social_accounts SET
    status = 'disconnected', access_token = NULL, refresh_token = NULL, updated_at = NOW()
  WHERE tenant_id = p_tenant_id AND platform = p_platform;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_social_posts(p_tenant_id UUID, p_environment TEXT)
RETURNS SETOF public.social_posts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'social.manage');
  RETURN QUERY SELECT * FROM public.social_posts sp
  WHERE sp.tenant_id = p_tenant_id AND sp.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  ORDER BY COALESCE(sp.scheduled_at, sp.created_at) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_social_post(
  p_tenant_id UUID, p_environment TEXT, p_id UUID,
  p_content TEXT, p_platforms TEXT[], p_media_urls TEXT[],
  p_link_url TEXT, p_scheduled_at TIMESTAMPTZ, p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'social.manage');
  IF p_id IS NULL THEN
    INSERT INTO public.social_posts (tenant_id, environment, content, platforms, media_urls, link_url, scheduled_at, status, created_by)
    VALUES (p_tenant_id, COALESCE(NULLIF(p_environment, ''), 'production'), trim(p_content), p_platforms,
      COALESCE(p_media_urls, '{}'), NULLIF(trim(p_link_url), ''), p_scheduled_at, COALESCE(p_status, 'draft'), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.social_posts SET
      content = trim(p_content), platforms = p_platforms, media_urls = COALESCE(p_media_urls, media_urls),
      link_url = NULLIF(trim(p_link_url), ''), scheduled_at = p_scheduled_at,
      status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id AND tenant_id = p_tenant_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_customer_loyalty(UUID, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_social_accounts(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_social_account(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_social_posts(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_post(UUID, TEXT, UUID, TEXT, TEXT[], TEXT[], TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
