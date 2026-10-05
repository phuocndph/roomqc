-- Add unique constraint on (room_id, item_id) for room_items table
-- This is required for ON CONFLICT to work in complete_room_delivery function
ALTER TABLE room_items ADD CONSTRAINT room_items_room_item_unique UNIQUE (room_id, item_id);

-- Fix complete_room_delivery function to return all_completed
CREATE OR REPLACE FUNCTION complete_room_delivery(
  p_distribution_order_room_id UUID,
  p_confirmed_by UUID,
  p_item_confirmations JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_room_id UUID;
  v_item RECORD;
  v_confirmed_qty INTEGER;
  v_ordered_qty INTEGER;
  v_missing_qty INTEGER;
  v_all_completed BOOLEAN;
BEGIN
  -- Get order and room info
  SELECT distribution_order_id, room_id INTO v_order_id, v_room_id
  FROM distribution_order_rooms
  WHERE id = p_distribution_order_room_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Distribution order room not found';
  END IF;

  -- Process each item
  FOR v_item IN 
    SELECT doi.id, doi.item_id, doi.quantity
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
  LOOP
    -- Get confirmed quantity from input or default to ordered quantity
    v_ordered_qty := v_item.quantity;
    v_confirmed_qty := COALESCE(
      (p_item_confirmations->>v_item.item_id::TEXT)::INTEGER,
      v_ordered_qty
    );
    
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

    -- Update item quantities
    -- Move confirmed quantity from pending to in_use
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

-- Fix RLS policy for in_app_notifications to allow users to create notifications for others
DROP POLICY IF EXISTS "Users can insert notifications" ON in_app_notifications;
CREATE POLICY "Users can insert notifications" 
ON in_app_notifications 
FOR INSERT 
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);