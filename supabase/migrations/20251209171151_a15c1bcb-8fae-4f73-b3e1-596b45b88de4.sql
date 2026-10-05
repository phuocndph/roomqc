-- Drop and recreate the create_outbound_transaction function to properly update item quantities
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
SET search_path = public
AS $$
declare
  v_item record;
  v_transaction_id uuid;
  v_transaction_code text;
  v_current_stock integer;
  v_unit_price numeric;
  v_item_name text;
  v_total_items integer := 0;
  v_total_value numeric := 0;
  v_low_stock_items text[] := array[]::text[];
  v_min_stock integer;
  v_quantity_total integer;
begin
  -- First pass: validate all items have sufficient stock
  for v_item in 
    select * from jsonb_to_recordset(p_items) as x(
      item_id uuid,
      quantity integer,
      notes text
    )
  loop
    select quantity_in_stock, name into v_current_stock, v_item_name
    from items
    where id = v_item.item_id;
    
    if v_current_stock is null then
      return jsonb_build_object(
        'success', false,
        'error', 'Không tìm thấy đồ dùng'
      );
    end if;
    
    if v_current_stock < v_item.quantity then
      return jsonb_build_object(
        'success', false,
        'error', format('Không đủ tồn kho cho %s (có: %s, cần: %s)', v_item_name, v_current_stock, v_item.quantity)
      );
    end if;
  end loop;
  
  -- Second pass: create transactions and update quantities
  for v_item in 
    select * from jsonb_to_recordset(p_items) as x(
      item_id uuid,
      quantity integer,
      notes text
    )
  loop
    select quantity_in_stock, quantity_total, unit_price, name, minimum_stock
    into v_current_stock, v_quantity_total, v_unit_price, v_item_name, v_min_stock
    from items
    where id = v_item.item_id;
    
    -- Create the transaction record
    insert into inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_type,
      transaction_category,
      quantity,
      unit_price,
      total_value,
      quantity_before,
      quantity_after,
      from_location,
      to_location,
      created_by,
      related_type,
      related_id,
      documents,
      photos,
      notes
    ) values (
      p_tenant_id,
      p_hotel_id,
      v_item.item_id,
      'out',
      p_transaction_category,
      v_item.quantity,
      v_unit_price,
      v_item.quantity * coalesce(v_unit_price, 0),
      v_current_stock,
      v_current_stock - v_item.quantity,
      p_from_location,
      p_to_location,
      p_created_by,
      p_related_type,
      p_related_id,
      p_documents,
      p_photos,
      coalesce(v_item.notes, p_notes)
    )
    returning id, transaction_code into v_transaction_id, v_transaction_code;
    
    -- Update item quantities based on transaction category
    if p_transaction_category = 'room_assign' then
      -- Moving from stock to in_use
      update items
      set quantity_in_stock = quantity_in_stock - v_item.quantity,
          quantity_in_use = quantity_in_use + v_item.quantity
      where id = v_item.item_id;
    elsif p_transaction_category = 'laundry' then
      -- Moving from stock to laundry
      update items
      set quantity_in_stock = quantity_in_stock - v_item.quantity,
          quantity_in_laundry = quantity_in_laundry + v_item.quantity
      where id = v_item.item_id;
    elsif p_transaction_category = 'disposal' then
      -- Disposing items - reduce total
      update items
      set quantity_in_stock = quantity_in_stock - v_item.quantity,
          quantity_total = quantity_total - v_item.quantity
      where id = v_item.item_id;
    elsif p_transaction_category = 'maintenance' then
      -- Moving to maintenance (damaged)
      update items
      set quantity_in_stock = quantity_in_stock - v_item.quantity,
          quantity_damaged = quantity_damaged + v_item.quantity
      where id = v_item.item_id;
    else
      -- Default: just reduce stock and total for 'other'
      update items
      set quantity_in_stock = quantity_in_stock - v_item.quantity,
          quantity_total = quantity_total - v_item.quantity
      where id = v_item.item_id;
    end if;
    
    v_total_items := v_total_items + 1;
    v_total_value := v_total_value + (v_item.quantity * coalesce(v_unit_price, 0));
    
    -- Check for low stock warning
    if (v_current_stock - v_item.quantity) < coalesce(v_min_stock, 0) then
      v_low_stock_items := array_append(v_low_stock_items, v_item_name);
    end if;
  end loop;
  
  return jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'transaction_code', v_transaction_code,
    'total_items', v_total_items,
    'total_value', v_total_value,
    'low_stock_items', v_low_stock_items
  );
  
exception when others then
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$$;