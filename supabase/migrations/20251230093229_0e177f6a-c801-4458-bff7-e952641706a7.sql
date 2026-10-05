-- Add columns for tracking when employee receives the order
ALTER TABLE distribution_orders
ADD COLUMN IF NOT EXISTS received_at timestamptz,
ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES users(id);

-- Update handover_batch to NOT deduct inventory (only update status)
CREATE OR REPLACE FUNCTION handover_batch(
  p_batch_id uuid,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_batch record;
  v_order record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get batch info
  SELECT * INTO v_batch FROM distribution_order_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;
  
  -- Get order info
  SELECT * INTO v_order FROM distribution_orders WHERE id = v_batch.distribution_order_id;
  
  -- Validate batch status
  IF v_batch.status NOT IN ('open', 'pending') THEN
    RAISE EXCEPTION 'Batch already handed over or in invalid state: %', v_batch.status;
  END IF;
  
  -- Update batch status to handed_over (NO inventory deduction - that happens when employee confirms receipt)
  UPDATE distribution_order_batches
  SET status = 'handed_over',
      handed_over_at = now(),
      handed_over_by = v_actor_id,
      updated_at = now()
  WHERE id = p_batch_id;
  
  -- Update order status to released if still pending
  IF v_order.status = 'pending' THEN
    UPDATE distribution_orders
    SET status = 'released',
        released_at = now(),
        released_by = v_actor_id,
        updated_at = now()
    WHERE id = v_order.id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'message', 'Batch handed over successfully. Waiting for employee to confirm receipt.'
  );
END;
$$;

-- Create new RPC for employee to confirm receipt of all items (THIS deducts inventory)
CREATE OR REPLACE FUNCTION confirm_receive_order(
  p_order_id uuid,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order record;
  v_transaction_code text;
  v_item record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get order info
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  -- Validate actor is assigned to this order
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this order';
  END IF;
  
  -- Validate order status (must be released)
  IF v_order.status != 'released' THEN
    RAISE EXCEPTION 'Order not ready for receiving. Current status: %', v_order.status;
  END IF;
  
  -- Generate transaction code
  v_transaction_code := 'TXN-RCV-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  
  -- Deduct inventory: Create transactions for each item and update stock
  FOR v_item IN
    SELECT 
      doi.item_id,
      i.hotel_id,
      i.tenant_id,
      SUM(doi.quantity) as total_quantity,
      i.quantity_in_stock,
      i.quantity_pending
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    JOIN items i ON i.id = doi.item_id
    WHERE dor.distribution_order_id = p_order_id
    GROUP BY doi.item_id, i.hotel_id, i.tenant_id, i.quantity_in_stock, i.quantity_pending
  LOOP
    -- Create inventory transaction: warehouse_release
    INSERT INTO inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_type,
      transaction_category,
      transaction_code,
      quantity,
      quantity_before,
      quantity_after,
      from_location,
      to_location,
      related_type,
      related_id,
      created_by,
      notes
    ) VALUES (
      v_item.tenant_id,
      v_item.hotel_id,
      v_item.item_id,
      'out',
      'warehouse_release',
      v_transaction_code,
      v_item.total_quantity,
      v_item.quantity_in_stock,
      v_item.quantity_in_stock - v_item.total_quantity,
      'warehouse',
      'staff',
      'distribution_order',
      p_order_id,
      v_actor_id,
      'Nhân viên xác nhận nhận hàng từ kho'
    );
    
    -- Update item quantities: decrease stock, increase pending
    UPDATE items
    SET quantity_in_stock = quantity_in_stock - v_item.total_quantity,
        quantity_pending = COALESCE(quantity_pending, 0) + v_item.total_quantity,
        updated_at = now()
    WHERE id = v_item.item_id;
  END LOOP;
  
  -- Update order status to in_progress
  UPDATE distribution_orders
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      received_at = now(),
      received_by = v_actor_id,
      updated_at = now()
  WHERE id = p_order_id;
  
  -- Update all batches to 'received'
  UPDATE distribution_order_batches
  SET status = 'received',
      received_at = now(),
      received_by = v_actor_id,
      updated_at = now()
  WHERE distribution_order_id = p_order_id 
    AND status IN ('open', 'pending', 'handed_over');
  
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'message', 'Đã xác nhận nhận hàng thành công. Kho đã được trừ.'
  );
END;
$$;