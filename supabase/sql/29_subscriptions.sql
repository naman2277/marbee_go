-- =============================================================================
-- MARBEE — Information services & subscriptions (Adobe Campaign–style)
-- Run AFTER 01_marbee_schema.sql (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.information_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'web_push', 'whatsapp', 'mobile_app')),
  delivery_mode TEXT DEFAULT 'newsletter' CHECK (delivery_mode IN ('newsletter', 'viral')),
  confirmation_mode TEXT NOT NULL DEFAULT 'simple' CHECK (confirmation_mode IN ('none', 'simple', 'double_opt_in')),
  send_subscribe_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  send_unsubscribe_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  subscribe_template TEXT,
  unsubscribe_template TEXT,
  unlimited BOOLEAN NOT NULL DEFAULT TRUE,
  validity_value INTEGER,
  validity_unit TEXT CHECK (validity_unit IS NULL OR validity_unit IN ('days', 'months')),
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS idx_information_services_tenant
  ON public.information_services (tenant_id, environment, updated_at DESC);

ALTER TABLE public.information_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "information_services_tenant_access" ON public.information_services;
CREATE POLICY "information_services_tenant_access" ON public.information_services FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.information_services TO authenticated;

CREATE TRIGGER information_services_updated_at
  BEFORE UPDATE ON public.information_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Current subscription state per customer per service
CREATE TABLE IF NOT EXISTS public.service_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  service_id UUID NOT NULL REFERENCES public.information_services(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'unsubscribed', 'expired')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'form', 'workflow', 'link')),
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_service_subscriptions_service
  ON public.service_subscriptions (service_id, status, subscribed_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_subscriptions_customer
  ON public.service_subscriptions (customer_id, status);

ALTER TABLE public.service_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_subscriptions_tenant_access" ON public.service_subscriptions;
CREATE POLICY "service_subscriptions_tenant_access" ON public.service_subscriptions FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.service_subscriptions TO authenticated;

CREATE TRIGGER service_subscriptions_updated_at
  BEFORE UPDATE ON public.service_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Subscribe / unsubscribe history
CREATE TABLE IF NOT EXISTS public.service_subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  service_id UUID NOT NULL REFERENCES public.information_services(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.service_subscriptions(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('subscribe', 'unsubscribe', 'confirm', 'expire', 'resubscribe')),
  source TEXT NOT NULL DEFAULT 'manual',
  actor_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_service
  ON public.service_subscription_events (service_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_events_customer
  ON public.service_subscription_events (customer_id, created_at DESC);

ALTER TABLE public.service_subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_subscription_events_tenant_access" ON public.service_subscription_events;
CREATE POLICY "service_subscription_events_tenant_access" ON public.service_subscription_events FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.service_subscription_events TO authenticated;

-- Recount active subscribers for a service
CREATE OR REPLACE FUNCTION public.refresh_service_subscriber_count(p_service_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.service_subscriptions
  WHERE service_id = p_service_id AND status = 'active';

  UPDATE public.information_services
  SET subscriber_count = v_count
  WHERE id = p_service_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_service_subscriber_count(UUID) TO authenticated;

-- Demo information services
INSERT INTO public.information_services (
  id, tenant_id, environment, name, slug, description, channel, delivery_mode,
  confirmation_mode, send_subscribe_confirmation, send_unsubscribe_confirmation,
  unlimited, subscriber_count, status
) VALUES
  (
    '90000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'production',
    'Weekly Newsletter',
    'weekly-newsletter',
    'Product updates and offers delivered every week',
    'email',
    'newsletter',
    'double_opt_in',
    TRUE,
    TRUE,
    TRUE,
    0,
    'active'
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'production',
    'Flash Sale Alerts',
    'flash-sale-alerts',
    'Limited-time promotional offers — auto-expires after 30 days',
    'email',
    'newsletter',
    'simple',
    FALSE,
    TRUE,
    FALSE,
    0,
    'active'
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'production',
    'Web Push Deals',
    'web-push-deals',
    'Browser push notifications for deal drops',
    'web_push',
    NULL,
    'none',
    FALSE,
    FALSE,
    TRUE,
    0,
    'active'
  )
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

UPDATE public.information_services
SET validity_value = 30, validity_unit = 'days'
WHERE id = '90000000-0000-0000-0000-000000000002';

-- Seed demo subscribers
INSERT INTO public.service_subscriptions (
  id, tenant_id, environment, service_id, customer_id, status, source, subscribed_at, confirmed_at
) VALUES
  (
    '91000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'production',
    '90000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'active',
    'manual',
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '14 days'
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'production',
    '90000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    'active',
    'form',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '7 days'
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'production',
    '90000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    'active',
    'import',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT (service_id, customer_id) DO NOTHING;

INSERT INTO public.service_subscription_events (
  id, tenant_id, environment, service_id, subscription_id, customer_id, event_type, source, actor_email
) VALUES
  (
    '92000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', 'production',
    '90000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'subscribe', 'manual', 'admin@marbee.demo'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001', 'production',
    '90000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    'subscribe', 'form', NULL
  ),
  (
    '92000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001', 'production',
    '90000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000001',
    'subscribe', 'import', 'admin@marbee.demo'
  )
ON CONFLICT (id) DO NOTHING;

SELECT public.refresh_service_subscriber_count('90000000-0000-0000-0000-000000000001');
SELECT public.refresh_service_subscriber_count('90000000-0000-0000-0000-000000000002');
SELECT public.refresh_service_subscriber_count('90000000-0000-0000-0000-000000000003');
