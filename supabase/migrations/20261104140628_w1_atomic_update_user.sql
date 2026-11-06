-- W1/F134/F135: make managed-user updates atomic and enforce the requested
-- level before any profile/role/hotel write can commit.  This command is an
-- internal Edge adapter: clients must never call it directly.
CREATE OR REPLACE FUNCTION public.update_user_atomic(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_user_level_code text DEFAULT NULL,
  p_hotel_id uuid DEFAULT NULL,
  p_position_id uuid DEFAULT NULL,
  p_departments text[] DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_updated public.users%ROWTYPE;
  v_position public.positions%ROWTYPE;
  v_requested_level text := p_user_level_code;
  v_effective_hotel uuid;
  v_role public.app_role;
  v_department text;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'SERVER_WORKER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'ACTOR_AND_TARGET_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_actor_id = p_target_user_id THEN
    RAISE EXCEPTION 'SELF_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor
  FROM public.users
  WHERE id = p_actor_id
  FOR SHARE;
  IF NOT FOUND
     OR v_actor.deleted_at IS NOT NULL
     OR v_actor.status IS DISTINCT FROM 'active'
     OR COALESCE(v_actor.account_locked, false) THEN
    RAISE EXCEPTION 'ACTOR_INACTIVE_OR_LOCKED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'TARGET_DELETED' USING ERRCODE = '42501';
  END IF;
  IF v_actor.tenant_id IS DISTINCT FROM v_target.tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_user(p_actor_id, p_target_user_id) THEN
    RAISE EXCEPTION 'CANNOT_MANAGE_TARGET' USING ERRCODE = '42501';
  END IF;

  IF v_requested_level IS NOT NULL
     AND v_requested_level NOT IN ('tenant_owner','manager','department_manager','staff') THEN
    RAISE EXCEPTION 'UNSUPPORTED_USER_LEVEL' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('active','inactive','suspended') THEN
    RAISE EXCEPTION 'UNSUPPORTED_USER_STATUS' USING ERRCODE = '22023';
  END IF;

  IF v_requested_level IS NOT NULL
     AND v_requested_level IS DISTINCT FROM v_target.user_level_code THEN
    IF v_target.user_level_code = 'tenant_owner'
       OR COALESCE(v_target.is_primary_owner, false) THEN
      RAISE EXCEPTION 'OWNER_LEVEL_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    IF public.user_has_subordinates(p_target_user_id) THEN
      RAISE EXCEPTION 'TARGET_HAS_SUBORDINATES' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_create_user(p_actor_id, v_requested_level, v_target.tenant_id) THEN
      RAISE EXCEPTION 'REQUESTED_LEVEL_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_hotel_id IS NOT NULL THEN
    PERFORM 1
    FROM public.hotels h
    WHERE h.id = p_hotel_id AND h.tenant_id = v_target.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'HOTEL_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END IF;
  v_effective_hotel := COALESCE(p_hotel_id, v_target.hotel_id);
  IF COALESCE(v_requested_level, v_target.user_level_code)
       IN ('manager','department_manager')
     AND v_effective_hotel IS NULL THEN
    RAISE EXCEPTION 'MANAGER_HOTEL_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_position_id IS NOT NULL THEN
    SELECT * INTO v_position
    FROM public.positions
    WHERE id = p_position_id AND tenant_id = v_target.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POSITION_MISMATCH' USING ERRCODE = '42501';
    END IF;
    IF v_requested_level IS NOT NULL
       AND v_position.user_level_code IS NOT NULL
       AND v_position.user_level_code IS DISTINCT FROM v_requested_level
       AND NOT (v_requested_level = 'department_manager'
                AND v_position.user_level_code = 'manager') THEN
      RAISE EXCEPTION 'POSITION_LEVEL_MISMATCH' USING ERRCODE = '22023';
    END IF;
    v_department := v_position.department;
  END IF;

  IF p_departments IS NOT NULL THEN
    IF cardinality(p_departments) < 1 THEN
      v_department := NULL;
    ELSE
      FOREACH v_department IN ARRAY p_departments LOOP
        IF v_department NOT IN ('housekeeping','laundry','inventory','maintenance','accounting','front_desk','other') THEN
          RAISE EXCEPTION 'UNSUPPORTED_DEPARTMENT' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      -- The legacy profile has one department; retain the first selected
      -- department while the hotel assignment keeps the full array.
      v_department := p_departments[1];
    END IF;
  END IF;

  IF p_full_name IS NOT NULL AND p_full_name IS DISTINCT FROM v_target.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', jsonb_build_object('old', v_target.full_name, 'new', p_full_name));
  END IF;
  IF p_phone IS DISTINCT FROM NULL AND p_phone IS DISTINCT FROM v_target.phone THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_object('old', v_target.phone, 'new', p_phone));
  END IF;
  IF v_requested_level IS NOT NULL AND v_requested_level IS DISTINCT FROM v_target.user_level_code THEN
    v_changes := v_changes || jsonb_build_object('user_level_code', jsonb_build_object('old', v_target.user_level_code, 'new', v_requested_level));
  END IF;
  IF p_status IS NOT NULL AND p_status IS DISTINCT FROM v_target.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', v_target.status, 'new', p_status));
  END IF;
  IF p_hotel_id IS NOT NULL AND p_hotel_id IS DISTINCT FROM v_target.hotel_id THEN
    v_changes := v_changes || jsonb_build_object('hotel_id', jsonb_build_object('old', v_target.hotel_id, 'new', p_hotel_id));
  END IF;
  IF p_position_id IS NOT NULL AND p_position_id IS DISTINCT FROM v_target.position_id THEN
    v_changes := v_changes || jsonb_build_object('position_id', jsonb_build_object('old', v_target.position_id, 'new', p_position_id));
  END IF;

  UPDATE public.users
  SET full_name = COALESCE(p_full_name, full_name),
      phone = CASE WHEN p_phone IS NULL THEN phone ELSE p_phone END,
      user_level_code = COALESCE(v_requested_level, user_level_code),
      role = CASE COALESCE(v_requested_level, user_level_code)
        WHEN 'tenant_owner' THEN 'owner'
        WHEN 'manager' THEN 'hotel_manager'
        WHEN 'department_manager' THEN 'department_manager'
        WHEN 'staff' THEN 'staff'
        ELSE role END,
      hotel_id = COALESCE(p_hotel_id, hotel_id),
      position_id = COALESCE(p_position_id, position_id),
      department = COALESCE(v_department, department),
      status = COALESCE(p_status, status),
      updated_at = now()
  WHERE id = p_target_user_id;

  IF p_hotel_id IS NOT NULL THEN
    INSERT INTO public.user_hotels(user_id, hotel_id, assigned_by)
    VALUES (p_target_user_id, p_hotel_id, p_actor_id)
    ON CONFLICT (user_id, hotel_id) DO UPDATE
      SET assigned_by = EXCLUDED.assigned_by;
    IF p_departments IS NOT NULL THEN
      -- The checked-in schema used by this candidate may include the legacy
      -- departments column; update it only when present in the target DB.
      BEGIN
        EXECUTE 'UPDATE public.user_hotels SET departments = $1 WHERE user_id = $2 AND hotel_id = $3'
          USING p_departments, p_target_user_id, p_hotel_id;
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
  END IF;

  IF v_requested_level IS NOT NULL THEN
    v_role := CASE v_requested_level
      WHEN 'tenant_owner' THEN 'owner'::public.app_role
      WHEN 'manager' THEN 'hotel_manager'::public.app_role
      WHEN 'department_manager' THEN 'department_manager'::public.app_role
      WHEN 'staff' THEN 'staff'::public.app_role
    END;
    DELETE FROM public.user_roles
    WHERE user_id = p_target_user_id
      AND role::text IN ('owner','hotel_manager','department_manager','staff')
      AND role IS DISTINCT FROM v_role;
    INSERT INTO public.user_roles(user_id, role, created_by)
    VALUES (p_target_user_id, v_role, p_actor_id)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  SELECT * INTO v_updated FROM public.users WHERE id = p_target_user_id;
  INSERT INTO public.activity_logs(
    tenant_id, user_id, user_name, entity_type, entity_id, entity_name,
    action, description, old_values, new_values
  ) VALUES (
    v_target.tenant_id, p_actor_id, v_target.full_name, 'user', p_target_user_id,
    v_target.full_name, 'update',
    'Cập nhật thông tin người dùng: ' || v_target.full_name,
    to_jsonb(v_target), v_changes
  );
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.update_user_atomic(uuid,uuid,text,text,text,uuid,uuid,text[],text)
  IS 'Internal service-role command for atomic, hierarchy-checked managed-user updates.';
REVOKE ALL ON FUNCTION public.update_user_atomic(uuid,uuid,text,text,text,uuid,uuid,text[],text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_atomic(uuid,uuid,text,text,text,uuid,uuid,text[],text)
  TO service_role;
