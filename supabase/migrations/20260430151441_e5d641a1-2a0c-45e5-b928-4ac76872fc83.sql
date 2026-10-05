-- ============================================================
-- Phase 1 / Lượt 2: validate_room_check_context RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_room_check_context(
  p_room_id     uuid,
  p_check_type  text,
  p_task_id     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_tenant      uuid;
  v_hotel       uuid;
  v_role        text;
  v_room_tenant uuid;
  v_room_hotel  uuid;
  v_task_tenant uuid;
  v_task_assignee uuid;
  v_is_manager  boolean := false;
BEGIN
  -- 1) Auth
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='P0001';
  END IF;

  -- 2) Resolve tenant của user (qua user_profiles)
  SELECT tenant_id INTO v_tenant
    FROM public.user_profiles
   WHERE user_id = v_user
   LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'USER_HAS_NO_TENANT' USING ERRCODE='P0001';
  END IF;

  -- 3) Validate check_type
  IF p_check_type IS NULL OR p_check_type NOT IN
     ('daily','checkin','checkout','maintenance','delivery','replenish','inspection','vip_setup','turndown','deep_clean')
  THEN
    RAISE EXCEPTION 'INVALID_CHECK_TYPE' USING ERRCODE='P0001';
  END IF;

  -- 4) Validate room
  SELECT tenant_id, hotel_id INTO v_room_tenant, v_room_hotel
    FROM public.rooms
   WHERE id = p_room_id;

  IF v_room_tenant IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE='P0001';
  END IF;

  IF v_room_tenant <> v_tenant THEN
    RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE='P0001';
  END IF;

  v_hotel := v_room_hotel;

  -- 5) Manager?
  SELECT role::text INTO v_role
    FROM public.user_roles WHERE user_id = v_user LIMIT 1;
  v_is_manager := v_role IN ('super_admin','owner','hotel_manager','department_manager');

  -- 6) Validate task (nếu có)
  IF p_task_id IS NOT NULL THEN
    SELECT tenant_id, assigned_to INTO v_task_tenant, v_task_assignee
      FROM public.housekeeping_tasks WHERE id = p_task_id;

    IF v_task_tenant IS NULL THEN
      RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0001';
    END IF;

    IF v_task_tenant <> v_tenant THEN
      RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE='P0001';
    END IF;

    -- Staff chỉ được mở task của mình; manager mở được tất cả
    IF NOT v_is_manager AND v_task_assignee IS DISTINCT FROM v_user THEN
      RAISE EXCEPTION 'TASK_NOT_ASSIGNED_TO_USER' USING ERRCODE='P0001';
    END IF;
  END IF;

  -- 7) Audit log nhẹ (không spam: chỉ ghi nếu có task)
  IF p_task_id IS NOT NULL THEN
    PERFORM public.log_state_transition(
      v_tenant, v_hotel, 'room_checks', p_room_id,
      'open_check_session', NULL, p_check_type, NULL,
      jsonb_build_object('task_id', p_task_id, 'source','rpc_validate')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'hotel_id', v_hotel,
    'room_id', p_room_id,
    'task_id', p_task_id,
    'check_type', p_check_type,
    'is_manager', v_is_manager
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_room_check_context(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_room_check_context(uuid,text,uuid) TO authenticated, service_role;