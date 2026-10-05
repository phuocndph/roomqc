-- ============================================
-- COMPLETE HOTEL MANAGEMENT SYSTEM SCHEMA
-- ============================================

-- PART 1: EXTENSIONS & FUNCTIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function generate_unique_code(prefix text, table_name text, column_name text)
returns text as $$
declare
  new_code text;
  code_exists boolean;
begin
  loop
    new_code := prefix || '-' || lpad(floor(random() * 999999)::text, 6, '0');
    execute format('select exists(select 1 from %I where %I = $1)', table_name, column_name)
    into code_exists using new_code;
    exit when not code_exists;
  end loop;
  return new_code;
end;
$$ language plpgsql;

-- PART 2: CORE TABLES
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  phone text,
  logo_url text,
  subscription_plan text default 'basic',
  subscription_status text default 'trial',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  subscription_expires_at timestamptz,
  settings jsonb default '{"language": "vi", "currency": "VND", "timezone": "Asia/Ho_Chi_Minh", "date_format": "DD/MM/YYYY"}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger tenants_updated_at before update on tenants
  for each row execute function update_updated_at_column();

create table hotels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text unique not null,
  name text not null,
  address text,
  phone text,
  email text,
  total_rooms integer default 0,
  total_floors integer default 0,
  status text default 'active',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint hotels_code_check check (code ~ '^HTL-[0-9]{6}$')
);

create index idx_hotels_tenant on hotels(tenant_id);
create index idx_hotels_code on hotels(code);
create index idx_hotels_status on hotels(status);

create trigger hotels_updated_at before update on hotels
  for each row execute function update_updated_at_column();

create or replace function hotels_generate_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := generate_unique_code('HTL', 'hotels', 'code');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger hotels_before_insert before insert on hotels
  for each row execute function hotels_generate_code();

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  hotel_id uuid references hotels(id) on delete set null,
  full_name text not null,
  email text unique not null,
  phone text,
  avatar_url text,
  role text not null default 'staff',
  department text,
  status text default 'active',
  last_login_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint users_role_check check (role in ('super_admin', 'owner', 'hotel_manager', 'department_manager', 'staff')),
  constraint users_department_check check (department is null or department in ('housekeeping', 'laundry', 'inventory', 'maintenance'))
);

create index idx_users_tenant on users(tenant_id);
create index idx_users_hotel on users(hotel_id);
create index idx_users_role on users(role);
create index idx_users_email on users(email);

create trigger users_updated_at before update on users
  for each row execute function update_updated_at_column();

create table item_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  name_en text,
  description text,
  icon text default 'package',
  color text default '#3b82f6',
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_item_categories_tenant on item_categories(tenant_id);
create index idx_item_categories_sort on item_categories(tenant_id, sort_order);

create trigger item_categories_updated_at before update on item_categories
  for each row execute function update_updated_at_column();

create table items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  category_id uuid references item_categories(id) on delete set null,
  code text not null,
  name text not null,
  name_en text,
  description text,
  unit text not null default 'cái',
  unit_price decimal(15,2) default 0,
  quantity_total integer default 0,
  quantity_in_stock integer default 0,
  quantity_in_use integer default 0,
  quantity_in_laundry integer default 0,
  quantity_damaged integer default 0,
  quantity_lost integer default 0,
  minimum_stock integer default 0,
  reorder_point integer default 0,
  brand text,
  model text,
  specifications jsonb default '{}'::jsonb,
  expected_lifetime_days integer,
  max_wash_cycles integer,
  current_wash_cycles integer default 0,
  images text[] default '{}',
  qr_code text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint items_code_hotel_unique unique (hotel_id, code),
  constraint items_quantities_valid check (
    quantity_total = quantity_in_stock + quantity_in_use + quantity_in_laundry + quantity_damaged + quantity_lost
    and quantity_total >= 0 and quantity_in_stock >= 0 and quantity_in_use >= 0
    and quantity_in_laundry >= 0 and quantity_damaged >= 0 and quantity_lost >= 0
  )
);

create index idx_items_tenant on items(tenant_id);
create index idx_items_hotel on items(hotel_id);
create index idx_items_category on items(category_id);
create index idx_items_code on items(code);
create index idx_items_status on items(status);

create trigger items_updated_at before update on items
  for each row execute function update_updated_at_column();

create or replace function items_generate_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    declare
      cat_prefix text;
    begin
      select case 
        when name ilike '%vải%' then 'FAB'
        when name ilike '%amenities%' or name ilike '%tiện nghi%' then 'AMN'
        when name ilike '%điện%' then 'ELC'
        when name ilike '%nội thất%' then 'FUR'
        when name ilike '%vệ sinh%' then 'CLN'
        else 'ITM'
      end into cat_prefix from item_categories where id = new.category_id;
      
      if cat_prefix is null then cat_prefix := 'ITM'; end if;
      new.code := generate_unique_code(cat_prefix, 'items', 'code');
    end;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger items_before_insert before insert on items
  for each row execute function items_generate_code();

create or replace function items_generate_qr()
returns trigger as $$
begin
  if new.qr_code is null then new.qr_code := new.code; end if;
  return new;
end;
$$ language plpgsql;

create trigger items_before_insert_qr before insert on items
  for each row execute function items_generate_qr();

create table rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_number text not null,
  floor integer not null,
  room_type text not null,
  status text default 'vacant',
  area_sqm decimal(10,2),
  bed_type text,
  max_guests integer default 2,
  has_window boolean default true,
  has_balcony boolean default false,
  view_type text,
  smoking_allowed boolean default false,
  base_price decimal(15,2) default 0,
  amenities text[] default '{}',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint rooms_hotel_number_unique unique (hotel_id, room_number),
  constraint rooms_type_check check (room_type in ('standard', 'deluxe', 'suite', 'vip')),
  constraint rooms_status_check check (status in ('vacant', 'occupied', 'cleaning', 'maintenance', 'out_of_order'))
);

create index idx_rooms_tenant on rooms(tenant_id);
create index idx_rooms_hotel on rooms(hotel_id);
create index idx_rooms_number on rooms(hotel_id, room_number);
create index idx_rooms_status on rooms(status);

create trigger rooms_updated_at before update on rooms
  for each row execute function update_updated_at_column();

create table room_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  quantity integer not null default 1,
  condition text default 'good',
  assigned_at timestamptz default now(),
  last_checked_at timestamptz,
  last_checked_by uuid references users(id),
  notes text,
  constraint room_items_quantity_positive check (quantity > 0),
  constraint room_items_condition_check check (condition in ('good', 'fair', 'poor', 'damaged'))
);

create index idx_room_items_room on room_items(room_id);
create index idx_room_items_item on room_items(item_id);
create unique index idx_room_items_unique on room_items(room_id, item_id);

create or replace function room_items_update_inventory()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update items set quantity_in_use = quantity_in_use + new.quantity, quantity_in_stock = quantity_in_stock - new.quantity where id = new.item_id;
  elsif (TG_OP = 'UPDATE') then
    update items set quantity_in_use = quantity_in_use + (new.quantity - old.quantity), quantity_in_stock = quantity_in_stock - (new.quantity - old.quantity) where id = new.item_id;
  elsif (TG_OP = 'DELETE') then
    update items set quantity_in_use = quantity_in_use - old.quantity, quantity_in_stock = quantity_in_stock + old.quantity where id = old.item_id;
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger room_items_inventory_trigger
  after insert or update or delete on room_items
  for each row execute function room_items_update_inventory();

create table room_type_standards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_type text not null,
  item_id uuid not null references items(id) on delete cascade,
  quantity integer not null default 1,
  created_at timestamptz default now(),
  constraint room_standards_unique unique (hotel_id, room_type, item_id),
  constraint room_standards_type_check check (room_type in ('standard', 'deluxe', 'suite', 'vip'))
);

create index idx_room_standards_hotel on room_type_standards(hotel_id);
create index idx_room_standards_type on room_type_standards(hotel_id, room_type);

create table room_checks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  checked_by uuid not null references users(id),
  check_type text not null,
  cleanliness_score integer,
  items_complete boolean default true,
  items_missing jsonb default '[]'::jsonb,
  items_damaged jsonb default '[]'::jsonb,
  photos text[] default '{}',
  notes text,
  checked_at timestamptz default now(),
  constraint room_checks_type_check check (check_type in ('daily', 'checkin', 'checkout', 'maintenance')),
  constraint room_checks_score_check check (cleanliness_score is null or (cleanliness_score >= 1 and cleanliness_score <= 5))
);

create index idx_room_checks_room on room_checks(room_id);
create index idx_room_checks_checked_by on room_checks(checked_by);
create index idx_room_checks_date on room_checks(checked_at);