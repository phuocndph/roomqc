-- =====================================================
-- TRANSACTION-SAFE BOOKING OPERATIONS FOR 100+ CONCURRENT USERS
-- =====================================================

-- 1. PERFORM CHECK-IN WITH TRANSACTION
-- Ensures both booking and room status are updated atomically
CREATE OR REPLACE FUNCTION perform_checkin(
  p_booking_id UUID,
  p_room_id UUID,
  p_early_checkin_charge NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Update booking status with row-level lock to prevent race conditions
  UPDATE room_bookings
  SET 
    status = 'checked_in',
    actual_check_in = v_now,
    early_checkin_charge = p_early_checkin_charge,
    updated_at = v_now
  WHERE id = p_booking_id
    AND status IN ('confirmed', 'pending'); -- Only allow check-in from valid states
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or already checked in/out';
  END IF;

  -- Update room status with row-level lock
  UPDATE rooms
  SET 
    status = 'occupied',
    updated_at = v_now
  WHERE id = p_room_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'room_id', p_room_id,
    'checked_in_at', v_now
  );

  RETURN v_result;
END;
$$;

-- 2. PERFORM CHECK-OUT WITH TRANSACTION
-- Ensures booking, room status, and financial calculations are updated atomically
CREATE OR REPLACE FUNCTION perform_checkout(
  p_booking_id UUID,
  p_room_id UUID,
  p_late_checkout_charge NUMERIC DEFAULT 0,
  p_service_charges NUMERIC DEFAULT 0,
  p_subtotal NUMERIC DEFAULT 0,
  p_vat_amount NUMERIC DEFAULT 0,
  p_service_fee_amount NUMERIC DEFAULT 0,
  p_total_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
  v_room_updated_at TIMESTAMPTZ;
BEGIN
  -- Get current room updated_at for optimistic locking
  SELECT updated_at INTO v_room_updated_at
  FROM rooms WHERE id = p_room_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Update booking status with row-level lock
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
    updated_at = v_now
  WHERE id = p_booking_id
    AND status = 'checked_in'; -- Only allow checkout from checked_in state
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in checked_in state';
  END IF;

  -- Update room status to check_out (needs cleaning/inspection)
  UPDATE rooms
  SET 
    status = 'check_out',
    updated_at = v_now
  WHERE id = p_room_id;

  v_result := jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'room_id', p_room_id,
    'checked_out_at', v_now,
    'total_amount', p_total_amount
  );

  RETURN v_result;
END;
$$;

-- 3. CANCEL BOOKING WITH TRANSACTION
-- Ensures booking is cancelled and room is freed atomically
CREATE OR REPLACE FUNCTION cancel_booking(
  p_booking_id UUID,
  p_room_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Update booking status
  UPDATE room_bookings
  SET 
    status = 'cancelled',
    updated_at = v_now
  WHERE id = p_booking_id
    AND status NOT IN ('checked_out', 'cancelled'); -- Cannot cancel already completed/cancelled
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or cannot be cancelled';
  END IF;

  -- Free up room if specified
  IF p_room_id IS NOT NULL THEN
    UPDATE rooms
    SET 
      status = 'vacant',
      updated_at = v_now
    WHERE id = p_room_id
      AND status NOT IN ('maintenance', 'out_of_order');
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'cancelled_at', v_now
  );

  RETURN v_result;
END;
$$;

-- 4. SAFE ROOM STATUS UPDATE WITH OPTIMISTIC LOCKING
-- Prevents race conditions when multiple users try to update the same room
CREATE OR REPLACE FUNCTION update_room_status_safe(
  p_room_id UUID,
  p_new_status TEXT,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
  v_current_updated_at TIMESTAMPTZ;
BEGIN
  -- Get current state with lock
  SELECT updated_at INTO v_current_updated_at
  FROM rooms WHERE id = p_room_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check for optimistic locking if expected_updated_at provided
  IF p_expected_updated_at IS NOT NULL AND v_current_updated_at > p_expected_updated_at THEN
    RAISE EXCEPTION 'Room was modified by another user. Please refresh and try again.';
  END IF;

  -- Update room status
  UPDATE rooms
  SET 
    status = p_new_status,
    updated_at = v_now
  WHERE id = p_room_id;

  v_result := jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'new_status', p_new_status,
    'updated_at', v_now
  );

  RETURN v_result;
END;
$$;