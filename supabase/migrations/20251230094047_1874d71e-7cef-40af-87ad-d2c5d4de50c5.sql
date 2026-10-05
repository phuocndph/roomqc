-- Update deliver_stop RPC to allow batch status 'handed_over'
CREATE OR REPLACE FUNCTION deliver_stop(
  p_stop_id uuid,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id uuid;
  v_stop record;
  v_order record;
  v_batch record;
  v_item record;
  v_transaction_code text;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get stop info
  SELECT dor.*, r.room_number, r.floor
  INTO v_stop
  FROM distribution_order_rooms dor
  JOIN rooms r ON r.id = dor.room_id
  WHERE dor.id = p_stop_id;
  
  IF v_stop IS NULL THEN
    RAISE EXCEPTION 'Stop not found';
  END IF;
  
  -- Get order info
  SELECT * INTO v_order FROM distribution_orders WHERE id = v_stop.distribution_order_id;
  
  -- Validate order status
  IF v_order.status NOT IN ('in_progress', 'released') THEN
    RAISE EXCEPTION 'Order not in progress (status: %)', v_order.status;
  END IF;
  
  -- Validate actor is assigned
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this order';
  END IF;
  
  -- Get batch info
  SELECT * INTO v_batch 
  FROM distribution_order_batches 
  WHERE distribution_order_id = v_stop.distribution_order_id 
    AND batch_number = v_stop.batch_number;
  
  -- Validate batch status - ALLOW handed_over, received, or done
  IF v_batch IS NOT NULL AND v_batch.status NOT IN ('handed_over', 'received', 'done') THEN
    RAISE EXCEPTION 'Batch not ready for delivery (status: %)', v_batch.status;
  END IF;
  
  -- Validate stop status
  IF v_stop.stop_status NOT IN ('pending', 'cannot_access') THEN
    RAISE EXCEPTION 'Stop already processed (status: %)', v_stop.stop_status;
  END IF;
  
  -- Generate transaction code
  v_transaction_code := 'TXN-DLV-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  
  -- Create inventory transactions: Pending -> In Use (for room delivery)
  INSERT INTO inventory_transactions (
    transaction_code,
    transaction_type,
    transaction_category,
    item_id,
    quantity,
    quantity_before,
    quantity_after,
    from_location,
    to_location,
    hotel_id,
    tenant_id,
    created_by,
    related_type,
    related_id,
    notes
  )
  SELECT
    v_transaction_code,
    'transfer',
    'room_deliver',
    doi.item_id,
    doi.quantity,
    i.quantity_pending,
    i.quantity_pending - doi.quantity,
    'pending',
    'room:' || v_stop.room_id::text,
    v_order.hotel_id,
    v_order.tenant_id,
    v_actor_id,
    'distribution_order_room',
    v_stop.id,
    'Giao đồ phòng ' || v_stop.room_number
  FROM distribution_order_items doi
  JOIN items i ON i.id = doi.item_id
  WHERE doi.distribution_order_room_id = v_stop.id;
  
  -- Update item quantities: pending -> in_use
  UPDATE items i
  SET 
    quantity_pending = i.quantity_pending - doi.quantity,
    quantity_in_use = i.quantity_in_use + doi.quantity,
    updated_at = now()
  FROM distribution_order_items doi
  WHERE doi.distribution_order_room_id = v_stop.id
    AND i.id = doi.item_id;
  
  -- Update stop status
  UPDATE distribution_order_rooms
  SET 
    stop_status = 'delivered',
    status = 'delivered',
    delivered_at = now(),
    delivered_by = v_actor_id,
    updated_at = now()
  WHERE id = p_stop_id;
  
  -- Update order progress
  UPDATE distribution_orders
  SET 
    rooms_completed = COALESCE(rooms_completed, 0) + 1,
    updated_at = now()
  WHERE id = v_stop.distribution_order_id;
  
  -- Check if all stops are done to complete the order
  IF NOT EXISTS (
    SELECT 1 FROM distribution_order_rooms
    WHERE distribution_order_id = v_stop.distribution_order_id
      AND stop_status IN ('pending', 'cannot_access')
  ) THEN
    UPDATE distribution_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_stop.distribution_order_id;
    
    -- Also mark batch as done
    UPDATE distribution_order_batches
    SET status = 'done', updated_at = now()
    WHERE distribution_order_id = v_stop.distribution_order_id 
      AND batch_number = v_stop.batch_number;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'stop_id', p_stop_id,
    'room_number', v_stop.room_number
  );
END;
$$;