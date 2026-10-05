-- Cancel distribution order function
CREATE OR REPLACE FUNCTION public.cancel_distribution_order(
  p_order_id UUID,
  p_cancelled_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_room RECORD;
  v_item RECORD;
BEGIN
  -- Get order
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Distribution order not found';
  END IF;
  
  IF v_order.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot cancel order with status %', v_order.status;
  END IF;
  
  -- Return quantity_pending back to quantity_in_stock for items in pending/delivered rooms
  FOR v_room IN 
    SELECT dor.id FROM distribution_order_rooms dor 
    WHERE dor.distribution_order_id = p_order_id 
    AND dor.status IN ('pending', 'delivered')
  LOOP
    FOR v_item IN 
      SELECT doi.item_id, doi.quantity 
      FROM distribution_order_items doi 
      WHERE doi.distribution_order_room_id = v_room.id
    LOOP
      UPDATE items 
      SET 
        quantity_in_stock = quantity_in_stock + v_item.quantity,
        quantity_pending = quantity_pending - v_item.quantity,
        updated_at = NOW()
      WHERE id = v_item.item_id;
    END LOOP;
    
    -- Update room status to rejected
    UPDATE distribution_order_rooms 
    SET status = 'rejected', updated_at = NOW()
    WHERE id = v_room.id;
  END LOOP;
  
  -- Update order status
  UPDATE distribution_orders 
  SET 
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_order_id;
  
  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;