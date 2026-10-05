-- Update perform_checkout RPC to accept p_new_amount_paid for atomic pay & checkout
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
  -- NEW: Optional amount_paid for atomic pay & checkout
  p_new_amount_paid numeric DEFAULT NULL
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
BEGIN
  -- Get current payment info
  SELECT deposit_amount, amount_paid 
  INTO v_deposit_amount, v_amount_paid
  FROM room_bookings WHERE id = p_booking_id;
  
  -- If new amount_paid provided, use it (for pay & checkout flow)
  IF p_new_amount_paid IS NOT NULL THEN
    v_amount_paid := p_new_amount_paid;
  END IF;
  
  -- Calculate payment status based on actual amounts
  IF (COALESCE(v_deposit_amount, 0) + COALESCE(v_amount_paid, 0)) >= p_total_amount THEN
    v_payment_status := 'paid';
  ELSIF (COALESCE(v_deposit_amount, 0) + COALESCE(v_amount_paid, 0)) > 0 THEN
    v_payment_status := 'partial';
  ELSE
    v_payment_status := 'pending';
  END IF;

  -- Update booking with all fields atomically
  UPDATE room_bookings
  SET 
    status = 'checked_out',
    actual_check_out = v_now,
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
    -- Update amount_paid and paid_at if new amount provided
    amount_paid = CASE WHEN p_new_amount_paid IS NOT NULL THEN p_new_amount_paid ELSE amount_paid END,
    paid_at = CASE WHEN p_new_amount_paid IS NOT NULL THEN v_now ELSE paid_at END,
    updated_at = v_now
  WHERE id = p_booking_id
    AND status = 'checked_in';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in checked_in state';
  END IF;

  UPDATE rooms SET status = 'check_out', updated_at = v_now WHERE id = p_room_id;

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