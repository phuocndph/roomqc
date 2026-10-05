CREATE OR REPLACE FUNCTION public.update_hotel_floor_map_cell_size(
  p_hotel_id uuid,
  p_size jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_tenant_id uuid;
  v_user_level text;
  v_is_super_admin boolean;
  v_hotel_tenant_id uuid;
  v_settings jsonb;
  v_preset text;
  v_height integer;
  v_cols integer;
  v_font_scale numeric;
  v_allowed_cols integer[] := ARRAY[4, 6, 8, 10, 12, 14, 16];
  v_best_cols integer := 12;
  v_best_diff integer := 999;
  v_candidate integer;
  v_normalized jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT u.tenant_id, u.user_level_code, COALESCE(u.is_super_admin, false)
    INTO v_user_tenant_id, v_user_level, v_is_super_admin
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_user_tenant_id IS NULL AND NOT COALESCE(v_is_super_admin, false) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  SELECT h.tenant_id, COALESCE(h.settings, '{}'::jsonb)
    INTO v_hotel_tenant_id, v_settings
  FROM public.hotels h
  WHERE h.id = p_hotel_id
  FOR UPDATE;

  IF v_hotel_tenant_id IS NULL THEN
    RAISE EXCEPTION 'HOTEL_NOT_FOUND';
  END IF;

  IF NOT COALESCE(v_is_super_admin, false) AND v_hotel_tenant_id <> v_user_tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  IF NOT COALESCE(v_is_super_admin, false)
     AND COALESCE(v_user_level, '') <> 'tenant_owner'
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_hotels uh
       WHERE uh.user_id = v_user_id
         AND uh.hotel_id = p_hotel_id
     ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_preset := COALESCE(NULLIF(p_size->>'preset', ''), 'custom');
  IF v_preset NOT IN ('sm', 'md', 'lg', 'custom') THEN
    v_preset := 'custom';
  END IF;

  v_height := COALESCE(NULLIF(p_size->>'height', '')::integer, 96);
  v_height := LEAST(220, GREATEST(64, v_height));

  v_cols := COALESCE(NULLIF(p_size->>'cols', '')::integer, 12);
  FOREACH v_candidate IN ARRAY v_allowed_cols LOOP
    IF abs(v_candidate - v_cols) < v_best_diff THEN
      v_best_diff := abs(v_candidate - v_cols);
      v_best_cols := v_candidate;
    END IF;
  END LOOP;

  v_font_scale := COALESCE(NULLIF(p_size->>'fontScale', '')::numeric, 1.0);
  v_font_scale := LEAST(1.8, GREATEST(0.7, v_font_scale));

  v_normalized := jsonb_build_object(
    'preset', v_preset,
    'height', v_height,
    'cols', v_best_cols,
    'fontScale', round(v_font_scale, 2)
  );

  UPDATE public.hotels
  SET settings = jsonb_set(v_settings, '{floor_map_cell_size}', v_normalized, true),
      updated_at = now()
  WHERE id = p_hotel_id;

  RETURN v_normalized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_hotel_floor_map_cell_size(uuid, jsonb) TO authenticated;