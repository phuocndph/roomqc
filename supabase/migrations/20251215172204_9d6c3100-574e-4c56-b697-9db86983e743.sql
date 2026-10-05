-- RPC function: Complete room delivery and update room_items
CREATE OR REPLACE FUNCTION public.complete_room_delivery(
  p_distribution_order_room_id UUID,
  p_confirmed_by UUID,
  p_items JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_room_id UUID;
  v_item RECORD;
  v_all_completed BOOLEAN;
  v_order_status TEXT;
  v_confirmed_qty INTEGER;
BEGIN
  -- Get distribution order room info
  SELECT 
    dor.distribution_order_id, 
    dor.room_id,
    d_order.status
  INTO v_order_id, v_room_id, v_order_status
  FROM distribution_order_rooms dor
  JOIN distribution_orders d_order ON d_order.id = dor.distribution_order_id
  WHERE dor.id = p_distribution_order_room_id;
  
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Distribution order room not found';
  END IF;
  
  -- Check if order is not cancelled
  IF v_order_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot confirm delivery for cancelled order';
  END IF;

  -- Update distribution order room status
  UPDATE distribution_order_rooms
  SET 
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = p_confirmed_by,
    delivered_at = COALESCE(delivered_at, now()),
    updated_at = now()
  WHERE id = p_distribution_order_room_id;

  -- Process each item in this room
  FOR v_item IN 
    SELECT 
      doi.id as order_item_id,
      doi.item_id,
      doi.quantity
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
  LOOP
    -- Get confirmed quantity from p_items or default to ordered quantity
    v_confirmed_qty := v_item.quantity;
    IF p_items IS NOT NULL THEN
      SELECT (x->>'quantity_confirmed')::INTEGER INTO v_confirmed_qty
      FROM jsonb_array_elements(p_items) x
      WHERE (x->>'item_id')::UUID = v_item.item_id;
      v_confirmed_qty := COALESCE(v_confirmed_qty, v_item.quantity);
    END IF;

    -- Update distribution order item
    UPDATE distribution_order_items
    SET 
      status = 'confirmed',
      quantity_confirmed = v_confirmed_qty,
      updated_at = now()
    WHERE id = v_item.order_item_id;

    -- Update items table: move from pending to in_use
    UPDATE items
    SET 
      quantity_pending = GREATEST(0, COALESCE(quantity_pending, 0) - v_item.quantity),
      quantity_in_use = COALESCE(quantity_in_use, 0) + v_confirmed_qty,
      updated_at = now()
    WHERE id = v_item.item_id;

    -- Upsert into room_items
    INSERT INTO room_items (room_id, item_id, quantity, condition, updated_at)
    VALUES (v_room_id, v_item.item_id, v_confirmed_qty, 'good', now())
    ON CONFLICT (room_id, item_id)
    DO UPDATE SET 
      quantity = room_items.quantity + EXCLUDED.quantity,
      updated_at = now();
  END LOOP;

  -- Check if all rooms in this order are completed
  SELECT NOT EXISTS (
    SELECT 1 FROM distribution_order_rooms
    WHERE distribution_order_id = v_order_id
    AND status NOT IN ('confirmed', 'rejected')
  ) INTO v_all_completed;

  -- Update order status
  IF v_all_completed THEN
    UPDATE distribution_orders
    SET 
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = v_order_id;
  ELSIF v_order_status = 'pending' THEN
    UPDATE distribution_orders
    SET 
      status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      updated_at = now()
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'all_completed', v_all_completed
  );
END;
$$;