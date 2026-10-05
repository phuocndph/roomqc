-- Remove stale declarations from the hardened RPC implementations without
-- changing any public RPC signature used by the frontend.
--
-- The functions were moved/renamed by earlier migrations. Reading their
-- current definitions lets this cleanup stay compatible with both a fresh
-- migration chain and an already-provisioned local/VPS database.
DO $cleanup$
DECLARE
  v_def text;
  v_start integer;
  v_end integer;
BEGIN
  -- update_distribution_order: this array was populated but never consulted.
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'update_distribution_order'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_order_id uuid, p_assigned_to uuid, p_notes text, p_rooms jsonb';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing public.update_distribution_order';
  END IF;
  IF strpos(v_def, 'v_existing_room_ids') > 0 THEN
    v_def := replace(v_def, E'  v_existing_room_ids UUID[];\n', '');
    v_start := strpos(v_def, E'    -- Get existing room order IDs');
    v_end := strpos(substring(v_def FROM v_start), E'    -- Extract new room IDs');
    IF v_start = 0 OR v_end = 0 THEN
      RAISE EXCEPTION 'Unexpected update_distribution_order definition';
    END IF;
    v_def := left(v_def, v_start - 1)
      || substring(v_def FROM v_start + v_end - 1);
    EXECUTE v_def;
  END IF;

  -- create_super_admin: retained only the result that is returned directly.
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_super_admin'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_email text, p_full_name text';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing public.create_super_admin';
  END IF;
  v_def := replace(v_def, E'  v_result jsonb;\n', '');
  EXECUTE v_def;

  -- Distribution workflow implementations: remove declarations that are not
  -- used after the public wrapper has performed the authorization checks.
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'mark_cannot_access_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_room_order_id uuid, p_exception_type text, p_exception_reason text, p_actor_id uuid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.mark_cannot_access_unchecked';
  END IF;
  v_def := replace(v_def, E'  v_batch record;\n', '');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'confirm_room_delivery_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_room_order_id uuid, p_confirmed_by uuid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.confirm_room_delivery_unchecked';
  END IF;
  v_def := replace(v_def, E'  v_dist_order RECORD;\n', '');
  EXECUTE v_def;

  -- The actor is validated by the public wrapper. Keep the argument consumed
  -- for API compatibility while avoiding a dead local record/assignment.
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'close_route_if_complete_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_order_id uuid, p_actor_id uuid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.close_route_if_complete_unchecked';
  END IF;
  v_def := replace(v_def,
    E'DECLARE\n  v_actor_id uuid; v_order record; v_incomplete_count int; v_room record; v_item record;',
    E'DECLARE\n  v_incomplete_count int; v_room record; v_item record;');
  v_def := replace(v_def,
    E'  v_actor_id := COALESCE(p_actor_id, auth.uid());\n',
    E'  PERFORM p_actor_id;\n');
  v_def := replace(v_def,
    E'  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;\n',
    E'  PERFORM 1 FROM distribution_orders WHERE id = p_order_id;\n');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'undo_room_delivery_confirmation_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_distribution_order_room_id uuid, p_performed_by uuid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.undo_room_delivery_confirmation_unchecked';
  END IF;
  IF strpos(v_def, 'PERFORM p_performed_by') = 0 THEN
    v_def := replace(v_def, E'BEGIN\n', E'BEGIN\n  PERFORM p_performed_by;\n');
  END IF;
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'setup_room_initial_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_room_id uuid, p_user_id uuid, p_reset_quantities boolean';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.setup_room_initial_unchecked';
  END IF;
  v_def := replace(v_def, E'  v_tenant_id UUID;\n', '');
  v_def := replace(v_def,
    E'  SELECT room_type, hotel_id, tenant_id \n  INTO v_room_type, v_hotel_id, v_tenant_id\n',
    E'  SELECT room_type, hotel_id\n  INTO v_room_type, v_hotel_id\n');
  IF strpos(v_def, 'PERFORM p_user_id') = 0 THEN
    v_def := replace(v_def, E'BEGIN\n', E'BEGIN\n  PERFORM p_user_id;\n');
  END IF;
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'confirm_receive_order_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_order_id uuid, p_actor_id uuid, p_adjustments jsonb';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.confirm_receive_order_unchecked';
  END IF;
  -- Adjustments are intentionally ignored by the current status-only v4 RPC;
  -- consume the compatibility parameter explicitly.
  IF strpos(v_def, 'PERFORM p_adjustments') = 0 THEN
    v_def := replace(v_def, E'BEGIN\n', E'BEGIN\n  PERFORM p_adjustments;\n');
  END IF;
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'apply_room_standards_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_room_id uuid, p_user_id uuid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.apply_room_standards_unchecked';
  END IF;
  -- Use the validated actor supplied by the wrapper. This also keeps trusted
  -- server-side calls working when auth.uid() is not populated.
  v_def := replace(v_def,
    '  IF auth.uid() IS NULL THEN',
    '  IF COALESCE(p_user_id, auth.uid()) IS NULL THEN');
  v_def := replace(v_def,
    '  SELECT tenant_id INTO v_caller_tenant FROM users WHERE id = auth.uid();',
    '  SELECT tenant_id INTO v_caller_tenant FROM users WHERE id = COALESCE(p_user_id, auth.uid());');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'create_outbound_transaction_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tenant_id uuid, p_hotel_id uuid, p_transaction_category text, p_from_location text, p_to_location text, p_created_by uuid, p_items jsonb, p_related_type text, p_related_id uuid, p_recipient_name text, p_recipient_signature text, p_documents text[], p_photos text[], p_notes text, p_from_warehouse_id uuid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.create_outbound_transaction_unchecked';
  END IF;
  -- These legacy fields are no longer used for the supported outbound
  -- categories, but remain in the signature for PostgREST compatibility.
  IF strpos(v_def, 'PERFORM p_recipient_name') = 0 THEN
    v_def := replace(v_def,
      E'BEGIN\n',
      E'BEGIN\n  PERFORM p_recipient_name;\n  PERFORM p_recipient_signature;\n');
  END IF;
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'create_laundry_return_transaction_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tenant_id uuid, p_hotel_id uuid, p_from_location text, p_to_location text, p_created_by uuid, p_items jsonb, p_related_id uuid, p_notes text';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.create_laundry_return_transaction_unchecked';
  END IF;
  v_def := replace(v_def, E'  v_in_use integer;\n', '');
  v_def := replace(v_def, E'  v_damaged integer;\n', '');
  v_def := replace(v_def, E'  v_lost integer;\n', '');
  v_def := replace(v_def, E'  v_pending integer;\n', '');
  v_def := replace(v_def,
    E'      COALESCE(quantity_in_use, 0),\n      COALESCE(quantity_damaged, 0),\n      COALESCE(quantity_lost, 0),\n      COALESCE(quantity_pending, 0),\n',
    '');
  v_def := replace(v_def,
    E'    INTO v_stock, v_laundry, v_in_use, v_damaged, v_lost, v_pending, v_total, v_unit_price\n',
    E'    INTO v_stock, v_laundry, v_total, v_unit_price\n');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'create_booking_v2_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_bookings jsonb, p_guest jsonb';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.create_booking_v2_unchecked';
  END IF;
  v_def := replace(v_def, E'  v_group_id uuid;\n', '');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'approve_tenant_unchecked'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tenant_id uuid, p_admin_id uuid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Missing private.approve_tenant_unchecked';
  END IF;
  v_def := replace(v_def, E'  v_result JSONB;\n', '');
  EXECUTE v_def;
END;
$cleanup$;
