DROP FUNCTION IF EXISTS public.update_booking_amount_paid(uuid, numeric, numeric);

CREATE FUNCTION public.update_booking_amount_paid(
  p_booking_id uuid,
  p_amount_to_add numeric,
  p_total_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_amount_paid numeric;
  v_new_amount_paid numeric;
  v_deposit_amount numeric;
  v_total_paid numeric;
  v_payment_status text;
BEGIN
  IF p_amount_to_add <= 0 THEN
    RAISE EXCEPTION 'Amount to add must be positive';
  END IF;

  SELECT COALESCE(amount_paid, 0), COALESCE(deposit_amount, 0)
  INTO v_current_amount_paid, v_deposit_amount
  FROM room_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  v_new_amount_paid := v_current_amount_paid + p_amount_to_add;
  v_total_paid := v_new_amount_paid + v_deposit_amount;

  IF v_total_paid >= p_total_amount THEN
    v_payment_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_payment_status := 'partial';
  ELSE
    v_payment_status := 'pending';
  END IF;

  UPDATE room_bookings
  SET 
    amount_paid = v_new_amount_paid,
    payment_status = v_payment_status,
    paid_at = CASE WHEN v_payment_status = 'paid' THEN now() ELSE paid_at END,
    updated_at = now()
  WHERE id = p_booking_id;
END;
$$;