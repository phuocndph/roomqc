apply_room_standards(uuid)
---DEF---
CREATE OR REPLACE FUNCTION public.apply_room_standards(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type TEXT;
  v_tenant_id UUID;
  v_items_affected INTEGER := 0;
BEGIN
  -- Get room type and tenant_id
  SELECT room_type, tenant_id INTO v_room_type, v_tenant_id 
  FROM rooms 
  WHERE id = p_room_id;
  
  IF v_room_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Room not found'
    );
  END IF;
  
  -- Apply standards: INSERT/UPDATE room_items with standard_quantity
  INSERT INTO room_items (room_id, item_id, quantity, standard_quantity, condition)
  SELECT 
    p_room_id,
    rts.item_id,
    rts.quantity,
    rts.quantity,  -- Set standard_quantity from standards
    'good'
  FROM room_type_standards rts
  WHERE rts.room_type = v_room_type
    AND rts.tenant_id = v_tenant_id
  ON CONFLICT (room_id, item_id) 
  DO UPDATE SET 
    standard_quantity = EXCLUDED.standard_quantity,  -- Always update standard
    quantity = GREATEST(room_items.quantity, EXCLUDED.quantity),  -- Keep max quantity
    updated_at = now();
  
  GET DIAGNOSTICS v_items_affected = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'items_affected', v_items_affected
  );
END;
$function$

setup_room_initial(uuid,boolean)
---DEF---
CREATE OR REPLACE FUNCTION public.setup_room_initial(p_room_id uuid, p_reset_quantities boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type text;
  v_hotel_id uuid;
  v_tenant_id uuid;
  v_added integer := 0;
  v_updated integer := 0;
  v_deleted integer := 0;
BEGIN
  -- Get room info
  SELECT room_type, hotel_id, tenant_id 
  INTO v_room_type, v_hotel_id, v_tenant_id
  FROM rooms WHERE id = p_room_id;

  IF v_room_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Không tìm thấy phòng'
    );
  END IF;

  -- If reset mode, delete items not in standards
  IF p_reset_quantities THEN
    DELETE FROM room_items ri
    WHERE ri.room_id = p_room_id
    AND NOT EXISTS (
      SELECT 1 FROM room_type_standards rts 
      WHERE rts.item_id = ri.item_id 
        AND rts.room_type = v_room_type 
        AND rts.hotel_id = v_hotel_id
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  -- Upsert items from standards
  -- FIXED: Removed tenant_id from INSERT (column doesn't exist in room_items)
  WITH upserted AS (
    INSERT INTO room_items (room_id, item_id, quantity, standard_quantity, condition, assigned_at)
    SELECT 
      p_room_id,
      rts.item_id,
      rts.quantity,
      rts.quantity,
      'good',
      NOW()
    FROM room_type_standards rts
    JOIN items i ON i.id = rts.item_id AND i.hotel_id = v_hotel_id
    WHERE rts.room_type = v_room_type
      AND rts.hotel_id = v_hotel_id
    ON CONFLICT (room_id, item_id) 
    DO UPDATE SET 
      standard_quantity = EXCLUDED.standard_quantity,
      quantity = CASE 
        WHEN p_reset_quantities THEN EXCLUDED.quantity
        ELSE GREATEST(room_items.quantity, EXCLUDED.quantity)
      END
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT 
    COUNT(*) FILTER (WHERE is_insert)::integer,
    COUNT(*) FILTER (WHERE NOT is_insert)::integer
  INTO v_added, v_updated
  FROM upserted;

  RETURN jsonb_build_object(
    'success', true,
    'added', v_added,
    'updated', v_updated,
    'deleted', v_deleted,
    'message', format('Setup hoàn tất: %s thêm, %s cập nhật, %s xóa', v_added, v_updated, v_deleted)
  );
END;
$function$

undo_room_delivery_confirmation(uuid)
---DEF---
CREATE OR REPLACE FUNCTION public.undo_room_delivery_confirmation(p_distribution_order_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

handover_batch(uuid,uuid)
---DEF---
CREATE OR REPLACE FUNCTION public.handover_batch(p_batch_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_batch record;
  v_order record;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  
  -- Get batch info
  SELECT * INTO v_batch FROM distribution_order_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;
  
  -- Get order info
  SELECT * INTO v_order FROM distribution_orders WHERE id = v_batch.distribution_order_id;
  
  -- Validate batch status
  IF v_batch.status NOT IN ('open', 'pending') THEN
    RAISE EXCEPTION 'Batch already handed over or in invalid state: %', v_batch.status;
  END IF;
  
  -- Update batch status to handed_over (NO inventory deduction - that happens when employee confirms receipt)
  UPDATE distribution_order_batches
  SET status = 'handed_over',
      handed_over_at = now(),
      handed_over_by = v_actor_id,
      updated_at = now()
  WHERE id = p_batch_id;
  
  -- Update order status to released if still pending
  IF v_order.status = 'pending' THEN
    UPDATE distribution_orders
    SET status = 'released',
        released_at = now(),
        released_by = v_actor_id,
        updated_at = now()
    WHERE id = v_order.id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'message', 'Batch handed over successfully. Waiting for employee to confirm receipt.'
  );
END;
$function$

settle_batch_compensation(uuid)
---DEF---
CREATE OR REPLACE FUNCTION public.settle_batch_compensation(_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_user_id,'owner'::app_role)
       OR public.has_role(v_user_id,'hotel_manager'::app_role)
       OR public.has_role(v_user_id,'department_manager'::app_role)
       OR public.has_role(v_user_id,'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM laundry_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status NOT IN ('partially_received','compensation_needed') THEN
    RAISE EXCEPTION 'invalid_status:%', v_batch.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE laundry_batches
  SET status = 'closed',
      compensation_settled_at = now(),
      compensation_settled_by = v_user_id,
      updated_at = now()
  WHERE id = _batch_id;

  RETURN jsonb_build_object('ok', true, 'batch_id', _batch_id);
END $function$

