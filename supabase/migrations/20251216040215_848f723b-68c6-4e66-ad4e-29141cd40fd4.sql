-- 1. Sửa RPC create_laundry_return_transaction - KHÔNG thay đổi quantity_total
CREATE OR REPLACE FUNCTION public.create_laundry_return_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_batch_id uuid,
  p_batch_code text,
  p_item_id uuid,
  p_quantity integer,
  p_created_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
$function$;

-- 2. Sửa RPC create_laundry_loss_transaction - KHÔNG thay đổi quantity_total
CREATE OR REPLACE FUNCTION public.create_laundry_loss_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_batch_id uuid,
  p_batch_code text,
  p_item_id uuid,
  p_quantity integer,
  p_loss_type text, -- 'lost' hoặc 'damaged'
  p_created_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
$function$;

-- 3. Tạo RPC mới cho tạo lô giặt với atomic update
CREATE OR REPLACE FUNCTION public.create_laundry_batch_with_items(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_vendor_id uuid,
  p_delivery_date date,
  p_expected_return_date date,
  p_delivery_staff_id uuid,
  p_receiver_name text,
  p_notes text,
  p_items jsonb -- [{item_id, quantity, weight_kg, condition_note}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_batch_id uuid;
  v_batch_code text;
  v_item record;
  v_item_data record;
  v_total_items integer := 0;
  v_total_weight numeric := 0;
  v_estimated_cost numeric := 0;
  v_vendor record;
  v_price_per_kg numeric;
BEGIN
  -- Get vendor info for pricing
  SELECT * INTO v_vendor FROM laundry_vendors WHERE id = p_vendor_id;
  v_price_per_kg := COALESCE((v_vendor.contract_info->>'price_per_kg')::numeric, 0);

  -- Generate batch code
  v_batch_code := 'LB-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
    lpad((floor(random() * 1000)::integer)::text, 3, '0');

  -- Validate all items have sufficient stock first
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, weight_kg numeric, condition_note text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id AND tenant_id = p_tenant_id;
    
    IF v_item_data IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item.item_id;
    END IF;
    
    IF COALESCE(v_item_data.quantity_in_stock, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'Không đủ hàng trong kho cho %: Tồn kho %, Yêu cầu %', 
        v_item_data.name, COALESCE(v_item_data.quantity_in_stock, 0), v_item.quantity;
    END IF;
    
    v_total_items := v_total_items + v_item.quantity;
    v_total_weight := v_total_weight + COALESCE(v_item.weight_kg, 0);
  END LOOP;

  -- Calculate estimated cost
  v_estimated_cost := v_total_weight * v_price_per_kg;

  -- Create batch
  INSERT INTO laundry_batches (
    tenant_id, hotel_id, batch_code, vendor_id, 
    delivery_date, expected_return_date, delivery_staff_id,
    receiver_name, notes, total_items, total_weight_kg, estimated_cost, status
  ) VALUES (
    p_tenant_id, p_hotel_id, v_batch_code, p_vendor_id,
    p_delivery_date, p_expected_return_date, p_delivery_staff_id,
    p_receiver_name, p_notes, v_total_items, v_total_weight, v_estimated_cost, 'delivered'
  )
  RETURNING id INTO v_batch_id;

  -- Process each item - ATOMIC update stock -> laundry
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, weight_kg numeric, condition_note text)
  LOOP
    -- Insert batch item
    INSERT INTO laundry_batch_items (
      batch_id, item_id, quantity_delivered, weight_kg, condition_note
    ) VALUES (
      v_batch_id, v_item.item_id, v_item.quantity, v_item.weight_kg, v_item.condition_note
    );

    -- Update item quantities: stock -> laundry (quantity_total KHÔNG ĐỔI)
    UPDATE items SET 
      quantity_in_stock = COALESCE(quantity_in_stock, 0) - v_item.quantity,
      quantity_in_laundry = COALESCE(quantity_in_laundry, 0) + v_item.quantity,
      updated_at = now()
    WHERE id = v_item.item_id;
  END LOOP;

  -- Update vendor stats
  UPDATE laundry_vendors SET 
    total_orders = COALESCE(total_orders, 0) + 1,
    total_value = COALESCE(total_value, 0) + v_estimated_cost,
    updated_at = now()
  WHERE id = p_vendor_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_code', v_batch_code,
    'total_items', v_total_items,
    'total_weight', v_total_weight,
    'estimated_cost', v_estimated_cost
  );
END;
$function$;

-- 4. Migration sửa dữ liệu bị sai - Recalculate quantity_total cho tất cả items
UPDATE items SET 
  quantity_total = COALESCE(quantity_in_stock, 0) + COALESCE(quantity_in_use, 0) + 
                   COALESCE(quantity_in_laundry, 0) + COALESCE(quantity_damaged, 0) + 
                   COALESCE(quantity_pending, 0)
WHERE quantity_total != (
  COALESCE(quantity_in_stock, 0) + COALESCE(quantity_in_use, 0) + 
  COALESCE(quantity_in_laundry, 0) + COALESCE(quantity_damaged, 0) + 
  COALESCE(quantity_pending, 0)
);