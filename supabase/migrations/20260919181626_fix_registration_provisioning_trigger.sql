-- Allow the trusted onboarding RPC to create the first owner without weakening
-- the normal users-table privilege checks.  The implementation is renamed and
-- wrapped so the transaction-local context is present for every trigger fired
-- while complete_registration() provisions the account.

ALTER FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) RENAME TO complete_registration_impl;

CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_tenant_name text,
  p_email text,
  p_hotel_name text,
  p_hotel_address text,
  p_hotel_phone text,
  p_hotel_email text,
  p_total_rooms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $wrapper$
BEGIN
  IF p_user_id IS NULL OR (
    auth.uid() IS DISTINCT FROM p_user_id
    AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- LOCAL=true keeps the marker scoped to this RPC transaction only.
  PERFORM set_config('roomqc.registration_provisioning', 'true', true);
  PERFORM set_config('roomqc.registration_user_id', p_user_id::text, true);

  RETURN public.complete_registration_impl(
    p_user_id, p_full_name, p_phone, p_tenant_name, p_email,
    p_hotel_name, p_hotel_address, p_hotel_phone, p_hotel_email,
    p_total_rooms
  );
END;
$wrapper$;

REVOKE EXECUTE ON FUNCTION public.complete_registration_impl(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_registration_impl(
  uuid, text, text, text, text, text, text, text, text, integer
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) IS 'Completes first registration through a transaction-scoped provisioning context; retries are idempotent.';

CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_level text;
  caller_is_super boolean;
  provisioning_context boolean :=
    current_setting('roomqc.registration_provisioning', true) = 'true';
  provisioning_user text :=
    current_setting('roomqc.registration_user_id', true);
  is_service_role boolean :=
    current_setting('request.jwt.claim.role', true) = 'service_role';
BEGIN
  -- The only privileged exception is the first owner row for the same auth
  -- subject, created by complete_registration() inside its own transaction.
  IF provisioning_context
     AND NEW.id::text = provisioning_user
     AND (auth.uid() = NEW.id OR is_service_role)
     AND NEW.tenant_id IS NOT NULL
     AND NEW.user_level_code = 'tenant_owner'
     AND COALESCE(NEW.is_primary_owner, false) THEN
    IF TG_OP = 'INSERT'
       OR (
         TG_OP = 'UPDATE'
         AND OLD.tenant_id IS NULL
         AND COALESCE(OLD.status, '') IN ('', 'pending_setup')
       ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Bỏ qua khi không có auth (service_role / migration / trigger nội bộ).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  caller_is_super := public.is_super_admin(auth.uid());
  IF caller_is_super THEN
    RETURN NEW;
  END IF;

  SELECT user_level_code INTO caller_level
  FROM public.users
  WHERE id = auth.uid();

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
       OR COALESCE(NEW.is_primary_owner, false) IS DISTINCT FROM COALESCE(OLD.is_primary_owner, false)
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Không có quyền thay đổi trường nhạy cảm của tài khoản' USING ERRCODE = '42501';
    END IF;

    IF (NEW.user_level_code IS DISTINCT FROM OLD.user_level_code
        OR NEW.role IS DISTINCT FROM OLD.role) THEN
      IF NOT public.can_manage_user(auth.uid(), NEW.id) THEN
        RAISE EXCEPTION 'Không có quyền thay đổi vai trò người dùng' USING ERRCODE = '42501';
      END IF;
      IF NEW.user_level_code = 'tenant_owner' AND caller_level <> 'tenant_owner' THEN
        RAISE EXCEPTION 'Chỉ chủ khách sạn mới gán được cấp Chủ khách sạn' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.is_super_admin = true OR COALESCE(NEW.is_primary_owner, false) = true THEN
      RAISE EXCEPTION 'Không có quyền tạo tài khoản cấp cao nhất' USING ERRCODE = '42501';
    END IF;
    IF caller_level IS NULL OR caller_level NOT IN ('tenant_owner', 'manager') THEN
      RAISE EXCEPTION 'Chỉ chủ khách sạn hoặc quản lý mới tạo được tài khoản' USING ERRCODE = '42501';
    END IF;
    IF NEW.user_level_code = 'tenant_owner' AND caller_level <> 'tenant_owner' THEN
      RAISE EXCEPTION 'Chỉ chủ khách sạn mới tạo được tài khoản Chủ khách sạn' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
