
-- Function: Quản lý kho xác nhận đã xuất hàng
CREATE OR REPLACE FUNCTION public.confirm_warehouse_delivery(
  p_room_order_id UUID,
  p_delivered_by UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_room_status TEXT;
  v_order_status TEXT;
  v_total_rooms INTEGER;
BEGIN
  -- Get current room order info
  SELECT dor.distribution_order_id, dor.status, dist_ord.status, dist_ord.total_rooms
  INTO v_order_id, v_room_status, v_order_status, v_total_rooms
  FROM distribution_order_rooms dor
  JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
  WHERE dor.id = p_room_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room order not found';
  END IF;

  -- Only allow from pending status
  IF v_room_status != 'pending' THEN
    RAISE EXCEPTION 'Phòng này đã được xuất kho hoặc đã xử lý';
  END IF;

  -- Update room status to delivered
  UPDATE distribution_order_rooms SET
    status = 'delivered',
    delivered_at = now(),
    delivered_by = p_delivered_by,
    updated_at = now()
  WHERE id = p_room_order_id;

  -- Update order status to in_progress if first delivery
  IF v_order_status = 'pending' THEN
    UPDATE distribution_orders SET
      status = 'in_progress',
      started_at = now(),
      updated_at = now()
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'new_status', 'delivered'
  );
END;
$function$;

-- Update get_distribution_order_detail to include delivered_by info
CREATE OR REPLACE FUNCTION public.get_distribution_order_detail(p_order_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', dist_ord.id,
    'order_code', dist_ord.order_code,
    'status', dist_ord.status,
    'total_rooms', dist_ord.total_rooms,
    'total_items', dist_ord.total_items,
    'assigned_to', dist_ord.assigned_to,
    'assigned_to_name', assigned_user.full_name,
    'created_by', dist_ord.created_by,
    'created_by_name', creator.full_name,
    'notes', dist_ord.notes,
    'started_at', dist_ord.started_at,
    'completed_at', dist_ord.completed_at,
    'created_at', dist_ord.created_at,
    'rooms', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', dor.id,
          'room_id', dor.room_id,
          'room_number', r.room_number,
          'floor', r.floor,
          'status', dor.status,
          'delivered_at', dor.delivered_at,
          'delivered_by', dor.delivered_by,
          'delivered_by_name', delivered_user.full_name,
          'confirmed_at', dor.confirmed_at,
          'confirmed_by_name', confirmed_user.full_name,
          'rejection_reason', dor.rejection_reason,
          'items', (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', doi.id,
                'item_id', doi.item_id,
                'item_name', i.name,
                'item_code', i.code,
                'quantity', doi.quantity,
                'quantity_confirmed', COALESCE(doi.quantity_confirmed, 0),
                'status', doi.status
              ) ORDER BY i.name
            ), '[]'::jsonb)
            FROM distribution_order_items doi
            JOIN items i ON i.id = doi.item_id
            WHERE doi.distribution_order_room_id = dor.id
          )
        ) ORDER BY r.floor, r.room_number
      ), '[]'::jsonb)
      FROM distribution_order_rooms dor
      JOIN rooms r ON r.id = dor.room_id
      LEFT JOIN users delivered_user ON delivered_user.id = dor.delivered_by
      LEFT JOIN users confirmed_user ON confirmed_user.id = dor.confirmed_by
      WHERE dor.distribution_order_id = dist_ord.id
    )
  )
  INTO v_result
  FROM distribution_orders dist_ord
  LEFT JOIN users assigned_user ON assigned_user.id = dist_ord.assigned_to
  LEFT JOIN users creator ON creator.id = dist_ord.created_by
  WHERE dist_ord.id = p_order_id;

  RETURN v_result;
END;
$function$;
