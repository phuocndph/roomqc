CREATE OR REPLACE FUNCTION public.submit_room_check_lean(
  _room_id uuid,
  _check_type text,
  _started_at timestamp with time zone,
  _notes text DEFAULT NULL::text,
  _photos text[] DEFAULT '{}'::text[],
  _items_missing jsonb DEFAULT '[]'::jsonb,
  _items_damaged jsonb DEFAULT '[]'::jsonb,
  _items_lost jsonb DEFAULT '[]'::jsonb,
  _items_consumed jsonb DEFAULT '[]'::jsonb,
  _items_replaced jsonb DEFAULT '[]'::jsonb,
  _task_id uuid DEFAULT NULL::uuid
)
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
  v_task_tenant uuid;
  v_last_check timestamptz;
  v_ok_count int;
  v_issue_count int;
  v_minibar_count int;
  v_check_id uuid;
  v_req_dl boolean;
  v_req_mr boolean;
  v_req_cc boolean;
  v_bad_item text;
  v_missing_item text;
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

  -- Quantity > 0 — kèm item_id của entry hỏng đầu tiên
  SELECT COALESCE(e->>'item_id','') INTO v_bad_item
  FROM jsonb_array_elements(
    _items_missing || _items_damaged || _items_lost || _items_consumed || _items_replaced
  ) e
  WHERE (e->>'quantity') IS NULL OR (e->>'quantity')::numeric <= 0
  LIMIT 1;
  IF v_bad_item IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_quantity:%', v_bad_item USING ERRCODE = '22023';
  END IF;

  -- Photo policy (granular per-bucket) — kèm item_id thiếu ảnh
  SELECT
    COALESCE((settings->'room_check'->>'photo_required_damaged_lost')::boolean, true),
    COALESCE((settings->'room_check'->>'photo_required_missing_replace')::boolean, false),
    COALESCE((settings->'room_check'->>'photo_required_consumed_chargeable')::boolean, false)
  INTO v_req_dl, v_req_mr, v_req_cc
  FROM public.hotels WHERE id = v_hotel_id;

  IF v_req_dl THEN
    SELECT COALESCE(e->>'item_id','') INTO v_missing_item
    FROM jsonb_array_elements(_items_damaged || _items_lost) e
    WHERE COALESCE(jsonb_array_length(COALESCE(e->'photos','[]'::jsonb)),0) = 0
    LIMIT 1;
    IF v_missing_item IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:damaged_lost:%', v_missing_item USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_req_mr THEN
    SELECT COALESCE(e->>'item_id','') INTO v_missing_item
    FROM jsonb_array_elements(_items_missing) e
    WHERE COALESCE(jsonb_array_length(COALESCE(e->'photos','[]'::jsonb)),0) = 0
    LIMIT 1;
    IF v_missing_item IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:missing_replace:%', v_missing_item USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_req_cc THEN
    SELECT COALESCE(e->>'item_id','') INTO v_missing_item
    FROM jsonb_array_elements(_items_consumed) e
    WHERE COALESCE((e->>'charge_to_guest')::boolean, true) = true
      AND COALESCE(jsonb_array_length(COALESCE(e->'photos','[]'::jsonb)),0) = 0
    LIMIT 1;
    IF v_missing_item IS NOT NULL THEN
      RAISE EXCEPTION 'photo_required:consumed_chargeable:%', v_missing_item USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Conflict detection: ai đó vừa ghi check sau _started_at?
  SELECT MAX(checked_at) INTO v_last_check
  FROM public.room_checks WHERE room_id = _room_id;
  IF v_last_check IS NOT NULL AND v_last_check > _started_at THEN
    RAISE EXCEPTION 'conflict_room_updated' USING ERRCODE = 'P0001';
  END IF;

  v_issue_count :=
      jsonb_array_length(_items_missing)
    + jsonb_array_length(_items_damaged)
    + jsonb_array_length(_items_lost)
    + jsonb_array_length(_items_consumed);
  v_minibar_count := 0;
  v_ok_count := 0;

  INSERT INTO public.room_checks (
    id, tenant_id, hotel_id, room_id, checked_by,
    check_type, check_mode, status,
    notes, photos,
    items_lost, items_consumed, items_replaced,
    started_at, checked_at
  ) VALUES (
    gen_random_uuid(), v_tenant_id, v_hotel_id, _room_id, v_user_id,
    _check_type, 'lean', 'submitted',
    _notes, _photos,
    _items_lost, _items_consumed, _items_replaced,
    _started_at, now()
  ) RETURNING id INTO v_check_id;

  -- Audit
  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', v_check_id,
    'lean_submit', NULL, 'submitted', _notes,
    jsonb_build_object('actor', v_user_id, 'check_type', _check_type, 'issue_count', v_issue_count)
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'summary_ok_count', v_ok_count,
    'summary_issue_count', v_issue_count,
    'summary_minibar_count', v_minibar_count
  );
END $function$;