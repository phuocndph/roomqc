-- =====================================================================
-- Room Check Lean — Validation & Permission Hardening
-- =====================================================================

-- 1) validate_room_check_context: bổ sung 'periodic' (đang thiếu → block staff)
CREATE OR REPLACE FUNCTION public.validate_room_check_context(
  p_room_id uuid, p_check_type text, p_task_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  SELECT tenant_id INTO v_tenant FROM public.user_profiles
   WHERE user_id = v_user LIMIT 1;
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
      FROM public.housekeeping_tasks WHERE id = p_task_id;
    IF v_task_tenant IS NULL THEN
      RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0001';
    END IF;
    IF v_task_tenant <> v_tenant THEN
      RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE='P0001';
    END IF;
    IF NOT v_is_manager AND v_task_assignee IS DISTINCT FROM v_user THEN
      RAISE EXCEPTION 'TASK_NOT_ASSIGNED_TO_USER' USING ERRCODE='P0001';
    END IF;
  END IF;

  IF p_task_id IS NOT NULL THEN
    PERFORM public.log_state_transition(
      v_tenant, v_hotel, 'room_checks', p_room_id,
      'open_check_session', NULL, p_check_type, NULL,
      jsonb_build_object('task_id', p_task_id, 'source','rpc_validate')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'tenant_id', v_tenant, 'hotel_id', v_hotel,
    'room_id', p_room_id, 'task_id', p_task_id,
    'check_type', p_check_type, 'is_manager', v_is_manager
  );
END;
$function$;

-- 2) submit_room_check_lean: siết validation
--    - quantity > 0 cho mọi item bucket
--    - granular photo enforcement (damaged_lost mặc định bật, missing/consumed off)
--    - tenant validate cho _task_id (nếu có)
--    - audit log explicit
CREATE OR REPLACE FUNCTION public.submit_room_check_lean(
  _room_id uuid, _check_type text, _started_at timestamptz,
  _notes text DEFAULT NULL,
  _photos text[] DEFAULT '{}'::text[],
  _items_missing jsonb DEFAULT '[]'::jsonb,
  _items_damaged jsonb DEFAULT '[]'::jsonb,
  _items_lost jsonb DEFAULT '[]'::jsonb,
  _items_consumed jsonb DEFAULT '[]'::jsonb,
  _items_replaced jsonb DEFAULT '[]'::jsonb,
  _task_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_user_tenant uuid;
  v_task_tenant uuid;
  v_last_check timestamptz;
  v_ok_count int;
  v_issue_count int;
  v_minibar_count int;
  v_check_id uuid;
  v_req_dl boolean;     -- photo_required_damaged_lost
  v_req_mr boolean;     -- photo_required_missing_replace
  v_req_cc boolean;     -- photo_required_consumed_chargeable
  v_bad_qty int;
  v_missing_photo text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF _check_type NOT IN ('daily','periodic','checkin','checkout','maintenance') THEN
    RAISE EXCEPTION 'invalid_check_type:%', _check_type USING ERRCODE = '22023';
  END IF;

  SELECT r.tenant_id, r.hotel_id INTO v_tenant_id, v_hotel_id
  FROM public.rooms r WHERE r.id = _room_id FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_user_tenant := public.get_current_user_tenant_id();
  IF v_tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE = '42501';
  END IF;

  -- Validate task tenant + room link nếu có
  IF _task_id IS NOT NULL THEN
    SELECT tenant_id INTO v_task_tenant
    FROM public.housekeeping_tasks WHERE id = _task_id;
    IF v_task_tenant IS NULL THEN
      RAISE EXCEPTION 'task_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_task_tenant <> v_tenant_id THEN
      RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Quantity > 0 cho mọi bucket
  SELECT COUNT(*)::int INTO v_bad_qty FROM (
    SELECT (e->>'quantity')::numeric AS q
    FROM jsonb_array_elements(
      _items_missing || _items_damaged || _items_lost || _items_consumed || _items_replaced
    ) e
  ) s WHERE q IS NULL OR q <= 0;
  IF v_bad_qty > 0 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;

  -- Photo policy (granular per-bucket)
  SELECT
    COALESCE((settings->'room_check'->>'photo_required_damaged_lost')::boolean, true),
    COALESCE((settings->'room_check'->>'photo_required_missing_replace')::boolean, false),
    COALESCE((settings->'room_check'->>'photo_required_consumed_chargeable')::boolean, false)
  INTO v_req_dl, v_req_mr, v_req_cc
  FROM public.hotels WHERE id = v_hotel_id;

  IF v_req_dl THEN
    SELECT 'damaged_lost' INTO v_missing_photo
    FROM jsonb_array_elements(_items_damaged || _items_lost) e
    WHERE COALESCE(jsonb_array_length(COALESCE(e->'photos','[]'::jsonb)),0) = 0
    LIMIT 1;
    IF v_missing_photo IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:damaged_lost' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_req_mr THEN
    v_missing_photo := NULL;
    SELECT 'missing_replace' INTO v_missing_photo
    FROM jsonb_array_elements(_items_missing || _items_replaced) e
    WHERE COALESCE(jsonb_array_length(COALESCE(e->'photos','[]'::jsonb)),0) = 0
    LIMIT 1;
    IF v_missing_photo IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:missing_replace' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_req_cc THEN
    v_missing_photo := NULL;
    SELECT 'consumed_chargeable' INTO v_missing_photo
    FROM jsonb_array_elements(_items_consumed) e
    WHERE COALESCE((e->>'charge_to_guest')::boolean, true) = true
      AND COALESCE(jsonb_array_length(COALESCE(e->'photos','[]'::jsonb)),0) = 0
    LIMIT 1;
    IF v_missing_photo IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:consumed_chargeable' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Conflict check
  SELECT MAX(checked_at) INTO v_last_check
  FROM public.room_checks WHERE room_id = _room_id;
  IF v_last_check IS NOT NULL AND _started_at IS NOT NULL AND v_last_check > _started_at THEN
    RAISE EXCEPTION 'conflict_room_updated' USING ERRCODE = 'P0001';
  END IF;

  -- Compute counters
  v_issue_count := COALESCE(jsonb_array_length(_items_missing), 0)
                 + COALESCE(jsonb_array_length(_items_damaged), 0)
                 + COALESCE(jsonb_array_length(_items_lost), 0);
  v_minibar_count := COALESCE(jsonb_array_length(_items_consumed), 0);

  SELECT GREATEST(COALESCE(SUM(standard_quantity), 0)::int - v_issue_count, 0)
    INTO v_ok_count
  FROM public.room_items WHERE room_id = _room_id;

  INSERT INTO public.room_checks (
    room_id, tenant_id, hotel_id, task_id,
    checked_by, check_type, check_mode, status,
    items_complete, items_missing, items_damaged, items_lost,
    items_consumed, items_replaced,
    summary_ok_count, summary_issue_count, minibar_count,
    notes, photos, checked_at
  ) VALUES (
    _room_id, v_tenant_id, v_hotel_id, _task_id,
    v_user_id, _check_type, 'standard', 'submitted',
    v_issue_count = 0,
    _items_missing, _items_damaged, _items_lost,
    _items_consumed, _items_replaced,
    v_ok_count, v_issue_count, v_minibar_count,
    _notes, COALESCE(_photos, '{}'::text[]), now()
  ) RETURNING id INTO v_check_id;

  DELETE FROM public.room_check_sessions WHERE room_id = _room_id;

  -- Audit explicit
  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', v_check_id,
    'lean_submit', NULL, 'submitted', NULL,
    jsonb_build_object(
      'check_type', _check_type, 'task_id', _task_id,
      'issue_count', v_issue_count, 'minibar_count', v_minibar_count
    )
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id, 'room_id', _room_id,
    'summary_ok_count', v_ok_count,
    'summary_issue_count', v_issue_count,
    'minibar_count', v_minibar_count
  );
END $function$;

-- 3) perform_quick_room_check: thêm audit explicit (giữ nguyên logic khác)
CREATE OR REPLACE FUNCTION public.perform_quick_room_check(
  _room_id uuid, _check_type text DEFAULT 'daily',
  _notes text DEFAULT NULL, _photos text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_room_status text;
  v_user_tenant uuid;
  v_photo_mode public.photo_evidence_mode;
  v_quick_enabled boolean;
  v_rate_limit_min int;
  v_last_quick timestamptz;
  v_check_id uuid;
  v_ok_count int;
  v_old_status text;
  v_new_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _check_type NOT IN ('daily','periodic') THEN
    RAISE EXCEPTION 'quick_path_not_allowed:%', _check_type USING ERRCODE = '22023';
  END IF;

  SELECT r.tenant_id, r.hotel_id, r.status INTO v_tenant_id, v_hotel_id, v_room_status
  FROM public.rooms r WHERE r.id = _room_id FOR UPDATE;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_user_tenant := public.get_current_user_tenant_id();
  IF v_tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE = '42501';
  END IF;

  SELECT
    photo_evidence_mode,
    COALESCE((settings->'room_check'->>'quick_path_enabled')::boolean, true),
    COALESCE((settings->'room_check'->>'quick_path_rate_limit_minutes')::int, 30)
  INTO v_photo_mode, v_quick_enabled, v_rate_limit_min
  FROM public.hotels WHERE id = v_hotel_id;

  IF NOT v_quick_enabled THEN
    RAISE EXCEPTION 'quick_path_disabled' USING ERRCODE = 'P0001';
  END IF;

  SELECT MAX(checked_at) INTO v_last_quick
  FROM public.room_checks WHERE room_id = _room_id AND check_mode = 'quick';
  IF v_last_quick IS NOT NULL AND v_last_quick > (now() - (v_rate_limit_min || ' minutes')::interval) THEN
    RAISE EXCEPTION 'quick_rate_limited:%', v_rate_limit_min USING ERRCODE = 'P0001';
  END IF;

  IF v_photo_mode = 'always' AND COALESCE(array_length(_photos, 1), 0) = 0 THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(standard_quantity), 0)::int INTO v_ok_count
  FROM public.room_items WHERE room_id = _room_id;

  v_old_status := v_room_status;

  INSERT INTO public.room_checks (
    room_id, tenant_id, hotel_id,
    checked_by, check_type, check_mode, status,
    cleanliness_score, items_complete,
    summary_ok_count, summary_issue_count, minibar_count,
    notes, photos, checked_at
  ) VALUES (
    _room_id, v_tenant_id, v_hotel_id,
    v_user_id, _check_type, 'quick', 'submitted',
    5, true, v_ok_count, 0, 0,
    _notes, COALESCE(_photos, '{}'::text[]), now()
  ) RETURNING id INTO v_check_id;

  DELETE FROM public.room_check_sessions WHERE room_id = _room_id;

  IF v_room_status IN ('cleaning','dirty') THEN
    BEGIN
      PERFORM public.transition_room_status(
        _room_id := _room_id, _new_status := 'available',
        _reason := 'Quick room check OK', _actor := v_user_id
      );
      v_new_status := 'available';
    EXCEPTION WHEN undefined_function THEN
      UPDATE public.rooms SET status = 'available' WHERE id = _room_id;
      v_new_status := 'available';
    WHEN OTHERS THEN v_new_status := v_old_status;
    END;
  ELSE
    v_new_status := v_old_status;
  END IF;

  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', v_check_id,
    'quick_submit', v_old_status, COALESCE(v_new_status, v_old_status), NULL,
    jsonb_build_object('check_type', _check_type, 'mode','quick')
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id, 'room_id', _room_id,
    'old_status', v_old_status, 'new_status', COALESCE(v_new_status, v_old_status),
    'summary_ok_count', v_ok_count
  );
END $function$;

-- 4) reopen_room_check: thêm audit explicit
CREATE OR REPLACE FUNCTION public.reopen_room_check(
  _check_id uuid, _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  SELECT user_level INTO v_role FROM public.users WHERE id = v_user_id;
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