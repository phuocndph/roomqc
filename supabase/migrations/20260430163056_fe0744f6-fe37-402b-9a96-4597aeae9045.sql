DO $$ BEGIN
  CREATE TYPE public.photo_evidence_mode AS ENUM ('none', 'on_issue', 'always');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS photo_evidence_mode public.photo_evidence_mode NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.hotels.photo_evidence_mode IS
  'Khi nào nhân viên phải chụp ảnh bằng chứng khi kiểm tra phòng: none|on_issue|always';

CREATE OR REPLACE FUNCTION public.get_last_room_check(_room_id uuid)
RETURNS TABLE (
  id uuid,
  check_type text,
  checked_at timestamptz,
  checked_by uuid,
  checker_name text,
  cleanliness_score int,
  items_complete boolean,
  photos text[],
  notes text,
  issues_count int,
  qc_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rc.id,
    rc.check_type,
    rc.checked_at,
    rc.checked_by,
    COALESCE(u.full_name, 'Nhân viên') AS checker_name,
    rc.cleanliness_score,
    rc.items_complete,
    rc.photos,
    rc.notes,
    (
      COALESCE(jsonb_array_length(rc.items_missing), 0) +
      COALESCE(jsonb_array_length(rc.items_damaged), 0) +
      COALESCE(jsonb_array_length(rc.items_lost), 0)
    )::int AS issues_count,
    rc.qc_status
  FROM public.room_checks rc
  LEFT JOIN public.users u ON u.id = rc.checked_by
  WHERE rc.room_id = _room_id
    AND rc.tenant_id = public.get_current_user_tenant_id()
  ORDER BY rc.checked_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_last_room_check(uuid) TO authenticated;

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
  v_check_id uuid;
  v_old_status text;
  v_new_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF _check_type NOT IN ('daily','checkin','checkout','periodic','maintenance') THEN
    RAISE EXCEPTION 'invalid_check_type:%', _check_type USING ERRCODE = '22023';
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

  SELECT photo_evidence_mode INTO v_photo_mode FROM public.hotels WHERE id = v_hotel_id;
  IF v_photo_mode = 'always' AND COALESCE(array_length(_photos, 1), 0) = 0 THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.room_checks (
    room_id, checked_by, check_type,
    cleanliness_score, items_complete,
    items_missing, items_damaged, items_lost,
    items_consumed, items_replaced, items_sent_to_laundry,
    photos, notes, tenant_id, hotel_id, check_mode
  ) VALUES (
    _room_id, v_user_id, _check_type,
    5, true,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    COALESCE(_photos, '{}'::text[]), _notes, v_tenant_id, v_hotel_id, 'quick'
  ) RETURNING id INTO v_check_id;

  DELETE FROM public.room_check_sessions WHERE room_id = _room_id;

  v_old_status := v_room_status;
  IF _check_type = 'checkout' AND v_room_status IN ('check_out','occupied','occupied_clean','occupied_dirty') THEN
    v_new_status := 'vacant_clean';
  ELSIF _check_type = 'daily' AND v_room_status IN ('cleaning','vacant_dirty','vacant_inspected') THEN
    v_new_status := 'vacant_clean';
  ELSIF _check_type = 'checkin' AND v_room_status IN ('vacant_clean','vacant_inspected','vacant_dirty') THEN
    v_new_status := 'occupied_clean';
  END IF;

  IF v_new_status IS NOT NULL AND v_new_status <> v_old_status THEN
    UPDATE public.rooms SET status = v_new_status, updated_at = now() WHERE id = _room_id;

    BEGIN
      PERFORM public.log_state_transition(
        'room', _room_id, v_old_status, v_new_status,
        jsonb_build_object('source', 'perform_quick_room_check', 'check_id', v_check_id)
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'room_id', _room_id,
    'old_status', v_old_status,
    'new_status', COALESCE(v_new_status, v_old_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_quick_room_check(uuid, text, text, text[]) TO authenticated;