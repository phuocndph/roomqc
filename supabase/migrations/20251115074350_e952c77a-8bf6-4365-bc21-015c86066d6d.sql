-- Fix RPC functions to get images from item_images table instead of non-existent i.images column

-- Fix get_low_stock_items function
create or replace function get_low_stock_items(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  code text,
  name text,
  category_id uuid,
  category_name text,
  quantity_in_stock integer,
  minimum_stock integer,
  reorder_point integer,
  shortage integer,
  shortage_percent numeric,
  unit_price numeric,
  images text[]
) as $$
begin
  return query
  select 
    i.id,
    i.code,
    i.name,
    i.category_id,
    c.name as category_name,
    i.quantity_in_stock,
    i.minimum_stock,
    i.reorder_point,
    (i.minimum_stock - i.quantity_in_stock) as shortage,
    round(
      ((i.minimum_stock - i.quantity_in_stock)::numeric / nullif(i.minimum_stock, 0)::numeric) * 100,
      2
    ) as shortage_percent,
    i.unit_price,
    array_agg(ii.url order by ii.display_order) filter (where ii.url is not null) as images
  from items i
  left join item_categories c on c.id = i.category_id
  left join item_images ii on ii.item_id = i.id
  where i.tenant_id = p_tenant_id
    and i.hotel_id = p_hotel_id
    and i.status = 'active'
    and i.quantity_in_stock < i.minimum_stock
  group by i.id, i.code, i.name, i.category_id, c.name, i.quantity_in_stock, 
           i.minimum_stock, i.reorder_point, i.unit_price
  order by 
    (i.minimum_stock - i.quantity_in_stock) desc,
    i.quantity_in_stock asc
  limit p_limit;
end;
$$ language plpgsql stable security definer;

-- Fix get_inventory_transactions_filtered function
create or replace function get_inventory_transactions_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid default null,
  p_transaction_type text default null,
  p_category_id uuid default null,
  p_created_by uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  transaction_code text,
  transaction_type text,
  transaction_category text,
  item_id uuid,
  item_name text,
  item_code text,
  item_images text[],
  category_name text,
  quantity integer,
  unit_price numeric,
  total_value numeric,
  quantity_before integer,
  quantity_after integer,
  from_location text,
  to_location text,
  created_by uuid,
  created_by_name text,
  created_by_avatar text,
  created_at timestamptz,
  notes text,
  total_count bigint
) as $$
begin
  return query
  with filtered_transactions as (
    select 
      t.id,
      t.transaction_code,
      t.transaction_type,
      t.transaction_category,
      t.item_id,
      i.name as item_name,
      i.code as item_code,
      array_agg(ii.url order by ii.display_order) filter (where ii.url is not null) as item_images,
      c.name as category_name,
      t.quantity,
      t.unit_price,
      t.total_value,
      t.quantity_before,
      t.quantity_after,
      t.from_location,
      t.to_location,
      t.created_by,
      u.full_name as created_by_name,
      u.avatar_url as created_by_avatar,
      t.created_at,
      t.notes
    from inventory_transactions t
    join items i on i.id = t.item_id
    left join item_images ii on ii.item_id = i.id
    left join item_categories c on c.id = i.category_id
    left join users u on u.id = t.created_by
    where t.tenant_id = p_tenant_id
      and (p_hotel_id is null or t.hotel_id = p_hotel_id)
      and (p_transaction_type is null or t.transaction_type = p_transaction_type)
      and (p_category_id is null or i.category_id = p_category_id)
      and (p_created_by is null or t.created_by = p_created_by)
      and (p_date_from is null or t.created_at::date >= p_date_from)
      and (p_date_to is null or t.created_at::date <= p_date_to)
      and (
        p_search is null or
        t.transaction_code ilike '%' || p_search || '%' or
        i.name ilike '%' || p_search || '%' or
        i.code ilike '%' || p_search || '%'
      )
    group by t.id, t.transaction_code, t.transaction_type, t.transaction_category,
             t.item_id, i.name, i.code, c.name, t.quantity, t.unit_price,
             t.total_value, t.quantity_before, t.quantity_after,
             t.from_location, t.to_location, t.created_by,
             u.full_name, u.avatar_url, t.created_at, t.notes
  )
  select 
    ft.*,
    count(*) over() as total_count
  from filtered_transactions ft
  order by ft.created_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql stable security definer;