-- =============================================================================
-- MARBEE — 88: NEW USERS NO LONGER JOIN THE DEMO TENANT AS ADMIN   (SEC-03, Phase 0)
--
-- Script 05 replaced handle_new_user() so that EVERY new auth user was inserted into
-- the demo tenant (00000000-…-0001) with the Tenant Admin role. With public signup on,
-- any stranger could create an account and administer that tenant.
--
-- This restores the original 01 behaviour: a new auth user gets a profile, nothing else.
-- People join a tenant ONLY through an invitation (accept_tenant_invite /
-- provisioned-user flows in 37–40) or a tenant created by a platform admin (D-017).
--
-- Also turn OFF public signups in the dashboard (Authentication → Sign In / Providers →
-- "Allow new users to sign up"). Invitations keep working with signups off.
--
-- Does NOT remove existing memberships — review them with the query at the bottom.
-- Safe to re-run. Rollback: re-run 05 (re-opens the hole — don't).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Trigger already exists (01); recreate defensively in case it was dropped.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- REVIEW (read-only): who is a member of the demo tenant, and how they got there.
-- Anyone you don't recognise was probably auto-added by the old 05 trigger.
-- =============================================================================
-- SELECT p.email, r.name AS role, tu.status, tu.created_at
-- FROM public.tenant_users tu
-- JOIN public.profiles p ON p.id = tu.user_id
-- JOIN public.roles r ON r.id = tu.role_id
-- WHERE tu.tenant_id = '00000000-0000-0000-0000-000000000001'
-- ORDER BY tu.created_at;
