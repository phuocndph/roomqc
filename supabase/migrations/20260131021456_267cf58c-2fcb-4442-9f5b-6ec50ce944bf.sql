-- Fix confirm_receive_order to check stock before deducting
CREATE OR REPLACE FUNCTION public.confirm_receive_order(p_order_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_order record;
  v_transaction_code text;
  v_item record;
  v_warehouse_name text;
  v_staff_name text;
  v_insufficient_items jsonb := '[]'::jsonb;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get order info
  SELECT * INTO v_order FROM distribution_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  -- Get default warehouse name for this hotel
  SELECT w.name INTO v_warehouse_name 
  FROM warehouses w 
  WHERE w.hotel_id = v_order.hotel_id AND w.is_default = true
  LIMIT 1;
  
  -- Get staff name
  SELECT full_name INTO v_staff_name FROM users WHERE id = v_actor_id;
  
  -- Fallback if not found
  v_warehouse_name := COALESCE(v_warehouse_name, 'Kho');
  v_staff_name := COALESCE(v_staff_name, 'Nhân viên');
  
  -- Validate actor is assigned to this order
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this order';
  END IF;
  
  -- Validate order status (must be released)
  IF v_order.status != 'released' THEN
    RAISE EXCEPTION 'Order not ready for receiving. Current status: %', v_order.status;
  END IF;
  
  -- PRE-CHECK: Validate sufficient stock for all items BEFORE any deduction
  FOR v_item IN
    SELECT 
      doi.item_id,
      i.name as item_name,
      i.code as item_code,
      i.hotel_id,
      i.tenant_id,
      SUM(doi.quantity) as total_quantity,
      i.quantity_in_stock,
      i.quantity_pending
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    JOIN items i ON i.id = doi.item_id
    WHERE dor.distribution_order_id = p_order_id
    GROUP BY doi.item_id, i.name, i.code, i.hotel_id, i.tenant_id, i.quantity_in_stock, i.quantity_pending
  LOOP
    IF v_item.quantity_in_stock < v_item.total_quantity THEN
      v_insufficient_items := v_insufficient_items || jsonb_build_object(
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'item_code', v_item.item_code,
        'required', v_item.total_quantity,
        'available', v_item.quantity_in_stock,
        'shortage', v_item.total_quantity - v_item.quantity_in_stock
      );
    END IF;
  END LOOP;
  
  -- If any items have insufficient stock, return error with details
  IF jsonb_array_length(v_insufficient_items) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_STOCK',
      'message', 'Không đủ tồn kho cho một số mặt hàng',
      'insufficient_items', v_insufficient_items
    );
  END IF;
  
  -- Generate transaction code
  v_transaction_code := 'TXN-RCV-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  
  -- Deduct inventory: Create transactions for each item and update stock
  FOR v_item IN
    SELECT 
      doi.item_id,
      i.hotel_id,
      i.tenant_id,
      SUM(doi.quantity) as total_quantity,
      i.quantity_in_stock,
      i.quantity_pending
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    JOIN items i ON i.id = doi.item_id
    WHERE dor.distribution_order_id = p_order_id
    GROUP BY doi.item_id, i.hotel_id, i.tenant_id, i.quantity_in_stock, i.quantity_pending
  LOOP
    -- Create inventory transaction: warehouse_release with actual names
    INSERT INTO inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_type,
      transaction_category,
      transaction_code,
      quantity,
      quantity_before,
      quantity_after,
      from_location,
      to_location,
      related_type,
      related_id,
      created_by,
      notes
    ) VALUES (
      v_item.tenant_id,
      v_item.hotel_id,
      v_item.item_id,
      'out',
      'warehouse_release',
      v_transaction_code,
      v_item.total_quantity,
      v_item.quantity_in_stock,
      v_item.quantity_in_stock - v_item.total_quantity,
      v_warehouse_name,
      v_staff_name,
      'distribution_order',
      p_order_id,
      v_actor_id,
      'Nhân viên xác nhận nhận hàng từ kho'
    );
    
    -- Update item quantities: decrease stock, increase pending
    UPDATE items
    SET quantity_in_stock = quantity_in_stock - v_item.total_quantity,
        quantity_pending = COALESCE(quantity_pending, 0) + v_item.total_quantity,
        updated_at = now()
    WHERE id = v_item.item_id;
  END LOOP;
  
  -- Update order status to in_progress
  UPDATE distribution_orders
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      received_at = now(),
      received_by = v_actor_id,
      updated_at = now()
  WHERE id = p_order_id;
  
  -- Update all batches to 'received'
  UPDATE distribution_order_batches
  SET status = 'received',
      received_at = now(),
      received_by = v_actor_id,
      updated_at = now()
  WHERE distribution_order_id = p_order_id 
    AND status IN ('open', 'pending', 'handed_over');
  
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'message', 'Đã xác nhận nhận hàng thành công. Kho đã được trừ.'
  );
END;
$function$;