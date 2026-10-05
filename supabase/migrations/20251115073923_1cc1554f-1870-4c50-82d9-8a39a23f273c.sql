-- Add transaction_type parameter to create_outbound_transaction function
-- This allows specifying 'lost' or 'damaged' instead of hardcoded 'out'

drop function if exists create_outbound_transaction(uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text, text, text[], text[], text);

create or replace function create_outbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_transaction_type text default 'out',
  p_related_type text default null,
  p_related_id uuid default null,
  p_recipient_name text default null,
  p_recipient_signature text default null,
  p_documents text[] default null,
  p_photos text[] default null,
  p_notes text default null
)
returns jsonb as $$
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
begin
  -- Validate transaction_type
  if p_transaction_type not in ('out', 'lost', 'damaged') then
    raise exception 'Invalid transaction_type. Must be: out, lost, or damaged';
  end if;

  for v_item in 
    select * from jsonb_to_recordset(p_items) as x(
      item_id uuid,
      quantity integer,
      notes text
    )
  loop
    select quantity_in_stock, unit_price into v_current_stock, v_unit_price
    from items
    where id = v_item.item_id;
    
    if v_current_stock < v_item.quantity then
      raise exception 'Insufficient stock for item %', v_item.item_id;
    end if;
  end loop;
  
  for v_item in 
    select * from jsonb_to_recordset(p_items) as x(
      item_id uuid,
      quantity integer,
      notes text
    )
  loop
    select quantity_in_stock, unit_price, name, minimum_stock
    into v_current_stock, v_unit_price, v_item_name, v_min_stock
    from items
    where id = v_item.item_id;
    
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
      p_transaction_type,
      p_transaction_category,
      v_item.quantity,
      v_unit_price,
      v_item.quantity * v_unit_price,
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
    
    update items
    set quantity_in_stock = quantity_in_stock - v_item.quantity
    where id = v_item.item_id;
    
    v_total_items := v_total_items + 1;
    v_total_value := v_total_value + (v_item.quantity * v_unit_price);
    
    if (v_current_stock - v_item.quantity) < v_min_stock then
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
$$ language plpgsql security definer;