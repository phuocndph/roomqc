-- =============================================
-- PHASE 3: RPC Functions for Route/Batch/Stop State Machine
-- =============================================

-- 3.1 handover_batch: Storekeeper marks batch as handed over
CREATE OR REPLACE FUNCTION handover_batch(
  p_batch_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_batch record;
  v_order record;
  v_items record;
  v_transaction_code text;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get batch info
  SELECT dob.*, dist_ord.hotel_id, dist_ord.tenant_id, dist_ord.assigned_to, dist_ord.status as order_status
  INTO v_batch
  FROM distribution_order_batches dob
  JOIN distribution_orders dist_ord ON dist_ord.id = dob.distribution_order_id
  WHERE dob.id = p_batch_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found' USING ERRCODE = 'P0002';
  END IF;
  
  -- Validate state: must be 'open'
  IF v_batch.status != 'open' THEN
    RAISE EXCEPTION 'Batch already handed over (status: %)', v_batch.status USING ERRCODE = '23505';
  END IF;
  
  -- Update batch status
  UPDATE distribution_order_batches
  SET status = 'handed_over',
      handed_over_at = now(),
      handed_over_by = v_actor_id,
      updated_at = now()
  WHERE id = p_batch_id;
  
  -- Update order status to 'released' if first batch handed over
  UPDATE distribution_orders
  SET status = 'released',
      released_at = COALESCE(released_at, now()),
      released_by = COALESCE(released_by, v_actor_id),
      updated_at = now()
  WHERE id = v_batch.distribution_order_id
    AND status = 'pending';
  
  -- Generate transaction code
  v_transaction_code := 'TXN-HO-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || LEFT(p_batch_id::text, 8);
  
  -- Create inventory transactions: Warehouse -> In-hand (per item in batch)
  INSERT INTO inventory_transactions (
    tenant_id, hotel_id, item_id, quantity, quantity_before, quantity_after,
    transaction_type, transaction_category, transaction_code,
    related_type, related_id, created_by, notes
  )
  SELECT 
    v_batch.tenant_id,
    v_batch.hotel_id,
    doi.item_id,
    doi.quantity,
    i.quantity_in_stock,
    i.quantity_in_stock - doi.quantity,
    'out',
    'warehouse_release',
    v_transaction_code,
    'distribution_batch',
    p_batch_id,
    v_actor_id,
    'Batch #' || v_batch.batch_number || ' handed over to assignee'
  FROM distribution_order_rooms dor
  JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
  JOIN items i ON i.id = doi.item_id
  WHERE dor.distribution_order_id = v_batch.distribution_order_id
    AND dor.batch_number = v_batch.batch_number;
  
  -- Update item quantities: decrease quantity_in_stock, increase quantity_pending
  UPDATE items i
  SET quantity_in_stock = quantity_in_stock - batch_qty.total_qty,
      quantity_pending = COALESCE(quantity_pending, 0) + batch_qty.total_qty,
      updated_at = now()
  FROM (
    SELECT doi.item_id, SUM(doi.quantity) as total_qty
    FROM distribution_order_rooms dor
    JOIN distribution_order_items doi ON doi.distribution_order_room_id = dor.id
    WHERE dor.distribution_order_id = v_batch.distribution_order_id
      AND dor.batch_number = v_batch.batch_number
    GROUP BY doi.item_id
  ) batch_qty
  WHERE i.id = batch_qty.item_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'handed_over',
    'handed_over_at', now()
  );
END;
$$;

-- 3.2 receive_batch: Assignee confirms receiving the batch
CREATE OR REPLACE FUNCTION receive_batch(
  p_batch_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_batch record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get batch info
  SELECT dob.*, dist_ord.assigned_to, dist_ord.status as order_status
  INTO v_batch
  FROM distribution_order_batches dob
  JOIN distribution_orders dist_ord ON dist_ord.id = dob.distribution_order_id
  WHERE dob.id = p_batch_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found' USING ERRCODE = 'P0002';
  END IF;
  
  -- Validate actor is assigned to this order
  IF v_batch.assigned_to IS NOT NULL AND v_batch.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this route' USING ERRCODE = '42501';
  END IF;
  
  -- Validate state: must be 'handed_over'
  IF v_batch.status != 'handed_over' THEN
    RAISE EXCEPTION 'Batch not ready for receiving (status: %)', v_batch.status USING ERRCODE = '23505';
  END IF;
  
  -- Update batch status
  UPDATE distribution_order_batches
  SET status = 'received',
      received_at = now(),
      received_by = v_actor_id,
      updated_at = now()
  WHERE id = p_batch_id;
  
  -- Update order status to 'in_progress' if not already
  UPDATE distribution_orders
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = v_batch.distribution_order_id
    AND status IN ('pending', 'released');
  
  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'received',
    'received_at', now()
  );
END;
$$;

-- 3.3 deliver_stop: Assignee delivers items to a room
CREATE OR REPLACE FUNCTION deliver_stop(
  p_room_order_id uuid,
  p_items_confirmed jsonb DEFAULT NULL, -- [{item_id, quantity_confirmed}]
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
  v_batch record;
  v_transaction_code text;
  v_item record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get room order info
  SELECT dor.*, r.room_number, r.floor as room_floor
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
  
  -- Validate actor is assigned
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this route' USING ERRCODE = '42501';
  END IF;
  
  -- Get batch info
  SELECT * INTO v_batch
  FROM distribution_order_batches
  WHERE distribution_order_id = v_room_order.distribution_order_id
    AND batch_number = v_room_order.batch_number;
  
  -- Validate batch is received
  IF v_batch.status NOT IN ('received', 'done') THEN
    RAISE EXCEPTION 'Batch not received yet (status: %)', v_batch.status USING ERRCODE = '23505';
  END IF;
  
  -- Validate stop status
  IF v_room_order.stop_status NOT IN ('pending', 'cannot_access') THEN
    RAISE EXCEPTION 'Stop already processed (status: %)', v_room_order.stop_status USING ERRCODE = '23505';
  END IF;
  
  -- Update item quantities if provided
  IF p_items_confirmed IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_confirmed) AS x(item_id uuid, quantity_confirmed int)
    LOOP
      UPDATE distribution_order_items
      SET quantity_confirmed = v_item.quantity_confirmed,
          status = 'confirmed',
          updated_at = now()
      WHERE distribution_order_room_id = p_room_order_id
        AND item_id = v_item.item_id;
    END LOOP;
  ELSE
    -- Confirm all items with original quantity
    UPDATE distribution_order_items
    SET quantity_confirmed = quantity,
        status = 'confirmed',
        updated_at = now()
    WHERE distribution_order_room_id = p_room_order_id;
  END IF;
  
  -- Update room order status
  UPDATE distribution_order_rooms
  SET stop_status = 'delivered',
      status = 'confirmed',
      delivered_at = now(),
      delivered_by = v_actor_id,
      exception_type = NULL,
      exception_reason = NULL,
      updated_at = now()
  WHERE id = p_room_order_id;
  
  -- Generate transaction code
  v_transaction_code := 'TXN-DL-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || LEFT(p_room_order_id::text, 8);
  
  -- Create inventory transactions: In-hand -> Room
  INSERT INTO inventory_transactions (
    tenant_id, hotel_id, item_id, quantity, quantity_before, quantity_after,
    transaction_type, transaction_category, transaction_code,
    related_type, related_id, to_location, created_by, notes
  )
  SELECT 
    v_order.tenant_id,
    v_order.hotel_id,
    doi.item_id,
    COALESCE(doi.quantity_confirmed, doi.quantity),
    i.quantity_pending,
    i.quantity_pending - COALESCE(doi.quantity_confirmed, doi.quantity),
    'out',
    'room_deliver',
    v_transaction_code,
    'distribution_room',
    p_room_order_id,
    v_room_order.room_number,
    v_actor_id,
    'Delivered to room ' || v_room_order.room_number
  FROM distribution_order_items doi
  JOIN items i ON i.id = doi.item_id
  WHERE doi.distribution_order_room_id = p_room_order_id;
  
  -- Update item quantities: decrease pending, increase in_use
  UPDATE items i
  SET quantity_pending = COALESCE(quantity_pending, 0) - room_qty.total_qty,
      quantity_in_use = COALESCE(quantity_in_use, 0) + room_qty.total_qty,
      updated_at = now()
  FROM (
    SELECT doi.item_id, SUM(COALESCE(doi.quantity_confirmed, doi.quantity)) as total_qty
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_room_order_id
    GROUP BY doi.item_id
  ) room_qty
  WHERE i.id = room_qty.item_id;
  
  -- Update room_items (room stock per SKU)
  INSERT INTO room_items (room_id, item_id, quantity, tenant_id, hotel_id)
  SELECT 
    v_room_order.room_id,
    doi.item_id,
    COALESCE(doi.quantity_confirmed, doi.quantity),
    v_order.tenant_id,
    v_order.hotel_id
  FROM distribution_order_items doi
  WHERE doi.distribution_order_room_id = p_room_order_id
  ON CONFLICT (room_id, item_id) DO UPDATE
  SET quantity = room_items.quantity + EXCLUDED.quantity,
      updated_at = now();
  
  -- Check if batch is complete
  PERFORM check_and_update_batch_status(v_batch.id);
  
  -- Check if order is complete
  PERFORM check_and_update_order_status(v_order.id);
  
  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'stop_status', 'delivered',
    'delivered_at', now()
  );
END;
$$;

-- 3.4 mark_cannot_access: Mark a room as cannot access
CREATE OR REPLACE FUNCTION mark_cannot_access(
  p_room_order_id uuid,
  p_exception_type text,
  p_exception_reason text DEFAULT NULL,
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
  v_batch record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Validate exception_type
  IF p_exception_type NOT IN ('guest_inside', 'dnd', 'locked', 'retry', 'other') THEN
    RAISE EXCEPTION 'Invalid exception type: %', p_exception_type USING ERRCODE = '22023';
  END IF;
  
  -- Get room order info
  SELECT * INTO v_room_order
  FROM distribution_order_rooms
  WHERE id = p_room_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room order not found' USING ERRCODE = 'P0002';
  END IF;
  
  -- Get order info
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = v_room_order.distribution_order_id;
  
  -- Validate actor is assigned
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this route' USING ERRCODE = '42501';
  END IF;
  
  -- Validate stop status
  IF v_room_order.stop_status NOT IN ('pending', 'cannot_access') THEN
    RAISE EXCEPTION 'Stop already processed (status: %)', v_room_order.stop_status USING ERRCODE = '23505';
  END IF;
  
  -- Update room order status
  UPDATE distribution_order_rooms
  SET stop_status = 'cannot_access',
      exception_type = p_exception_type,
      exception_reason = p_exception_reason,
      updated_at = now()
  WHERE id = p_room_order_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'stop_status', 'cannot_access',
    'exception_type', p_exception_type
  );
END;
$$;

-- 3.5 retry_stop: Retry a cannot_access stop (back to pending)
CREATE OR REPLACE FUNCTION retry_stop(
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
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get room order info
  SELECT * INTO v_room_order
  FROM distribution_order_rooms
  WHERE id = p_room_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room order not found' USING ERRCODE = 'P0002';
  END IF;
  
  -- Get order info
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = v_room_order.distribution_order_id;
  
  -- Validate actor is assigned
  IF v_order.assigned_to IS NOT NULL AND v_order.assigned_to != v_actor_id THEN
    RAISE EXCEPTION 'You are not assigned to this route' USING ERRCODE = '42501';
  END IF;
  
  -- Validate stop status must be cannot_access
  IF v_room_order.stop_status != 'cannot_access' THEN
    RAISE EXCEPTION 'Can only retry stops with cannot_access status (current: %)', v_room_order.stop_status USING ERRCODE = '23505';
  END IF;
  
  -- Update room order status back to pending
  UPDATE distribution_order_rooms
  SET stop_status = 'pending',
      exception_type = 'retry',
      exception_reason = 'Retry attempted at ' || to_char(now(), 'HH24:MI'),
      updated_at = now()
  WHERE id = p_room_order_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'stop_status', 'pending'
  );
END;
$$;

-- 3.6 return_to_stock_for_stop: Return items to warehouse (required before handover)
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
  
  -- Create inventory transactions: In-hand -> Warehouse
  INSERT INTO inventory_transactions (
    tenant_id, hotel_id, item_id, quantity, quantity_before, quantity_after,
    transaction_type, transaction_category, transaction_code,
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
    'distribution_room',
    p_room_order_id,
    v_actor_id,
    'Returned to stock from room ' || v_room_order.room_number || ' (cannot access)'
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
    'returned_at', now()
  );
END;
$$;

-- 3.7 handover_stop_create_next_route: Handover a stop and create next shift route
CREATE OR REPLACE FUNCTION handover_stop_create_next_route(
  p_room_order_id uuid,
  p_next_shift_code text,
  p_next_assignee_id uuid DEFAULT NULL,
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
  v_next_order_id uuid;
  v_next_room_order_id uuid;
  v_next_order_code text;
  v_next_assignee uuid;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Validate next_shift_code
  IF p_next_shift_code NOT IN ('morning', 'afternoon', 'night') THEN
    RAISE EXCEPTION 'Invalid shift code: %', p_next_shift_code USING ERRCODE = '22023';
  END IF;
  
  -- Get room order info
  SELECT dor.*, r.room_number, r.floor as room_floor, r.id as the_room_id
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
  
  -- Validate stop status must be cannot_access
  IF v_room_order.stop_status != 'cannot_access' THEN
    RAISE EXCEPTION 'Can only handover cannot_access stops (current: %)', v_room_order.stop_status USING ERRCODE = '23505';
  END IF;
  
  -- Validate returned_at is set (items returned to stock)
  IF v_room_order.returned_at IS NULL THEN
    RAISE EXCEPTION 'Must return items to stock before handover' USING ERRCODE = '23505';
  END IF;
  
  -- Determine next assignee (use provided or created_by as leader fallback)
  v_next_assignee := COALESCE(p_next_assignee_id, v_order.created_by);
  
  -- Generate next order code
  v_next_order_code := 'DIST-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  
  -- Create next shift route
  INSERT INTO distribution_orders (
    tenant_id, hotel_id, order_code, status, floor, shift_date, shift_code,
    batch_size, assigned_to, created_by, notes
  )
  VALUES (
    v_order.tenant_id,
    v_order.hotel_id,
    v_next_order_code,
    'pending',
    v_room_order.room_floor,
    CASE 
      WHEN p_next_shift_code = 'morning' AND v_order.shift_code = 'night' THEN CURRENT_DATE + 1
      ELSE CURRENT_DATE
    END,
    p_next_shift_code,
    v_order.batch_size,
    v_next_assignee,
    v_actor_id,
    'Handover from route ' || v_order.order_code || ' (room ' || v_room_order.room_number || ')'
  )
  RETURNING id INTO v_next_order_id;
  
  -- Create room in next route
  INSERT INTO distribution_order_rooms (
    distribution_order_id, room_id, batch_number, stop_status, status
  )
  VALUES (
    v_next_order_id,
    v_room_order.the_room_id,
    1,
    'pending',
    'pending'
  )
  RETURNING id INTO v_next_room_order_id;
  
  -- Copy items to next route
  INSERT INTO distribution_order_items (
    distribution_order_room_id, item_id, quantity, status
  )
  SELECT 
    v_next_room_order_id,
    doi.item_id,
    doi.quantity,
    'pending'
  FROM distribution_order_items doi
  WHERE doi.distribution_order_room_id = p_room_order_id;
  
  -- Create batch for next route
  INSERT INTO distribution_order_batches (
    distribution_order_id, batch_number, status
  )
  VALUES (v_next_order_id, 1, 'open');
  
  -- Update totals for next route
  UPDATE distribution_orders
  SET total_rooms = 1,
      total_items = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM distribution_order_items
        WHERE distribution_order_room_id = v_next_room_order_id
      )
  WHERE id = v_next_order_id;
  
  -- Update current stop as resolved
  UPDATE distribution_order_rooms
  SET stop_status = 'resolved',
      handover_to_order_id = v_next_order_id,
      handover_at = now(),
      updated_at = now()
  WHERE id = p_room_order_id;
  
  -- Check if current order is complete
  PERFORM check_and_update_order_status(v_order.id);
  
  RETURN jsonb_build_object(
    'success', true,
    'room_order_id', p_room_order_id,
    'stop_status', 'resolved',
    'next_order_id', v_next_order_id,
    'next_order_code', v_next_order_code,
    'next_shift_code', p_next_shift_code
  );
END;
$$;

-- 3.8 close_route_if_complete: Close route when 100% complete
CREATE OR REPLACE FUNCTION close_route_if_complete(
  p_order_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order record;
  v_incomplete_count integer;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get order info
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  
  -- Count incomplete stops
  SELECT COUNT(*) INTO v_incomplete_count
  FROM distribution_order_rooms
  WHERE distribution_order_id = p_order_id
    AND stop_status NOT IN ('delivered', 'resolved');
  
  IF v_incomplete_count > 0 THEN
    RAISE EXCEPTION 'Cannot close route: % stops not completed', v_incomplete_count USING ERRCODE = '23505';
  END IF;
  
  -- Close the route
  UPDATE distribution_orders
  SET status = 'closed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
  
  -- Mark all batches as done
  UPDATE distribution_order_batches
  SET status = 'done',
      updated_at = now()
  WHERE distribution_order_id = p_order_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'closed',
    'closed_at', now()
  );
END;
$$;

-- Helper function: Check and update batch status
CREATE OR REPLACE FUNCTION check_and_update_batch_status(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_incomplete_count integer;
BEGIN
  SELECT * INTO v_batch
  FROM distribution_order_batches
  WHERE id = p_batch_id;
  
  IF v_batch.status = 'done' THEN
    RETURN;
  END IF;
  
  -- Count incomplete stops in this batch
  SELECT COUNT(*) INTO v_incomplete_count
  FROM distribution_order_rooms
  WHERE distribution_order_id = v_batch.distribution_order_id
    AND batch_number = v_batch.batch_number
    AND stop_status NOT IN ('delivered', 'resolved');
  
  IF v_incomplete_count = 0 THEN
    UPDATE distribution_order_batches
    SET status = 'done',
        updated_at = now()
    WHERE id = p_batch_id;
  END IF;
END;
$$;

-- Helper function: Check and update order status
CREATE OR REPLACE FUNCTION check_and_update_order_status(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_incomplete_count integer;
  v_completed_count integer;
BEGIN
  SELECT * INTO v_order
  FROM distribution_orders
  WHERE id = p_order_id;
  
  IF v_order.status IN ('completed', 'closed', 'cancelled') THEN
    RETURN;
  END IF;
  
  -- Count stops
  SELECT 
    COUNT(*) FILTER (WHERE stop_status NOT IN ('delivered', 'resolved')),
    COUNT(*) FILTER (WHERE stop_status IN ('delivered', 'resolved'))
  INTO v_incomplete_count, v_completed_count
  FROM distribution_order_rooms
  WHERE distribution_order_id = p_order_id;
  
  IF v_incomplete_count = 0 AND v_completed_count > 0 THEN
    UPDATE distribution_orders
    SET status = 'completed',
        completed_at = now(),
        rooms_completed = v_completed_count,
        updated_at = now()
    WHERE id = p_order_id;
  ELSE
    -- Update rooms_completed count
    UPDATE distribution_orders
    SET rooms_completed = v_completed_count,
        updated_at = now()
    WHERE id = p_order_id;
  END IF;
END;
$$;