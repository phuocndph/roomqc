
-- 1) Helper: chuẩn hóa status legacy về v2 (idempotent)
CREATE OR REPLACE FUNCTION public.fn_normalize_room_status_v2(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _status
    WHEN 'vacant'        THEN 'vacant_clean'
    WHEN 'occupied'      THEN 'occupied_clean'
    WHEN 'cleaning'      THEN 'vacant_dirty'
    WHEN 'check_out'     THEN 'vacant_dirty'
    WHEN 'check_in'      THEN 'occupied_clean'
    WHEN 'maintenance'   THEN 'out_of_service'
    WHEN 'reserved'      THEN 'reserved'
    ELSE _status
  END;
$$;

-- 2) Backfill dữ liệu legacy nếu còn (an toàn vì chỉ map sang v2)
UPDATE public.rooms
   SET status = public.fn_normalize_room_status_v2(status)
 WHERE status IN ('vacant','occupied','cleaning','check_in','check_out','maintenance');

-- 3) perform_checkin: hiểu cả status v2 + legacy, set room = occupied_clean
CREATE OR REPLACE FUNCTION public.perform_checkin(
  p_booking_id uuid,
  p_room_id uuid,
  p_early_checkin_charge numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
  v_room_status TEXT;
  v_room_tenant UUID;
  v_room_hotel UUID;
  v_current_booking_id UUID;
  v_current_guest_name TEXT;
BEGIN
  -- Lock room
  SELECT status, tenant_id, hotel_id
    INTO v_room_status, v_room_tenant, v_room_hotel
  FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  -- Nếu đã có khách khác đang checked_in trong phòng này → chặn
  IF v_room_status IN ('occupied_clean','occupied_dirty','dnd','service_refused','sleep_out','occupied') THEN
    SELECT rb.id, rb.guest_name
      INTO v_current_booking_id, v_current_guest_name
    FROM public.room_bookings rb
    WHERE rb.room_id = p_room_id
      AND rb.status = 'checked_in'
      AND rb.id <> p_booking_id
    LIMIT 1;

    IF v_current_booking_id IS NOT NULL THEN
      RAISE EXCEPTION 'ROOM_OCCUPIED:%', v_current_guest_name;
    END IF;
  END IF;

  -- Trạng thái cho phép check-in (v2 + legacy alias)
  IF v_room_status NOT IN (
    'vacant_clean','vacant_inspected','reserved',
    -- legacy
    'vacant','cleaning','check_out'
  ) THEN
    -- Báo lỗi rõ ràng cho từng case không cho phép
    IF v_room_status = 'vacant_dirty' THEN
      RAISE EXCEPTION 'ROOM_DIRTY_NEEDS_CLEANING';
    ELSIF v_room_status IN ('out_of_order','out_of_service','maintenance') THEN
      RAISE EXCEPTION 'ROOM_BLOCKED_FOR_MAINTENANCE:%', v_room_status;
    ELSE
      RAISE EXCEPTION 'INVALID_ROOM_STATUS:%', v_room_status;
    END IF;
  END IF;

  -- Booking phải đang confirmed/pending
  UPDATE public.room_bookings
     SET status = 'checked_in',
         actual_check_in = v_now,
         early_checkin_charge = p_early_checkin_charge,
         updated_at = v_now
   WHERE id = p_booking_id
     AND status IN ('confirmed','pending');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_VALID';
  END IF;

  -- Set phòng sang occupied_clean
  UPDATE public.rooms
     SET status = 'occupied_clean',
         updated_at = v_now
   WHERE id = p_room_id;

  -- Audit log
  INSERT INTO public.audit_log (
    tenant_id, hotel_id, table_name, record_id, action,
    actor_id, old_data, new_data, context
  ) VALUES (
    v_room_tenant, v_room_hotel, 'rooms', p_room_id, 'state_change',
    auth.uid(),
    jsonb_build_object('status', v_room_status),
    jsonb_build_object('status', 'occupied_clean'),
    jsonb_build_object('reason', 'perform_checkin', 'booking_id', p_booking_id)
  );

  v_result := jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'room_id', p_room_id,
    'checked_in_at', v_now
  );
  RETURN v_result;
END;
$$;

-- 4) perform_checkout: set phòng sang vacant_dirty (chờ HK dọn)
CREATE OR REPLACE FUNCTION public.perform_checkout(
  p_booking_id uuid,
  p_room_id uuid,
  p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,
  p_subtotal numeric DEFAULT 0,
  p_vat_amount numeric DEFAULT 0,
  p_service_fee_amount numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_damage_charges numeric DEFAULT 0,
  p_damage_notes text DEFAULT NULL,
  p_damage_items jsonb DEFAULT '[]'::jsonb,
  p_new_amount_paid numeric DEFAULT NULL,
  p_check_out_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
  v_deposit_amount NUMERIC;
  v_amount_paid NUMERIC;
  v_payment_status TEXT;
  v_room_status TEXT;
  v_room_tenant UUID;
  v_room_hotel UUID;
BEGIN
  SELECT deposit_amount, amount_paid
    INTO v_deposit_amount, v_amount_paid
  FROM public.room_bookings WHERE id = p_booking_id;

  IF p_new_amount_paid IS NOT NULL THEN
    v_amount_paid := p_new_amount_paid;
  END IF;

  IF (COALESCE(v_deposit_amount,0) + COALESCE(v_amount_paid,0)) >= p_total_amount THEN
    v_payment_status := 'paid';
  ELSIF (COALESCE(v_deposit_amount,0) + COALESCE(v_amount_paid,0)) > 0 THEN
    v_payment_status := 'partial';
  ELSE
    v_payment_status := 'pending';
  END IF;

  UPDATE public.room_bookings
     SET status = 'checked_out',
         actual_check_out = v_now,
         check_out_date = COALESCE(p_check_out_date, check_out_date),
         late_checkout_charge = p_late_checkout_charge,
         service_charges = p_service_charges,
         subtotal = p_subtotal,
         vat_amount = p_vat_amount,
         service_fee_amount = p_service_fee_amount,
         total_amount = p_total_amount,
         payment_status = v_payment_status,
         damage_charges = COALESCE(p_damage_charges, 0),
         damage_notes = p_damage_notes,
         damage_items = COALESCE(p_damage_items, '[]'::jsonb),
         amount_paid = CASE WHEN p_new_amount_paid IS NOT NULL THEN p_new_amount_paid ELSE amount_paid END,
         paid_at = CASE WHEN p_new_amount_paid IS NOT NULL THEN v_now ELSE paid_at END,
         updated_at = v_now
   WHERE id = p_booking_id
     AND status = 'checked_in';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in checked_in state';
  END IF;

  SELECT status, tenant_id, hotel_id
    INTO v_room_status, v_room_tenant, v_room_hotel
  FROM public.rooms WHERE id = p_room_id;

  UPDATE public.rooms
     SET status = 'vacant_dirty',
         updated_at = v_now
   WHERE id = p_room_id;

  INSERT INTO public.audit_log (
    tenant_id, hotel_id, table_name, record_id, action,
    actor_id, old_data, new_data, context
  ) VALUES (
    v_room_tenant, v_room_hotel, 'rooms', p_room_id, 'state_change',
    auth.uid(),
    jsonb_build_object('status', v_room_status),
    jsonb_build_object('status', 'vacant_dirty'),
    jsonb_build_object('reason', 'perform_checkout', 'booking_id', p_booking_id)
  );

  v_result := jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payment_status', v_payment_status,
    'total_amount', p_total_amount,
    'damage_charges', COALESCE(p_damage_charges, 0)
  );
  RETURN v_result;
END;
$$;
