-- =============================================
-- Phase 2: Update RPCs to save full location text
-- =============================================

-- 1. Update create_warehouse_transfer to save warehouse names
CREATE OR REPLACE FUNCTION public.create_warehouse_transfer(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_from_warehouse_id UUID,
  p_to_warehouse_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_item_notes TEXT;
  v_from_quantity INTEGER;
  v_to_quantity INTEGER;
  v_transaction_code TEXT;
  v_item_record RECORD;
  v_from_warehouse_name TEXT;
  v_to_warehouse_name TEXT;
BEGIN
  -- Get warehouse names for location text
  SELECT name INTO v_from_warehouse_name FROM public.warehouses WHERE id = p_from_warehouse_id;
  SELECT name INTO v_to_warehouse_name FROM public.warehouses WHERE id = p_to_warehouse_id;

  -- Validate warehouses exist and belong to same hotel
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = p_from_warehouse_id AND hotel_id = p_hotel_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Source warehouse not found or inactive';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = p_to_warehouse_id AND hotel_id = p_hotel_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Destination warehouse not found or inactive';
  END IF;
  
  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Cannot transfer to same warehouse';
  END IF;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_item_notes := v_item->>'notes';
    
    -- Get item info
    SELECT * INTO v_item_record FROM public.items WHERE id = v_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % not found', v_item_id;
    END IF;
    
    -- Check source warehouse has enough stock
    SELECT quantity INTO v_from_quantity
    FROM public.warehouse_stock
    WHERE warehouse_id = p_from_warehouse_id AND item_id = v_item_id;
    
    IF v_from_quantity IS NULL OR v_from_quantity < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in source warehouse for item %', v_item_record.name;
    END IF;
    
    -- Generate transaction code
    v_transaction_code := 'TRF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                          SUBSTRING(gen_random_uuid()::TEXT, 1, 6);
    
    -- Create transaction record with location text
    INSERT INTO public.inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_type,
      transaction_category,
      transaction_code,
      quantity,
      quantity_before,
      quantity_after,
      unit_price,
      total_value,
      from_warehouse_id,
      to_warehouse_id,
      from_location,
      to_location,
      notes,
      created_by,
      transaction_date
    ) VALUES (
      p_tenant_id,
      p_hotel_id,
      v_item_id,
      'transfer',
      'internal_transfer',
      v_transaction_code,
      v_quantity,
      v_from_quantity,
      v_from_quantity - v_quantity,
      v_unit_price,
      v_unit_price * v_quantity,
      p_from_warehouse_id,
      p_to_warehouse_id,
      v_from_warehouse_name,
      v_to_warehouse_name,
      COALESCE(v_item_notes, p_notes),
      p_created_by,
      NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    -- Update source warehouse stock
    UPDATE public.warehouse_stock
    SET quantity = quantity - v_quantity,
        last_transaction_id = v_transaction_id,
        last_updated = NOW()
    WHERE warehouse_id = p_from_warehouse_id AND item_id = v_item_id;
    
    -- Update or create destination warehouse stock
    INSERT INTO public.warehouse_stock (
      warehouse_id,
      item_id,
      tenant_id,
      quantity,
      last_transaction_id,
      last_updated
    ) VALUES (
      p_to_warehouse_id,
      v_item_id,
      p_tenant_id,
      v_quantity,
      v_transaction_id,
      NOW()
    )
    ON CONFLICT (warehouse_id, item_id) DO UPDATE
    SET quantity = warehouse_stock.quantity + v_quantity,
        last_transaction_id = v_transaction_id,
        last_updated = NOW();
  END LOOP;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Update confirm_receive_order to save warehouse name and staff name
CREATE OR REPLACE FUNCTION confirm_receive_order(
  p_order_id uuid,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order record;
  v_transaction_code text;
  v_item record;
  v_warehouse_name text;
  v_staff_name text;
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
$$;


-- 3. Update return_to_stock_for_stop to save room and warehouse location
CREATE OR REPLACE FUNCTION return_to_stock_for_stop(
  p_room_order_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_room_order record;
  v_order record;
  v_transaction_code text;
  v_warehouse_name text;
  v_room_location text;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get room order info
  SELECT dor.*, r.room_number
  INTO v_room_order
  FROM distribution_order_rooms dor
  JOIN rooms r ON r.id = dor.room_id
  WHERE dor.id = p_room_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room order not found' USING ERRCODE = 'P0002';
  END IF;
  
  -- Get order info
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = v_room_order.distribution_order_id;
  
  -- Get default warehouse name
  SELECT w.name INTO v_warehouse_name 
  FROM warehouses w 
  WHERE w.hotel_id = v_order.hotel_id AND w.is_default = true
  LIMIT 1;
  
  -- Set location text
  v_warehouse_name := COALESCE(v_warehouse_name, 'Kho');
  v_room_location := 'Phòng ' || v_room_order.room_number;
  
  -- Validate actor is assigned
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this route' USING ERRCODE = '42501';
  END IF;
  
  -- Validate stop status must be cannot_access
  IF v_room_order.stop_status != 'cannot_access' THEN
    RAISE EXCEPTION 'Can only return to stock for cannot_access stops (current: %)', v_room_order.stop_status USING ERRCODE = '23505';
  END IF;
  
  -- Check if already returned
  IF v_room_order.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Items already returned to stock' USING ERRCODE = '23505';
  END IF;
  
  -- Generate transaction code
  v_transaction_code := 'TXN-RT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || LEFT(p_room_order_id::text, 8);
  
  -- Create inventory transactions with proper location text
  INSERT INTO inventory_transactions (
    tenant_id, hotel_id, item_id, quantity, quantity_before, quantity_after,
    transaction_type, transaction_category, transaction_code,
    from_location, to_location,
    related_type, related_id, created_by, notes
  )
  SELECT 
    v_order.tenant_id,
    v_order.hotel_id,
    doi.item_id,
    doi.quantity,
    i.quantity_pending,
    i.quantity_pending - doi.quantity,
    'in',
    'return_to_stock',
    v_transaction_code,
    v_room_location,
    v_warehouse_name,
    'distribution_room',
    p_room_order_id,
    v_actor_id,
    'Trả hàng về kho từ ' || v_room_location || ' (không vào được phòng)'
  FROM distribution_order_items doi
  JOIN items i ON i.id = doi.item_id
  WHERE doi.distribution_order_room_id = p_room_order_id;
  
  -- Update item quantities: decrease pending, increase in_stock
  UPDATE items i
  SET quantity_pending = COALESCE(quantity_pending, 0) - room_qty.total_qty,
      quantity_in_stock = COALESCE(quantity_in_stock, 0) + room_qty.total_qty,
      updated_at = now()
  FROM (
    SELECT doi.item_id, SUM(doi.quantity) as total_qty
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_room_order_id
    GROUP BY doi.item_id
  ) room_qty
  WHERE i.id = room_qty.item_id;
  
  -- Update room order
  UPDATE distribution_order_rooms
  SET returned_at = now(),
      updated_at = now()
  WHERE id = p_room_order_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'room_number', v_room_order.room_number,
    'message', 'Đã trả hàng về kho thành công'
  );
END;
$$;