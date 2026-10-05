-- Fix handover_batch: move qty from quantity_in_stock to quantity_in_use instead of decreasing stock alone
-- (the items_quantities_valid CHECK requires quantity_total = sum of all bucket columns)

CREATE OR REPLACE FUNCTION handover_batch(
  p_batch_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_adjustments jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_batch record;
  v_order record;
  v_item record;
  v_insufficient jsonb := '[]'::jsonb;
  v_qty_actual integer;
  v_first_transaction_id uuid;
  v_new_transaction_id uuid;
  v_transaction_code_base text;
  v_row_index integer := 0;
  v_unit_price numeric(15,2);
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());

  SELECT * INTO v_batch FROM distribution_order_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'BATCH_NOT_FOUND', 'message', 'Không tìm thấy batch');
  END IF;

  SELECT * INTO v_order FROM distribution_orders WHERE id = v_batch.distribution_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Không tìm thấy phiếu');
  END IF;

  IF v_batch.status NOT IN ('open', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Batch đã được giao trước đó');
  END IF;

  IF p_adjustments IS NULL THEN
    FOR v_item IN
      SELECT doi.item_id, i.name, i.code,
             SUM(doi.quantity) as required,
             COALESCE(i.quantity_in_stock, 0) as available
      FROM distribution_order_rooms dor
      JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
      JOIN items i ON i.id = doi.item_id
      WHERE dor.distribution_order_id = v_order.id
        AND (dor.batch_number = v_batch.batch_number OR v_batch.batch_number IS NULL OR dor.batch_number IS NULL)
      GROUP BY doi.item_id, i.name, i.code, i.quantity_in_stock
    LOOP
      IF v_item.available < v_item.required THEN
        v_insufficient := v_insufficient || jsonb_build_object(
          'item_id', v_item.item_id,
          'item_name', v_item.name,
          'item_code', v_item.code,
          'required', v_item.required,
          'available', v_item.available,
          'shortage', v_item.required - v_item.available
        );
      END IF;
    END LOOP;

    IF jsonb_array_length(v_insufficient) > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INSUFFICIENT_STOCK',
        'message', 'Một số mặt hàng không đủ trong kho',
        'insufficient_items', v_insufficient
      );
    END IF;
  END IF;

  v_transaction_code_base := 'TXN-HDO-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text, 1, 4);

  FOR v_item IN
    SELECT doi.item_id,
           SUM(doi.quantity)::integer as total_quantity,
           i.name as item_name,
           i.code as item_code,
           COALESCE(i.unit_price, 0)::numeric(15,2) as unit_price,
           COALESCE(i.quantity_in_stock, 0) as quantity_in_stock
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    JOIN items i ON i.id = doi.item_id
    WHERE dor.distribution_order_id = v_order.id
      AND (dor.batch_number = v_batch.batch_number OR v_batch.batch_number IS NULL OR dor.batch_number IS NULL)
    GROUP BY doi.item_id, i.name, i.code, i.unit_price, i.quantity_in_stock
  LOOP
    IF p_adjustments IS NOT NULL THEN
      SELECT COALESCE(SUM((adj->>'quantity_actual')::integer), v_item.total_quantity)
        INTO v_qty_actual
      FROM jsonb_array_elements(p_adjustments) adj
      WHERE (adj->>'item_id')::uuid = v_item.item_id;

      IF v_qty_actual IS NULL THEN
        v_qty_actual := v_item.total_quantity;
      END IF;

      UPDATE distribution_order_items doi
      SET quantity_actual = (
            SELECT (adj->>'quantity_actual')::integer
            FROM jsonb_array_elements(p_adjustments) adj
            WHERE (adj->>'item_id')::uuid = v_item.item_id
            LIMIT 1
          ),
          updated_at = now()
      FROM distribution_order_rooms dor
      WHERE doi.distribution_order_room_id = dor.id
        AND dor.distribution_order_id = v_order.id
        AND doi.item_id = v_item.item_id
        AND (dor.batch_number = v_batch.batch_number OR v_batch.batch_number IS NULL OR dor.batch_number IS NULL);
    ELSE
      v_qty_actual := v_item.total_quantity;
    END IF;

    IF v_qty_actual IS NULL OR v_qty_actual <= 0 THEN
      CONTINUE;
    END IF;

    -- Cap by available stock to keep CHECK constraint valid
    IF v_qty_actual > v_item.quantity_in_stock THEN
      v_qty_actual := v_item.quantity_in_stock;
    END IF;

    IF v_qty_actual <= 0 THEN
      CONTINUE;
    END IF;

    v_row_index := v_row_index + 1;
    v_unit_price := v_item.unit_price;

    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      unit_price, total_value,
      related_type, related_id, reference_type, reference_id,
      from_warehouse_id,
      notes, created_by, status, transaction_date
    ) VALUES (
      v_order.tenant_id, v_order.hotel_id,
      v_transaction_code_base || '-' || lpad(v_row_index::text, 3, '0'),
      'out', 'staff_assign',
      v_item.item_id, v_qty_actual,
      v_item.quantity_in_stock,
      GREATEST(0, v_item.quantity_in_stock - v_qty_actual),
      v_unit_price, v_unit_price * v_qty_actual,
      'distribution_handover', v_order.id,
      'distribution_handover', v_order.id,
      NULL,
      'Giao hàng cho NV - ' || v_order.order_code,
      v_actor_id, 'completed', now()
    ) RETURNING id INTO v_new_transaction_id;

    IF v_first_transaction_id IS NULL THEN
      v_first_transaction_id := v_new_transaction_id;
    END IF;

    -- Move qty from stock -> in_use (keeps quantity_total invariant)
    UPDATE items
    SET quantity_in_stock = GREATEST(0, COALESCE(quantity_in_stock, 0) - v_qty_actual),
        quantity_in_use   = COALESCE(quantity_in_use, 0) + v_qty_actual,
        updated_at = now()
    WHERE id = v_item.item_id;
  END LOOP;

  UPDATE distribution_order_batches
  SET status = 'handed_over',
      handed_over_at = now(),
      handed_over_by = v_actor_id,
      updated_at = now()
  WHERE id = p_batch_id;

  UPDATE distribution_orders
  SET status = 'released',
      released_at = now(),
      released_by = v_actor_id,
      transaction_id = COALESCE(v_first_transaction_id, transaction_id),
      updated_at = now()
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã giao hàng cho nhân viên thành công',
    'batch_id', p_batch_id,
    'order_id', v_order.id,
    'transaction_id', v_first_transaction_id,
    'items_count', v_row_index
  );
END;
$$;