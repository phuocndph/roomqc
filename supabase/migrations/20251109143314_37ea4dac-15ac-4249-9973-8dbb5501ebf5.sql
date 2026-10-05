-- ============================================
-- DASHBOARD ACTIVITIES VIEW
-- ============================================

-- Drop existing view if any
drop view if exists dashboard_activities cascade;

-- Create view to transform activity_logs to dashboard format
create or replace view dashboard_activities as
select 
  al.id,
  -- Map action + entity_type to activity type
  case 
    when al.action = 'create' and al.entity_type = 'item' then 'inventory_add'
    when al.action = 'delete' and al.entity_type = 'item' then 'inventory_remove'
    when al.action = 'create' and al.entity_type = 'inventory_transaction' 
         and (al.new_values->>'transaction_type')::text = 'in' then 'inventory_add'
    when al.action = 'create' and al.entity_type = 'inventory_transaction' 
         and (al.new_values->>'transaction_type')::text = 'out' then 'inventory_remove'
    when al.action = 'create' and al.entity_type = 'laundry_batch' then 'laundry_sent'
    when al.action = 'update' and al.entity_type = 'laundry_batch' 
         and (al.new_values->>'status')::text = 'received' then 'laundry_received'
    when al.action = 'create' and al.entity_type = 'room_check' then 'room_check'
    when al.action = 'create' and al.entity_type = 'maintenance_request' then 'maintenance'
    when al.entity_type = 'notification' 
         and (al.new_values->>'category')::text = 'inventory' then 'low_stock'
    else 'other'
  end as type,
  al.description,
  al.user_name,
  u.avatar_url as user_avatar,
  al.created_at,
  al.tenant_id,
  jsonb_build_object(
    'entity_type', al.entity_type,
    'entity_id', al.entity_id,
    'entity_name', al.entity_name,
    'action', al.action
  ) as metadata
from activity_logs al
left join users u on u.id = al.user_id
order by al.created_at desc;

-- Grant permissions
grant select on dashboard_activities to authenticated;

-- ============================================
-- MONTHLY EXPENSES MATERIALIZED VIEW
-- ============================================

-- Drop existing if any
drop materialized view if exists monthly_expenses cascade;

-- Create materialized view
create materialized view monthly_expenses as
select 
  date_trunc('month', date)::date as month,
  tenant_id,
  sum(case when source = 'purchase' then amount else 0 end) as purchase_amount,
  sum(case when source = 'laundry' then amount else 0 end) as laundry_amount,
  sum(case when source = 'maintenance' then amount else 0 end) as maintenance_amount,
  sum(amount) as total_amount
from (
  -- Purchase orders
  select 
    tenant_id,
    order_date::date as date,
    total_amount as amount,
    'purchase' as source
  from purchase_orders
  where status in ('received', 'partial')
    and order_date is not null
  
  union all
  
  -- Laundry batches
  select 
    tenant_id,
    coalesce(actual_return_date, expected_return_date, delivery_date)::date as date,
    coalesce(actual_cost, estimated_cost, 0) as amount,
    'laundry' as source
  from laundry_batches
  where status = 'received'
  
  union all
  
  -- Maintenance requests
  select 
    tenant_id,
    coalesce(completed_at, created_at)::date as date,
    coalesce(actual_cost, estimated_cost, 0) as amount,
    'maintenance' as source
  from maintenance_requests
  where status = 'completed'
) expenses
where date is not null
group by date_trunc('month', date), tenant_id;

-- Create indexes
create unique index idx_monthly_expenses_tenant_month 
  on monthly_expenses(tenant_id, month desc);

create index idx_monthly_expenses_month 
  on monthly_expenses(month desc);

-- Refresh function
create or replace function refresh_monthly_expenses()
returns void as $$
begin
  refresh materialized view concurrently monthly_expenses;
end;
$$ language plpgsql security definer;

-- Grant permissions
grant select on monthly_expenses to authenticated;

-- ============================================
-- DASHBOARD STATS FUNCTION
-- ============================================

create or replace function get_dashboard_stats(p_tenant_id uuid)
returns jsonb as $$
declare
  v_current_month_start date := date_trunc('month', now())::date;
  v_last_month_start date := (date_trunc('month', now()) - interval '1 month')::date;
  v_result jsonb;
begin
  with current_stats as (
    select 
      coalesce(sum(quantity_total * unit_price), 0) as total_value,
      coalesce(sum(quantity_total), 0) as total_items,
      coalesce(sum(quantity_in_stock), 0) as in_stock,
      coalesce(sum(quantity_in_use), 0) as in_use,
      coalesce(sum(quantity_in_laundry), 0) as in_laundry,
      count(*) filter (where quantity_in_stock < minimum_stock and status = 'active') as low_stock_count
    from items
    where tenant_id = p_tenant_id
      and status = 'active'
  ),
  last_month_value as (
    select coalesce(sum(quantity_before * unit_price), 0) as value
    from (
      select distinct on (item_id) 
        item_id,
        quantity_before,
        unit_price
      from inventory_transactions it
      join items i on i.id = it.item_id
      where it.tenant_id = p_tenant_id
        and it.transaction_date >= v_last_month_start
        and it.transaction_date < v_current_month_start
      order by item_id, transaction_date desc
    ) last_month_items
  ),
  laundry_batches_active as (
    select count(*) as active_batches
    from laundry_batches
    where tenant_id = p_tenant_id
      and status in ('delivered', 'washing', 'ready')
  )
  select jsonb_build_object(
    'total_value', (select total_value from current_stats),
    'total_value_last_month', (select value from last_month_value),
    'total_value_change_percent', 
      case 
        when (select value from last_month_value) = 0 then null
        else round(
          (((select total_value from current_stats) - (select value from last_month_value)) * 100.0) / 
          nullif((select value from last_month_value), 0),
          2
        )
      end,
    'total_items', (select total_items from current_stats),
    'in_stock', (select in_stock from current_stats),
    'in_use', (select in_use from current_stats),
    'in_laundry', (select in_laundry from current_stats),
    'low_stock_count', (select low_stock_count from current_stats),
    'active_laundry_batches', (select active_batches from laundry_batches_active)
  ) into v_result;
  
  return v_result;
end;
$$ language plpgsql stable security definer;

-- ============================================
-- GET MONTHLY EXPENSES FUNCTION
-- ============================================

create or replace function get_monthly_expenses(
  p_tenant_id uuid,
  p_months integer default 12
)
returns table (
  month text,
  purchase bigint,
  laundry bigint,
  maintenance bigint,
  total bigint
) as $$
begin
  return query
  with months_range as (
    select generate_series(
      date_trunc('month', now() - (p_months || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date as month
  )
  select 
    to_char(mr.month, 'Mon') as month,
    coalesce(me.purchase_amount, 0)::bigint as purchase,
    coalesce(me.laundry_amount, 0)::bigint as laundry,
    coalesce(me.maintenance_amount, 0)::bigint as maintenance,
    coalesce(me.total_amount, 0)::bigint as total
  from months_range mr
  left join monthly_expenses me on me.month = mr.month and me.tenant_id = p_tenant_id
  order by mr.month asc;
end;
$$ language plpgsql stable security definer;

-- ============================================
-- GET TOP ITEMS FUNCTION
-- ============================================

create or replace function get_top_items(
  p_tenant_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  code text,
  name text,
  thumbnail text,
  category_name text,
  category_color text,
  quantity_in_use integer,
  quantity_total integer,
  utilization_rate numeric,
  stock_status text
) as $$
begin
  return query
  select 
    i.id,
    i.code,
    i.name,
    i.images[1] as thumbnail,
    c.name as category_name,
    c.color as category_color,
    i.quantity_in_use,
    i.quantity_total,
    case 
      when i.quantity_total = 0 then 0
      else round((i.quantity_in_use::numeric / i.quantity_total::numeric) * 100, 2)
    end as utilization_rate,
    case
      when i.quantity_in_stock = 0 then 'out_of_stock'
      when i.quantity_in_stock < i.minimum_stock then 'low_stock'
      else 'in_stock'
    end as stock_status
  from items i
  left join item_categories c on c.id = i.category_id
  where i.tenant_id = p_tenant_id
    and i.status = 'active'
    and i.quantity_in_use > 0
  order by i.quantity_in_use desc
  limit p_limit;
end;
$$ language plpgsql stable security definer;

-- ============================================
-- GET RECENT ACTIVITIES FUNCTION
-- ============================================

create or replace function get_recent_activities(
  p_tenant_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  type text,
  description text,
  user_name text,
  user_avatar text,
  created_at timestamptz,
  metadata jsonb
) as $$
begin
  return query
  select 
    da.id,
    da.type,
    da.description,
    da.user_name,
    da.user_avatar,
    da.created_at,
    da.metadata
  from dashboard_activities da
  where da.tenant_id = p_tenant_id
  order by da.created_at desc
  limit p_limit;
end;
$$ language plpgsql stable security definer;