-- 1. Drop old functions that will be replaced
DROP FUNCTION IF EXISTS public.confirm_warehouse_delivery(uuid, uuid);
DROP FUNCTION IF EXISTS public.complete_room_delivery(uuid, text, text, uuid);

-- 2. Create unified confirm function with proper inventory tracking
CREATE OR REPLACE FUNCTION public.confirm_room_delivery(
  p_room_order_id UUID,
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room_order RECORD;
  v_dist_order RECORD;
  v_room RECORD;
  v_item RECORD;
  v_transaction_code TEXT;
BEGIN
  -- Get room order details
  SELECT dor.*, dist_ord.tenant_id, dist_ord.hotel_id, dist_ord.order_code, dist_ord.created_by as order_created_by
  INTO v_room_order
  FROM distribution_order_rooms dor
  JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
  WHERE dor.id = p_room_order_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room order not found');
  END IF;
  
  IF v_room_order.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already confirmed');
  END IF;
  
  IF v_room_order.status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot confirm rejected order');
  END IF;
  
  -- Get room info
  SELECT * INTO v_room FROM rooms WHERE id = v_room_order.room_id;
  
  -- Generate transaction code
  v_transaction_code := 'DIS-CONF-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
    lpad((floor(random() * 1000)::integer)::text, 3, '0');
  
  -- Process each item in this room order
  FOR v_item IN 
    SELECT doi.*, i.name as item_name, i.quantity_pending, i.quantity_in_use, i.unit_price
    FROM distribution_order_items doi
    JOIN items i ON i.id = doi.item_id
    WHERE doi.distribution_order_room_id = p_room_order_id
  LOOP
    -- Update item quantities: pending -> in_use
    UPDATE items SET
      quantity_pending = GREATEST(0, COALESCE(quantity_pending, 0) - v_item.quantity),
      quantity_in_use = COALESCE(quantity_in_use, 0) + v_item.quantity,
      updated_at = now()
    WHERE id = v_item.item_id;
    
    -- Record inventory transaction
    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      from_location, to_location, created_by,
      related_type, related_id, notes,
      unit_price, total_value
    ) VALUES (
      v_room_order.tenant_id, 
      v_room_order.hotel_id, 
      v_transaction_code, 
      'out', 
      'room_assign',
      v_item.item_id, 
      v_item.quantity, 
      COALESCE(v_item.quantity_pending, 0),
      GREATEST(0, COALESCE(v_item.quantity_pending, 0) - v_item.quantity),
      'pending',
      'Phòng ' || v_room.room_number,
      p_confirmed_by,
      'distribution_order',
      v_room_order.distribution_order_id,
      'Xác nhận giao hàng từ phiếu ' || v_room_order.order_code,
      COALESCE(v_item.unit_price, 0),
      v_item.quantity * COALESCE(v_item.unit_price, 0)
    );
    
    -- Update or insert room_items
    INSERT INTO room_items (room_id, item_id, quantity, condition, is_verified, verified_at, verified_by)
    VALUES (v_room_order.room_id, v_item.item_id, v_item.quantity, 'good', true, now(), p_confirmed_by)
    ON CONFLICT (room_id, item_id) 
    DO UPDATE SET 
      quantity = room_items.quantity + EXCLUDED.quantity,
      is_verified = true,
      verified_at = now(),
      verified_by = p_confirmed_by,
      updated_at = now();
    
    -- Update distribution order item status
    UPDATE distribution_order_items SET
      status = 'confirmed',
      quantity_confirmed = v_item.quantity,
      updated_at = now()
    WHERE id = v_item.id;
  END LOOP;
  
  -- Update room order status
  UPDATE distribution_order_rooms SET
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = p_confirmed_by,
    updated_at = now()
  WHERE id = p_room_order_id;
  
  -- Check if all rooms are completed
  UPDATE distribution_orders SET
    rooms_completed = (
      SELECT COUNT(*) FROM distribution_order_rooms 
      WHERE distribution_order_id = v_room_order.distribution_order_id 
      AND status IN ('confirmed', 'rejected')
    ),
    status = CASE 
      WHEN (
        SELECT COUNT(*) FROM distribution_order_rooms 
        WHERE distribution_order_id = v_room_order.distribution_order_id 
        AND status NOT IN ('confirmed', 'rejected')
      ) = 0 THEN 'completed'
      ELSE status
    END,
    completed_at = CASE 
      WHEN (
        SELECT COUNT(*) FROM distribution_order_rooms 
        WHERE distribution_order_id = v_room_order.distribution_order_id 
        AND status NOT IN ('confirmed', 'rejected')
      ) = 0 THEN now()
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = v_room_order.distribution_order_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'order_code', v_room_order.order_code
  );
END;
$$;

-- 3. Create batch confirm function
CREATE OR REPLACE FUNCTION public.batch_confirm_room_deliveries(
  p_room_order_ids UUID[],
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room_order_id UUID;
  v_result JSONB;
  v_success_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH v_room_order_id IN ARRAY p_room_order_ids
  LOOP
    v_result := confirm_room_delivery(v_room_order_id, p_confirmed_by);
    
    IF (v_result->>'success')::BOOLEAN THEN
      v_success_count := v_success_count + 1;
    ELSE
      v_failed_count := v_failed_count + 1;
      v_errors := array_append(v_errors, v_room_order_id::TEXT || ': ' || (v_result->>'error'));
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', v_failed_count = 0,
    'success_count', v_success_count,
    'failed_count', v_failed_count,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

-- 4. Update undo function to properly revert inventory
CREATE OR REPLACE FUNCTION public.undo_room_delivery_confirmation(
  p_distribution_order_room_id UUID,
  p_performed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room_order RECORD;
  v_item RECORD;
  v_hours_since_confirm NUMERIC;
  v_room_number TEXT;
BEGIN
  -- Get room order
  SELECT dor.*, dist_ord.tenant_id, dist_ord.hotel_id, dist_ord.order_code
  INTO v_room_order
  FROM distribution_order_rooms dor
  JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
  WHERE dor.id = p_distribution_order_room_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room order not found');
  END IF;
  
  IF v_room_order.status != 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only undo confirmed orders');
  END IF;
  
  -- Check 24-hour limit
  v_hours_since_confirm := EXTRACT(EPOCH FROM (now() - v_room_order.confirmed_at)) / 3600;
  IF v_hours_since_confirm > 24 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only undo within 24 hours');
  END IF;
  
  -- Get room number
  SELECT room_number INTO v_room_number FROM rooms WHERE id = v_room_order.room_id;
  
  -- Revert each item
  FOR v_item IN 
    SELECT doi.*, i.quantity_pending, i.quantity_in_use
    FROM distribution_order_items doi
    JOIN items i ON i.id = doi.item_id
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
  LOOP
    -- Revert item quantities: in_use -> pending
    UPDATE items SET
      quantity_pending = COALESCE(quantity_pending, 0) + v_item.quantity,
      quantity_in_use = GREATEST(0, COALESCE(quantity_in_use, 0) - v_item.quantity),
      updated_at = now()
    WHERE id = v_item.item_id;
    
    -- Update room_items
    UPDATE room_items SET
      quantity = GREATEST(0, quantity - v_item.quantity),
      updated_at = now()
    WHERE room_id = v_room_order.room_id AND item_id = v_item.item_id;
    
    -- Delete room_items if quantity is 0
    DELETE FROM room_items 
    WHERE room_id = v_room_order.room_id 
      AND item_id = v_item.item_id 
      AND quantity <= 0;
    
    -- Reset item status
    UPDATE distribution_order_items SET
      status = 'pending',
      quantity_confirmed = NULL,
      updated_at = now()
    WHERE id = v_item.id;
  END LOOP;
  
  -- Delete the inventory transactions for this confirmation
  DELETE FROM inventory_transactions 
  WHERE related_type = 'distribution_order' 
    AND related_id = v_room_order.distribution_order_id
    AND to_location = 'Phòng ' || v_room_number;
  
  -- Reset room order status
  UPDATE distribution_order_rooms SET
    status = 'pending',
    confirmed_at = NULL,
    confirmed_by = NULL,
    updated_at = now()
  WHERE id = p_distribution_order_room_id;
  
  -- Update order stats
  UPDATE distribution_orders SET
    rooms_completed = GREATEST(0, COALESCE(rooms_completed, 0) - 1),
    status = 'in_progress',
    completed_at = NULL,
    updated_at = now()
  WHERE id = v_room_order.distribution_order_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;