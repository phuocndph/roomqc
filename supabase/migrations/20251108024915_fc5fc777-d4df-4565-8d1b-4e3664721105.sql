-- ============================================
-- PART 4: HELPER FUNCTIONS, VIEWS & SEED DATA
-- ============================================

-- Helper function: Create default item categories for new tenant
create or replace function create_default_categories(p_tenant_id uuid)
returns void as $$
begin
  insert into item_categories (tenant_id, name, name_en, description, icon, color, sort_order)
  values
    (p_tenant_id, 'Đồ vải', 'Fabric & Linens', 'Khăn tắm, ga giường, chăn gối, rèm cửa...', 'shirt', '#3b82f6', 1),
    (p_tenant_id, 'Tiện nghi', 'Amenities', 'Bàn chải, dầu gội, sữa tắm, lược, dép...', 'sparkles', '#8b5cf6', 2),
    (p_tenant_id, 'Thiết bị điện', 'Electronics', 'Tivi, tủ lạnh, máy sấy, điều hòa...', 'tv', '#10b981', 3),
    (p_tenant_id, 'Nội thất', 'Furniture', 'Giường, tủ, bàn, ghế, gương...', 'sofa', '#f59e0b', 4),
    (p_tenant_id, 'Đồ vệ sinh', 'Cleaning Supplies', 'Xà phòng, giấy vệ sinh, túi rác...', 'spray', '#06b6d4', 5)
  on conflict do nothing;
end;
$$ language plpgsql security definer;

-- Setup function: Initialize new tenant with hotel and default data
create or replace function setup_new_tenant(
  p_tenant_id uuid,
  p_hotel_name text,
  p_hotel_address text,
  p_total_rooms integer,
  p_owner_user_id uuid
)
returns uuid as $$
declare
  v_hotel_id uuid;
begin
  insert into hotels (tenant_id, name, address, total_rooms)
  values (p_tenant_id, p_hotel_name, p_hotel_address, p_total_rooms)
  returning id into v_hotel_id;
  
  perform create_default_categories(p_tenant_id);
  
  update users set tenant_id = p_tenant_id, hotel_id = v_hotel_id, role = 'owner'
  where id = p_owner_user_id;
  
  insert into notifications (tenant_id, user_id, type, category, title, message)
  values (p_tenant_id, p_owner_user_id, 'success', 'system', 'Chào mừng đến với hệ thống!',
          'Tài khoản của bạn đã được tạo thành công. Hãy bắt đầu bằng cách thêm tài sản vào kho.');
  
  return v_hotel_id;
end;
$$ language plpgsql security definer;

-- Activity logging function
create or replace function log_activity(
  p_tenant_id uuid,
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_name text,
  p_description text,
  p_old_values jsonb default null,
  p_new_values jsonb default null
)
returns void as $$
declare
  v_user_name text;
  v_user_role text;
begin
  select full_name, role into v_user_name, v_user_role from users where id = p_user_id;
  
  insert into activity_logs (
    tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, 
    entity_name, description, old_values, new_values
  ) values (
    p_tenant_id, p_user_id, coalesce(v_user_name, 'Unknown'), v_user_role, p_action,
    p_entity_type, p_entity_id, p_entity_name, p_description, p_old_values, p_new_values
  );
end;
$$ language plpgsql security definer;

-- View: Dashboard statistics per hotel
create or replace view dashboard_stats as
select
  h.id as hotel_id,
  h.tenant_id,
  h.name as hotel_name,
  count(distinct i.id) as total_items,
  sum(i.quantity_total) as total_quantity,
  sum(i.quantity_total * i.unit_price) as total_inventory_value,
  sum(i.quantity_in_stock) as total_in_stock,
  sum(i.quantity_in_use) as total_in_use,
  sum(i.quantity_in_laundry) as total_in_laundry,
  sum(i.quantity_damaged) as total_damaged,
  count(distinct i.id) filter (where i.quantity_in_stock < i.minimum_stock) as low_stock_items_count,
  count(distinct r.id) as total_rooms,
  count(distinct r.id) filter (where r.status = 'vacant') as vacant_rooms,
  count(distinct r.id) filter (where r.status = 'occupied') as occupied_rooms,
  count(distinct r.id) filter (where r.status = 'cleaning') as cleaning_rooms,
  count(distinct r.id) filter (where r.status = 'maintenance') as maintenance_rooms,
  count(distinct lb.id) filter (where lb.status in ('delivered', 'washing', 'ready')) as active_laundry_batches,
  count(distinct mr.id) filter (where mr.status in ('pending', 'assigned', 'in_progress')) as pending_maintenance_requests
from hotels h
left join items i on i.hotel_id = h.id and i.status = 'active'
left join rooms r on r.hotel_id = h.id
left join laundry_batches lb on lb.hotel_id = h.id
left join maintenance_requests mr on mr.hotel_id = h.id
group by h.id, h.tenant_id, h.name;

-- View: Item availability with stock status
create or replace view item_availability as
select
  i.*,
  c.name as category_name,
  h.name as hotel_name,
  case
    when i.quantity_in_stock = 0 then 'out_of_stock'
    when i.quantity_in_stock < i.minimum_stock then 'low_stock'
    else 'available'
  end as stock_status,
  case
    when i.quantity_total = 0 then 0
    else round((i.quantity_in_use::decimal / i.quantity_total::decimal) * 100, 2)
  end as utilization_rate,
  case
    when i.max_wash_cycles is not null and i.max_wash_cycles > 0
    then round((i.current_wash_cycles::decimal / i.max_wash_cycles::decimal) * 100, 2)
    else null
  end as wash_cycle_progress
from items i
left join item_categories c on c.id = i.category_id
left join hotels h on h.id = i.hotel_id;

-- Performance indexes
create index if not exists idx_items_hotel_category on items(hotel_id, category_id) where status = 'active';
create index if not exists idx_items_low_stock on items(hotel_id) where quantity_in_stock < minimum_stock and status = 'active';
create index if not exists idx_rooms_hotel_status on rooms(hotel_id, status);
create index if not exists idx_laundry_batches_hotel_status on laundry_batches(hotel_id, status);
create index if not exists idx_maintenance_requests_hotel_status on maintenance_requests(hotel_id, status);
create index if not exists idx_inventory_transactions_item_date on inventory_transactions(item_id, transaction_date);
create index if not exists idx_items_images_gin on items using gin(images);
create index if not exists idx_rooms_amenities_gin on rooms using gin(amenities);