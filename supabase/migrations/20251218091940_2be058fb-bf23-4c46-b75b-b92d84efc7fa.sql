-- Fix undo_room_delivery_confirmation to delete room_items instead of updating to 0
CREATE OR REPLACE FUNCTION public.undo_room_delivery_confirmation(
  p_distribution_order_room_id uuid,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_room_id UUID;
  v_confirmed_at TIMESTAMPTZ;
  v_item RECORD;
  v_new_qty INTEGER;
BEGIN
  SELECT 
    dor.distribution_order_id,
    dor.room_id,
    dor.confirmed_at
  INTO v_order_id, v_room_id, v_confirmed_at
  FROM distribution_order_rooms dor
  WHERE dor.id = p_distribution_order_room_id
  AND dor.status = 'confirmed';

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found or not confirmed');
  END IF;

  IF v_confirmed_at < now() - interval '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot undo after 24 hours');
  END IF;

  FOR v_item IN 
    SELECT doi.item_id, doi.quantity_confirmed
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
    AND doi.quantity_confirmed > 0
  LOOP
    -- Return quantity from in_use to pending
    UPDATE items SET
      quantity_in_use = GREATEST(0, COALESCE(quantity_in_use, 0) - v_item.quantity_confirmed),
      quantity_pending = COALESCE(quantity_pending, 0) + v_item.quantity_confirmed,
      updated_at = now()
    WHERE id = v_item.item_id;

    -- Calculate new quantity for room_items
    SELECT COALESCE(quantity, 0) - v_item.quantity_confirmed INTO v_new_qty
    FROM room_items 
    WHERE room_id = v_room_id AND item_id = v_item.item_id;

    -- Delete if new quantity <= 0, otherwise update
    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      DELETE FROM room_items
      WHERE room_id = v_room_id AND item_id = v_item.item_id;
    ELSE
      UPDATE room_items SET quantity = v_new_qty
      WHERE room_id = v_room_id AND item_id = v_item.item_id;
    END IF;

    -- Reset distribution item status
    UPDATE distribution_order_items SET
      quantity_confirmed = 0,
      status = 'pending',
      updated_at = now()
    WHERE distribution_order_room_id = p_distribution_order_room_id
    AND item_id = v_item.item_id;
  END LOOP;

  -- Reset room status
  UPDATE distribution_order_rooms SET
    status = 'delivered',
    confirmed_by = NULL,
    confirmed_at = NULL,
    updated_at = now()
  WHERE id = p_distribution_order_room_id;

  -- Update order status
  UPDATE distribution_orders SET
    status = 'in_progress',
    completed_at = NULL,
    rooms_completed = GREATEST(0, COALESCE(rooms_completed, 0) - 1),
    updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Also fix the single-param version
CREATE OR REPLACE FUNCTION public.undo_room_delivery_confirmation(
  p_distribution_order_room_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_room_id UUID;
  v_confirmed_at TIMESTAMPTZ;
  v_item RECORD;
  v_new_qty INTEGER;
BEGIN
  SELECT 
    dor.distribution_order_id,
    dor.room_id,
    dor.confirmed_at
  INTO v_order_id, v_room_id, v_confirmed_at
  FROM distribution_order_rooms dor
  WHERE dor.id = p_distribution_order_room_id
  AND dor.status = 'confirmed';

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found or not confirmed');
  END IF;

  IF v_confirmed_at < now() - interval '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot undo after 24 hours');
  END IF;

  FOR v_item IN 
    SELECT doi.item_id, doi.quantity_confirmed
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
    AND doi.quantity_confirmed > 0
  LOOP
    UPDATE items SET
      quantity_in_use = GREATEST(0, COALESCE(quantity_in_use, 0) - v_item.quantity_confirmed),
      quantity_pending = COALESCE(quantity_pending, 0) + v_item.quantity_confirmed,
      updated_at = now()
    WHERE id = v_item.item_id;

    SELECT COALESCE(quantity, 0) - v_item.quantity_confirmed INTO v_new_qty
    FROM room_items 
    WHERE room_id = v_room_id AND item_id = v_item.item_id;

    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      DELETE FROM room_items
      WHERE room_id = v_room_id AND item_id = v_item.item_id;
    ELSE
      UPDATE room_items SET quantity = v_new_qty
      WHERE room_id = v_room_id AND item_id = v_item.item_id;
    END IF;

    UPDATE distribution_order_items SET
      quantity_confirmed = 0,
      status = 'pending',
      updated_at = now()
    WHERE distribution_order_room_id = p_distribution_order_room_id
    AND item_id = v_item.item_id;
  END LOOP;

  UPDATE distribution_order_rooms SET
    status = 'delivered',
    confirmed_by = NULL,
    confirmed_at = NULL,
    updated_at = now()
  WHERE id = p_distribution_order_room_id;

  UPDATE distribution_orders SET
    status = 'in_progress',
    completed_at = NULL,
    rooms_completed = GREATEST(0, COALESCE(rooms_completed, 0) - 1),
    updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;