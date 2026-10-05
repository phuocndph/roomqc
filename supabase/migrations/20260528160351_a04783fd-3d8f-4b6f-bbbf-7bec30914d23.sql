-- ============================================================
-- Phase 2b: room_blocks + RPCs move/resize/block management
-- ============================================================

-- 1) Table
CREATE TABLE IF NOT EXISTS public.room_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  block_type text NOT NULL DEFAULT 'maintenance'
    CHECK (block_type IN ('ooo','oos','vip_hold','maintenance','other')),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_blocks_date_check CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_room_blocks_hotel_range
  ON public.room_blocks (hotel_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_room_blocks_room
  ON public.room_blocks (room_id, start_date, end_date);

-- 2) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_blocks TO authenticated;
GRANT ALL ON public.room_blocks TO service_role;

-- 3) RLS
ALTER TABLE public.room_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_blocks_select_same_tenant"
  ON public.room_blocks FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "room_blocks_insert_manager"
  ON public.room_blocks FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'hotel_manager')
      OR public.has_role(auth.uid(), 'department_manager')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "room_blocks_update_manager"
  ON public.room_blocks FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'hotel_manager')
      OR public.has_role(auth.uid(), 'department_manager')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "room_blocks_delete_manager"
  ON public.room_blocks FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'hotel_manager')
      OR public.has_role(auth.uid(), 'department_manager')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_room_blocks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_room_blocks_touch
  BEFORE UPDATE ON public.room_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_room_blocks_updated_at();

-- 5) Helper: kiểm tra xung đột với booking khác
CREATE OR REPLACE FUNCTION public._tc_check_booking_conflict(
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_exclude_booking_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.room_bookings
   WHERE room_id = p_room_id
     AND status IN ('confirmed','checked_in')
     AND (p_exclude_booking_id IS NULL OR id <> p_exclude_booking_id)
     AND check_in_date < p_check_out
     AND check_out_date > p_check_in
   LIMIT 1
$$;

-- 6) Helper: kiểm tra xung đột với room_block
CREATE OR REPLACE FUNCTION public._tc_check_block_conflict(
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_exclude_block_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.room_blocks
   WHERE room_id = p_room_id
     AND (p_exclude_block_id IS NULL OR id <> p_exclude_block_id)
     AND start_date < p_check_out
     AND end_date > p_check_in
   LIMIT 1
$$;

-- 7) RPC: create_room_block
CREATE OR REPLACE FUNCTION public.create_room_block(
  p_hotel_id uuid,
  p_room_id uuid,
  p_start_date date,
  p_end_date date,
  p_block_type text DEFAULT 'maintenance',
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tenant uuid := public.get_current_user_tenant_id();
  v_hotel_tenant uuid;
  v_conflict_booking uuid;
  v_conflict_block uuid;
  v_block_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'invalid_date_range: Ngày kết thúc phải sau ngày bắt đầu' USING ERRCODE = '22023';
  END IF;
  IF p_block_type NOT IN ('ooo','oos','vip_hold','maintenance','other') THEN
    RAISE EXCEPTION 'invalid_block_type' USING ERRCODE = '22023';
  END IF;

  -- Validate tenant
  SELECT tenant_id INTO v_hotel_tenant FROM public.hotels WHERE id = p_hotel_id;
  IF v_hotel_tenant IS NULL OR v_hotel_tenant <> v_tenant THEN
    RAISE EXCEPTION 'forbidden_hotel' USING ERRCODE = '42501';
  END IF;

  -- Validate room thuộc hotel
  PERFORM 1 FROM public.rooms
   WHERE id = p_room_id AND hotel_id = p_hotel_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_in_hotel' USING ERRCODE = '42501';
  END IF;

  -- Conflict checks
  v_conflict_booking := public._tc_check_booking_conflict(p_room_id, p_start_date, p_end_date, NULL);
  IF v_conflict_booking IS NOT NULL THEN
    RAISE EXCEPTION 'conflict_with_booking: Khoảng ngày bị trùng với booking đang hoạt động' USING ERRCODE = '23P01';
  END IF;

  v_conflict_block := public._tc_check_block_conflict(p_room_id, p_start_date, p_end_date, NULL);
  IF v_conflict_block IS NOT NULL THEN
    RAISE EXCEPTION 'conflict_with_block: Khoảng ngày bị trùng với block đã có' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.room_blocks(tenant_id, hotel_id, room_id, start_date, end_date, block_type, reason, created_by)
  VALUES (v_tenant, p_hotel_id, p_room_id, p_start_date, p_end_date, p_block_type, p_reason, v_user)
  RETURNING id INTO v_block_id;

  PERFORM public.log_state_transition(
    v_tenant, p_hotel_id, 'room_blocks', v_block_id,
    'create', NULL, p_block_type, p_reason,
    jsonb_build_object('room_id', p_room_id, 'start_date', p_start_date, 'end_date', p_end_date)
  );

  RETURN jsonb_build_object('id', v_block_id, 'ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_room_block(uuid, uuid, date, date, text, text) TO authenticated;

-- 8) RPC: delete_room_block
CREATE OR REPLACE FUNCTION public.delete_room_block(p_block_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tenant uuid := public.get_current_user_tenant_id();
  v_row public.room_blocks%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_row FROM public.room_blocks WHERE id = p_block_id;
  IF NOT FOUND OR v_row.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'block_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner') OR public.has_role(v_user, 'hotel_manager')
    OR public.has_role(v_user, 'department_manager') OR public.has_role(v_user, 'super_admin')
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.room_blocks WHERE id = p_block_id;

  PERFORM public.log_state_transition(
    v_tenant, v_row.hotel_id, 'room_blocks', p_block_id,
    'delete', v_row.block_type, NULL, v_row.reason,
    jsonb_build_object('room_id', v_row.room_id, 'start_date', v_row.start_date, 'end_date', v_row.end_date)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_room_block(uuid) TO authenticated;

-- 9) RPC: move_booking (đổi phòng và/hoặc ngày)
CREATE OR REPLACE FUNCTION public.move_booking(
  p_booking_id uuid,
  p_new_room_id uuid,
  p_new_check_in date,
  p_new_check_out date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tenant uuid := public.get_current_user_tenant_id();
  v_row public.room_bookings%ROWTYPE;
  v_conflict_booking uuid;
  v_conflict_block uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_new_check_out <= p_new_check_in THEN
    RAISE EXCEPTION 'invalid_date_range: Ngày trả phải sau ngày nhận' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.room_bookings WHERE id = p_booking_id;
  IF NOT FOUND OR v_row.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'checked_out' OR v_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'booking_locked: Booking đã đóng, không thể di chuyển' USING ERRCODE = '23514';
  END IF;

  -- Validate new room thuộc cùng hotel
  PERFORM 1 FROM public.rooms
   WHERE id = p_new_room_id AND hotel_id = v_row.hotel_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_in_hotel' USING ERRCODE = '42501';
  END IF;

  -- Nếu đang lưu trú, không cho đổi ngày check-in về quá khứ
  IF v_row.status = 'checked_in' AND v_row.check_in_date <> p_new_check_in THEN
    RAISE EXCEPTION 'checkin_locked: Khách đang lưu trú, không thể đổi ngày nhận' USING ERRCODE = '23514';
  END IF;

  -- Conflict checks
  v_conflict_booking := public._tc_check_booking_conflict(p_new_room_id, p_new_check_in, p_new_check_out, p_booking_id);
  IF v_conflict_booking IS NOT NULL THEN
    RAISE EXCEPTION 'conflict_with_booking: Phòng đã có booking khác trong khoảng này' USING ERRCODE = '23P01';
  END IF;

  v_conflict_block := public._tc_check_block_conflict(p_new_room_id, p_new_check_in, p_new_check_out, NULL);
  IF v_conflict_block IS NOT NULL THEN
    RAISE EXCEPTION 'conflict_with_block: Phòng đã bị block trong khoảng này' USING ERRCODE = '23P01';
  END IF;

  UPDATE public.room_bookings
     SET room_id = p_new_room_id,
         check_in_date = p_new_check_in,
         check_out_date = p_new_check_out,
         updated_at = now()
   WHERE id = p_booking_id;

  PERFORM public.log_state_transition(
    v_tenant, v_row.hotel_id, 'room_bookings', p_booking_id,
    'move', v_row.room_id::text, p_new_room_id::text, NULL,
    jsonb_build_object(
      'from_check_in', v_row.check_in_date, 'from_check_out', v_row.check_out_date,
      'to_check_in', p_new_check_in, 'to_check_out', p_new_check_out
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_booking(uuid, uuid, date, date) TO authenticated;

-- 10) RPC: resize_booking (giữ nguyên phòng, đổi ngày)
CREATE OR REPLACE FUNCTION public.resize_booking(
  p_booking_id uuid,
  p_new_check_in date,
  p_new_check_out date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.room_bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.room_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE = '42501'; END IF;
  RETURN public.move_booking(p_booking_id, v_row.room_id, p_new_check_in, p_new_check_out);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resize_booking(uuid, date, date) TO authenticated;

-- 11) Cập nhật get_tape_chart để trả thêm room_blocks
CREATE OR REPLACE FUNCTION public.get_tape_chart(
  p_hotel_id uuid,
  p_start_date date,
  p_days int DEFAULT 14
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_tenant uuid := public.get_current_user_tenant_id();
  v_hotel_tenant uuid;
  v_end date;
  v_rooms jsonb;
  v_bookings jsonb;
  v_blocks jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 THEN p_days := 14; END IF;
  IF p_days > 60 THEN p_days := 60; END IF;
  v_end := p_start_date + p_days;

  SELECT tenant_id INTO v_hotel_tenant FROM public.hotels WHERE id = p_hotel_id;
  IF v_hotel_tenant IS NULL OR v_hotel_tenant <> v_user_tenant THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'floor' DESC, r->>'room_number'), '[]'::jsonb)
  INTO v_rooms
  FROM (
    SELECT jsonb_build_object(
      'id', id, 'room_number', room_number, 'floor', floor,
      'room_type', room_type, 'status', status, 'base_price', base_price,
      'max_guests', max_guests, 'bed_type', bed_type
    ) AS r
    FROM public.rooms
    WHERE hotel_id = p_hotel_id AND tenant_id = v_user_tenant
  ) sub;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'room_id', b.room_id, 'guest_name', b.guest_name,
    'guest_phone', b.guest_phone, 'guest_count', b.guest_count,
    'check_in_date', b.check_in_date, 'check_out_date', b.check_out_date,
    'expected_check_in_time', b.expected_check_in_time,
    'expected_check_out_time', b.expected_check_out_time,
    'actual_check_in', b.actual_check_in, 'actual_check_out', b.actual_check_out,
    'status', b.status, 'payment_status', b.payment_status,
    'booking_source', b.booking_source, 'booking_group_id', b.booking_group_id,
    'total_amount', b.total_amount, 'amount_paid', b.amount_paid,
    'deposit_amount', b.deposit_amount, 'notes', b.notes
  )), '[]'::jsonb)
  INTO v_bookings
  FROM public.room_bookings b
  WHERE b.hotel_id = p_hotel_id
    AND b.tenant_id = v_user_tenant
    AND b.status IN ('confirmed','checked_in','checked_out')
    AND b.check_in_date < v_end
    AND b.check_out_date > p_start_date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', rb.id, 'room_id', rb.room_id,
    'start_date', rb.start_date, 'end_date', rb.end_date,
    'block_type', rb.block_type, 'reason', rb.reason,
    'created_at', rb.created_at, 'created_by', rb.created_by
  )), '[]'::jsonb)
  INTO v_blocks
  FROM public.room_blocks rb
  WHERE rb.hotel_id = p_hotel_id
    AND rb.tenant_id = v_user_tenant
    AND rb.start_date < v_end
    AND rb.end_date > p_start_date;

  RETURN jsonb_build_object(
    'start_date', p_start_date,
    'days', p_days,
    'rooms', v_rooms,
    'bookings', v_bookings,
    'room_blocks', v_blocks
  );
END;
$$;