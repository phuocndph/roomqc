-- Drop old function first
DROP FUNCTION IF EXISTS public.complete_room_delivery(uuid, uuid, jsonb);

-- Recreate with new signature
CREATE OR REPLACE FUNCTION public.complete_room_delivery(
  p_distribution_order_room_id UUID,
  p_confirmed_by UUID,
  p_item_confirmations JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_room_id UUID;
  v_item RECORD;
  v_all_processed BOOLEAN;
  v_completed_count INTEGER;
  v_total_rooms INTEGER;
  v_confirmation JSONB;
  v_confirmed_qty INTEGER;
  v_has_partial BOOLEAN := false;
BEGIN
  SELECT distribution_order_id, room_id INTO v_order_id, v_room_id
  FROM distribution_order_rooms
  WHERE id = p_distribution_order_room_id;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM distribution_order_rooms
    WHERE id = p_distribution_order_room_id
    AND status IN ('pending', 'delivered')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room already processed');
  END IF;

  FOR v_item IN 
    SELECT doi.id, doi.item_id, doi.quantity, i.name as item_name
    FROM distribution_order_items doi
    JOIN items i ON i.id = doi.item_id
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
  LOOP
    v_confirmed_qty := v_item.quantity;
    IF p_item_confirmations IS NOT NULL THEN
      v_confirmation := p_item_confirmations->v_item.item_id::TEXT;
      IF v_confirmation IS NOT NULL THEN
        v_confirmed_qty := LEAST((v_confirmation->>'quantity_confirmed')::INTEGER, v_item.quantity);
      END IF;
    END IF;

    IF v_confirmed_qty < v_item.quantity THEN
      v_has_partial := true;
    END IF;

    UPDATE items SET
      quantity_pending = GREATEST(0, COALESCE(quantity_pending, 0) - v_item.quantity),
      quantity_in_use = COALESCE(quantity_in_use, 0) + v_confirmed_qty,
      quantity_in_stock = quantity_in_stock + (v_item.quantity - v_confirmed_qty),
      updated_at = now()
    WHERE id = v_item.item_id;

    UPDATE distribution_order_items SET
      quantity_confirmed = v_confirmed_qty,
      status = CASE 
        WHEN v_confirmed_qty = 0 THEN 'rejected'
        WHEN v_confirmed_qty < v_item.quantity THEN 'partial'
        ELSE 'confirmed'
      END,
      updated_at = now()
    WHERE id = v_item.id;

    IF v_confirmed_qty > 0 THEN
      INSERT INTO room_items (room_id, item_id, quantity, condition, updated_at)
      VALUES (v_room_id, v_item.item_id, v_confirmed_qty, 'good', now())
      ON CONFLICT (room_id, item_id) DO UPDATE SET
        quantity = room_items.quantity + EXCLUDED.quantity,
        updated_at = now();
    END IF;
  END LOOP;

  UPDATE distribution_order_rooms SET
    status = 'confirmed',
    confirmed_by = p_confirmed_by,
    confirmed_at = now(),
    delivered_at = COALESCE(delivered_at, now()),
    updated_at = now()
  WHERE id = p_distribution_order_room_id;

  SELECT 
    COUNT(*) FILTER (WHERE status IN ('confirmed', 'rejected')),
    COUNT(*)
  INTO v_completed_count, v_total_rooms
  FROM distribution_order_rooms
  WHERE distribution_order_id = v_order_id;

  UPDATE distribution_orders SET
    rooms_completed = v_completed_count,
    status = CASE WHEN v_completed_count = v_total_rooms THEN 'completed' ELSE 'in_progress' END,
    started_at = COALESCE(started_at, now()),
    completed_at = CASE WHEN v_completed_count = v_total_rooms THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'has_partial', v_has_partial,
    'order_completed', v_completed_count = v_total_rooms
  );
END;
$$;

-- Add rooms_completed column if not exists
ALTER TABLE distribution_orders ADD COLUMN IF NOT EXISTS rooms_completed INTEGER DEFAULT 0;

-- PHASE 6: Undo room delivery confirmation
CREATE OR REPLACE FUNCTION public.undo_room_delivery_confirmation(
  p_distribution_order_room_id UUID,
  p_performed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_room_id UUID;
  v_confirmed_at TIMESTAMPTZ;
  v_item RECORD;
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

    UPDATE room_items SET
      quantity = GREATEST(0, quantity - v_item.quantity_confirmed),
      updated_at = now()
    WHERE room_id = v_room_id AND item_id = v_item.item_id;

    DELETE FROM room_items
    WHERE room_id = v_room_id AND item_id = v_item.item_id AND quantity <= 0;

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