-- ============================================================
-- Distribution lifecycle v2 (no data repair)
-- ============================================================

DROP FUNCTION IF EXISTS public.confirm_receive_order(uuid);
DROP FUNCTION IF EXISTS public.complete_room_delivery(uuid, uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.complete_room_delivery(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.complete_room_delivery(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.complete_room_delivery(uuid);

-- create_distribution_order v3 (auto-batch row)
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

  -- ★ Auto-create batch row
  INSERT INTO distribution_order_batches (distribution_order_id, batch_number, status, handed_over_at, handed_over_by)
  VALUES (v_order_id, 1, v_batch_status,
    CASE WHEN v_initial_status='released' THEN now() END,
    CASE WHEN v_initial_status='released' THEN p_created_by END);

  -- Move in_stock -> pending
  FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals) LOOP
    v_quantity := (v_item_totals->>v_item_id::TEXT)::INT;
    UPDATE items SET
      quantity_in_stock = quantity_in_stock - v_quantity,
      quantity_pending  = COALESCE(quantity_pending,0) + v_quantity,
      updated_at = now()
    WHERE id = v_item_id;
  END LOOP;

  -- If auto_release: also pending -> in_use (because batch already handed_over)
  IF v_initial_status = 'released' THEN
    FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals) LOOP
      v_quantity := (v_item_totals->>v_item_id::TEXT)::INT;
      UPDATE items SET
        quantity_pending = GREATEST(0, COALESCE(quantity_pending,0) - v_quantity),
        quantity_in_use  = COALESCE(quantity_in_use,0) + v_quantity,
        updated_at = now()
      WHERE id = v_item_id;
    END LOOP;
  END IF;

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

-- handover_batch v2 (pending -> in_use only)
CREATE OR REPLACE FUNCTION public.handover_batch(
  p_batch_id uuid, p_actor_id uuid DEFAULT NULL, p_adjustments jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id uuid; v_batch record; v_order record; v_item record;
  v_qty_actual integer; v_first_transaction_id uuid; v_new_transaction_id uuid;
  v_transaction_code_base text; v_row_index integer := 0; v_unit_price numeric(15,2);
  v_pending_available integer;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  SELECT * INTO v_batch FROM distribution_order_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','BATCH_NOT_FOUND','message','Không tìm thấy batch'); END IF;
  SELECT * INTO v_order FROM distribution_orders WHERE id = v_batch.distribution_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','ORDER_NOT_FOUND','message','Không tìm thấy phiếu'); END IF;

  IF v_batch.status NOT IN ('open','pending') THEN
    RETURN jsonb_build_object('success',false,'error','INVALID_STATUS','message','Batch đã được xuất kho trước đó');
  END IF;
  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('success',false,'error','INVALID_ORDER_STATUS','message','Phiếu không ở trạng thái chờ xuất kho (status: '||v_order.status||')');
  END IF;

  v_transaction_code_base := 'TXN-HDO-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text,1,4);

  FOR v_item IN
    SELECT doi.item_id, SUM(doi.quantity)::int AS total_quantity,
           i.name AS item_name, i.code AS item_code, COALESCE(i.unit_price,0)::numeric(15,2) AS unit_price,
           COALESCE(i.quantity_in_use,0) AS quantity_in_use, COALESCE(i.quantity_pending,0) AS quantity_pending
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    JOIN items i ON i.id = doi.item_id
    WHERE dor.distribution_order_id = v_order.id
      AND (dor.batch_number = v_batch.batch_number OR v_batch.batch_number IS NULL OR dor.batch_number IS NULL)
    GROUP BY doi.item_id, i.name, i.code, i.unit_price, i.quantity_in_use, i.quantity_pending
  LOOP
    IF p_adjustments IS NOT NULL THEN
      SELECT (adj->>'quantity_actual')::int INTO v_qty_actual
        FROM jsonb_array_elements(p_adjustments) adj
        WHERE (adj->>'item_id')::uuid = v_item.item_id LIMIT 1;
      v_qty_actual := COALESCE(v_qty_actual, v_item.total_quantity);
      UPDATE distribution_order_items doi
        SET quantity_actual = v_qty_actual, updated_at = now()
      FROM distribution_order_rooms dor
      WHERE doi.distribution_order_room_id = dor.id
        AND dor.distribution_order_id = v_order.id
        AND doi.item_id = v_item.item_id
        AND (dor.batch_number = v_batch.batch_number OR v_batch.batch_number IS NULL OR dor.batch_number IS NULL);
    ELSE
      v_qty_actual := v_item.total_quantity;
    END IF;

    IF v_qty_actual IS NULL OR v_qty_actual <= 0 THEN CONTINUE; END IF;
    v_pending_available := v_item.quantity_pending;
    IF v_qty_actual > v_pending_available THEN v_qty_actual := v_pending_available; END IF;
    IF v_qty_actual <= 0 THEN CONTINUE; END IF;

    v_row_index := v_row_index + 1;
    v_unit_price := v_item.unit_price;

    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      unit_price, total_value, related_type, related_id, reference_type, reference_id,
      notes, created_by, status, transaction_date
    ) VALUES (
      v_order.tenant_id, v_order.hotel_id,
      v_transaction_code_base || '-' || lpad(v_row_index::text,3,'0'),
      'transfer', 'staff_assign', v_item.item_id, v_qty_actual,
      v_item.quantity_in_use, v_item.quantity_in_use + v_qty_actual,
      v_unit_price, v_unit_price * v_qty_actual,
      'distribution_handover', v_order.id, 'distribution_handover', v_order.id,
      'Xuất kho cho NV - ' || v_order.order_code, v_actor_id, 'completed', now()
    ) RETURNING id INTO v_new_transaction_id;
    IF v_first_transaction_id IS NULL THEN v_first_transaction_id := v_new_transaction_id; END IF;

    -- ★ pending -> in_use (NOT in_stock again)
    UPDATE items
    SET quantity_pending = GREATEST(0, COALESCE(quantity_pending,0) - v_qty_actual),
        quantity_in_use  = COALESCE(quantity_in_use,0) + v_qty_actual,
        updated_at = now()
    WHERE id = v_item.item_id;
  END LOOP;

  UPDATE distribution_order_batches SET status='handed_over', handed_over_at=now(), handed_over_by=v_actor_id, updated_at=now()
    WHERE id = p_batch_id;
  UPDATE distribution_orders SET status='released', released_at=now(), released_by=v_actor_id,
    transaction_id = COALESCE(v_first_transaction_id, transaction_id), updated_at = now()
    WHERE id = v_order.id;

  RETURN jsonb_build_object('success',true,'message','Đã xuất kho cho nhân viên',
    'batch_id',p_batch_id,'order_id',v_order.id,'transaction_id',v_first_transaction_id,'items_count',v_row_index);
END; $$;

-- confirm_receive_order v4 (status + batch only, no stock)
CREATE OR REPLACE FUNCTION public.confirm_receive_order(
  p_order_id uuid, p_actor_id uuid DEFAULT NULL, p_adjustments jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order RECORD; v_actor uuid;
BEGIN
  v_actor := COALESCE(p_actor_id, auth.uid());
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','ORDER_NOT_FOUND'); END IF;
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to <> v_actor AND v_order.created_by <> v_actor THEN
    RETURN jsonb_build_object('success',false,'error','NOT_ASSIGNED','message','Bạn không được phân công phiếu này');
  END IF;
  IF v_order.status <> 'released' THEN
    RETURN jsonb_build_object('success',false,'error','INVALID_STATUS','message','Phiếu phải ở trạng thái Đã xuất kho');
  END IF;

  UPDATE distribution_orders SET status='in_progress', received_at=now(), received_by=v_actor,
    started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = p_order_id;
  UPDATE distribution_order_batches SET status='received', received_at=now(), received_by=v_actor, updated_at=now()
    WHERE distribution_order_id = p_order_id AND status IN ('handed_over','open');

  RETURN jsonb_build_object('success',true,'order_id',p_order_id,'new_status','in_progress');
END; $$;

-- deliver_stop v3 (in_use & total decrement)
CREATE OR REPLACE FUNCTION public.deliver_stop(
  p_stop_id uuid, p_actor_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id uuid; v_stop record; v_order record; v_batch record; v_transaction_code text;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  SELECT dor.*, r.room_number, r.floor INTO v_stop
    FROM distribution_order_rooms dor JOIN rooms r ON r.id = dor.room_id WHERE dor.id = p_stop_id;
  IF v_stop IS NULL THEN RAISE EXCEPTION 'Stop not found'; END IF;
  SELECT * INTO v_order FROM distribution_orders WHERE id = v_stop.distribution_order_id;
  IF v_order.status NOT IN ('in_progress','released') THEN RAISE EXCEPTION 'Order not in progress (status: %)', v_order.status; END IF;
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to <> v_actor_id AND v_order.created_by <> v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this order';
  END IF;
  SELECT * INTO v_batch FROM distribution_order_batches
    WHERE distribution_order_id = v_stop.distribution_order_id AND batch_number = v_stop.batch_number;
  IF v_batch IS NOT NULL AND v_batch.status NOT IN ('handed_over','received','done') THEN
    RAISE EXCEPTION 'Batch not ready for delivery (status: %)', v_batch.status;
  END IF;
  IF v_stop.stop_status NOT IN ('pending','cannot_access') THEN
    RAISE EXCEPTION 'Stop already processed (status: %)', v_stop.stop_status;
  END IF;

  v_transaction_code := 'TXN-DLV-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text,1,4);

  INSERT INTO inventory_transactions (
    transaction_code, transaction_type, transaction_category,
    item_id, quantity, quantity_before, quantity_after,
    from_location, to_location, hotel_id, tenant_id,
    created_by, related_type, related_id, notes
  )
  SELECT v_transaction_code, 'out', 'room_deliver',
    doi.item_id, COALESCE(doi.quantity_actual, doi.quantity),
    i.quantity_total, GREATEST(0, i.quantity_total - COALESCE(doi.quantity_actual, doi.quantity)),
    'in_use', 'room:' || v_stop.room_id::text,
    v_order.hotel_id, v_order.tenant_id, v_actor_id,
    'distribution_order_room', v_stop.id, 'Giao đồ phòng ' || v_stop.room_number
  FROM distribution_order_items doi JOIN items i ON i.id = doi.item_id
  WHERE doi.distribution_order_room_id = v_stop.id;

  UPDATE items i
  SET quantity_in_use = GREATEST(0, COALESCE(i.quantity_in_use,0) - COALESCE(doi.quantity_actual, doi.quantity)),
      quantity_total  = GREATEST(0, COALESCE(i.quantity_total,0)  - COALESCE(doi.quantity_actual, doi.quantity)),
      updated_at = now()
  FROM distribution_order_items doi
  WHERE doi.distribution_order_room_id = v_stop.id AND i.id = doi.item_id;

  UPDATE distribution_order_rooms SET stop_status='delivered', status='delivered',
    delivered_at=now(), delivered_by=v_actor_id, updated_at=now() WHERE id = p_stop_id;
  UPDATE distribution_orders SET rooms_completed = COALESCE(rooms_completed,0)+1, updated_at=now()
    WHERE id = v_stop.distribution_order_id;

  IF NOT EXISTS (
    SELECT 1 FROM distribution_order_rooms
    WHERE distribution_order_id = v_stop.distribution_order_id
      AND stop_status IN ('pending','cannot_access')
  ) THEN
    UPDATE distribution_orders SET status='completed', completed_at=now(), updated_at=now()
      WHERE id = v_stop.distribution_order_id;
    UPDATE distribution_order_batches SET status='done', updated_at=now()
      WHERE distribution_order_id = v_stop.distribution_order_id;
  END IF;

  RETURN jsonb_build_object('success',true,'stop_id',p_stop_id,'room_number',v_stop.room_number);
END; $$;

-- cancel_distribution_order v2
CREATE OR REPLACE FUNCTION public.cancel_distribution_order(
  p_order_id UUID, p_cancelled_by UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD; v_room RECORD; v_item RECORD; v_bucket TEXT;
BEGIN
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Distribution order not found'; END IF;
  IF v_order.status NOT IN ('pending','released','in_progress') THEN
    RAISE EXCEPTION 'Cannot cancel order with status %', v_order.status;
  END IF;

  IF v_order.status = 'pending' THEN v_bucket := 'pending'; ELSE v_bucket := 'in_use'; END IF;

  FOR v_room IN
    SELECT id FROM distribution_order_rooms
    WHERE distribution_order_id = p_order_id
      AND COALESCE(stop_status, status) NOT IN ('delivered','resolved')
  LOOP
    FOR v_item IN
      SELECT item_id, COALESCE(quantity_actual, quantity) AS qty
      FROM distribution_order_items WHERE distribution_order_room_id = v_room.id
    LOOP
      IF v_bucket = 'pending' THEN
        UPDATE items SET quantity_in_stock = quantity_in_stock + v_item.qty,
          quantity_pending = GREATEST(0, COALESCE(quantity_pending,0) - v_item.qty), updated_at=NOW()
        WHERE id = v_item.item_id;
      ELSE
        UPDATE items SET quantity_in_stock = quantity_in_stock + v_item.qty,
          quantity_in_use = GREATEST(0, COALESCE(quantity_in_use,0) - v_item.qty), updated_at=NOW()
        WHERE id = v_item.item_id;
      END IF;
    END LOOP;
    UPDATE distribution_order_rooms SET status='rejected', stop_status='resolved', updated_at=NOW()
      WHERE id = v_room.id;
  END LOOP;

  UPDATE distribution_orders SET status='cancelled', updated_at=NOW(),
    notes = COALESCE(notes,'') || E'\n[Huỷ bởi ' || p_cancelled_by::text || ' lúc ' || now()::text || ']'
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success',true,'order_id',p_order_id);
END; $$;

-- close_route_if_complete v2 (release stuck in_use)
CREATE OR REPLACE FUNCTION public.close_route_if_complete(
  p_order_id uuid, p_actor_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id uuid; v_order record; v_incomplete_count int; v_room record; v_item record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;

  SELECT COUNT(*) INTO v_incomplete_count
  FROM distribution_order_rooms
  WHERE distribution_order_id = p_order_id
    AND COALESCE(stop_status, status) NOT IN ('delivered','resolved','rejected');
  IF v_incomplete_count > 0 THEN
    RAISE EXCEPTION 'Cannot close route: % stops not completed', v_incomplete_count USING ERRCODE='23505';
  END IF;

  FOR v_room IN
    SELECT id FROM distribution_order_rooms
    WHERE distribution_order_id = p_order_id
      AND COALESCE(stop_status, status) IN ('resolved','rejected','cannot_access')
  LOOP
    FOR v_item IN
      SELECT item_id, COALESCE(quantity_actual, quantity) AS qty
      FROM distribution_order_items WHERE distribution_order_room_id = v_room.id
    LOOP
      UPDATE items SET quantity_in_stock = quantity_in_stock + v_item.qty,
        quantity_in_use = GREATEST(0, COALESCE(quantity_in_use,0) - v_item.qty), updated_at=NOW()
      WHERE id = v_item.item_id;
    END LOOP;
  END LOOP;

  UPDATE distribution_orders SET status='closed', completed_at=COALESCE(completed_at, now()), updated_at=now()
    WHERE id = p_order_id;
  UPDATE distribution_order_batches SET status='done', updated_at=now()
    WHERE distribution_order_id = p_order_id;

  RETURN jsonb_build_object('success',true,'order_id',p_order_id,'status','closed','closed_at',now());
END; $$;
