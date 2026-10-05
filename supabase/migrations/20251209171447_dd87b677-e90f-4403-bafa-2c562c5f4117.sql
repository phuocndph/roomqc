-- Drop all versions of the function first
DROP FUNCTION IF EXISTS public.create_outbound_transaction(uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text, text, text[], text[], text);
DROP FUNCTION IF EXISTS public.create_outbound_transaction(uuid, uuid, text, text, text, uuid, jsonb, text, text, uuid, text, text, text[], text[], text);

-- Recreate the function with correct signature
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
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  -- Generate transaction code
  v_transaction_code := 'OUT-' || to_char(now(), 'YYYYMMDD') || '-' || 
    lpad((floor(random() * 10000)::integer)::text, 4, '0');

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

    -- Insert transaction record
    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      from_location, to_location, created_by,
      related_type, related_id, documents, photos, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_transaction_code, 'out', p_transaction_category,
      v_item.item_id, v_item.quantity, v_current_stock, v_new_stock,
      p_from_location, p_to_location, p_created_by,
      p_related_type, p_related_id, p_documents, p_photos, 
      COALESCE(v_item.notes, p_notes)
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
$$;