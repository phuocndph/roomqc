CREATE OR REPLACE FUNCTION public.confirm_delivery_from_room_check(p_room_order_id uuid, p_confirmed_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_id uuid;
  v_booking_id uuid;
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_items_updated int := 0;
  v_item record;
  v_all_confirmed boolean;
BEGIN
  SELECT dor.room_id, dor.booking_id, r.tenant_id, r.hotel_id
  INTO v_room_id, v_booking_id, v_tenant_id, v_hotel_id
  FROM distribution_order_rooms dor
  JOIN rooms r ON r.id = dor.room_id
  WHERE dor.id = p_room_order_id;

  IF v_room_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room order not found');
  END IF;

  FOR v_item IN
    SELECT doi.id, doi.item_id, doi.quantity
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_room_order_id
      AND doi.status != 'confirmed'
  LOOP
    UPDATE distribution_order_items
    SET status = 'confirmed',
        quantity_confirmed = quantity,
        updated_at = now()
    WHERE id = v_item.id;

    INSERT INTO room_items (room_id, item_id, quantity)
    VALUES (v_room_id, v_item.item_id, v_item.quantity)
    ON CONFLICT (room_id, item_id)
    DO UPDATE SET
      quantity = room_items.quantity + EXCLUDED.quantity;

    IF v_booking_id IS NOT NULL THEN
      UPDATE booking_consumables
      SET supplemented_quantity = supplemented_quantity + v_item.quantity,
          updated_at = now()
      WHERE booking_id = v_booking_id
        AND item_id = v_item.item_id;
    END IF;

    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, item_id, quantity,
      quantity_before, quantity_after,
      transaction_type, transaction_category, transaction_code,
      related_type, related_id, created_by
    )
    SELECT
      v_tenant_id, v_hotel_id, v_item.item_id, v_item.quantity,
      COALESCE(i.quantity_in_use, 0),
      COALESCE(i.quantity_in_use, 0) + v_item.quantity,
      'in', 'other_in', 'RCV-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
      'distribution_order_room', p_room_order_id, p_confirmed_by
    FROM items i WHERE i.id = v_item.item_id;

    UPDATE items
    SET quantity_in_use = COALESCE(quantity_in_use, 0) + v_item.quantity,
        quantity_pending = GREATEST(0, COALESCE(quantity_pending, 0) - v_item.quantity),
        updated_at = now()
    WHERE id = v_item.item_id;

    v_items_updated := v_items_updated + 1;
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1 FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_room_order_id
      AND doi.status != 'confirmed'
  ) INTO v_all_confirmed;

  IF v_all_confirmed THEN
    UPDATE distribution_order_rooms
    SET status = 'completed',
        delivered_at = COALESCE(delivered_at, now()),
        delivered_by = COALESCE(delivered_by, p_confirmed_by),
        updated_at = now()
    WHERE id = p_room_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'items_updated', v_items_updated,
    'all_confirmed', v_all_confirmed
  );
END;
$function$;