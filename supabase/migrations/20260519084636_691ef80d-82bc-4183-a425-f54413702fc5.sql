CREATE OR REPLACE FUNCTION public.can_manage_user(p_manager_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_manager_level INTEGER;
  v_target_level INTEGER;
  v_manager_tenant uuid;
  v_target_tenant uuid;
  v_manager_is_super boolean;
BEGIN
  IF p_manager_id IS NULL OR p_target_user_id IS NULL OR p_manager_id = p_target_user_id THEN
    RETURN false;
  END IF;

  -- Lấy tenant + cờ super admin của manager và target
  SELECT u.tenant_id, COALESCE(u.is_super_admin, false)
    INTO v_manager_tenant, v_manager_is_super
  FROM users u WHERE u.id = p_manager_id;

  SELECT u.tenant_id INTO v_target_tenant
  FROM users u WHERE u.id = p_target_user_id;

  -- Defense-in-depth: bắt buộc cùng tenant trừ khi caller là super admin
  IF NOT v_manager_is_super THEN
    IF v_manager_tenant IS NULL OR v_target_tenant IS NULL
       OR v_manager_tenant <> v_target_tenant THEN
      RETURN false;
    END IF;
  END IF;

  -- Lấy hierarchy_level
  SELECT ul.hierarchy_level INTO v_manager_level
  FROM users u
  JOIN user_levels ul ON u.user_level_code = ul.code
  WHERE u.id = p_manager_id;

  SELECT ul.hierarchy_level INTO v_target_level
  FROM users u
  JOIN user_levels ul ON u.user_level_code = ul.code
  WHERE u.id = p_target_user_id;

  IF v_manager_level IS NULL OR v_target_level IS NULL THEN
    RETURN false;
  END IF;

  -- Manager chỉ quản lý được user có hierarchy_level cao hơn (cấp thấp hơn)
  IF v_manager_level >= v_target_level THEN
    RETURN false;
  END IF;

  -- Target do manager tạo
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_target_user_id AND created_by = p_manager_id
  ) THEN
    RETURN true;
  END IF;

  -- Manager là tenant_owner
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_manager_id AND user_level_code = 'tenant_owner'
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;