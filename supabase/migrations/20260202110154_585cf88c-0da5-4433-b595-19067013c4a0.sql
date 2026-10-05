-- Create RPC function to validate hourly booking overlaps
CREATE OR REPLACE FUNCTION validate_hourly_booking(
  p_room_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_count INTEGER;
  v_conflict_booking RECORD;
BEGIN
  -- Check for overlapping hourly bookings
  -- Overlap condition: existing.start < new.end AND existing.end > new.start
  SELECT COUNT(*), MIN(id) INTO v_conflict_count
  FROM room_bookings
  WHERE room_id = p_room_id
    AND booking_type = 'hourly'
    AND status IN ('confirmed', 'checked_in')
    AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
    AND hourly_start_time < p_end_time
    AND hourly_end_time > p_start_time;

  IF v_conflict_count > 0 THEN
    -- Get conflict details for error message
    SELECT id, guest_name, hourly_start_time, hourly_end_time 
    INTO v_conflict_booking
    FROM room_bookings
    WHERE room_id = p_room_id
      AND booking_type = 'hourly'
      AND status IN ('confirmed', 'checked_in')
      AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
      AND hourly_start_time < p_end_time
      AND hourly_end_time > p_start_time
    LIMIT 1;

    RETURN jsonb_build_object(
      'valid', false, 
      'error', 'HOURLY_OVERLAP',
      'message', 'Phòng đã có lịch đặt theo giờ trong thời gian này',
      'conflict', jsonb_build_object(
        'booking_id', v_conflict_booking.id,
        'guest_name', v_conflict_booking.guest_name,
        'start_time', v_conflict_booking.hourly_start_time,
        'end_time', v_conflict_booking.hourly_end_time
      )
    );
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- Also check for daily/monthly overlaps with hourly bookings
-- A room booked daily/monthly should not be available for hourly on those days
CREATE OR REPLACE FUNCTION validate_hourly_against_daily(
  p_room_id UUID,
  p_booking_date DATE,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_count INTEGER;
BEGIN
  -- Check if room has daily/monthly booking on this date
  SELECT COUNT(*) INTO v_conflict_count
  FROM room_bookings
  WHERE room_id = p_room_id
    AND booking_type IN ('daily', 'monthly')
    AND status IN ('confirmed', 'checked_in')
    AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
    AND check_in_date <= p_booking_date
    AND check_out_date > p_booking_date;

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'error', 'DAILY_OVERLAP',
      'message', 'Phòng đã có khách đặt theo ngày/tháng trong ngày này'
    );
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;