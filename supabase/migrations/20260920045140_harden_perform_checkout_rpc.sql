-- Checkout changes booking money, booking state, room state, and audit history.
-- Validate the complete context before the SECURITY DEFINER body mutates data.
CREATE OR REPLACE FUNCTION public.perform_checkout(
  p_booking_id uuid,
  p_room_id uuid,
  p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,
  p_subtotal numeric DEFAULT 0,
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
  v_actor uuid;
  v_booking record;
  v_room record;
  v_now timestamptz := now();
  v_vat_amount numeric;
  v_service_fee_amount numeric;
  v_total_amount numeric;
  v_vat_base numeric;
  v_payment_status text;
BEGIN
  IF p_booking_id IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_new_amount_paid IS NOT NULL THEN
    RAISE EXCEPTION 'DIRECT_AMOUNT_PAID_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_late_checkout_charge IS NULL OR p_late_checkout_charge < 0
     OR p_late_checkout_charge <> p_late_checkout_charge
     OR p_late_checkout_charge IN ('Infinity'::numeric, '-Infinity'::numeric)
     OR p_service_charges IS NULL OR p_service_charges < 0
     OR p_service_charges <> p_service_charges
     OR p_service_charges IN ('Infinity'::numeric, '-Infinity'::numeric)
     OR p_subtotal IS NULL OR p_subtotal < 0
     OR p_subtotal <> p_subtotal
     OR p_subtotal IN ('Infinity'::numeric, '-Infinity'::numeric)
     OR p_damage_charges IS NULL OR p_damage_charges < 0
     OR p_damage_charges <> p_damage_charges
     OR p_damage_charges IN ('Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_AMOUNT' USING ERRCODE = '22023';
  END IF;

  IF p_damage_charges > p_subtotal THEN
    RAISE EXCEPTION 'DAMAGE_EXCEEDS_SUBTOTAL' USING ERRCODE = '22023';
  END IF;
  IF p_damage_items IS NULL OR jsonb_typeof(p_damage_items) <> 'array'
     OR jsonb_array_length(p_damage_items) > 1000 THEN
    RAISE EXCEPTION 'INVALID_DAMAGE_ITEMS' USING ERRCODE = '22023';
  END IF;
  IF p_damage_notes IS NOT NULL AND length(p_damage_notes) > 10000 THEN
    RAISE EXCEPTION 'DAMAGE_NOTES_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  SELECT rb.tenant_id, rb.hotel_id, rb.room_id, rb.status,
         rb.check_in_date, rb.deposit_amount, rb.amount_paid,
         COALESCE(rb.vat_rate, 8) AS vat_rate,
         COALESCE(rb.service_fee_rate, 5) AS service_fee_rate
    INTO v_booking
  FROM public.room_bookings rb
  WHERE rb.id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_actor := public.assert_rpc_actor(
    v_booking.tenant_id,
    v_booking.hotel_id,
    auth.uid(),
    false
  );

  IF v_booking.room_id IS DISTINCT FROM p_room_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status IS DISTINCT FROM 'checked_in' THEN
    RAISE EXCEPTION 'BOOKING_NOT_CHECKED_IN' USING ERRCODE = '22023';
  END IF;
  IF p_check_out_date IS NOT NULL AND (
    p_check_out_date < v_booking.check_in_date
    OR p_check_out_date > current_date
  ) THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_DATE' USING ERRCODE = '22023';
  END IF;
  IF v_booking.vat_rate < 0 OR v_booking.vat_rate > 100
     OR v_booking.service_fee_rate < 0 OR v_booking.service_fee_rate > 100 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FEE_RATE' USING ERRCODE = '22023';
  END IF;

  SELECT r.status, r.tenant_id, r.hotel_id
    INTO v_room
  FROM public.rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_room.tenant_id IS DISTINCT FROM v_booking.tenant_id
     OR v_room.hotel_id IS DISTINCT FROM v_booking.hotel_id THEN
    RAISE EXCEPTION 'ROOM_CONTEXT_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_vat_base := p_subtotal - p_damage_charges;
  v_vat_amount := round(v_vat_base * v_booking.vat_rate / 100);
  v_service_fee_amount := round(v_vat_base * v_booking.service_fee_rate / 100);
  v_total_amount := p_subtotal + v_vat_amount + v_service_fee_amount;

  IF COALESCE(v_booking.deposit_amount, 0) + COALESCE(v_booking.amount_paid, 0)
       >= v_total_amount THEN
    v_payment_status := 'paid';
  ELSIF COALESCE(v_booking.deposit_amount, 0) + COALESCE(v_booking.amount_paid, 0) > 0 THEN
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
      vat_amount = v_vat_amount,
      service_fee_amount = v_service_fee_amount,
      total_amount = v_total_amount,
      payment_status = v_payment_status,
      damage_charges = p_damage_charges,
      damage_notes = p_damage_notes,
      damage_items = p_damage_items,
      paid_at = CASE
        WHEN v_payment_status = 'paid' THEN COALESCE(paid_at, v_now)
        ELSE paid_at
      END,
      updated_at = v_now
  WHERE id = p_booking_id;

  UPDATE public.rooms
  SET status = 'vacant_dirty', updated_at = v_now
  WHERE id = p_room_id;

  INSERT INTO public.audit_log (
    tenant_id, hotel_id, table_name, record_id, action,
    actor_id, old_data, new_data, context
  ) VALUES (
    v_booking.tenant_id,
    v_booking.hotel_id,
    'rooms',
    p_room_id,
    'state_change',
    v_actor,
    jsonb_build_object('status', v_room.status),
    jsonb_build_object('status', 'vacant_dirty'),
    jsonb_build_object('reason', 'perform_checkout', 'booking_id', p_booking_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payment_status', v_payment_status,
    'subtotal', p_subtotal,
    'vat_base', v_vat_base,
    'vat_amount', v_vat_amount,
    'service_fee_amount', v_service_fee_amount,
    'total_amount', v_total_amount,
    'damage_charges', p_damage_charges
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_checkout(
  uuid, uuid, numeric, numeric, numeric, numeric, text, jsonb, numeric, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_checkout(
  uuid, uuid, numeric, numeric, numeric, numeric, text, jsonb, numeric, date
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
