CREATE OR REPLACE FUNCTION public.reopen_room_check(_check_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_user_tenant uuid;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, hotel_id INTO v_tenant_id, v_hotel_id
    FROM public.room_checks WHERE id = _check_id FOR UPDATE;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'check_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_user_tenant := public.get_current_user_tenant_id();
  IF v_tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE = '42501';
  END IF;

  SELECT user_level_code INTO v_role FROM public.users WHERE id = v_user_id;
  IF v_role NOT IN ('super_admin','tenant_owner','manager') THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = '42501';
  END IF;

  UPDATE public.room_checks
  SET status = 'reopened',
      notes = COALESCE(notes,'') ||
              CASE WHEN _reason IS NOT NULL
                   THEN E'\n[Mở lại: ' || _reason || ']'
                   ELSE E'\n[Mở lại bởi quản lý]' END,
      updated_at = now()
  WHERE id = _check_id;

  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', _check_id,
    'reopen', 'submitted', 'reopened', _reason,
    jsonb_build_object('actor', v_user_id)
  );

  RETURN jsonb_build_object('check_id', _check_id, 'status', 'reopened');
END $function$;