CREATE OR REPLACE FUNCTION public.merge_guests(
  p_target_id uuid,
  p_source_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_target guests%ROWTYPE;
  v_src guests%ROWTYPE;
  v_bookings_moved int := 0;
BEGIN
  IF p_target_id IS NULL OR p_source_ids IS NULL OR array_length(p_source_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF p_target_id = ANY(p_source_ids) THEN
    RAISE EXCEPTION 'TARGET_IN_SOURCES';
  END IF;

  SELECT * INTO v_target FROM public.guests WHERE id = p_target_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND';
  END IF;
  v_tenant := v_target.tenant_id;

  -- Permission: owner / hotel_manager (lenient — staff in management hierarchy)
  IF NOT (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Tenant safety
  IF EXISTS (
    SELECT 1 FROM public.guests
    WHERE id = ANY(p_source_ids) AND tenant_id <> v_tenant
  ) THEN
    RAISE EXCEPTION 'CROSS_TENANT';
  END IF;

  -- Move bookings
  UPDATE public.room_bookings
     SET guest_id = p_target_id
   WHERE guest_id = ANY(p_source_ids)
     AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_bookings_moved = ROW_COUNT;

  -- Merge stats + fill missing fields from sources
  FOR v_src IN
    SELECT * FROM public.guests
     WHERE id = ANY(p_source_ids) AND tenant_id = v_tenant
  LOOP
    UPDATE public.guests
       SET total_stays  = COALESCE(total_stays, 0) + COALESCE(v_src.total_stays, 0),
           total_spent  = COALESCE(total_spent, 0) + COALESCE(v_src.total_spent, 0),
           last_stay_date = GREATEST(COALESCE(last_stay_date, '1900-01-01'::date),
                                     COALESCE(v_src.last_stay_date, '1900-01-01'::date)),
           email      = COALESCE(NULLIF(email, ''), v_src.email),
           id_type    = COALESCE(NULLIF(id_type, ''), v_src.id_type),
           id_number  = COALESCE(NULLIF(id_number, ''), v_src.id_number),
           nationality= COALESCE(NULLIF(nationality, ''), v_src.nationality),
           gender     = COALESCE(NULLIF(gender, ''), v_src.gender),
           date_of_birth = COALESCE(date_of_birth, v_src.date_of_birth),
           address    = COALESCE(NULLIF(address, ''), v_src.address),
           permanent_address = COALESCE(NULLIF(permanent_address, ''), v_src.permanent_address),
           id_image_url = COALESCE(NULLIF(id_image_url, ''), v_src.id_image_url),
           notes      = CASE
                          WHEN v_src.notes IS NULL OR v_src.notes = '' THEN notes
                          WHEN notes IS NULL OR notes = '' THEN v_src.notes
                          ELSE notes || E'\n---\n' || v_src.notes
                        END,
           updated_at = now()
     WHERE id = p_target_id;
  END LOOP;

  -- Delete sources
  DELETE FROM public.guests
   WHERE id = ANY(p_source_ids) AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'merged_count', array_length(p_source_ids, 1),
    'bookings_moved', v_bookings_moved,
    'target_id', p_target_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_guests(uuid, uuid[]) TO authenticated;