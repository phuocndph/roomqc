-- Update handover_batch to check stock and handle adjustments
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
  v_transaction_id uuid;
  v_transaction_code text;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get batch info
  SELECT * INTO v_batch FROM distribution_order_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('success', false, 'error', 'BATCH_NOT_FOUND', 'message', 'Không tìm thấy batch');
  END IF;
  
  -- Get order info
  SELECT * INTO v_order FROM distribution_orders WHERE id = v_batch.distribution_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Không tìm thấy phiếu');
  END IF;
  
  -- Validate batch status
  IF v_batch.status NOT IN ('open', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Batch đã được giao trước đó');
  END IF;
  
  -- Check stock for all items in this order (if no adjustments provided)
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
    
    -- If insufficient, return error with details
    IF jsonb_array_length(v_insufficient) > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INSUFFICIENT_STOCK',
        'message', 'Một số mặt hàng không đủ trong kho',
        'insufficient_items', v_insufficient
      );
    END IF;
  END IF;
  
  -- Generate transaction code
  v_transaction_code := 'TXN-HDO-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text, 1, 4);
  
  -- Create inventory transaction record
  INSERT INTO inventory_transactions (
    tenant_id, hotel_id, transaction_code, transaction_type,
    reference_type, reference_id, notes, created_by, status
  ) VALUES (
    v_order.tenant_id, v_order.hotel_id, v_transaction_code, 'outbound',
    'distribution_handover', v_order.id, 'Giao hàng cho nhân viên - ' || v_order.order_code,
    v_actor_id, 'completed'
  ) RETURNING id INTO v_transaction_id;
  
  -- Deduct inventory and update quantity_actual for each item
  FOR v_item IN
    SELECT doi.id as item_row_id, doi.item_id, doi.quantity,
           i.name as item_name, i.code as item_code, i.unit,
           COALESCE(i.quantity_in_stock, 0) as quantity_in_stock
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    JOIN items i ON i.id = doi.item_id
    WHERE dor.distribution_order_id = v_order.id
      AND (dor.batch_number = v_batch.batch_number OR v_batch.batch_number IS NULL OR dor.batch_number IS NULL)
  LOOP
    -- Get actual quantity (from adjustments or original)
    v_qty_actual := v_item.quantity;
    
    IF p_adjustments IS NOT NULL THEN
      SELECT (adj->>'quantity_actual')::integer INTO v_qty_actual
      FROM jsonb_array_elements(p_adjustments) adj
      WHERE (adj->>'item_id')::uuid = v_item.item_id;
      
      IF v_qty_actual IS NULL THEN
        v_qty_actual := v_item.quantity;
      END IF;
      
      -- Update quantity_actual on the item row
      UPDATE distribution_order_items
      SET quantity_actual = v_qty_actual,
          updated_at = now()
      WHERE id = v_item.item_row_id;
    END IF;
    
    -- Only deduct if qty > 0
    IF v_qty_actual > 0 THEN
      -- Create transaction item
      INSERT INTO inventory_transaction_items (
        transaction_id, item_id, quantity, unit, notes
      ) VALUES (
        v_transaction_id, v_item.item_id, v_qty_actual, v_item.unit,
        'Giao cho phiếu ' || v_order.order_code
      );
      
      -- Update item stock
      UPDATE items
      SET quantity_in_stock = GREATEST(0, COALESCE(quantity_in_stock, 0) - v_qty_actual),
          updated_at = now()
      WHERE id = v_item.item_id;
    END IF;
  END LOOP;
  
  -- Update batch status
  UPDATE distribution_order_batches 
  SET status = 'handed_over',
      handed_over_at = now(),
      handed_over_by = v_actor_id,
      updated_at = now()
  WHERE id = p_batch_id;
  
  -- Update order status to released
  UPDATE distribution_orders 
  SET status = 'released',
      released_at = now(),
      released_by = v_actor_id,
      transaction_id = v_transaction_id,
      updated_at = now()
  WHERE id = v_order.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã giao hàng cho nhân viên thành công',
    'batch_id', p_batch_id,
    'order_id', v_order.id,
    'transaction_id', v_transaction_id
  );
END;
$$;

-- Simplify confirm_receive_order - no longer handles stock deduction
CREATE OR REPLACE FUNCTION confirm_receive_order(
  p_order_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_adjustments jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get order info
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Không tìm thấy phiếu');
  END IF;
  
  -- Validate order status
  IF v_order.status != 'released' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'INVALID_STATUS', 
      'message', 'Phiếu chưa được giao từ kho hoặc đã được xác nhận'
    );
  END IF;
  
  -- Update order status to in_progress
  UPDATE distribution_orders 
  SET status = 'in_progress',
      received_at = now(),
      received_by = v_actor_id,
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = p_order_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã xác nhận nhận hàng thành công',
    'order_id', p_order_id
  );
END;
$$;