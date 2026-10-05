-- Fix validate_room_check_context: nó tham chiếu public.user_profiles không tồn tại
-- → đổi sang public.users (đúng schema dự án).
CREATE OR REPLACE FUNCTION public.validate_room_check_context(
  p_room_id uuid,
  p_check_type text,
  p_task_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='P0001';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.users
   WHERE id = v_user LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'USER_HAS_NO_TENANT' USING ERRCODE='P0001';
  END IF;

  IF p_check_type IS NULL OR p_check_type NOT IN
     ('daily','periodic','checkin','checkout','maintenance','delivery','replenish',
      'inspection','vip_setup','turndown','deep_clean')
  THEN
    RAISE EXCEPTION 'INVALID_CHECK_TYPE' USING ERRCODE='P0001';
  END IF;

  SELECT tenant_id, hotel_id INTO v_room_tenant, v_room_hotel
    FROM public.rooms WHERE id = p_room_id;
  IF v_room_tenant IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE='P0001';
  END IF;
  IF v_room_tenant <> v_tenant THEN
    RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE='P0001';
  END IF;
  v_hotel := v_room_hotel;

  SELECT role::text INTO v_role
    FROM public.user_roles WHERE user_id = v_user LIMIT 1;
  v_is_manager := v_role IN ('super_admin','owner','hotel_manager','department_manager');

  IF p_task_id IS NOT NULL THEN
    SELECT tenant_id, assigned_to INTO v_task_tenant, v_task_assignee
      FROM public.housekeeping_tasks WHERE id = p_task_id LIMIT 1;
    IF v_task_tenant IS NULL THEN
      RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0001';
    END IF;
    IF v_task_tenant <> v_tenant THEN
      RAISE EXCEPTION 'TASK_TENANT_MISMATCH' USING ERRCODE='P0001';
    END IF;
    IF NOT v_is_manager AND v_task_assignee IS NOT NULL AND v_task_assignee <> v_user THEN
      RAISE EXCEPTION 'TASK_NOT_ASSIGNED_TO_YOU' USING ERRCODE='P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant,
    'hotel_id',  v_hotel,
    'room_id',   p_room_id,
    'task_id',   p_task_id,
    'check_type', p_check_type,
    'is_manager', v_is_manager
  );
END;
$function$;