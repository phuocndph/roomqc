-- Add quantity_actual column to distribution_order_items
ALTER TABLE distribution_order_items
ADD COLUMN IF NOT EXISTS quantity_actual integer DEFAULT NULL;

COMMENT ON COLUMN distribution_order_items.quantity_actual IS 
'Số lượng giao thực tế (có thể khác quantity khi thiếu hàng). NULL = giao đủ';

-- Update confirm_receive_order RPC to support adjustments
CREATE OR REPLACE FUNCTION confirm_receive_order(
  p_order_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_adjustments jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_actor uuid;
  v_tenant_id uuid;
  v_item RECORD;
  v_required integer;
  v_available integer;
  v_actual integer;
  v_insufficient_items jsonb := '[]'::jsonb;
  v_adjustment RECORD;
  v_adjustment_map jsonb := '{}'::jsonb;
BEGIN
  -- Get actor
  v_actor := COALESCE(p_actor_id, auth.uid());
  
  -- Get order details
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  
  -- Verify status is released
  IF v_order.status != 'released' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Order must be in released status');
  END IF;
  
  v_tenant_id := v_order.tenant_id;
  
  -- Build adjustment map if provided
  IF p_adjustments IS NOT NULL THEN
    FOR v_adjustment IN SELECT * FROM jsonb_to_recordset(p_adjustments) AS x(item_id uuid, quantity_actual integer)
    LOOP
      v_adjustment_map := v_adjustment_map || jsonb_build_object(v_adjustment.item_id::text, v_adjustment.quantity_actual);
    END LOOP;
  END IF;
  
  -- Check stock for each item
  FOR v_item IN
    SELECT 
      doi.id as item_line_id,
      doi.item_id,
      i.name as item_name,
      i.code as item_code,
      SUM(doi.quantity) as total_required,
      i.quantity_in_stock as available
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    JOIN items i ON i.id = doi.item_id
    WHERE dor.distribution_order_id = p_order_id
    GROUP BY doi.item_id, i.name, i.code, i.quantity_in_stock, doi.id
  LOOP
    v_required := v_item.total_required;
    v_available := COALESCE(v_item.available, 0);
    
    -- Check if there's an adjustment for this item
    IF v_adjustment_map ? v_item.item_id::text THEN
      v_actual := (v_adjustment_map ->> v_item.item_id::text)::integer;
      
      -- Validate adjustment doesn't exceed available stock
      IF v_actual > v_available THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', 'ADJUSTMENT_EXCEEDS_STOCK',
          'message', format('Điều chỉnh %s vượt quá tồn kho (%s > %s)', v_item.item_name, v_actual, v_available)
        );
      END IF;
      
      -- Update quantity_actual
      UPDATE distribution_order_items
      SET quantity_actual = v_actual
      WHERE id = v_item.item_line_id;
      
    ELSE
      -- No adjustment - check if stock is sufficient
      IF v_available < v_required THEN
        v_insufficient_items := v_insufficient_items || jsonb_build_array(jsonb_build_object(
          'item_id', v_item.item_id,
          'item_name', v_item.item_name,
          'item_code', v_item.item_code,
          'required', v_required,
          'available', v_available,
          'shortage', v_required - v_available
        ));
      END IF;
      v_actual := v_required;
    END IF;
  END LOOP;
  
  -- If no adjustments provided and there are insufficient items, return error
  IF p_adjustments IS NULL AND jsonb_array_length(v_insufficient_items) > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'INSUFFICIENT_STOCK',
      'insufficient_items', v_insufficient_items
    );
  END IF;
  
  -- Deduct inventory based on quantity_actual or quantity
  FOR v_item IN
    SELECT 
      doi.item_id,
      COALESCE(doi.quantity_actual, doi.quantity) as deduct_qty
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    WHERE dor.distribution_order_id = p_order_id
  LOOP
    UPDATE items
    SET 
      quantity_in_stock = quantity_in_stock - v_item.deduct_qty,
      quantity_total = quantity_total - v_item.deduct_qty
    WHERE id = v_item.item_id;
  END LOOP;
  
  -- Update order status to in_progress
  UPDATE distribution_orders
  SET 
    status = 'in_progress',
    received_at = now(),
    received_by = v_actor,
    started_at = now(),
    updated_at = now()
  WHERE id = p_order_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;