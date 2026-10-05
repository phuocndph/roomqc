-- =====================================================================
-- Room Check Lean v1 — Business Logic RPCs
-- =====================================================================

-- 1) UPGRADE perform_quick_room_check
--    + Restrict to daily/periodic only
--    + Honor hotel quick_path_enabled
--    + Enforce rate-limit per-hotel config
--    + Auto-fill summary_ok_count from room standard items
CREATE OR REPLACE FUNCTION public.perform_quick_room_check(
  _room_id uuid,
  _check_type text DEFAULT 'daily',
  _notes text DEFAULT NULL,
  _photos text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Lean: quick path chỉ cho daily / periodic
  IF _check_type NOT IN ('daily','periodic') THEN
    RAISE EXCEPTION 'quick_path_not_allowed:%', _check_type USING ERRCODE = '22023';
  END IF;

  SELECT r.tenant_id, r.hotel_id, r.status
    INTO v_tenant_id, v_hotel_id, v_room_status
  FROM public.rooms r
  WHERE r.id = _room_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_user_tenant := public.get_current_user_tenant_id();
  IF v_tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE = '42501';
  END IF;

  -- Hotel config
  SELECT
    photo_evidence_mode,
    COALESCE((settings->'room_check'->>'quick_path_enabled')::boolean, true),
    COALESCE((settings->'room_check'->>'quick_path_rate_limit_minutes')::int, 30)
  INTO v_photo_mode, v_quick_enabled, v_rate_limit_min
  FROM public.hotels WHERE id = v_hotel_id;

  IF NOT v_quick_enabled THEN
    RAISE EXCEPTION 'quick_path_disabled' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limit
  SELECT MAX(checked_at) INTO v_last_quick
  FROM public.room_checks
  WHERE room_id = _room_id AND check_mode = 'quick';

  IF v_last_quick IS NOT NULL AND v_last_quick > (now() - (v_rate_limit_min || ' minutes')::interval) THEN
    RAISE EXCEPTION 'quick_rate_limited:%', v_rate_limit_min USING ERRCODE = 'P0001';
  END IF;

  -- Photo evidence (always mode)
  IF v_photo_mode = 'always' AND COALESCE(array_length(_photos, 1), 0) = 0 THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = 'P0001';
  END IF;

  -- Đếm số item chuẩn của phòng → summary_ok_count
  SELECT COALESCE(SUM(standard_quantity), 0)::int INTO v_ok_count
  FROM public.room_items
  WHERE room_id = _room_id;

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
    5, true,
    v_ok_count, 0, 0,
    _notes, COALESCE(_photos, '{}'::text[]), now()
  ) RETURNING id INTO v_check_id;

  -- Cleanup session
  DELETE FROM public.room_check_sessions WHERE room_id = _room_id;

  -- Lift room → available nếu đang cleaning/dirty
  IF v_room_status IN ('cleaning','dirty') THEN
    BEGIN
      PERFORM public.transition_room_status(
        _room_id := _room_id,
        _new_status := 'available',
        _reason := 'Quick room check OK',
        _actor := v_user_id
      );
      v_new_status := 'available';
    EXCEPTION WHEN undefined_function THEN
      UPDATE public.rooms SET status = 'available' WHERE id = _room_id;
      v_new_status := 'available';
    WHEN OTHERS THEN
      v_new_status := v_old_status;
    END;
  ELSE
    v_new_status := v_old_status;
  END IF;

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'room_id', _room_id,
    'old_status', v_old_status,
    'new_status', COALESCE(v_new_status, v_old_status),
    'summary_ok_count', v_ok_count
  );
END $$;

GRANT EXECUTE ON FUNCTION public.perform_quick_room_check(uuid,text,text,text[]) TO authenticated;

-- =====================================================================
-- 2) NEW: submit_room_check_lean
--    Atomic standard submit. Conflict check, summary computed server-side.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_room_check_lean(
  _room_id uuid,
  _check_type text,
  _started_at timestamptz,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_user_tenant uuid;
  v_last_check timestamptz;
  v_ok_count int;
  v_issue_count int;
  v_minibar_count int;
  v_check_id uuid;
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

  -- Conflict check: ai đó đã submit sau khi user mở phiên?
  SELECT MAX(checked_at) INTO v_last_check
  FROM public.room_checks WHERE room_id = _room_id;

  IF v_last_check IS NOT NULL AND _started_at IS NOT NULL AND v_last_check > _started_at THEN
    RAISE EXCEPTION 'conflict_room_updated' USING ERRCODE = 'P0001';
  END IF;

  -- Compute summary counters
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

  -- Cleanup session
  DELETE FROM public.room_check_sessions WHERE room_id = _room_id;

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'room_id', _room_id,
    'summary_ok_count', v_ok_count,
    'summary_issue_count', v_issue_count,
    'minibar_count', v_minibar_count
  );
END $$;

GRANT EXECUTE ON FUNCTION public.submit_room_check_lean(uuid,text,timestamptz,text,text[],jsonb,jsonb,jsonb,jsonb,jsonb,uuid) TO authenticated;

-- =====================================================================
-- 3) NEW: reopen_room_check (supervisor only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reopen_room_check(
  _check_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_user_tenant uuid;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.room_checks WHERE id = _check_id FOR UPDATE;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'check_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_user_tenant := public.get_current_user_tenant_id();
  IF v_tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE = '42501';
  END IF;

  -- Chỉ owner/manager mới reopen được
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

  RETURN jsonb_build_object('check_id', _check_id, 'status', 'reopened');
END $$;

GRANT EXECUTE ON FUNCTION public.reopen_room_check(uuid,text) TO authenticated;
