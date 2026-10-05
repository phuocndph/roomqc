-- Manual confirmation accepts client values only as consistency checks.  The
-- payment row and booking totals remain authoritative for settlement.
CREATE OR REPLACE FUNCTION public.confirm_booking_payment_manual(
  p_payment_id uuid,
  p_booking_id uuid,
  p_amount numeric,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_payment record;
  v_booking_total numeric;
BEGIN
  IF p_payment_id IS NULL OR p_booking_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount <> p_amount
     OR p_amount IN ('Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;

  SELECT bp.tenant_id, bp.hotel_id, bp.booking_id, bp.amount
    INTO v_payment
  FROM public.booking_payments bp
  WHERE bp.id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.booking_id IS DISTINCT FROM p_booking_id THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_rpc_actor(
    v_payment.tenant_id,
    v_payment.hotel_id,
    auth.uid(),
    false
  );

  IF p_amount <> v_payment.amount THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_total_amount IS NOT NULL THEN
    IF p_total_amount <= 0
       OR p_total_amount <> p_total_amount
       OR p_total_amount IN ('Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'INVALID_TOTAL_AMOUNT' USING ERRCODE = '22023';
    END IF;

    SELECT rb.total_amount
      INTO v_booking_total
    FROM public.room_bookings rb
    WHERE rb.id = p_booking_id
    FOR UPDATE;
    IF NOT FOUND OR v_booking_total IS DISTINCT FROM p_total_amount THEN
      RAISE EXCEPTION 'BOOKING_TOTAL_MISMATCH' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN public.settle_booking_payment(p_payment_id, NULL);
END;
$$;
