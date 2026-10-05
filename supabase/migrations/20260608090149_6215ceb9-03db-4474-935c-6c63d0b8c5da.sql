CREATE OR REPLACE FUNCTION public.record_booking_payment(
  p_booking_id uuid,
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_transaction_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_new_amount_paid numeric;
  v_payment_status text;
BEGIN
  INSERT INTO booking_payments (
    id, tenant_id, hotel_id, booking_id,
    amount, payment_method, transaction_reference,
    payment_status, metadata, paid_at
  ) VALUES (
    gen_random_uuid(), p_tenant_id, p_hotel_id, p_booking_id,
    p_amount, p_payment_method, p_transaction_reference,
    'completed', p_metadata, now()
  )
  RETURNING id INTO v_payment_id;

  UPDATE room_bookings
  SET amount_paid = COALESCE(amount_paid, 0) + p_amount,
      payment_status = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount + COALESCE(deposit_amount, 0)
             >= COALESCE(p_total_amount, total_amount, 0) THEN 'paid'
        ELSE 'partial'
      END,
      paid_at = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount + COALESCE(deposit_amount, 0)
             >= COALESCE(p_total_amount, total_amount, 0) THEN now()
        ELSE paid_at
      END
  WHERE id = p_booking_id
  RETURNING amount_paid, payment_status INTO v_new_amount_paid, v_payment_status;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'new_amount_paid', v_new_amount_paid,
    'payment_status', v_payment_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_booking_payment(uuid, uuid, uuid, numeric, text, text, jsonb, numeric) TO authenticated;

-- Atomic manual confirm of an existing pending payment + booking amount update
CREATE OR REPLACE FUNCTION public.confirm_booking_payment_manual(
  p_payment_id uuid,
  p_booking_id uuid,
  p_amount numeric,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_amount_paid numeric;
  v_payment_status text;
BEGIN
  UPDATE booking_payments
  SET payment_status = 'completed',
      paid_at = COALESCE(paid_at, now())
  WHERE id = p_payment_id
    AND payment_status <> 'completed';

  UPDATE room_bookings
  SET amount_paid = COALESCE(amount_paid, 0) + p_amount,
      payment_status = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount + COALESCE(deposit_amount, 0)
             >= COALESCE(p_total_amount, total_amount, 0) THEN 'paid'
        ELSE 'partial'
      END,
      paid_at = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount + COALESCE(deposit_amount, 0)
             >= COALESCE(p_total_amount, total_amount, 0) THEN now()
        ELSE paid_at
      END
  WHERE id = p_booking_id
  RETURNING amount_paid, payment_status INTO v_new_amount_paid, v_payment_status;

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'new_amount_paid', v_new_amount_paid,
    'payment_status', v_payment_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_booking_payment_manual(uuid, uuid, numeric, numeric) TO authenticated;
