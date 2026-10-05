-- RPC Function: Confirm delivery from Room Check
-- Updates stop_status to 'delivered', confirms items, and updates room_items quantity

CREATE OR REPLACE FUNCTION public.confirm_delivery_from_room_check(
  p_room_order_id uuid,
  p_confirmed_by uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_order distribution_order_rooms%ROWTYPE;
  v_order distribution_orders%ROWTYPE;
  v_item RECORD;
  v_items_updated int := 0;
  v_room_id uuid;
  v_tenant_id uuid;
BEGIN
  -- 1. Get the room order record
  SELECT * INTO v_room_order
  FROM distribution_order_rooms
  WHERE id = p_room_order_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room order not found');
  END IF;
  
  -- Check if already delivered
  IF v_room_order.stop_status = 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already delivered');
  END IF;
  
  v_room_id := v_room_order.room_id;
  
  -- 2. Get the parent distribution order for tenant_id
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = v_room_order.distribution_order_id;
  
  v_tenant_id := v_order.tenant_id;
  
  -- 3. Update room_order status to delivered
  UPDATE distribution_order_rooms
  SET 
    stop_status = 'delivered',
    status = 'delivered',
    delivered_at = now(),
    delivered_by = p_confirmed_by,
    confirmed_at = now(),
    confirmed_by = p_confirmed_by,
    updated_at = now()
  WHERE id = p_room_order_id;
  
  -- 4. Loop through items and update room_items
  FOR v_item IN 
    SELECT doi.item_id, doi.quantity, i.name as item_name
    FROM distribution_order_items doi
    JOIN items i ON i.id = doi.item_id
    WHERE doi.distribution_order_room_id = p_room_order_id
  LOOP
    -- Update item status to confirmed
    UPDATE distribution_order_items
    SET 
      status = 'confirmed',
      quantity_confirmed = quantity,
      updated_at = now()
    WHERE distribution_order_room_id = p_room_order_id
      AND item_id = v_item.item_id;
    
    -- Upsert room_items: increment quantity if exists, otherwise insert
    INSERT INTO room_items (room_id, item_id, quantity, last_checked_at, last_checked_by, condition)
    VALUES (v_room_id, v_item.item_id, v_item.quantity, now(), p_confirmed_by, 'good')
    ON CONFLICT (room_id, item_id)
    DO UPDATE SET 
      quantity = COALESCE(room_items.quantity, 0) + EXCLUDED.quantity,
      last_checked_at = now(),
      last_checked_by = p_confirmed_by;
    
    v_items_updated := v_items_updated + 1;
  END LOOP;
  
  -- 5. Update parent order stats
  UPDATE distribution_orders
  SET 
    rooms_completed = COALESCE(rooms_completed, 0) + 1,
    updated_at = now()
  WHERE id = v_room_order.distribution_order_id;
  
  -- Check if all rooms are completed
  IF (SELECT COUNT(*) FROM distribution_order_rooms 
      WHERE distribution_order_id = v_room_order.distribution_order_id 
      AND stop_status NOT IN ('delivered', 'resolved')) = 0 THEN
    UPDATE distribution_orders
    SET 
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = v_room_order.distribution_order_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'items_updated', v_items_updated,
    'room_id', v_room_id,
    'message', 'Đã xác nhận nhận hàng thành công'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.confirm_delivery_from_room_check(uuid, uuid) TO authenticated;