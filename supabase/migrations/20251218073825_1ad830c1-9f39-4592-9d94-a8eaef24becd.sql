-- Create reject_room_delivery function
CREATE OR REPLACE FUNCTION reject_room_delivery(
  p_distribution_order_room_id UUID,
  p_rejected_by UUID,
  p_rejection_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_item RECORD;
  v_completed_count INTEGER;
  v_total_rooms INTEGER;
BEGIN
  SELECT distribution_order_id INTO v_order_id
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
    SELECT doi.item_id, doi.quantity
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
  LOOP
    UPDATE items SET
      quantity_pending = GREATEST(0, COALESCE(quantity_pending, 0) - v_item.quantity),
      quantity_in_stock = quantity_in_stock + v_item.quantity,
      updated_at = now()
    WHERE id = v_item.item_id;

    UPDATE distribution_order_items SET
      status = 'rejected',
      quantity_confirmed = 0,
      updated_at = now()
    WHERE distribution_order_room_id = p_distribution_order_room_id
    AND item_id = v_item.item_id;
  END LOOP;

  UPDATE distribution_order_rooms SET
    status = 'rejected',
    confirmed_by = p_rejected_by,
    confirmed_at = now(),
    rejection_reason = p_rejection_reason,
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
    'order_completed', v_completed_count = v_total_rooms
  );
END;
$$;

-- Create get_room_distribution_history function
CREATE OR REPLACE FUNCTION get_room_distribution_history(p_room_id UUID)
RETURNS TABLE (
  order_id UUID,
  order_code TEXT,
  order_status TEXT,
  room_status TEXT,
  total_items INTEGER,
  total_quantity INTEGER,
  delivered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by_name TEXT,
  assigned_to_name TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ,
  items JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dord.id as order_id,
    dord.order_code,
    dord.status as order_status,
    dor.status as room_status,
    (SELECT COUNT(*)::INTEGER FROM distribution_order_items doi WHERE doi.distribution_order_room_id = dor.id) as total_items,
    (SELECT COALESCE(SUM(doi.quantity), 0)::INTEGER FROM distribution_order_items doi WHERE doi.distribution_order_room_id = dor.id) as total_quantity,
    dor.delivered_at,
    dor.confirmed_at,
    u_confirmed.full_name as confirmed_by_name,
    u_assigned.full_name as assigned_to_name,
    dor.rejection_reason,
    dord.created_at,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'item_id', doi.item_id,
        'item_name', i.name,
        'item_code', i.code,
        'quantity', doi.quantity,
        'quantity_confirmed', doi.quantity_confirmed,
        'status', doi.status
      ))
      FROM distribution_order_items doi
      JOIN items i ON i.id = doi.item_id
      WHERE doi.distribution_order_room_id = dor.id
    ) as items
  FROM distribution_order_rooms dor
  JOIN distribution_orders dord ON dord.id = dor.distribution_order_id
  LEFT JOIN users u_confirmed ON u_confirmed.id = dor.confirmed_by
  LEFT JOIN users u_assigned ON u_assigned.id = dord.assigned_to
  WHERE dor.room_id = p_room_id
  ORDER BY dord.created_at DESC;
END;
$$;