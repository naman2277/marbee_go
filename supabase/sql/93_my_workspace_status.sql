-- =============================================================================
-- 93 — my_workspace_status()   (Phase 0 · TD-20)
--
-- After sql/91 a suspended workspace is invisible to its members (correct), so the
-- app can't tell "your workspace is suspended" from "you have no workspace". This
-- read-only function tells the SIGNED-IN user about THEIR OWN memberships only:
-- how many active workspaces they have, and the names of their suspended ones.
-- It reveals nothing about other users or workspaces, grants no access, and
-- changes nothing.
--
-- Order: after 91. Safe to re-run. Rollback: DROP FUNCTION public.my_workspace_status();
-- =============================================================================
CREATE OR REPLACE FUNCTION public.my_workspace_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active', (SELECT count(*) FROM public.user_tenant_ids()),
    'suspended', COALESCE((
      SELECT jsonb_agg(t.name ORDER BY t.name)
      FROM public.tenant_users tu
      JOIN public.tenants t ON t.id = tu.tenant_id
      WHERE tu.user_id = auth.uid() AND tu.status = 'active' AND t.status = 'suspended'
    ), '[]'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.my_workspace_status() FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.my_workspace_status() FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.my_workspace_status() TO authenticated;
