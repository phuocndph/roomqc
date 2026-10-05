-- ============================================
-- INVENTORY MANAGEMENT FUNCTIONS
-- ============================================

-- Function: Get inventory dashboard stats
create or replace function get_inventory_dashboard_stats(p_tenant_id uuid, p_hotel_id uuid)
returns jsonb as $$
declare
  v_result jsonb;
begin
  with current_stats as (
    select 
      coalesce(sum(quantity_in_stock * unit_price), 0) as total_stock_value,
      coalesce(sum(quantity_in_stock), 0) as total_items_count,
      count(distinct id) as total_product_types,
      count(*) filter (where quantity_in_stock < minimum_stock) as low_stock_count,
      count(*) filter (where quantity_in_stock <= reorder_point) as reorder_needed_count
    from items
    where tenant_id = p_tenant_id
      and hotel_id = p_hotel_id
      and status = 'active'
  ),
  today_transactions as (
    select 
      count(*) as total_transactions,
      count(*) filter (where transaction_type = 'out') as out_count,
      count(*) filter (where transaction_type = 'in') as in_count
    from inventory_transactions
    where tenant_id = p_tenant_id
      and hotel_id = p_hotel_id
      and date(created_at) = current_date
  ),
  monthly_inbound as (
    select 
      coalesce(sum(total_value), 0) as value_in_this_month
    from inventory_transactions
    where tenant_id = p_tenant_id
      and hotel_id = p_hotel_id
      and transaction_type = 'in'
      and date_trunc('month', created_at) = date_trunc('month', now())
  ),
  last_month_inbound as (
    select 
      coalesce(sum(total_value), 0) as value_in_last_month
    from inventory_transactions
    where tenant_id = p_tenant_id
      and hotel_id = p_hotel_id
      and transaction_type = 'in'
      and date_trunc('month', created_at) = date_trunc('month', now() - interval '1 month')
  ),
  last_month_stock_value as (
    select 
      coalesce(sum(quantity_in_stock * unit_price), 0) as value_last_month
    from items
    where tenant_id = p_tenant_id
      and hotel_id = p_hotel_id
      and status = 'active'
      and updated_at < date_trunc('month', now())
  )
  select jsonb_build_object(
    'total_stock_value', (select total_stock_value from current_stats),
    'stock_value_change_percent', 
      case 
        when (select value_last_month from last_month_stock_value) = 0 then null
        else round(
          (((select total_stock_value from current_stats) - (select value_last_month from last_month_stock_value)) * 100.0) / 
          nullif((select value_last_month from last_month_stock_value), 0),
          2
        )
      end,
    'total_items_count', (select total_items_count from current_stats),
    'total_product_types', (select total_product_types from current_stats),
    'low_stock_count', (select low_stock_count from current_stats),
    'reorder_needed_count', (select reorder_needed_count from current_stats),
    'today_transactions', jsonb_build_object(
      'total', (select total_transactions from today_transactions),
      'in', (select in_count from today_transactions),
      'out', (select out_count from today_transactions)
    ),
    'value_in_this_month', (select value_in_this_month from monthly_inbound),
    'value_in_last_month', (select value_in_last_month from last_month_inbound),
    'inbound_change_percent',
      case 
        when (select value_in_last_month from last_month_inbound) = 0 then null
        else round(
          (((select value_in_this_month from monthly_inbound) - (select value_in_last_month from last_month_inbound)) * 100.0) / 
          nullif((select value_in_last_month from last_month_inbound), 0),
          2
        )
      end
  ) into v_result;
  
  return v_result;
end;
$$ language plpgsql stable security definer;

-- Function: Get low stock items
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
    i.images
  from items i
  left join item_categories c on c.id = i.category_id
  where i.tenant_id = p_tenant_id
    and i.hotel_id = p_hotel_id
    and i.status = 'active'
    and i.quantity_in_stock < i.minimum_stock
  order by 
    (i.minimum_stock - i.quantity_in_stock) desc,
    i.quantity_in_stock asc
  limit p_limit;
end;
$$ language plpgsql stable security definer;

-- Function: Get inventory transactions with filters
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
      i.images as item_images,
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

-- Function: Get inventory value over time
create or replace function get_inventory_value_over_time(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_months integer default 12
)
returns table (
  month date,
  stock_value numeric,
  value_in numeric,
  value_out numeric
) as $$
begin
  return query
  with months_range as (
    select generate_series(
      date_trunc('month', now()) - (p_months || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    )::date as month
  )
  select 
    mr.month,
    coalesce(
      (select sum(quantity_in_stock * unit_price)
       from items
       where tenant_id = p_tenant_id
         and hotel_id = p_hotel_id
         and status = 'active'
         and created_at <= mr.month + interval '1 month'
      ),
      0
    ) as stock_value,
    coalesce(
      sum(t.total_value) filter (where t.transaction_type = 'in'),
      0
    ) as value_in,
    coalesce(
      sum(t.total_value) filter (where t.transaction_type = 'out'),
      0
    ) as value_out
  from months_range mr
  left join inventory_transactions t on 
    date_trunc('month', t.created_at) = mr.month and
    t.tenant_id = p_tenant_id and
    t.hotel_id = p_hotel_id
  group by mr.month
  order by mr.month;
end;
$$ language plpgsql stable security definer;

-- Function: Create inbound transaction
create or replace function create_inbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_type text default null,
  p_related_id uuid default null,
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
  v_total_items integer := 0;
  v_total_value numeric := 0;
begin
  for v_item in 
    select * from jsonb_to_recordset(p_items) as x(
      item_id uuid,
      quantity integer,
      unit_price numeric,
      notes text
    )
  loop
    select quantity_in_stock into v_current_stock
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
      'in',
      p_transaction_category,
      v_item.quantity,
      v_item.unit_price,
      v_item.quantity * v_item.unit_price,
      v_current_stock,
      v_current_stock + v_item.quantity,
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
    set 
      quantity_in_stock = quantity_in_stock + v_item.quantity,
      quantity_total = quantity_total + v_item.quantity
    where id = v_item.item_id;
    
    v_total_items := v_total_items + 1;
    v_total_value := v_total_value + (v_item.quantity * v_item.unit_price);
  end loop;
  
  return jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'transaction_code', v_transaction_code,
    'total_items', v_total_items,
    'total_value', v_total_value
  );
  
exception when others then
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$$ language plpgsql security definer;

-- Function: Create outbound transaction
create or replace function create_outbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
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
      'out',
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

-- Function: Get stock adjustments with filters
create or replace function get_stock_adjustments_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid default null,
  p_status text default null,
  p_adjustment_type text default null,
  p_created_by uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  adjustment_code text,
  adjustment_type text,
  status text,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_by_name text,
  assigned_to uuid[],
  assigned_to_names text[],
  total_items_checked integer,
  total_discrepancies integer,
  total_value_difference numeric,
  approved_by uuid,
  approved_by_name text,
  notes text,
  total_count bigint
) as $$
begin
  return query
  with filtered_adjustments as (
    select 
      sa.id,
      sa.adjustment_code,
      sa.adjustment_type,
      sa.status,
      sa.scheduled_date,
      sa.started_at,
      sa.completed_at,
      sa.created_by,
      cu.full_name as created_by_name,
      sa.assigned_to,
      array(
        select u.full_name 
        from users u 
        where u.id = any(sa.assigned_to)
      ) as assigned_to_names,
      sa.total_items_checked,
      sa.total_discrepancies,
      sa.total_value_difference,
      sa.approved_by,
      au.full_name as approved_by_name,
      sa.notes
    from stock_adjustments sa
    left join users cu on cu.id = sa.created_by
    left join users au on au.id = sa.approved_by
    where sa.tenant_id = p_tenant_id
      and (p_hotel_id is null or sa.hotel_id = p_hotel_id)
      and (p_status is null or sa.status = p_status)
      and (p_adjustment_type is null or sa.adjustment_type = p_adjustment_type)
      and (p_created_by is null or sa.created_by = p_created_by)
      and (p_date_from is null or sa.scheduled_date >= p_date_from)
      and (p_date_to is null or sa.scheduled_date <= p_date_to)
  )
  select 
    fa.*,
    count(*) over() as total_count
  from filtered_adjustments fa
  order by fa.scheduled_date desc, fa.created_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql stable security definer;

-- Function: Create stock adjustment
create or replace function create_stock_adjustment(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_adjustment_type text,
  p_scheduled_date date,
  p_created_by uuid,
  p_assigned_to uuid[],
  p_item_ids uuid[],
  p_notes text default null
)
returns jsonb as $$
declare
  v_adjustment_id uuid;
  v_adjustment_code text;
  v_item_id uuid;
  v_system_quantity integer;
  v_unit_price numeric;
begin
  insert into stock_adjustments (
    tenant_id,
    hotel_id,
    adjustment_type,
    scheduled_date,
    created_by,
    assigned_to,
    status,
    notes
  ) values (
    p_tenant_id,
    p_hotel_id,
    p_adjustment_type,
    p_scheduled_date,
    p_created_by,
    p_assigned_to,
    'draft',
    p_notes
  )
  returning id, adjustment_code into v_adjustment_id, v_adjustment_code;
  
  foreach v_item_id in array p_item_ids
  loop
    select quantity_in_stock, unit_price 
    into v_system_quantity, v_unit_price
    from items
    where id = v_item_id;
    
    insert into stock_adjustment_items (
      adjustment_id,
      item_id,
      system_quantity,
      actual_quantity,
      unit_price,
      status
    ) values (
      v_adjustment_id,
      v_item_id,
      v_system_quantity,
      v_system_quantity,
      v_unit_price,
      'pending'
    );
  end loop;
  
  return jsonb_build_object(
    'success', true,
    'adjustment_id', v_adjustment_id,
    'adjustment_code', v_adjustment_code,
    'total_items', array_length(p_item_ids, 1)
  );
  
exception when others then
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$$ language plpgsql security definer;