-- Harden client-callable SECURITY DEFINER RPCs.  The helper trusts only
-- server-side requests; normal PostgREST calls must resolve to the caller's
-- authenticated profile and tenant.

CREATE OR REPLACE FUNCTION public.rpc_request_is_trusted()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT session_user IN ('postgres', 'supabase_admin', 'service_role')
      OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.assert_rpc_actor(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_require_manager boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_user record;
  v_is_manager boolean := false;
BEGIN
  IF public.rpc_request_is_trusted() THEN
    RETURN v_actor;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL AND auth.uid() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT u.id, u.tenant_id, u.hotel_id, u.user_level_code, u.is_super_admin
    INTO v_user
  FROM public.users u
  WHERE u.id = v_actor
    AND u.status IS DISTINCT FROM 'inactive'
    AND u.deleted_at IS NULL;

  IF NOT FOUND OR v_user.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF p_hotel_id IS NOT NULL
     AND v_user.hotel_id IS DISTINCT FROM p_hotel_id
     AND NOT EXISTS (
       SELECT 1 FROM public.user_hotels uh
       WHERE uh.user_id = v_actor AND uh.hotel_id = p_hotel_id
     ) THEN
    RAISE EXCEPTION 'HOTEL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_is_manager := COALESCE(v_user.is_super_admin, false)
    OR v_user.user_level_code IN ('super_admin', 'tenant_owner', 'hotel_manager', 'department_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_actor
        AND ur.role::text IN ('super_admin', 'owner', 'hotel_manager', 'department_manager')
    );

  IF p_require_manager AND NOT v_is_manager THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_is_trusted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_rpc_actor(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_request_is_trusted() TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_rpc_actor(uuid, uuid, uuid, boolean) TO service_role;

-- Room-check inventory mutations must be tenant-scoped and reject invalid
-- quantities instead of silently clamping/over-counting stock.
CREATE OR REPLACE FUNCTION public.atomic_item_lost(p_item_id uuid, p_quantity integer)
RETURNS TABLE(quantity_before integer, quantity_after integer, unit_price numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before integer;
  v_after integer;
  v_price numeric;
  v_hotel_id uuid;
  v_tenant_id uuid;
  v_default_warehouse_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;

  SELECT i.quantity_in_stock, i.unit_price, i.hotel_id, i.tenant_id
    INTO v_before, v_price, v_hotel_id, v_tenant_id
  FROM public.items i
  WHERE i.id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_rpc_actor(v_tenant_id, v_hotel_id, auth.uid(), false);

  IF p_quantity > COALESCE(v_before, 0) THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = '22003';
  END IF;

  v_after := COALESCE(v_before, 0) - p_quantity;

  UPDATE public.items
  SET quantity_in_stock = v_after,
      quantity_lost = COALESCE(quantity_lost, 0) + p_quantity,
      updated_at = now()
  WHERE id = p_item_id;

  SELECT id INTO v_default_warehouse_id
  FROM public.warehouses
  WHERE hotel_id = v_hotel_id AND tenant_id = v_tenant_id
    AND is_default = true AND is_active = true
  LIMIT 1;

  IF v_default_warehouse_id IS NOT NULL THEN
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_quantity,
        updated_at = now()
    WHERE warehouse_id = v_default_warehouse_id AND item_id = p_item_id;
  END IF;

  RETURN QUERY SELECT v_before, v_after, v_price;
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_item_consumed(p_item_id uuid, p_quantity integer)
RETURNS TABLE(quantity_before integer, quantity_after integer, unit_price numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before integer;
  v_after integer;
  v_price numeric;
  v_hotel_id uuid;
  v_tenant_id uuid;
  v_default_warehouse_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;

  SELECT i.quantity_in_stock, i.unit_price, i.hotel_id, i.tenant_id
    INTO v_before, v_price, v_hotel_id, v_tenant_id
  FROM public.items i
  WHERE i.id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_rpc_actor(v_tenant_id, v_hotel_id, auth.uid(), false);

  IF p_quantity > COALESCE(v_before, 0) THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = '22003';
  END IF;

  v_after := COALESCE(v_before, 0) - p_quantity;

  UPDATE public.items
  SET quantity_in_stock = v_after,
      updated_at = now()
  WHERE id = p_item_id;

  SELECT id INTO v_default_warehouse_id
  FROM public.warehouses
  WHERE hotel_id = v_hotel_id AND tenant_id = v_tenant_id
    AND is_default = true AND is_active = true
  LIMIT 1;

  IF v_default_warehouse_id IS NOT NULL THEN
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_quantity,
        updated_at = now()
    WHERE warehouse_id = v_default_warehouse_id AND item_id = p_item_id;
  END IF;

  RETURN QUERY SELECT v_before, v_after, v_price;
END;
$$;

-- This RPC is intentionally a no-op on item counters; the laundry-batch
-- trigger is the single inventory source of truth. It still validates caller
-- scope and quantity so arbitrary rows cannot be probed through the RPC.
CREATE OR REPLACE FUNCTION public.atomic_item_to_laundry(p_item_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_hotel_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id, hotel_id INTO v_tenant_id, v_hotel_id
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_rpc_actor(v_tenant_id, v_hotel_id, auth.uid(), false);
END;
$$;

-- Distribution orders are a privileged inventory boundary. Validate every
-- referenced room/item before changing stock and lock item rows first so two
-- concurrent orders cannot reserve the same units.
CREATE OR REPLACE FUNCTION public.create_distribution_order(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_created_by uuid,
  p_assigned_to uuid,
  p_rooms jsonb,
  p_notes text DEFAULT NULL,
  p_auto_release boolean DEFAULT false,
  p_supplement_request_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_order_id uuid;
  v_order_code text;
  v_room jsonb;
  v_room_id uuid;
  v_room_order_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_current_stock integer;
  v_total_rooms integer := 0;
  v_total_items integer := 0;
  v_item_totals jsonb := '{}'::jsonb;
  v_retry_count integer := 0;
  v_code_exists boolean;
  v_initial_status text;
  v_batch_status text;
  v_supplement_id uuid;
BEGIN
  IF p_rooms IS NULL OR jsonb_typeof(p_rooms) <> 'array' OR jsonb_array_length(p_rooms) = 0 THEN
    RAISE EXCEPTION 'ROOMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hotels WHERE id = p_hotel_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'HOTEL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_actor := public.assert_rpc_actor(p_tenant_id, p_hotel_id, p_created_by, false);

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.users u
    LEFT JOIN public.user_hotels uh ON uh.user_id = u.id AND uh.hotel_id = p_hotel_id
    WHERE u.id = p_assigned_to
      AND u.tenant_id = p_tenant_id
      AND u.status IS DISTINCT FROM 'inactive'
      AND (u.hotel_id = p_hotel_id OR uh.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ASSIGNEE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  FOR v_room IN SELECT value FROM jsonb_array_elements(p_rooms)
  LOOP
    v_room_id := NULLIF(v_room->>'room_id', '')::uuid;
    IF v_room_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.rooms
      WHERE id = v_room_id AND tenant_id = p_tenant_id AND hotel_id = p_hotel_id
    ) THEN
      RAISE EXCEPTION 'ROOM_MISMATCH' USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(v_room->'items') <> 'array' OR jsonb_array_length(v_room->'items') = 0 THEN
      RAISE EXCEPTION 'ROOM_ITEMS_REQUIRED' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_room->'items')
    LOOP
      v_item_id := NULLIF(v_item->>'item_id', '')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
      IF v_item_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_ITEM_QUANTITY' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.items
        WHERE id = v_item_id AND tenant_id = p_tenant_id AND hotel_id = p_hotel_id
      ) THEN
        RAISE EXCEPTION 'ITEM_MISMATCH' USING ERRCODE = '42501';
      END IF;

      v_item_totals := jsonb_set(
        v_item_totals,
        ARRAY[v_item_id::text],
        to_jsonb(COALESCE((v_item_totals->>(v_item_id::text))::integer, 0) + v_quantity),
        true
      );
      v_total_items := v_total_items + v_quantity;
    END LOOP;
    v_total_rooms := v_total_rooms + 1;
  END LOOP;

  -- Lock in UUID order to avoid deadlocks between concurrent routes.
  PERFORM 1
  FROM public.items i
  WHERE i.id IN (SELECT key::uuid FROM jsonb_each(v_item_totals))
  ORDER BY i.id
  FOR UPDATE;

  FOR v_item_id IN SELECT key::uuid FROM jsonb_each(v_item_totals) ORDER BY key
  LOOP
    v_quantity := (v_item_totals->>(v_item_id::text))::integer;
    SELECT quantity_in_stock INTO v_current_stock FROM public.items WHERE id = v_item_id;
    IF COALESCE(v_current_stock, 0) < v_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = '22003';
    END IF;
  END LOOP;

  LOOP
    v_order_code := 'DIS-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    SELECT EXISTS(SELECT 1 FROM public.distribution_orders WHERE order_code = v_order_code)
      INTO v_code_exists;
    EXIT WHEN NOT v_code_exists;
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= 5 THEN
      v_order_code := 'DIS-' || to_char(now(), 'YYYYMMDD') || '-' ||
        substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  IF p_auto_release AND p_assigned_to IS NOT NULL THEN
    v_initial_status := 'released';
    v_batch_status := 'handed_over';
  ELSE
    v_initial_status := 'pending';
    v_batch_status := 'open';
  END IF;

  INSERT INTO public.distribution_orders (
    tenant_id, hotel_id, order_code, created_by, assigned_to, notes, status,
    released_at, released_by
  ) VALUES (
    p_tenant_id, p_hotel_id, v_order_code, v_actor, p_assigned_to, p_notes,
    v_initial_status,
    CASE WHEN v_initial_status = 'released' THEN now() END,
    CASE WHEN v_initial_status = 'released' THEN v_actor END
  ) RETURNING id INTO v_order_id;

  FOR v_room IN SELECT value FROM jsonb_array_elements(p_rooms)
  LOOP
    v_room_id := (v_room->>'room_id')::uuid;
    INSERT INTO public.distribution_order_rooms (distribution_order_id, room_id, batch_number)
    VALUES (v_order_id, v_room_id, 1)
    RETURNING id INTO v_room_order_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_room->'items')
    LOOP
      INSERT INTO public.distribution_order_items (distribution_order_room_id, item_id, quantity)
      VALUES (v_room_order_id, (v_item->>'item_id')::uuid, (v_item->>'quantity')::integer);
    END LOOP;
  END LOOP;

  INSERT INTO public.distribution_order_batches (
    distribution_order_id, batch_number, status, handed_over_at, handed_over_by
  ) VALUES (
    v_order_id, 1, v_batch_status,
    CASE WHEN v_initial_status = 'released' THEN now() END,
    CASE WHEN v_initial_status = 'released' THEN v_actor END
  )
  ON CONFLICT (distribution_order_id, batch_number) DO UPDATE SET
    status = EXCLUDED.status,
    handed_over_at = EXCLUDED.handed_over_at,
    handed_over_by = EXCLUDED.handed_over_by,
    updated_at = now();

  FOR v_item_id IN SELECT key::uuid FROM jsonb_each(v_item_totals) ORDER BY key
  LOOP
    v_quantity := (v_item_totals->>(v_item_id::text))::integer;
    UPDATE public.items
    SET quantity_in_stock = quantity_in_stock - v_quantity,
        quantity_in_use = CASE WHEN v_initial_status = 'released'
          THEN COALESCE(quantity_in_use, 0) + v_quantity ELSE quantity_in_use END,
        quantity_pending = CASE WHEN v_initial_status = 'pending'
          THEN COALESCE(quantity_pending, 0) + v_quantity ELSE quantity_pending END,
        updated_at = now()
    WHERE id = v_item_id;
  END LOOP;

  UPDATE public.distribution_orders
  SET total_rooms = v_total_rooms, total_items = v_total_items, updated_at = now()
  WHERE id = v_order_id;

  IF p_supplement_request_ids IS NOT NULL THEN
    FOREACH v_supplement_id IN ARRAY p_supplement_request_ids LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.supplement_requests sr
        WHERE sr.id = v_supplement_id
          AND sr.tenant_id = p_tenant_id
          AND sr.hotel_id = p_hotel_id
          AND sr.status = 'pending'
      ) THEN
        RAISE EXCEPTION 'SUPPLEMENT_REQUEST_MISMATCH' USING ERRCODE = '42501';
      END IF;
      UPDATE public.supplement_requests
      SET distribution_order_id = v_order_id,
          status = 'approved',
          approved_at = now(),
          approved_by = v_actor,
          updated_at = now()
      WHERE id = v_supplement_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_code', v_order_code,
    'total_rooms', v_total_rooms,
    'total_items', v_total_items,
    'status', v_initial_status
  );
END;
$$;
