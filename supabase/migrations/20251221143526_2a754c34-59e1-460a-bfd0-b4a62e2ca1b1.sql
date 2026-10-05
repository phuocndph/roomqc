-- Enhance complete_room_delivery to support additional items
CREATE OR REPLACE FUNCTION complete_room_delivery(
  p_distribution_order_room_id UUID,
  p_confirmed_by UUID,
  p_item_confirmations JSONB DEFAULT NULL,
  p_additional_items JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_room_id UUID;
  v_tenant_id UUID;
  v_hotel_id UUID;
  v_item RECORD;
  v_additional_item RECORD;
  v_confirmed_qty INTEGER;
  v_ordered_qty INTEGER;
  v_missing_qty INTEGER;
  v_all_completed BOOLEAN;
  v_item_id UUID;
  v_add_qty INTEGER;
  v_current_stock INTEGER;
BEGIN
  -- Get order and room info
  SELECT dor.distribution_order_id, dor.room_id, dist_ord.tenant_id, dist_ord.hotel_id 
  INTO v_order_id, v_room_id, v_tenant_id, v_hotel_id
  FROM distribution_order_rooms dor
  JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
  WHERE dor.id = p_distribution_order_room_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Distribution order room not found';
  END IF;

  -- Process existing items
  FOR v_item IN 
    SELECT doi.id, doi.item_id, doi.quantity
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
  LOOP
    -- Get confirmed quantity from input or default to ordered quantity
    v_ordered_qty := v_item.quantity;
    
    -- Try to get from new format {item_id: {quantity_confirmed: X}}
    IF p_item_confirmations IS NOT NULL AND 
       p_item_confirmations->v_item.item_id::TEXT IS NOT NULL THEN
      v_confirmed_qty := COALESCE(
        (p_item_confirmations->v_item.item_id::TEXT->>'quantity_confirmed')::INTEGER,
        (p_item_confirmations->>v_item.item_id::TEXT)::INTEGER,
        v_ordered_qty
      );
    ELSE
      v_confirmed_qty := v_ordered_qty;
    END IF;
    
    -- Calculate missing quantity
    v_missing_qty := v_ordered_qty - v_confirmed_qty;

    -- Update item status and confirmed quantity
    UPDATE distribution_order_items
    SET 
      quantity_confirmed = v_confirmed_qty,
      status = CASE 
        WHEN v_confirmed_qty = 0 THEN 'rejected'
        WHEN v_confirmed_qty < v_ordered_qty THEN 'partial'
        ELSE 'delivered'
      END,
      updated_at = NOW()
    WHERE id = v_item.id;

    -- Update item quantities - Move confirmed quantity from pending to in_use
    UPDATE items
    SET 
      quantity_pending = GREATEST(COALESCE(quantity_pending, 0) - v_confirmed_qty, 0),
      quantity_in_use = COALESCE(quantity_in_use, 0) + v_confirmed_qty,
      updated_at = NOW()
    WHERE id = v_item.item_id;

    -- Return missing quantity back to stock
    IF v_missing_qty > 0 THEN
      UPDATE items
      SET 
        quantity_pending = GREATEST(COALESCE(quantity_pending, 0) - v_missing_qty, 0),
        quantity_in_stock = COALESCE(quantity_in_stock, 0) + v_missing_qty,
        updated_at = NOW()
      WHERE id = v_item.item_id;
    END IF;

    -- Update room_items (upsert) - only if confirmed quantity > 0
    IF v_confirmed_qty > 0 THEN
      INSERT INTO room_items (room_id, item_id, quantity, condition, assigned_at)
      VALUES (v_room_id, v_item.item_id, v_confirmed_qty, 'good', NOW())
      ON CONFLICT (room_id, item_id) 
      DO UPDATE SET 
        quantity = room_items.quantity + EXCLUDED.quantity,
        assigned_at = NOW();
    END IF;
  END LOOP;

  -- Process additional items (incidentals)
  IF p_additional_items IS NOT NULL AND jsonb_array_length(p_additional_items) > 0 THEN
    FOR v_additional_item IN SELECT * FROM jsonb_to_recordset(p_additional_items) AS x(item_id UUID, quantity INTEGER)
    LOOP
      v_item_id := v_additional_item.item_id;
      v_add_qty := v_additional_item.quantity;
      
      -- Check current stock
      SELECT COALESCE(quantity_in_stock, 0) INTO v_current_stock
      FROM items
      WHERE id = v_item_id;
      
      IF v_current_stock < v_add_qty THEN
        RAISE EXCEPTION 'Khong du ton kho cho item %', v_item_id;
      END IF;
      
      -- Create new distribution_order_item for additional item
      INSERT INTO distribution_order_items (
        distribution_order_room_id, 
        item_id, 
        quantity, 
        quantity_confirmed,
        status, 
        notes,
        created_at, 
        updated_at
      )
      VALUES (
        p_distribution_order_room_id, 
        v_item_id, 
        v_add_qty, 
        v_add_qty,
        'delivered',
        'Do phat sinh',
        NOW(), 
        NOW()
      );
      
      -- Update item quantities - Move from stock to in_use
      UPDATE items
      SET 
        quantity_in_stock = GREATEST(COALESCE(quantity_in_stock, 0) - v_add_qty, 0),
        quantity_in_use = COALESCE(quantity_in_use, 0) + v_add_qty,
        updated_at = NOW()
      WHERE id = v_item_id;
      
      -- Update room_items (upsert)
      INSERT INTO room_items (room_id, item_id, quantity, condition, assigned_at)
      VALUES (v_room_id, v_item_id, v_add_qty, 'good', NOW())
      ON CONFLICT (room_id, item_id) 
      DO UPDATE SET 
        quantity = room_items.quantity + EXCLUDED.quantity,
        assigned_at = NOW();
      
      -- Update order total_items
      UPDATE distribution_orders
      SET total_items = COALESCE(total_items, 0) + v_add_qty
      WHERE id = v_order_id;
    END LOOP;
  END IF;

  -- Update room status
  UPDATE distribution_order_rooms
  SET 
    status = 'confirmed',
    confirmed_at = NOW(),
    confirmed_by = p_confirmed_by,
    updated_at = NOW()
  WHERE id = p_distribution_order_room_id;

  -- Check if all rooms are processed and update order status
  UPDATE distribution_orders
  SET 
    rooms_completed = (
      SELECT COUNT(*) 
      FROM distribution_order_rooms 
      WHERE distribution_order_id = v_order_id 
      AND status IN ('confirmed', 'rejected')
    ),
    status = CASE 
      WHEN (SELECT COUNT(*) FROM distribution_order_rooms WHERE distribution_order_id = v_order_id AND status NOT IN ('confirmed', 'rejected')) = 0 
      THEN 'completed'
      ELSE status
    END,
    completed_at = CASE 
      WHEN (SELECT COUNT(*) FROM distribution_order_rooms WHERE distribution_order_id = v_order_id AND status NOT IN ('confirmed', 'rejected')) = 0 
      THEN NOW()
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE id = v_order_id;

  -- Check if all rooms completed
  SELECT NOT EXISTS (
    SELECT 1 FROM distribution_order_rooms 
    WHERE distribution_order_id = v_order_id 
    AND status NOT IN ('confirmed', 'rejected')
  ) INTO v_all_completed;

  RETURN jsonb_build_object(
    'success', true, 
    'room_id', v_room_id,
    'all_completed', v_all_completed
  );
END;
$$;