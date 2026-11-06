-- W1 remediation slice: make hotel access and RPC actors tenant-scoped.
--
-- This migration intentionally changes only the shared guards used by RLS and
-- client-callable SECURITY DEFINER RPCs. It does not rewrite business tables
-- or existing data. The checks are evaluated in the database so a forged
-- tenant/hotel/actor payload cannot bypass the UI.

CREATE OR REPLACE FUNCTION public.user_has_hotel_access(
  p_user_id uuid,
  p_hotel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_hotel_id IS NULL THEN false
    -- An authenticated caller may only ask about its own access. Trusted
    -- server-side jobs keep the existing ability to evaluate another actor.
    WHEN NOT public.rpc_request_is_trusted()
      AND p_user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.hotels h
        ON h.id = p_hotel_id
      WHERE u.id = p_user_id
        AND u.status = 'active'
        AND NOT COALESCE(u.account_locked, false)
        AND u.deleted_at IS NULL
        AND (
          -- Platform Super Admin is intentionally global. Tenant owners are
          -- wide only inside their own tenant; hotel staff remain assigned.
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = u.id
              AND ur.role::text = 'super_admin'
          )
          OR COALESCE(u.is_super_admin, false)
          OR (
            h.tenant_id = u.tenant_id
            AND (
              EXISTS (
                SELECT 1
                FROM public.user_roles ur
                WHERE ur.user_id = u.id
                  AND ur.role::text = 'owner'
              )
              OR u.user_level_code = 'tenant_owner'
              OR u.hotel_id = p_hotel_id
              OR EXISTS (
                SELECT 1
                FROM public.user_hotels uh
                WHERE uh.user_id = u.id
                  AND uh.hotel_id = p_hotel_id
              )
            )
          )
        )
    )
  END;
$$;

-- Keep this helper available to RLS policies and authenticated clients that
-- already use it, while preventing anonymous or public execution.
REVOKE ALL ON FUNCTION public.user_has_hotel_access(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_hotel_access(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_rpc_actor(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_require_manager boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_user record;
  v_is_manager boolean := false;
  v_is_tenant_wide boolean := false;
BEGIN
  IF public.rpc_request_is_trusted() THEN
    RETURN v_actor;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL AND auth.uid() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT u.id, u.tenant_id, u.hotel_id, u.user_level_code,
         u.is_super_admin, u.status, u.account_locked, u.deleted_at
    INTO v_user
  FROM public.users u
  WHERE u.id = v_actor;

  IF NOT FOUND OR v_user.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF v_user.deleted_at IS NOT NULL OR v_user.status <> 'active' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_user.account_locked, false) THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED' USING ERRCODE = '42501';
  END IF;

  v_is_tenant_wide := COALESCE(v_user.is_super_admin, false)
    OR v_user.user_level_code = 'super_admin'
    OR v_user.user_level_code = 'tenant_owner'
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = v_actor
        AND ur.role::text IN ('super_admin', 'owner')
    );

  IF p_hotel_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.hotels h
       WHERE h.id = p_hotel_id
         AND h.tenant_id = p_tenant_id
     ) THEN
    RAISE EXCEPTION 'HOTEL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF p_hotel_id IS NOT NULL
     AND NOT v_is_tenant_wide
     AND v_user.hotel_id IS DISTINCT FROM p_hotel_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_hotels uh
       WHERE uh.user_id = v_actor
         AND uh.hotel_id = p_hotel_id
     ) THEN
    RAISE EXCEPTION 'HOTEL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_is_manager := v_is_tenant_wide
    OR v_user.user_level_code IN ('tenant_owner', 'hotel_manager', 'department_manager')
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = v_actor
        AND ur.role::text IN ('hotel_manager', 'department_manager')
    );

  IF p_require_manager AND NOT v_is_manager THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_rpc_actor(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_rpc_actor(uuid, uuid, uuid, boolean)
  TO service_role;
