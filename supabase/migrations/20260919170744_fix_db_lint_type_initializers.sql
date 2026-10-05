-- Make empty PL/pgSQL initializers explicit so schema lint and runtime
-- assignment semantics agree across PostgreSQL versions.

CREATE OR REPLACE FUNCTION public.create_distribution_order(
  p_tenant_id UUID, p_hotel_id UUID, p_created_by UUID, p_assigned_to UUID,
  p_rooms JSONB, p_notes TEXT DEFAULT NULL,
  p_auto_release BOOLEAN DEFAULT FALSE,
  p_supplement_request_ids UUID[] DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id UUID; v_order_code TEXT;
  v_room JSONB; v_room_id UUID; v_room_order_id UUID;
  v_item JSONB; v_item_id UUID; v_quantity INTEGER; v_current_stock INTEGER;
  v_total_rooms INTEGER := 0; v_total_items INTEGER := 0;
  v_item_totals JSONB := '{}'::jsonb; v_retry_count INTEGER := 0; v_code_exists BOOLEAN;
  v_initial_status TEXT; v_supplement_id UUID; v_batch_status TEXT;
BEGIN
  LOOP
    v_order_code := 'DIS-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' || lpad((floor(random()*10000)::int)::text,4,'0');
    SELECT EXISTS(SELECT 1 FROM distribution_orders WHERE order_code = v_order_code) INTO v_code_exists;
    IF NOT v_code_exists THEN EXIT; END IF;
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= 5 THEN v_order_code := 'DIS-' || to_char(now(),'YYYYMMDD') || '-' || substring(gen_random_uuid()::text,1,8); EXIT; END IF;
  END LOOP;

  IF p_auto_release AND p_assigned_to IS NOT NULL THEN
    v_initial_status := 'released'; v_batch_status := 'handed_over';
  ELSE
    v_initial_status := 'pending'; v_batch_status := 'open';
  END IF;

  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms) LOOP
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'items') LOOP
      v_item_id := (v_item->>'item_id')::UUID; v_quantity := (v_item->>'quantity')::INTEGER;
      IF v_item_totals ? v_item_id::TEXT THEN
        v_item_totals := jsonb_set(v_item_totals, ARRAY[v_item_id::TEXT], to_jsonb((v_item_totals->>v_item_id::TEXT)::INT + v_quantity));
      ELSE
        v_item_totals := jsonb_set(v_item_totals, ARRAY[v_item_id::TEXT], to_jsonb(v_quantity));
      END IF;
    END LOOP;
  END LOOP;

  FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals) LOOP
    v_quantity := (v_item_totals->>v_item_id::TEXT)::INT;
    SELECT quantity_in_stock INTO v_current_stock FROM items WHERE id = v_item_id AND tenant_id = p_tenant_id;
    IF v_current_stock IS NULL THEN RAISE EXCEPTION 'Item not found: %', v_item_id; END IF;
    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Không đủ hàng trong kho. Yêu cầu: %, Tồn kho: %', v_quantity, v_current_stock;
    END IF;
  END LOOP;

  INSERT INTO distribution_orders (tenant_id, hotel_id, order_code, created_by, assigned_to, notes, status, released_at, released_by)
  VALUES (p_tenant_id, p_hotel_id, v_order_code, p_created_by, p_assigned_to, p_notes, v_initial_status,
    CASE WHEN v_initial_status='released' THEN now() END,
    CASE WHEN v_initial_status='released' THEN p_created_by END)
  RETURNING id INTO v_order_id;

  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms) LOOP
    v_room_id := (v_room->>'room_id')::UUID; v_total_rooms := v_total_rooms + 1;
    INSERT INTO distribution_order_rooms (distribution_order_id, room_id, batch_number)
      VALUES (v_order_id, v_room_id, 1) RETURNING id INTO v_room_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'items') LOOP
      v_item_id := (v_item->>'item_id')::UUID; v_quantity := (v_item->>'quantity')::INT;
      v_total_items := v_total_items + v_quantity;
      INSERT INTO distribution_order_items (distribution_order_room_id, item_id, quantity)
        VALUES (v_room_order_id, v_item_id, v_quantity);
    END LOOP;
  END LOOP;

  INSERT INTO distribution_order_batches (distribution_order_id, batch_number, status, handed_over_at, handed_over_by)
  VALUES (v_order_id, 1, v_batch_status,
    CASE WHEN v_initial_status='released' THEN now() END,
    CASE WHEN v_initial_status='released' THEN p_created_by END)
  ON CONFLICT (distribution_order_id, batch_number) DO UPDATE
    SET status         = EXCLUDED.status,
        handed_over_at = EXCLUDED.handed_over_at,
        handed_over_by = EXCLUDED.handed_over_by,
        updated_at     = now();

  FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals) LOOP
    v_quantity := (v_item_totals->>v_item_id::TEXT)::INT;
    IF v_initial_status = 'released' THEN
      UPDATE items SET
        quantity_in_stock = quantity_in_stock - v_quantity,
        quantity_in_use   = COALESCE(quantity_in_use,0) + v_quantity,
        updated_at = now()
      WHERE id = v_item_id;
    ELSE
      UPDATE items SET
        quantity_in_stock = quantity_in_stock - v_quantity,
        quantity_pending  = COALESCE(quantity_pending,0) + v_quantity,
        updated_at = now()
      WHERE id = v_item_id;
    END IF;
  END LOOP;

  UPDATE distribution_orders SET total_rooms = v_total_rooms, total_items = v_total_items WHERE id = v_order_id;

  IF p_supplement_request_ids IS NOT NULL THEN
    FOREACH v_supplement_id IN ARRAY p_supplement_request_ids LOOP
      UPDATE supplement_requests SET distribution_order_id = v_order_id, status = 'approved',
        approved_at = now(), approved_by = p_created_by
      WHERE id = v_supplement_id AND status = 'pending';
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success',true,'order_id',v_order_id,'order_code',v_order_code,
    'total_rooms',v_total_rooms,'total_items',v_total_items,'status',v_initial_status);
END; $$;

CREATE OR REPLACE FUNCTION public.bulk_delete_items(p_item_ids uuid[], p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count integer := 0;
  v_failed_count integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_item_id uuid;
  v_item_tenant uuid;
  v_caller_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Keep the legacy actor argument meaningful without trusting it for auth.
  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'ACTOR_MISMATCH';
  END IF;

  SELECT tenant_id INTO v_caller_tenant FROM users WHERE id = auth.uid();
  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  FOREACH v_item_id IN ARRAY p_item_ids LOOP
    BEGIN
      SELECT tenant_id INTO v_item_tenant FROM items WHERE id = v_item_id;

      IF v_item_tenant IS NULL OR v_item_tenant <> v_caller_tenant THEN
        v_failed_count := v_failed_count + 1;
        v_errors := array_append(v_errors, 'Item ' || v_item_id || ' không thuộc tenant');
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM items
        WHERE id = v_item_id
          AND (quantity_in_use > 0 OR quantity_in_laundry > 0)
      ) THEN
        v_failed_count := v_failed_count + 1;
        v_errors := array_append(v_errors, 'Item ' || v_item_id || ' đang sử dụng');
      ELSE
        UPDATE items SET
          status = 'discontinued',
          updated_at = now()
        WHERE id = v_item_id;

        v_deleted_count := v_deleted_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
      v_errors := array_append(v_errors, SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'failed_count', v_failed_count,
    'errors', v_errors
  );
END;
$function$;
