CREATE OR REPLACE FUNCTION public.update_booking_amount_paid(
  p_booking_id uuid,
  p_amount_to_add numeric,
  p_total_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_amount numeric;
  v_status text;
BEGIN
  UPDATE room_bookings
  SET amount_paid = COALESCE(amount_paid, 0) + p_amount_to_add,
      payment_status = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount_to_add >= p_total_amount THEN 'paid'
        ELSE 'partial'
      END,
      paid_at = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount_to_add >= p_total_amount THEN now()
        ELSE paid_at
      END
  WHERE id = p_booking_id
  RETURNING amount_paid, payment_status INTO v_new_amount, v_status;

  RETURN jsonb_build_object(
    'new_amount_paid', v_new_amount,
    'payment_status', v_status
  );
END;
$$;