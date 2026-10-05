-- Update perform_checkin RPC to validate room status before check-in
-- This prevents checking in to occupied rooms

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
  v_room_status TEXT;
  v_current_booking_id UUID;
  v_current_guest_name TEXT;
BEGIN
  -- Lock room row to prevent race conditions
  SELECT status INTO v_room_status
  FROM rooms WHERE id = p_room_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;
  
  -- Block check-in if room is occupied
  IF v_room_status = 'occupied' THEN
    -- Find the booking currently occupying the room
    SELECT rb.id, rb.guest_name INTO v_current_booking_id, v_current_guest_name
    FROM room_bookings rb
    WHERE rb.room_id = p_room_id 
      AND rb.status = 'checked_in'
      AND rb.id != p_booking_id
    LIMIT 1;
    
    IF v_current_booking_id IS NOT NULL THEN
      RAISE EXCEPTION 'ROOM_OCCUPIED:%', v_current_guest_name;
    END IF;
  END IF;
  
  -- Only allow check-in if room status is valid
  IF v_room_status NOT IN ('vacant', 'cleaning', 'check_out', 'reserved') THEN
    RAISE EXCEPTION 'INVALID_ROOM_STATUS:%', v_room_status;
  END IF;

  -- Update booking to checked_in
  UPDATE room_bookings
  SET 
    status = 'checked_in',
    actual_check_in = v_now,
    early_checkin_charge = p_early_checkin_charge,
    updated_at = v_now
  WHERE id = p_booking_id
    AND status IN ('confirmed', 'pending');
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_VALID';
  END IF;

  -- Update room to occupied
  UPDATE rooms
  SET 
    status = 'occupied',
    updated_at = v_now
  WHERE id = p_room_id;

  v_result := jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'room_id', p_room_id,
    'checked_in_at', v_now
  );

  RETURN v_result;
END;
$$;