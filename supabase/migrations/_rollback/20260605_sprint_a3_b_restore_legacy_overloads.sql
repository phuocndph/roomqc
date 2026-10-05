CREATE OR REPLACE FUNCTION public.create_distribution_order(p_tenant_id uuid, p_hotel_id uuid, p_created_by uuid, p_assigned_to uuid, p_rooms jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_order_code TEXT;
  v_room JSONB;
  v_room_id UUID;
  v_room_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_quantity INTEGER;
  v_current_stock INTEGER;
  v_total_rooms INTEGER := 0;
  v_total_items INTEGER := 0;
  v_item_totals JSONB := '{}';
  v_retry_count INTEGER := 0;
  v_code_exists BOOLEAN;
BEGIN
  -- Generate unique order code
  LOOP
    v_order_code := 'DIS-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    
    SELECT EXISTS(SELECT 1 FROM distribution_orders WHERE order_code = v_order_code)
    INTO v_code_exists;
    
    IF NOT v_code_exists THEN EXIT; END IF;
    
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= 5 THEN
      v_order_code := 'DIS-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  -- First pass: aggregate total quantities needed per item and validate stock
  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
  LOOP
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'items')
    LOOP
      v_item_id := (v_item->>'item_id')::UUID;
      v_quantity := (v_item->>'quantity')::INTEGER;
      
      IF v_item_totals ? v_item_id::TEXT THEN
        v_item_totals := jsonb_set(v_item_totals, ARRAY[v_item_id::TEXT], 
          to_jsonb((v_item_totals->>v_item_id::TEXT)::INTEGER + v_quantity));
      ELSE
        v_item_totals := jsonb_set(v_item_totals, ARRAY[v_item_id::TEXT], to_jsonb(v_quantity));
      END IF;
    END LOOP;
  END LOOP;

  -- Validate all items have sufficient stock
  FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals)
  LOOP
    v_quantity := (v_item_totals->>v_item_id::TEXT)::INTEGER;
    
    SELECT quantity_in_stock INTO v_current_stock
    FROM items WHERE id = v_item_id AND tenant_id = p_tenant_id;
    
    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item_id;
    END IF;
    
    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Không đủ hàng trong kho. Yêu cầu: %, Tồn kho: %', v_quantity, v_current_stock;
    END IF;
  END LOOP;

  -- Create distribution order
  INSERT INTO distribution_orders (tenant_id, hotel_id, order_code, created_by, assigned_to, notes)
  VALUES (p_tenant_id, p_hotel_id, v_order_code, p_created_by, p_assigned_to, p_notes)
  RETURNING id INTO v_order_id;

  -- Process each room
  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
  LOOP
    v_room_id := (v_room->>'room_id')::UUID;
    v_total_rooms := v_total_rooms + 1;
    
    INSERT INTO distribution_order_rooms (distribution_order_id, room_id)
    VALUES (v_order_id, v_room_id)
    RETURNING id INTO v_room_order_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'items')
    LOOP
      v_item_id := (v_item->>'item_id')::UUID;
      v_quantity := (v_item->>'quantity')::INTEGER;
      v_total_items := v_total_items + v_quantity;
      
      INSERT INTO distribution_order_items (distribution_order_room_id, item_id, quantity)
      VALUES (v_room_order_id, v_item_id, v_quantity);
    END LOOP;
  END LOOP;

  -- Update items: decrease stock, increase pending
  FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals)
  LOOP
    v_quantity := (v_item_totals->>v_item_id::TEXT)::INTEGER;
    
    UPDATE items SET
      quantity_in_stock = quantity_in_stock - v_quantity,
      quantity_pending = COALESCE(quantity_pending, 0) + v_quantity,
      updated_at = now()
    WHERE id = v_item_id;
  END LOOP;

  UPDATE distribution_orders SET
    total_rooms = v_total_rooms,
    total_items = v_total_items
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_code', v_order_code,
    'total_rooms', v_total_rooms,
    'total_items', v_total_items
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.create_inbound_transaction(p_tenant_id uuid, p_hotel_id uuid, p_transaction_category text, p_from_location text, p_to_location text, p_created_by uuid, p_items jsonb, p_related_type text DEFAULT NULL::text, p_related_id uuid DEFAULT NULL::uuid, p_documents text[] DEFAULT NULL::text[], p_photos text[] DEFAULT NULL::text[], p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_code text;
  v_item record;
  v_current_stock integer;
  v_new_stock integer;
  v_item_data record;
  v_result jsonb;
  v_total_items integer := 0;
  v_total_value numeric := 0;
  v_transaction_id uuid;
  v_retry_count integer := 0;
  v_max_retries integer := 5;
  v_code_exists boolean;
BEGIN
  -- Generate unique transaction code with retry logic
  LOOP
    v_transaction_code := 'IN-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM inventory_transactions WHERE transaction_code = v_transaction_code)
    INTO v_code_exists;
    
    IF NOT v_code_exists THEN
      EXIT;
    END IF;
    
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= v_max_retries THEN
      -- Use UUID as fallback for guaranteed uniqueness
      v_transaction_code := 'IN-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, unit_price numeric, notes text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id;
    
    IF v_item_data IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item.item_id;
    END IF;
    
    v_current_stock := COALESCE(v_item_data.quantity_in_stock, 0);
    v_new_stock := v_current_stock + v_item.quantity;

    -- Insert transaction record
    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      unit_price, total_value,
      from_location, to_location, created_by,
      related_type, related_id, documents, photos, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_transaction_code, 'in', p_transaction_category,
      v_item.item_id, v_item.quantity, v_current_stock, v_new_stock,
      COALESCE(v_item.unit_price, v_item_data.unit_price, 0),
      v_item.quantity * COALESCE(v_item.unit_price, v_item_data.unit_price, 0),
      p_from_location, p_to_location, p_created_by,
      p_related_type, p_related_id, p_documents, p_photos, 
      COALESCE(v_item.notes, p_notes)
    )
    RETURNING id INTO v_transaction_id;

    -- Update item quantities
    UPDATE items SET 
      quantity_in_stock = v_new_stock,
      quantity_total = COALESCE(quantity_total, 0) + v_item.quantity,
      unit_price = COALESCE(v_item.unit_price, unit_price),
      updated_at = now()
    WHERE id = v_item.item_id;

    v_total_items := v_total_items + 1;
    v_total_value := v_total_value + (v_item.quantity * COALESCE(v_item.unit_price, v_item_data.unit_price, 0));
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'total_items', v_total_items,
    'total_value', v_total_value
  );

  RETURN v_result;
END;
$function$

CREATE OR REPLACE FUNCTION public.create_outbound_transaction(p_tenant_id uuid, p_hotel_id uuid, p_transaction_category text, p_from_location text, p_to_location text, p_created_by uuid, p_items jsonb, p_related_type text DEFAULT NULL::text, p_related_id uuid DEFAULT NULL::uuid, p_recipient_name text DEFAULT NULL::text, p_recipient_signature text DEFAULT NULL::text, p_documents text[] DEFAULT NULL::text[], p_photos text[] DEFAULT NULL::text[], p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_code text;
  v_item record;
  v_current_stock integer;
  v_new_stock integer;
  v_item_data record;
  v_result jsonb;
  v_transaction_ids uuid[] := ARRAY[]::uuid[];
  v_low_stock_items text[] := ARRAY[]::text[];
  v_transaction_id uuid;
  v_retry_count integer := 0;
  v_max_retries integer := 5;
  v_code_exists boolean;
  v_unit_price numeric;
  v_total_value numeric;
BEGIN
  -- Generate unique transaction code with retry logic
  LOOP
    v_transaction_code := 'OUT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM inventory_transactions WHERE transaction_code = v_transaction_code)
    INTO v_code_exists;
    
    IF NOT v_code_exists THEN
      EXIT;
    END IF;
    
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= v_max_retries THEN
      -- Use UUID as fallback for guaranteed uniqueness
      v_transaction_code := 'OUT-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  -- First pass: validate all items have sufficient stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, notes text)
  LOOP
    SELECT quantity_in_stock, name INTO v_item_data
    FROM items 
    WHERE id = v_item.item_id AND tenant_id = p_tenant_id;
    
    IF v_item_data IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item.item_id;
    END IF;
    
    IF v_item_data.quantity_in_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Không đủ hàng trong kho cho sản phẩm: %. Tồn kho: %, Yêu cầu: %', 
        v_item_data.name, v_item_data.quantity_in_stock, v_item.quantity;
    END IF;
  END LOOP;

  -- Second pass: process transactions
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, notes text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id;
    
    v_current_stock := v_item_data.quantity_in_stock;
    v_new_stock := v_current_stock - v_item.quantity;
    
    -- Get unit_price and calculate total_value
    v_unit_price := COALESCE(v_item_data.unit_price, 0);
    v_total_value := v_item.quantity * v_unit_price;

    -- Insert transaction record with unit_price and total_value
    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      from_location, to_location, created_by,
      related_type, related_id, documents, photos, notes,
      unit_price, total_value
    ) VALUES (
      p_tenant_id, p_hotel_id, v_transaction_code, 'out', p_transaction_category,
      v_item.item_id, v_item.quantity, v_current_stock, v_new_stock,
      p_from_location, p_to_location, p_created_by,
      p_related_type, p_related_id, p_documents, p_photos, 
      COALESCE(v_item.notes, p_notes),
      v_unit_price, v_total_value
    )
    RETURNING id INTO v_transaction_id;
    
    v_transaction_ids := array_append(v_transaction_ids, v_transaction_id);

    -- Update item quantities based on category
    IF p_transaction_category = 'room_assign' THEN
      UPDATE items SET 
        quantity_in_stock = v_new_stock,
        quantity_in_use = COALESCE(quantity_in_use, 0) + v_item.quantity,
        updated_at = now()
      WHERE id = v_item.item_id;
    ELSIF p_transaction_category = 'laundry' THEN
      UPDATE items SET 
        quantity_in_stock = v_new_stock,
        quantity_in_laundry = COALESCE(quantity_in_laundry, 0) + v_item.quantity,
        updated_at = now()
      WHERE id = v_item.item_id;
    ELSIF p_transaction_category = 'maintenance' THEN
      UPDATE items SET 
        quantity_in_stock = v_new_stock,
        quantity_damaged = COALESCE(quantity_damaged, 0) + v_item.quantity,
        updated_at = now()
      WHERE id = v_item.item_id;
    ELSIF p_transaction_category = 'disposal' THEN
      UPDATE items SET 
        quantity_in_stock = v_new_stock,
        quantity_total = COALESCE(quantity_total, 0) - v_item.quantity,
        updated_at = now()
      WHERE id = v_item.item_id;
    ELSE
      UPDATE items SET 
        quantity_in_stock = v_new_stock,
        updated_at = now()
      WHERE id = v_item.item_id;
    END IF;

    -- Check for low stock
    IF v_new_stock <= COALESCE(v_item_data.minimum_stock, 0) THEN
      v_low_stock_items := array_append(v_low_stock_items, v_item_data.name);
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'transaction_ids', to_jsonb(v_transaction_ids),
    'low_stock_items', to_jsonb(v_low_stock_items)
  );

  RETURN v_result;
END;
$function$

CREATE OR REPLACE FUNCTION public.create_laundry_loss_transaction(p_tenant_id uuid, p_hotel_id uuid, p_batch_id uuid, p_batch_code text, p_item_id uuid, p_quantity integer, p_loss_type text, p_created_by uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_code text;
  v_item record;
  v_new_laundry integer;
  v_new_lost integer;
  v_new_damaged integer;
  v_new_total integer;
  v_transaction_id uuid;
  v_transaction_type text;
BEGIN
  -- Generate transaction code
  v_transaction_code := 'LL-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
    lpad((floor(random() * 10000)::integer)::text, 4, '0');

  -- Get current item data
  SELECT * INTO v_item FROM items WHERE id = p_item_id AND tenant_id = p_tenant_id;
  
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  -- Calculate new quantities
  v_new_laundry := GREATEST(0, COALESCE(v_item.quantity_in_laundry, 0) - p_quantity);
  v_new_lost := COALESCE(v_item.quantity_lost, 0);
  v_new_damaged := COALESCE(v_item.quantity_damaged, 0);
  v_new_total := COALESCE(v_item.quantity_total, 0) - p_quantity; -- Giảm total vì mất/hỏng

  IF p_loss_type = 'lost' THEN
    v_new_lost := v_new_lost + p_quantity;
    v_transaction_type := 'lost';
  ELSE
    v_new_damaged := v_new_damaged + p_quantity;
    v_transaction_type := 'damaged';
  END IF;

  -- Insert transaction record
  INSERT INTO inventory_transactions (
    tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
    item_id, quantity, quantity_before, quantity_after,
    from_location, to_location, created_by,
    related_type, related_id, notes, unit_price, total_value
  ) VALUES (
    p_tenant_id, p_hotel_id, v_transaction_code, v_transaction_type, 'laundry',
    p_item_id, p_quantity, COALESCE(v_item.quantity_in_laundry, 0), v_new_laundry,
    'Laundry: ' || p_batch_code, CASE WHEN p_loss_type = 'lost' THEN 'Mất' ELSE 'Hỏng' END, 
    p_created_by,
    'laundry_batch', p_batch_id, 
    COALESCE(p_notes, CASE WHEN p_loss_type = 'lost' THEN 'Mất từ giặt' ELSE 'Hỏng từ giặt' END || ' - Lô ' || p_batch_code),
    COALESCE(v_item.unit_price, 0), p_quantity * COALESCE(v_item.unit_price, 0)
  )
  RETURNING id INTO v_transaction_id;

  -- Update item quantities
  UPDATE items SET 
    quantity_in_laundry = v_new_laundry,
    quantity_lost = v_new_lost,
    quantity_damaged = v_new_damaged,
    quantity_total = v_new_total,
    updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'transaction_code', v_transaction_code,
    'loss_type', p_loss_type,
    'quantity', p_quantity
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.create_laundry_return_transaction(p_tenant_id uuid, p_hotel_id uuid, p_batch_id uuid, p_batch_code text, p_item_id uuid, p_quantity integer, p_created_by uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_code text;
  v_item record;
  v_new_stock integer;
  v_new_laundry integer;
  v_transaction_id uuid;
BEGIN
  -- Generate transaction code
  v_transaction_code := 'LR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
    lpad((floor(random() * 10000)::integer)::text, 4, '0');

  -- Get current item data
  SELECT * INTO v_item FROM items WHERE id = p_item_id AND tenant_id = p_tenant_id;
  
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  -- Calculate new quantities - quantity_total KHÔNG THAY ĐỔI
  v_new_stock := COALESCE(v_item.quantity_in_stock, 0) + p_quantity;
  v_new_laundry := GREATEST(0, COALESCE(v_item.quantity_in_laundry, 0) - p_quantity);

  -- Insert transaction record
  INSERT INTO inventory_transactions (
    tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
    item_id, quantity, quantity_before, quantity_after,
    from_location, to_location, created_by,
    related_type, related_id, notes, unit_price, total_value
  ) VALUES (
    p_tenant_id, p_hotel_id, v_transaction_code, 'in', 'return',
    p_item_id, p_quantity, COALESCE(v_item.quantity_in_stock, 0), v_new_stock,
    'Laundry: ' || p_batch_code, 'Kho', p_created_by,
    'laundry_batch', p_batch_id, COALESCE(p_notes, 'Nhập kho từ giặt - Lô ' || p_batch_code),
    COALESCE(v_item.unit_price, 0), p_quantity * COALESCE(v_item.unit_price, 0)
  )
  RETURNING id INTO v_transaction_id;

  -- Update item quantities - CHỈ update stock và laundry, KHÔNG đổi total
  UPDATE items SET 
    quantity_in_stock = v_new_stock,
    quantity_in_laundry = v_new_laundry,
    updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'transaction_code', v_transaction_code,
    'quantity_before', COALESCE(v_item.quantity_in_stock, 0),
    'quantity_after', v_new_stock
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.get_laundry_batches_filtered(p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_vendor_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, batch_code text, vendor_id uuid, vendor_name text, vendor_logo text, vendor_rating numeric, delivery_date timestamp with time zone, expected_return_date timestamp with time zone, actual_return_date timestamp with time zone, total_items integer, total_weight_kg numeric, estimated_cost numeric, actual_cost numeric, status text, quality_rating numeric, timeliness_rating numeric, items_lost integer, items_damaged integer, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_batches AS (
    SELECT 
      lb.*,
      lv.name as vendor_name,
      lv.contract_info->>'logo_url' as vendor_logo,
      lv.rating as vendor_rating
    FROM laundry_batches lb
    JOIN laundry_vendors lv ON lv.id = lb.vendor_id
    WHERE lb.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
      AND (p_vendor_id IS NULL OR lb.vendor_id = p_vendor_id)
      AND (p_status IS NULL OR lb.status = p_status)
      AND (p_from_date IS NULL OR lb.delivery_date::date >= p_from_date)
      AND (p_to_date IS NULL OR lb.delivery_date::date <= p_to_date)
  )
  SELECT 
    fb.id,
    fb.batch_code,
    fb.vendor_id,
    fb.vendor_name,
    fb.vendor_logo,
    fb.vendor_rating,
    fb.delivery_date,
    fb.expected_return_date,
    fb.actual_return_date,
    fb.total_items,
    fb.total_weight_kg,
    fb.estimated_cost,
    fb.actual_cost,
    fb.status,
    fb.quality_rating,
    fb.timeliness_rating,
    fb.items_lost,
    fb.items_damaged,
    fb.created_at,
    COUNT(*) OVER() as total_count
  FROM filtered_batches fb
  ORDER BY fb.delivery_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$

CREATE OR REPLACE FUNCTION public.setup_new_tenant(p_tenant_id uuid, p_hotel_name text, p_hotel_address text, p_total_rooms integer, p_owner_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hotel_id uuid;
begin
  insert into hotels (tenant_id, name, address, total_rooms)
  values (p_tenant_id, p_hotel_name, p_hotel_address, p_total_rooms)
  returning id into v_hotel_id;
  
  perform create_default_categories(p_tenant_id);
  
  update users set tenant_id = p_tenant_id, hotel_id = v_hotel_id, role = 'owner'
  where id = p_owner_user_id;
  
  insert into notifications (tenant_id, user_id, type, category, title, message)
  values (p_tenant_id, p_owner_user_id, 'success', 'system', 'Chào mừng đến với hệ thống!',
          'Tài khoản của bạn đã được tạo thành công. Hãy bắt đầu bằng cách thêm tài sản vào kho.');
  
  return v_hotel_id;
end;
$function$

