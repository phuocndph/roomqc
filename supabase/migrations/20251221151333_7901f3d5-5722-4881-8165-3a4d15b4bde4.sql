-- Drop old function and recreate with new logic
-- Now warehouse delivery confirmation directly marks room as 'confirmed' instead of 'delivered'
-- This simplifies the flow: warehouse manager confirms = delivery completed

CREATE OR REPLACE FUNCTION public.confirm_warehouse_delivery(
  p_room_order_id UUID,
  p_delivered_by UUID,
  p_item_confirmations JSONB DEFAULT NULL -- optional: {item_id: {quantity_confirmed: n}}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_order RECORD;
  v_order RECORD;
  v_all_confirmed BOOLEAN;
  v_item RECORD;
  v_confirmation JSONB;
  v_qty_confirmed INT;
BEGIN
  -- Get the room order
  SELECT * INTO v_room_order
  FROM distribution_order_rooms
  WHERE id = p_room_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room order not found';
  END IF;
  
  IF v_room_order.status != 'pending' THEN
    RAISE EXCEPTION 'Room is not in pending status';
  END IF;
  
  -- Update room status directly to 'confirmed' (skipping 'delivered' step)
  UPDATE distribution_order_rooms
  SET 
    status = 'confirmed',
    delivered_at = NOW(),
    delivered_by = p_delivered_by,
    confirmed_at = NOW(),
    confirmed_by = p_delivered_by,
    updated_at = NOW()
  WHERE id = p_room_order_id;
  
  -- Update each item's quantity_confirmed
  FOR v_item IN
    SELECT doi.id, doi.item_id, doi.quantity
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_room_order_id
  LOOP
    v_qty_confirmed := v_item.quantity; -- Default to requested quantity
    
    -- Check if custom confirmation provided
    IF p_item_confirmations IS NOT NULL THEN
      v_confirmation := p_item_confirmations->v_item.item_id::text;
      IF v_confirmation IS NOT NULL THEN
        v_qty_confirmed := COALESCE((v_confirmation->>'quantity_confirmed')::INT, v_item.quantity);
      END IF;
    END IF;
    
    UPDATE distribution_order_items
    SET 
      quantity_confirmed = v_qty_confirmed,
      status = 'confirmed',
      updated_at = NOW()
    WHERE id = v_item.id;
  END LOOP;
  
  -- Get the parent order
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = v_room_order.distribution_order_id;
  
  -- Check if all rooms are now confirmed or rejected
  SELECT NOT EXISTS (
    SELECT 1 FROM distribution_order_rooms
    WHERE distribution_order_id = v_order.id
      AND status NOT IN ('confirmed', 'rejected')
  ) INTO v_all_confirmed;
  
  -- Update order status
  IF v_all_confirmed THEN
    UPDATE distribution_orders
    SET 
      status = 'completed',
      completed_at = NOW(),
      rooms_completed = total_rooms,
      updated_at = NOW()
    WHERE id = v_order.id;
  ELSE
    -- At least one room confirmed, order is in_progress
    UPDATE distribution_orders
    SET 
      status = 'in_progress',
      started_at = COALESCE(started_at, NOW()),
      rooms_completed = (
        SELECT COUNT(*) FROM distribution_order_rooms
        WHERE distribution_order_id = v_order.id
          AND status IN ('confirmed', 'rejected')
      ),
      updated_at = NOW()
    WHERE id = v_order.id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'new_status', 'confirmed',
    'all_completed', v_all_confirmed
  );
END;
$$;