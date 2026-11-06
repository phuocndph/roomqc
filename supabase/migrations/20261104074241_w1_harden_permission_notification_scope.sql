-- W1 remediation: effective permission/session and notification recipient scope.
-- Client-visible permission helpers must not be usable as an actor oracle, and
-- sensitive room reads must fail closed after a direct grant is revoked.

CREATE OR REPLACE FUNCTION public.has_user_permission(
  p_user_id uuid,
  p_module text,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_module IS NULL OR p_action IS NULL THEN
    RETURN false;
  END IF;

  -- Authenticated clients may ask only about their own current actor. The
  -- service role may evaluate another actor for server-side policy decisions.
  IF NOT public.rpc_request_is_trusted() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.status <> 'active'
     OR COALESCE(v_user.account_locked, false)
     OR v_user.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF v_user.user_level_code IN ('super_admin', 'tenant_owner')
     OR COALESCE(v_user.is_super_admin, false) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.tenant_id = v_user.tenant_id
      AND up.module = p_module
      AND up.enabled = true
      AND (up.action = p_action
        OR (p_action = 'update' AND up.action = 'edit')
        OR (p_action = 'edit' AND up.action = 'update'))
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.code = ur.role::text
      AND (r.tenant_id = v_user.tenant_id
        OR r.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid)
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND (p.action = p_action
        OR (p_action = 'update' AND p.action = 'edit')
        OR (p_action = 'edit' AND p.action = 'update'))
      AND p.module = p_module
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_user_permission(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_user_permission(uuid, text, text)
  TO authenticated, service_role;

-- Tenant-scoped room reads must also require the current actor to be live and
-- assigned. Older tenant-only policies would otherwise keep stale sessions
-- reading rooms after a direct grant/hotel assignment is removed.
DROP POLICY IF EXISTS "Users can view rooms from their tenant" ON public.rooms;
DROP POLICY IF EXISTS "Users can view rooms in their tenant" ON public.rooms;
DROP POLICY IF EXISTS "Users can view rooms with hotel access" ON public.rooms;
CREATE POLICY "Users can view rooms with live hotel access"
ON public.rooms FOR SELECT TO authenticated
USING (
  private.business_actor_is_live()
  AND private.business_hotel_scope(tenant_id, hotel_id)
  AND (
    public.has_user_permission(auth.uid(), 'rooms', 'view')
    OR public.has_user_permission(auth.uid(), 'rooms', 'read')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('owner', 'super_admin')
    )
  )
);

CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  p_user_id uuid,
  p_tenant_id uuid,
  p_title text,
  p_body text,
  p_type text DEFAULT 'info',
  p_action_url text DEFAULT NULL,
  p_icon text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender public.users%ROWTYPE;
  v_recipient public.users%ROWTYPE;
  v_notification_id uuid;
BEGIN
  SELECT * INTO v_sender FROM public.users WHERE id = auth.uid();
  SELECT * INTO v_recipient FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_sender.id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_NOTIFICATION_SENDER' USING ERRCODE = '42501';
  END IF;
  IF NOT public.rpc_request_is_trusted() AND (
    v_sender.status <> 'active'
    OR COALESCE(v_sender.account_locked, false)
    OR v_sender.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'INACTIVE_NOTIFICATION_SENDER' USING ERRCODE = '42501';
  END IF;
  IF v_recipient.id IS NULL OR v_sender.tenant_id IS DISTINCT FROM p_tenant_id
     OR v_recipient.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'NOTIFICATION_TENANT_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT public.rpc_request_is_trusted()
     AND NOT (v_sender.user_level_code IN ('super_admin', 'tenant_owner')
       OR COALESCE(v_sender.is_super_admin, false))
     AND NOT public.has_user_permission(v_sender.id, 'notifications', 'create') THEN
    RAISE EXCEPTION 'NOTIFICATION_CREATE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.in_app_notifications(user_id, tenant_id, title, body, type, action_url, icon, metadata, is_read)
  VALUES (v_recipient.id, p_tenant_id, p_title, p_body, p_type, p_action_url, p_icon, COALESCE(p_metadata, '{}'::jsonb), false)
  RETURNING id INTO v_notification_id;
  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification_for_user(uuid, uuid, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification_for_user(uuid, uuid, text, text, text, text, text, jsonb)
  TO authenticated, service_role;
