-- Tạo RPC mới cho việc nhập kho từ giặt
-- Logic: Chỉ cộng quantity_in_stock, trừ quantity_in_laundry, KHÔNG đổi quantity_total

CREATE OR REPLACE FUNCTION public.create_laundry_return_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_code text;
  v_item jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_current_stock integer;
  v_current_laundry integer;
  v_unit_price numeric;
  v_new_stock integer;
  v_new_laundry integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Generate transaction code
  v_transaction_code := 'LR-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    
    -- Get current item data
    SELECT quantity_in_stock, quantity_in_laundry, unit_price
    INTO v_current_stock, v_current_laundry, v_unit_price
    FROM items
    WHERE id = v_item_id;
    
    -- Calculate new values
    v_new_stock := COALESCE(v_current_stock, 0) + v_quantity;
    v_new_laundry := GREATEST(0, COALESCE(v_current_laundry, 0) - v_quantity);
    
    -- Update item inventory (KHÔNG đổi quantity_total)
    UPDATE items
    SET 
      quantity_in_stock = v_new_stock,
      quantity_in_laundry = v_new_laundry,
      updated_at = now()
    WHERE id = v_item_id;
    
    -- Create transaction record
    INSERT INTO inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_code,
      transaction_type,
      transaction_category,
      quantity,
      quantity_before,
      quantity_after,
      unit_price,
      total_value,
      from_location,
      to_location,
      related_type,
      related_id,
      notes,
      created_by,
      transaction_date
    ) VALUES (
      p_tenant_id,
      p_hotel_id,
      v_item_id,
      v_transaction_code,
      'in',
      'return',
      v_quantity,
      v_current_stock,
      v_new_stock,
      v_unit_price,
      v_quantity * COALESCE(v_unit_price, 0),
      p_from_location,
      p_to_location,
      'laundry_batch',
      p_related_id,
      COALESCE(p_notes, 'Nhập kho từ giặt'),
      p_created_by,
      now()
    );
    
    -- Add to results
    v_results := v_results || jsonb_build_object(
      'item_id', v_item_id,
      'quantity', v_quantity,
      'new_stock', v_new_stock,
      'new_laundry', v_new_laundry
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'items_processed', v_results
  );
END;
$$;