-- 1) Allow 'pending_refund' as a payment_method value for soft refund tracking
ALTER TABLE public.booking_payments DROP CONSTRAINT IF EXISTS booking_payments_payment_method_check;
ALTER TABLE public.booking_payments
  ADD CONSTRAINT booking_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'bank_transfer', 'pending_refund'));

-- 2) Upgrade cancel_booking RPC to accept reason + refund flag, append notes, and
--    record a soft pending_refund entry into booking_payments when needed.
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid,
  p_room_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL,
  p_refund_deposit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_booking_status TEXT;
  v_existing_notes TEXT;
  v_deposit NUMERIC := 0;
  v_tenant UUID;
  v_hotel UUID;
  v_suffix TEXT;
  v_new_notes TEXT;
BEGIN
  SELECT status, notes, COALESCE(deposit_amount, 0), tenant_id, hotel_id
    INTO v_booking_status, v_existing_notes, v_deposit, v_tenant, v_hotel
  FROM room_bookings WHERE id = p_booking_id;

  IF v_booking_status IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking_status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Booking cannot be cancelled in current status: %', v_booking_status;
  END IF;

  v_suffix := CASE
    WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0
      THEN '[Hủy: ' || trim(p_reason) || CASE WHEN p_refund_deposit AND v_deposit > 0 THEN ' — cần hoàn cọc' ELSE '' END || ']'
    ELSE NULL
  END;

  v_new_notes := CASE
    WHEN v_suffix IS NULL THEN v_existing_notes
    WHEN v_existing_notes IS NULL OR length(v_existing_notes) = 0 THEN v_suffix
    ELSE v_existing_notes || E'\n' || v_suffix
  END;

  UPDATE room_bookings
  SET status = 'cancelled',
      notes = v_new_notes,
      updated_at = v_now
  WHERE id = p_booking_id;

  IF p_room_id IS NOT NULL THEN
    IF v_booking_status = 'checked_in' THEN
      UPDATE rooms SET status = 'cleaning', updated_at = v_now WHERE id = p_room_id;
    ELSE
      UPDATE rooms SET status = 'vacant', updated_at = v_now
      WHERE id = p_room_id AND status NOT IN ('maintenance', 'out_of_order');
    END IF;
  END IF;

  -- Soft record refund need (negative amount) for accounting
  IF p_refund_deposit AND v_deposit > 0 THEN
    INSERT INTO public.booking_payments(
      tenant_id, hotel_id, booking_id, amount, payment_method,
      payment_status, notes, paid_at, metadata
    ) VALUES (
      v_tenant, v_hotel, p_booking_id, -v_deposit, 'pending_refund',
      'pending',
      'Hoàn cọc khi hủy đặt phòng: ' || COALESCE(p_reason, ''),
      v_now,
      jsonb_build_object('type', 'cancel_refund', 'reason', p_reason)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'previous_status', v_booking_status,
    'refund_recorded', (p_refund_deposit AND v_deposit > 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, uuid, text, boolean) TO authenticated;