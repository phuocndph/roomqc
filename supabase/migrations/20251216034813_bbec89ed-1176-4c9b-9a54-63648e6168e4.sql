-- Tạo RPC để xử lý items mất/hỏng từ laundry
-- Logic: trừ quantity_in_laundry, cộng quantity_lost/damaged, trừ quantity_total

CREATE OR REPLACE FUNCTION public.create_laundry_loss_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_loss_type text, -- 'lost' hoặc 'damaged'
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
  v_current_laundry integer;
  v_current_lost integer;
  v_current_damaged integer;
  v_current_total integer;
  v_unit_price numeric;
  v_new_laundry integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Generate transaction code
  v_transaction_code := 'LL-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    
    -- Get current item data
    SELECT quantity_in_laundry, quantity_lost, quantity_damaged, quantity_total, unit_price
    INTO v_current_laundry, v_current_lost, v_current_damaged, v_current_total, v_unit_price
    FROM items
    WHERE id = v_item_id;
    
    -- Calculate new laundry value
    v_new_laundry := GREATEST(0, COALESCE(v_current_laundry, 0) - v_quantity);
    
    -- Update item inventory based on loss type
    IF p_loss_type = 'lost' THEN
      UPDATE items
      SET 
        quantity_in_laundry = v_new_laundry,
        quantity_lost = COALESCE(quantity_lost, 0) + v_quantity,
        quantity_total = COALESCE(quantity_total, 0) - v_quantity,
        updated_at = now()
      WHERE id = v_item_id;
    ELSE -- damaged
      UPDATE items
      SET 
        quantity_in_laundry = v_new_laundry,
        quantity_damaged = COALESCE(quantity_damaged, 0) + v_quantity,
        quantity_total = COALESCE(quantity_total, 0) - v_quantity,
        updated_at = now()
      WHERE id = v_item_id;
    END IF;
    
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
      'out',
      'laundry',
      v_quantity,
      v_current_laundry,
      v_new_laundry,
      v_unit_price,
      v_quantity * COALESCE(v_unit_price, 0),
      'Đơn vị giặt',
      CASE WHEN p_loss_type = 'lost' THEN 'Mất mát' ELSE 'Hư hỏng' END,
      'laundry_batch',
      p_related_id,
      COALESCE(p_notes, 'Items ' || p_loss_type || ' từ giặt'),
      p_created_by,
      now()
    );
    
    -- Add to results
    v_results := v_results || jsonb_build_object(
      'item_id', v_item_id,
      'quantity', v_quantity,
      'loss_type', p_loss_type,
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