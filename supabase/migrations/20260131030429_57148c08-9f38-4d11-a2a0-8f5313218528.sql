-- Fix update_distribution_order RPC to use quantity_pending instead of only modifying quantity_in_stock
-- This maintains the items_quantities_valid constraint

CREATE OR REPLACE FUNCTION public.update_distribution_order(
  p_order_id UUID,
  p_assigned_to UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_rooms JSONB DEFAULT NULL -- [{room_id, items: [{item_id, quantity}]}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_old_assigned_to UUID;
  v_room JSONB;
  v_item JSONB;
  v_room_id UUID;
  v_room_order_id UUID;
  v_item_id UUID;
  v_quantity INT;
  v_old_quantity INT;
  v_item_record RECORD;
  v_existing_room_ids UUID[];
  v_new_room_ids UUID[];
  v_total_items INT := 0;
  v_total_rooms INT := 0;
BEGIN
  -- Get the order
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Distribution order not found';
  END IF;
  
  -- Only allow updates when pending
  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Can only edit orders in pending status';
  END IF;
  
  v_old_assigned_to := v_order.assigned_to;
  
  -- Update basic fields
  UPDATE distribution_orders
  SET 
    assigned_to = COALESCE(NULLIF(p_assigned_to::text, '')::UUID, assigned_to),
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_order_id;
  
  -- If rooms data provided, update rooms and items
  IF p_rooms IS NOT NULL AND jsonb_array_length(p_rooms) > 0 THEN
    -- Get existing room order IDs
    SELECT ARRAY_AGG(room_id) INTO v_existing_room_ids
    FROM distribution_order_rooms
    WHERE distribution_order_id = p_order_id;
    
    -- Extract new room IDs
    SELECT ARRAY_AGG((r->>'room_id')::UUID) INTO v_new_room_ids
    FROM jsonb_array_elements(p_rooms) r;
    
    -- Process each room in the new list
    FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
    LOOP
      v_room_id := (v_room->>'room_id')::UUID;
      
      -- Check if room order exists
      SELECT id INTO v_room_order_id
      FROM distribution_order_rooms
      WHERE distribution_order_id = p_order_id AND room_id = v_room_id;
      
      IF NOT FOUND THEN
        -- Create new room order
        INSERT INTO distribution_order_rooms (
          distribution_order_id,
          room_id,
          status
        ) VALUES (
          p_order_id,
          v_room_id,
          'pending'
        )
        RETURNING id INTO v_room_order_id;
      END IF;
      
      -- Get existing items for this room
      -- Delete items not in new list and restore stock (from pending back to stock)
      FOR v_item_record IN
        SELECT doi.id, doi.item_id, doi.quantity, i.quantity_in_stock, i.quantity_pending
        FROM distribution_order_items doi
        JOIN items i ON i.id = doi.item_id
        WHERE doi.distribution_order_room_id = v_room_order_id
      LOOP
        -- Check if item is in new list
        IF NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_room->'items') item
          WHERE (item->>'item_id')::UUID = v_item_record.item_id
        ) THEN
          -- Item removed from order: move from pending back to stock (keeps total unchanged)
          UPDATE items
          SET 
            quantity_in_stock = quantity_in_stock + v_item_record.quantity,
            quantity_pending = GREATEST(0, COALESCE(quantity_pending, 0) - v_item_record.quantity)
          WHERE id = v_item_record.item_id;
          
          DELETE FROM distribution_order_items WHERE id = v_item_record.id;
        END IF;
      END LOOP;
      
      -- Process each item in the room
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'items')
      LOOP
        v_item_id := (v_item->>'item_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        
        -- Get item info
        SELECT * INTO v_item_record FROM items WHERE id = v_item_id;
        
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Item % not found', v_item_id;
        END IF;
        
        -- Check if item exists in this room order
        SELECT quantity INTO v_old_quantity
        FROM distribution_order_items
        WHERE distribution_order_room_id = v_room_order_id AND item_id = v_item_id;
        
        IF FOUND THEN
          -- Update existing item
          IF v_quantity != v_old_quantity THEN
            -- Adjust: move between stock and pending (keeps total unchanged)
            -- If quantity increased: move more from stock to pending
            -- If quantity decreased: move from pending back to stock
            UPDATE items
            SET 
              quantity_in_stock = quantity_in_stock + v_old_quantity - v_quantity,
              quantity_pending = COALESCE(quantity_pending, 0) - v_old_quantity + v_quantity
            WHERE id = v_item_id;
            
            UPDATE distribution_order_items
            SET quantity = v_quantity, updated_at = NOW()
            WHERE distribution_order_room_id = v_room_order_id AND item_id = v_item_id;
          END IF;
        ELSE
          -- Check stock
          IF v_item_record.quantity_in_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for item %: available %, requested %', 
              v_item_record.name, v_item_record.quantity_in_stock, v_quantity;
          END IF;
          
          -- Create new item: move from stock to pending (keeps total unchanged)
          INSERT INTO distribution_order_items (
            distribution_order_room_id,
            item_id,
            quantity,
            status
          ) VALUES (
            v_room_order_id,
            v_item_id,
            v_quantity,
            'pending'
          );
          
          UPDATE items
          SET 
            quantity_in_stock = quantity_in_stock - v_quantity,
            quantity_pending = COALESCE(quantity_pending, 0) + v_quantity
          WHERE id = v_item_id;
        END IF;
        
        v_total_items := v_total_items + v_quantity;
      END LOOP;
      
      v_total_rooms := v_total_rooms + 1;
    END LOOP;
    
    -- Delete rooms not in new list (and restore stock from pending)
    FOR v_room_order_id IN
      SELECT dor.id FROM distribution_order_rooms dor
      WHERE dor.distribution_order_id = p_order_id
        AND dor.room_id != ALL(v_new_room_ids)
    LOOP
      -- Restore stock for all items in this room (from pending back to stock)
      UPDATE items i
      SET 
        quantity_in_stock = i.quantity_in_stock + doi.quantity,
        quantity_pending = GREATEST(0, COALESCE(i.quantity_pending, 0) - doi.quantity)
      FROM distribution_order_items doi
      WHERE doi.distribution_order_room_id = v_room_order_id
        AND i.id = doi.item_id;
      
      -- Delete items
      DELETE FROM distribution_order_items WHERE distribution_order_room_id = v_room_order_id;
      
      -- Delete room order
      DELETE FROM distribution_order_rooms WHERE id = v_room_order_id;
    END LOOP;
    
    -- Update totals
    UPDATE distribution_orders
    SET 
      total_rooms = v_total_rooms,
      total_items = v_total_items
    WHERE id = p_order_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_assigned_to', v_old_assigned_to
  );
END;
$$;