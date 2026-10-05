
-- Add retry scheduling column
ALTER TABLE public.guest_stay_registrations
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_stay_reg_next_retry
  ON public.guest_stay_registrations (next_retry_at)
  WHERE status IN ('pending','failed');

-- Internal enqueue function (trigger context, SECURITY DEFINER, no auth.uid check)
CREATE OR REPLACE FUNCTION public._enqueue_stay_registration_internal(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_room_number text;
  v_count int := 0;
BEGIN
  SELECT b.*, r.room_number AS rno
    INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF v_booking IS NULL THEN
    RETURN 0;
  END IF;

  v_room_number := COALESCE(v_booking.rno, 'N/A');

  IF v_booking.guest_id IS NOT NULL THEN
    INSERT INTO public.guest_stay_registrations
      (tenant_id, hotel_id, booking_id, guest_id, room_number, check_in_at, check_out_at, status)
    VALUES
      (v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
       v_room_number,
       COALESCE(v_booking.actual_check_in_time, v_booking.check_in_date::timestamptz),
       COALESCE(v_booking.actual_check_out_time, v_booking.check_out_date::timestamptz),
       'pending')
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='booking_guests'
  ) THEN
    INSERT INTO public.guest_stay_registrations
      (tenant_id, hotel_id, booking_id, guest_id, room_number, check_in_at, check_out_at, status)
    SELECT v_booking.tenant_id, v_booking.hotel_id, v_booking.id, bg.guest_id,
           v_room_number,
           COALESCE(v_booking.actual_check_in_time, v_booking.check_in_date::timestamptz),
           COALESCE(v_booking.actual_check_out_time, v_booking.check_out_date::timestamptz),
           'pending'
    FROM public.booking_guests bg
    WHERE bg.booking_id = v_booking.id AND bg.guest_id IS NOT NULL
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION public.trg_enqueue_stay_registration_on_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  IF NEW.status = 'checked_in'
     AND (OLD.status IS DISTINCT FROM 'checked_in') THEN

    -- Only enqueue if the hotel has tbltkbtt enabled
    SELECT COALESCE((tbltkbtt_config->>'enabled')::boolean, false)
      INTO v_enabled
    FROM public.hotels
    WHERE id = NEW.hotel_id;

    IF v_enabled THEN
      PERFORM public._enqueue_stay_registration_internal(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_bookings_enqueue_stay_reg ON public.room_bookings;
CREATE TRIGGER trg_room_bookings_enqueue_stay_reg
AFTER UPDATE OF status ON public.room_bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_stay_registration_on_checkin();
