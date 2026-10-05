-- Last-mile fixes for the consolidated schema.  This migration deliberately
-- comes after the historical feature migrations so these definitions are the
-- final contract used by both local reset and a future VPS deployment.

DO $repair_outbox_conflict$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.process_room_check_issue_outbox(integer)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'process_room_check_issue_outbox definition is missing';
  END IF;
  v_definition := replace(
    v_definition,
    'ON CONFLICT (idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL DO NOTHING',
    'ON CONFLICT DO NOTHING'
  );
  EXECUTE v_definition;
END;
$repair_outbox_conflict$;

CREATE OR REPLACE FUNCTION public.enqueue_stay_registration(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $enqueue$
DECLARE
  v_user_tenant uuid;
  v_booking record;
  v_room_number text;
  v_count integer := 0;
BEGIN
  SELECT u.tenant_id INTO v_user_tenant
  FROM public.users u
  WHERE u.id = auth.uid();

  SELECT b.*, r.room_number AS rno
  INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_user_tenant IS NULL OR v_user_tenant <> v_booking.tenant_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF v_booking.guest_id IS NULL THEN
    RETURN 0;
  END IF;

  v_room_number := COALESCE(v_booking.rno, 'N/A');
  INSERT INTO public.guest_stay_registrations(
    tenant_id, hotel_id, booking_id, guest_id, room_number,
    check_in_at, check_out_at, status
  ) VALUES (
    v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
    v_room_number,
    COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
    COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
    'pending'
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$enqueue$;

CREATE OR REPLACE FUNCTION public._enqueue_stay_registration_internal(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $enqueue_internal$
DECLARE
  v_booking record;
  v_room_number text;
  v_count integer := 0;
BEGIN
  SELECT b.*, r.room_number AS rno
  INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND OR v_booking.guest_id IS NULL THEN
    RETURN 0;
  END IF;

  v_room_number := COALESCE(v_booking.rno, 'N/A');
  INSERT INTO public.guest_stay_registrations(
    tenant_id, hotel_id, booking_id, guest_id, room_number,
    check_in_at, check_out_at, status
  ) VALUES (
    v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
    v_room_number,
    COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
    COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
    'pending'
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$enqueue_internal$;

REVOKE ALL ON FUNCTION public.enqueue_stay_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_stay_registration(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._enqueue_stay_registration_internal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._enqueue_stay_registration_internal(uuid) TO service_role;
