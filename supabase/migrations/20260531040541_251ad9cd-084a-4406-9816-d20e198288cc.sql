-- Gộp 2 UPDATE items khi auto_release thành 1 để tránh ghi log audit/snapshot bị hiểu như chuyển dịch ảo (pending tạm)

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
  v_item_totals JSONB := '{}'; v_retry_count INTEGER := 0; v_code_exists BOOLEAN;
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

  -- UPSERT batch row (coexist với trigger trg_auto_create_batch_records)
  INSERT INTO distribution_order_batches (distribution_order_id, batch_number, status, handed_over_at, handed_over_by)
  VALUES (v_order_id, 1, v_batch_status,
    CASE WHEN v_initial_status='released' THEN now() END,
    CASE WHEN v_initial_status='released' THEN p_created_by END)
  ON CONFLICT (distribution_order_id, batch_number) DO UPDATE
    SET status         = EXCLUDED.status,
        handed_over_at = EXCLUDED.handed_over_at,
        handed_over_by = EXCLUDED.handed_over_by,
        updated_at     = now();

  -- ★ Stock movement: 1 UPDATE duy nhất per item
  --   - Manual flow (pending order):  in_stock -= q, pending  += q
  --   - Auto-release flow (released): in_stock -= q, in_use   += q  (bỏ qua pending tạm)
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