-- ============================================
-- ITEMS MANAGEMENT FUNCTIONS
-- ============================================

-- Function: Get items with filters and pagination
create or replace function get_items_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid default null,
  p_category_id uuid default null,
  p_stock_status text default null,
  p_status text default 'active',
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  code text,
  name text,
  name_en text,
  thumbnail text,
  category_id uuid,
  category_name text,
  category_color text,
  unit text,
  unit_price numeric,
  quantity_total integer,
  quantity_in_stock integer,
  quantity_in_use integer,
  quantity_in_laundry integer,
  quantity_damaged integer,
  quantity_lost integer,
  minimum_stock integer,
  stock_status text,
  qr_code text,
  status text,
  created_at timestamptz,
  total_count bigint
) as $$
begin
  return query
  with filtered_items as (
    select 
      i.id,
      i.code,
      i.name,
      i.name_en,
      i.images[1] as thumbnail,
      i.category_id,
      c.name as category_name,
      c.color as category_color,
      i.unit,
      i.unit_price,
      i.quantity_total,
      i.quantity_in_stock,
      i.quantity_in_use,
      i.quantity_in_laundry,
      i.quantity_damaged,
      i.quantity_lost,
      i.minimum_stock,
      case
        when i.quantity_in_stock = 0 then 'out_of_stock'
        when i.quantity_in_stock < i.minimum_stock then 'low_stock'
        else 'in_stock'
      end as stock_status,
      i.qr_code,
      i.status,
      i.created_at
    from items i
    left join item_categories c on c.id = i.category_id
    where i.tenant_id = p_tenant_id
      and (p_hotel_id is null or i.hotel_id = p_hotel_id)
      and (p_category_id is null or i.category_id = p_category_id)
      and (p_status is null or i.status = p_status)
      and (
        p_search is null or
        i.name ilike '%' || p_search || '%' or
        i.code ilike '%' || p_search || '%' or
        i.name_en ilike '%' || p_search || '%'
      )
  )
  select 
    fi.*,
    count(*) over() as total_count
  from filtered_items fi
  where (
    p_stock_status is null or
    fi.stock_status = p_stock_status
  )
  order by fi.created_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql stable security definer;

-- Function: Get item detail with history
create or replace function get_item_detail(p_item_id uuid)
returns jsonb as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'item', row_to_json(i.*),
    'category', row_to_json(c.*),
    'hotel', row_to_json(h.*),
    'recent_transactions', (
      select jsonb_agg(row_to_json(t.*))
      from (
        select 
          it.id,
          it.transaction_type,
          it.transaction_category,
          it.quantity,
          it.from_location,
          it.to_location,
          it.notes,
          it.transaction_date,
          u.full_name as created_by_name
        from inventory_transactions it
        left join users u on u.id = it.created_by
        where it.item_id = p_item_id
        order by it.transaction_date desc
        limit 20
      ) t
    ),
    'room_allocations', (
      select jsonb_agg(row_to_json(ra.*))
      from (
        select 
          ri.id,
          ri.quantity,
          ri.condition,
          ri.assigned_at,
          r.room_number,
          r.floor,
          r.room_type
        from room_items ri
        join rooms r on r.id = ri.room_id
        where ri.item_id = p_item_id
        order by ri.assigned_at desc
      ) ra
    )
  ) into v_result
  from items i
  left join item_categories c on c.id = i.category_id
  left join hotels h on h.id = i.hotel_id
  where i.id = p_item_id;
  
  return v_result;
end;
$$ language plpgsql stable security definer;

-- Function: Get categories with stats
create or replace function get_categories_with_stats(p_tenant_id uuid)
returns table (
  id uuid,
  name text,
  name_en text,
  description text,
  icon text,
  color text,
  sort_order integer,
  items_count bigint,
  total_value numeric
) as $$
begin
  return query
  select 
    c.id,
    c.name,
    c.name_en,
    c.description,
    c.icon,
    c.color,
    c.sort_order,
    count(i.id) as items_count,
    coalesce(sum(i.quantity_total * i.unit_price), 0) as total_value
  from item_categories c
  left join items i on i.category_id = c.id and i.status = 'active'
  where c.tenant_id = p_tenant_id
  group by c.id
  order by c.sort_order, c.name;
end;
$$ language plpgsql stable security definer;

-- Function: Bulk delete items
create or replace function bulk_delete_items(
  p_item_ids uuid[],
  p_user_id uuid
)
returns jsonb as $$
declare
  v_deleted_count integer := 0;
  v_failed_count integer := 0;
  v_errors text[] := '{}';
  v_item_id uuid;
begin
  foreach v_item_id in array p_item_ids loop
    begin
      -- Check if item is in use
      if exists (
        select 1 from items 
        where id = v_item_id 
        and (quantity_in_use > 0 or quantity_in_laundry > 0)
      ) then
        v_failed_count := v_failed_count + 1;
        v_errors := array_append(v_errors, 'Item ' || v_item_id || ' is in use');
      else
        -- Soft delete
        update items set 
          status = 'discontinued',
          updated_at = now()
        where id = v_item_id;
        
        v_deleted_count := v_deleted_count + 1;
      end if;
    exception when others then
      v_failed_count := v_failed_count + 1;
      v_errors := array_append(v_errors, SQLERRM);
    end;
  end loop;
  
  return jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'failed_count', v_failed_count,
    'errors', v_errors
  );
end;
$$ language plpgsql security definer;