-- Create RPC to validate booking dates (check for overlap)
CREATE OR REPLACE FUNCTION public.validate_booking_dates(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_count INTEGER;
  v_conflict_bookings JSONB;
BEGIN
  -- Check for overlapping bookings
  SELECT COUNT(*), COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'guest_name', guest_name,
    'check_in', check_in_date,
    'check_out', check_out_date,
    'status', status
  )), '[]'::jsonb)
  INTO v_conflict_count, v_conflict_bookings
  FROM room_bookings
  WHERE room_id = p_room_id
    AND status IN ('confirmed', 'checked_in')
    AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
    AND check_in_date < p_check_out
    AND check_out_date > p_check_in;

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'BOOKING_OVERLAP',
      'message', 'Phòng đã có lịch đặt trong khoảng thời gian này',
      'conflicts', v_conflict_bookings
    );
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- Create trigger function to prevent booking overlap at database level
CREATE OR REPLACE FUNCTION public.prevent_booking_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check for active bookings
  IF NEW.status NOT IN ('confirmed', 'checked_in') THEN
    RETURN NEW;
  END IF;

  -- Check for overlap
  IF EXISTS (
    SELECT 1 FROM room_bookings
    WHERE room_id = NEW.room_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status IN ('confirmed', 'checked_in')
      AND check_in_date < NEW.check_out_date
      AND check_out_date > NEW.check_in_date
  ) THEN
    RAISE EXCEPTION 'Booking overlap detected: Room already has a booking for this period';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on room_bookings
DROP TRIGGER IF EXISTS tr_prevent_booking_overlap ON room_bookings;
CREATE TRIGGER tr_prevent_booking_overlap
  BEFORE INSERT OR UPDATE ON room_bookings
  FOR EACH ROW
  EXECUTE FUNCTION prevent_booking_overlap();