-- =============================================
-- Update create_inbound_transaction to support warehouse_stock
-- =============================================
CREATE OR REPLACE FUNCTION public.create_inbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_documents text[] DEFAULT NULL,
  p_photos text[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_to_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_warehouse_id uuid;
BEGIN
  -- Determine warehouse: use provided or get default
  v_warehouse_id := p_to_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE tenant_id = p_tenant_id 
      AND hotel_id = p_hotel_id 
      AND is_default = true 
      AND is_active = true
    LIMIT 1;
  END IF;

  -- Generate unique transaction code with retry logic
  LOOP
    v_transaction_code := 'IN-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    
    SELECT EXISTS(SELECT 1 FROM inventory_transactions WHERE transaction_code = v_transaction_code)
    INTO v_code_exists;
    
    IF NOT v_code_exists THEN
      EXIT;
    END IF;
    
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= v_max_retries THEN
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

    -- Insert transaction record with warehouse reference
    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      unit_price, total_value,
      from_location, to_location, to_warehouse_id, created_by,
      related_type, related_id, documents, photos, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_transaction_code, 'in', p_transaction_category,
      v_item.item_id, v_item.quantity, v_current_stock, v_new_stock,
      COALESCE(v_item.unit_price, v_item_data.unit_price, 0),
      v_item.quantity * COALESCE(v_item.unit_price, v_item_data.unit_price, 0),
      p_from_location, p_to_location, v_warehouse_id, p_created_by,
      p_related_type, p_related_id, p_documents, p_photos, 
      COALESCE(v_item.notes, p_notes)
    )
    RETURNING id INTO v_transaction_id;

    -- Update item total quantities
    UPDATE items SET 
      quantity_in_stock = v_new_stock,
      quantity_total = COALESCE(quantity_total, 0) + v_item.quantity,
      unit_price = COALESCE(v_item.unit_price, unit_price),
      updated_at = now()
    WHERE id = v_item.item_id;

    -- Update warehouse_stock if warehouse is specified
    IF v_warehouse_id IS NOT NULL THEN
      INSERT INTO warehouse_stock (warehouse_id, item_id, tenant_id, quantity, minimum_stock, last_transaction_id)
      VALUES (v_warehouse_id, v_item.item_id, p_tenant_id, v_item.quantity, 0, v_transaction_id)
      ON CONFLICT (warehouse_id, item_id) DO UPDATE
      SET quantity = warehouse_stock.quantity + v_item.quantity,
          last_transaction_id = v_transaction_id,
          last_updated = now();
    END IF;

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
$$;

-- =============================================
-- Update create_outbound_transaction to support warehouse_stock
-- =============================================
CREATE OR REPLACE FUNCTION public.create_outbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_recipient_signature text DEFAULT NULL,
  p_documents text[] DEFAULT NULL,
  p_photos text[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_from_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_warehouse_id uuid;
  v_warehouse_stock_qty integer;
  v_warehouse_name text;
BEGIN
  -- Determine warehouse: use provided or get default
  v_warehouse_id := p_from_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE tenant_id = p_tenant_id 
      AND hotel_id = p_hotel_id 
      AND is_default = true 
      AND is_active = true
    LIMIT 1;
  END IF;

  -- Get warehouse name for error messages
  IF v_warehouse_id IS NOT NULL THEN
    SELECT name INTO v_warehouse_name FROM warehouses WHERE id = v_warehouse_id;
  END IF;

  -- Generate unique transaction code
  LOOP
    v_transaction_code := 'OUT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    
    SELECT EXISTS(SELECT 1 FROM inventory_transactions WHERE transaction_code = v_transaction_code)
    INTO v_code_exists;
    
    IF NOT v_code_exists THEN
      EXIT;
    END IF;
    
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= v_max_retries THEN
      v_transaction_code := 'OUT-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  -- First pass: validate all items have sufficient stock (both total and warehouse-specific)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, notes text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id;
    
    IF v_item_data IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item.item_id;
    END IF;
    
    -- Check total stock
    IF COALESCE(v_item_data.quantity_in_stock, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for item: %. Available: %, Requested: %', 
        v_item_data.name, COALESCE(v_item_data.quantity_in_stock, 0), v_item.quantity;
    END IF;

    -- Check warehouse-specific stock if warehouse is specified
    IF v_warehouse_id IS NOT NULL THEN
      SELECT COALESCE(quantity, 0) INTO v_warehouse_stock_qty
      FROM warehouse_stock
      WHERE warehouse_id = v_warehouse_id AND item_id = v_item.item_id;

      IF COALESCE(v_warehouse_stock_qty, 0) < v_item.quantity THEN
        RAISE EXCEPTION 'Không đủ hàng trong kho "%" cho sản phẩm "%". Tồn kho: %, Yêu cầu: %', 
          COALESCE(v_warehouse_name, 'Unknown'), v_item_data.name, COALESCE(v_warehouse_stock_qty, 0), v_item.quantity;
      END IF;
    END IF;
  END LOOP;

  -- Second pass: process transactions
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, notes text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id;
    
    v_current_stock := COALESCE(v_item_data.quantity_in_stock, 0);
    v_new_stock := v_current_stock - v_item.quantity;
    v_unit_price := COALESCE(v_item_data.unit_price, 0);
    v_total_value := v_item.quantity * v_unit_price;

    -- Insert transaction record with warehouse reference
    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      unit_price, total_value,
      from_location, to_location, from_warehouse_id, created_by,
      related_type, related_id, documents, photos, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_transaction_code, 'out', p_transaction_category,
      v_item.item_id, v_item.quantity, v_current_stock, v_new_stock,
      v_unit_price, v_total_value,
      p_from_location, p_to_location, v_warehouse_id, p_created_by,
      p_related_type, p_related_id, p_documents, p_photos, 
      COALESCE(v_item.notes, p_notes)
    )
    RETURNING id INTO v_transaction_id;

    v_transaction_ids := array_append(v_transaction_ids, v_transaction_id);

    -- Update item total quantities
    UPDATE items SET 
      quantity_in_stock = v_new_stock,
      updated_at = now()
    WHERE id = v_item.item_id;

    -- Update warehouse_stock if warehouse is specified
    IF v_warehouse_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity = quantity - v_item.quantity,
          last_transaction_id = v_transaction_id,
          last_updated = now()
      WHERE warehouse_id = v_warehouse_id AND item_id = v_item.item_id;
    END IF;

    -- Check for low stock warning
    IF v_new_stock <= COALESCE(v_item_data.minimum_stock, 0) THEN
      v_low_stock_items := array_append(v_low_stock_items, v_item_data.name);
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'transaction_ids', to_jsonb(v_transaction_ids),
    'total_items', array_length(v_transaction_ids, 1),
    'low_stock_items', to_jsonb(v_low_stock_items)
  );

  RETURN v_result;
END;
$$;