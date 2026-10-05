-- ============================================
-- PART 2: LAUNDRY, INVENTORY & MAINTENANCE TABLES
-- ============================================

-- Laundry vendors
create table laundry_vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text unique not null,
  name text not null,
  type text not null,
  address text,
  phone text,
  email text,
  contact_person text,
  contract_info jsonb default '{"price_per_kg": 0, "minimum_order_kg": 0}'::jsonb,
  rating decimal(3,2) default 0,
  total_orders integer default 0,
  total_value decimal(15,2) default 0,
  status text default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint laundry_vendors_type_check check (type in ('external', 'in_house')),
  constraint laundry_vendors_rating_check check (rating >= 0 and rating <= 5)
);

create index idx_laundry_vendors_tenant on laundry_vendors(tenant_id);
create trigger laundry_vendors_updated_at before update on laundry_vendors for each row execute function update_updated_at_column();

create or replace function laundry_vendors_generate_code() returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := generate_unique_code('LND', 'laundry_vendors', 'code');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger laundry_vendors_before_insert before insert on laundry_vendors for each row execute function laundry_vendors_generate_code();

-- Laundry batches
create table laundry_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  vendor_id uuid not null references laundry_vendors(id) on delete restrict,
  batch_code text unique not null,
  delivery_date timestamptz not null,
  delivery_staff_id uuid references users(id),
  receiver_name text,
  expected_return_date timestamptz,
  actual_return_date timestamptz,
  return_staff_id uuid references users(id),
  delivery_person_name text,
  total_weight_kg decimal(10,2) not null,
  total_items integer not null,
  estimated_cost decimal(15,2),
  actual_cost decimal(15,2),
  status text default 'delivered',
  quality_rating decimal(3,2),
  timeliness_rating decimal(3,2),
  items_lost integer default 0,
  items_damaged integer default 0,
  compensation_amount decimal(15,2) default 0,
  delivery_photos text[] default '{}',
  return_photos text[] default '{}',
  notes text,
  return_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint laundry_batches_status_check check (status in ('delivered', 'washing', 'ready', 'received', 'cancelled')),
  constraint laundry_batches_ratings_check check (
    (quality_rating is null or (quality_rating >= 1 and quality_rating <= 5))
    and (timeliness_rating is null or (timeliness_rating >= 1 and timeliness_rating <= 5))
  )
);

create index idx_laundry_batches_tenant on laundry_batches(tenant_id);
create index idx_laundry_batches_hotel on laundry_batches(hotel_id);
create index idx_laundry_batches_vendor on laundry_batches(vendor_id);
create trigger laundry_batches_updated_at before update on laundry_batches for each row execute function update_updated_at_column();

create or replace function laundry_batches_generate_code() returns trigger as $$
begin
  if new.batch_code is null or new.batch_code = '' then
    new.batch_code := 'LB-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 9999)::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger laundry_batches_before_insert before insert on laundry_batches for each row execute function laundry_batches_generate_code();

-- Laundry batch items
create table laundry_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references laundry_batches(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity_delivered integer not null,
  weight_kg decimal(10,2),
  condition_note text,
  quantity_returned integer default 0,
  quantity_lost integer default 0,
  quantity_damaged integer default 0,
  return_condition text,
  created_at timestamptz default now(),
  constraint laundry_batch_items_quantities_check check (
    quantity_delivered > 0 and quantity_returned >= 0 and quantity_lost >= 0 and quantity_damaged >= 0
    and quantity_returned + quantity_lost + quantity_damaged <= quantity_delivered
  )
);

create index idx_laundry_batch_items_batch on laundry_batch_items(batch_id);
create index idx_laundry_batch_items_item on laundry_batch_items(item_id);

-- Inventory transactions
create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  transaction_code text unique not null,
  transaction_type text not null,
  transaction_category text,
  quantity integer not null,
  unit_price decimal(15,2),
  total_value decimal(15,2),
  quantity_before integer not null,
  quantity_after integer not null,
  related_type text,
  related_id uuid,
  from_location text,
  to_location text,
  created_by uuid not null references users(id),
  approved_by uuid references users(id),
  documents text[] default '{}',
  photos text[] default '{}',
  notes text,
  transaction_date timestamptz default now(),
  created_at timestamptz default now(),
  constraint inventory_transactions_type_check check (transaction_type in ('in', 'out', 'transfer', 'adjust', 'damaged', 'lost')),
  constraint inventory_transactions_category_check check (
    transaction_category is null or 
    transaction_category in ('purchase', 'laundry', 'room_assign', 'maintenance', 'disposal', 'return', 'adjustment', 'other')
  )
);

create index idx_inventory_transactions_tenant on inventory_transactions(tenant_id);
create index idx_inventory_transactions_hotel on inventory_transactions(hotel_id);
create index idx_inventory_transactions_item on inventory_transactions(item_id);

create or replace function inventory_transactions_generate_code() returns trigger as $$
begin
  if new.transaction_code is null or new.transaction_code = '' then
    new.transaction_code := 'TXN-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 999999)::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger inventory_transactions_before_insert before insert on inventory_transactions for each row execute function inventory_transactions_generate_code();

-- Vendors
create table vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text unique not null,
  name text not null,
  category text not null,
  products_services text[] default '{}',
  address text,
  phone text,
  email text,
  website text,
  contact_person text,
  tax_code text,
  bank_account text,
  bank_name text,
  payment_terms text,
  delivery_time text,
  minimum_order_value decimal(15,2),
  rating decimal(3,2) default 0,
  total_orders integer default 0,
  total_value decimal(15,2) default 0,
  on_time_delivery_rate decimal(5,2) default 100,
  documents text[] default '{}',
  status text default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint vendors_category_check check (category in ('supplier', 'service_provider', 'contractor', 'other')),
  constraint vendors_rating_check check (rating >= 0 and rating <= 5)
);

create index idx_vendors_tenant on vendors(tenant_id);
create trigger vendors_updated_at before update on vendors for each row execute function update_updated_at_column();

create or replace function vendors_generate_code() returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := generate_unique_code('VND', 'vendors', 'code');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger vendors_before_insert before insert on vendors for each row execute function vendors_generate_code();

-- Purchase orders
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete restrict,
  po_code text unique not null,
  order_date date not null default current_date,
  expected_delivery_date date,
  actual_delivery_date date,
  status text default 'draft',
  subtotal decimal(15,2) default 0,
  tax_amount decimal(15,2) default 0,
  shipping_fee decimal(15,2) default 0,
  total_amount decimal(15,2) default 0,
  requested_by uuid not null references users(id),
  approved_by uuid references users(id),
  shipping_address text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint purchase_orders_status_check check (status in ('draft', 'submitted', 'approved', 'rejected', 'ordered', 'partial', 'received', 'cancelled'))
);

create index idx_purchase_orders_tenant on purchase_orders(tenant_id);
create index idx_purchase_orders_hotel on purchase_orders(hotel_id);
create trigger purchase_orders_updated_at before update on purchase_orders for each row execute function update_updated_at_column();

create or replace function purchase_orders_generate_code() returns trigger as $$
begin
  if new.po_code is null or new.po_code = '' then
    new.po_code := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 9999)::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger purchase_orders_before_insert before insert on purchase_orders for each row execute function purchase_orders_generate_code();

-- Purchase order items
create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity_ordered integer not null,
  quantity_received integer default 0,
  unit_price decimal(15,2) not null,
  total_price decimal(15,2) generated always as (quantity_ordered * unit_price) stored,
  notes text,
  created_at timestamptz default now(),
  constraint purchase_order_items_quantity_check check (quantity_ordered > 0 and quantity_received >= 0 and quantity_received <= quantity_ordered)
);

create index idx_purchase_order_items_po on purchase_order_items(po_id);
create index idx_purchase_order_items_item on purchase_order_items(item_id);

-- Maintenance requests
create table maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  request_code text unique not null,
  room_id uuid references rooms(id) on delete set null,
  location text not null,
  item_id uuid references items(id) on delete set null,
  issue_type text not null,
  priority text default 'medium',
  title text not null,
  description text not null,
  status text default 'pending',
  assigned_to uuid references users(id),
  assigned_at timestamptz,
  reported_by uuid not null references users(id),
  reported_at timestamptz default now(),
  expected_completion_date timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  estimated_cost decimal(15,2),
  actual_cost decimal(15,2),
  solution text,
  parts_used text[],
  under_warranty boolean default false,
  warranty_info text,
  photos text[] default '{}',
  completion_photos text[] default '{}',
  documents text[] default '{}',
  notes text,
  completion_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint maintenance_requests_issue_type_check check (issue_type in ('repair', 'replace', 'inspection', 'cleaning', 'other')),
  constraint maintenance_requests_priority_check check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint maintenance_requests_status_check check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled'))
);

create index idx_maintenance_requests_tenant on maintenance_requests(tenant_id);
create index idx_maintenance_requests_hotel on maintenance_requests(hotel_id);
create trigger maintenance_requests_updated_at before update on maintenance_requests for each row execute function update_updated_at_column();

create or replace function maintenance_requests_generate_code() returns trigger as $$
begin
  if new.request_code is null or new.request_code = '' then
    new.request_code := 'MNT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 9999)::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger maintenance_requests_before_insert before insert on maintenance_requests for each row execute function maintenance_requests_generate_code();

-- Notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text,
  type text not null,
  category text not null,
  title text not null,
  message text not null,
  action_url text,
  action_label text,
  related_type text,
  related_id uuid,
  is_read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now(),
  expires_at timestamptz,
  constraint notifications_type_check check (type in ('info', 'warning', 'error', 'success')),
  constraint notifications_category_check check (category in ('inventory', 'laundry', 'room', 'maintenance', 'purchase', 'system', 'other'))
);

create index idx_notifications_tenant on notifications(tenant_id);
create index idx_notifications_user on notifications(user_id);

-- Activity logs
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  user_name text not null,
  user_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  description text not null,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now(),
  constraint activity_logs_action_check check (action in ('create', 'update', 'delete', 'view', 'export', 'approve', 'reject', 'login', 'logout', 'other'))
);

create index idx_activity_logs_tenant on activity_logs(tenant_id);
create index idx_activity_logs_user on activity_logs(user_id);