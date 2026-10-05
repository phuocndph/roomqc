-- Restore missing RLS policies on public.users (regression after foundation hardening)
-- Fix: is_super_admin requires p_user_id arg

DROP POLICY IF EXISTS "users_select_self_or_tenant" ON public.users;
DROP POLICY IF EXISTS "users_insert_in_tenant" ON public.users;
DROP POLICY IF EXISTS "users_update_self_or_managed" ON public.users;
DROP POLICY IF EXISTS "users_delete_subordinates" ON public.users;

CREATE POLICY "users_select_self_or_tenant"
ON public.users
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR id = auth.uid()
  OR (public.is_tenant_owner() AND tenant_id = public.get_current_user_tenant_id())
  OR (tenant_id = public.get_current_user_tenant_id() AND public.works_at_same_hotel(id))
);

CREATE POLICY "users_insert_in_tenant"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR tenant_id = public.get_current_user_tenant_id()
);

CREATE POLICY "users_update_self_or_managed"
ON public.users
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR id = auth.uid()
  OR (tenant_id = public.get_current_user_tenant_id() AND public.can_manage_user(auth.uid(), id))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR id = auth.uid()
  OR (tenant_id = public.get_current_user_tenant_id() AND public.can_manage_user(auth.uid(), id))
);

CREATE POLICY "users_delete_subordinates"
ON public.users
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_current_user_tenant_id()
    AND public.can_manage_user(auth.uid(), id)
    AND COALESCE(is_primary_owner, false) = false
  )
);

COMMENT ON POLICY "users_select_self_or_tenant" ON public.users IS
  'Restored after foundation hardening regression — bảng users từng bị mất toàn bộ policy.';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policy
  WHERE polrelid = 'public.users'::regclass;
  IF v_count < 4 THEN
    RAISE EXCEPTION 'Restore failed: expected >=4 policies on public.users, got %', v_count;
  END IF;
END $$;