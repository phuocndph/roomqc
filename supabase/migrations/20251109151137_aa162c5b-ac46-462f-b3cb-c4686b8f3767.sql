-- ============================================
-- ROOMS MANAGEMENT SCHEMA
-- ============================================

-- Ensure rooms table exists with all columns
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  
  room_number text not null,
  floor integer,
  room_type text not null,
  
  status text default 'vacant',
  
  area_sqm decimal(10,2),
  bed_type text,
  max_guests integer default 2,
  
  base_price decimal(15,2),
  
  has_window boolean default true,
  has_balcony boolean default false,
  view_type text,
  smoking_allowed boolean default false,
  
  amenities text[] default '{}',
  
  notes text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  constraint rooms_hotel_number_unique unique (hotel_id, room_number)
);

create index if not exists idx_rooms_tenant on rooms(tenant_id);
create index if not exists idx_rooms_hotel on rooms(hotel_id);
create index if not exists idx_rooms_number on rooms(room_number);
create index if not exists idx_rooms_status on rooms(status);
create index if not exists idx_rooms_floor on rooms(hotel_id, floor);

-- Table: room_items
create table if not exists room_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  
  quantity integer not null default 1,
  condition text default 'good',
  
  assigned_at timestamptz default now(),
  last_checked_at timestamptz,
  last_checked_by uuid references users(id),
  
  notes text
);

create index if not exists idx_room_items_room on room_items(room_id);
create index if not exists idx_room_items_item on room_items(item_id);
create unique index if not exists idx_room_items_unique on room_items(room_id, item_id);

-- Table: room_checks
create table if not exists room_checks (
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
  
  checked_at timestamptz default now()
);

create index if not exists idx_room_checks_room on room_checks(room_id);
create index if not exists idx_room_checks_checked_by on room_checks(checked_by);
create index if not exists idx_room_checks_date on room_checks(checked_at);

-- Table: room_type_standards
create table if not exists room_type_standards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  
  room_type text not null,
  item_id uuid not null references items(id) on delete cascade,
  quantity integer not null default 1,
  
  created_at timestamptz default now(),
  
  constraint room_standards_unique unique (hotel_id, room_type, item_id)
);

create index if not exists idx_room_standards_hotel on room_type_standards(hotel_id);
create index if not exists idx_room_standards_type on room_type_standards(hotel_id, room_type);

-- ============================================
-- ROOM MANAGEMENT FUNCTIONS
-- ============================================

create or replace function get_rooms_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid default null,
  p_floor integer default null,
  p_room_type text default null,
  p_status text default null,
  p_search text default null,
  p_missing_items_only boolean default false
)
returns table (
  id uuid,
  room_number text,
  floor integer,
  room_type text,
  status text,
  area_sqm numeric,
  bed_type text,
  max_guests integer,
  base_price numeric,
  amenities text[],
  total_items bigint,
  missing_items bigint,
  items_in_laundry bigint,
  last_check_at timestamptz,
  last_check_score integer
) as $$
begin
  return query
  with room_stats as (
    select 
      r.id,
      count(distinct ri.id) as total_items,
      count(distinct ri.id) filter (where ri.condition = 'damaged') as missing_items,
      0::bigint as items_in_laundry
    from rooms r
    left join room_items ri on ri.room_id = r.id
    where r.tenant_id = p_tenant_id
      and (p_hotel_id is null or r.hotel_id = p_hotel_id)
    group by r.id
  ),
  last_checks as (
    select distinct on (room_id)
      room_id,
      checked_at,
      cleanliness_score
    from room_checks
    order by room_id, checked_at desc
  )
  select 
    r.id,
    r.room_number,
    r.floor,
    r.room_type,
    r.status,
    r.area_sqm,
    r.bed_type,
    r.max_guests,
    r.base_price,
    r.amenities,
    coalesce(rs.total_items, 0) as total_items,
    coalesce(rs.missing_items, 0) as missing_items,
    coalesce(rs.items_in_laundry, 0) as items_in_laundry,
    lc.checked_at as last_check_at,
    lc.cleanliness_score as last_check_score
  from rooms r
  left join room_stats rs on rs.id = r.id
  left join last_checks lc on lc.room_id = r.id
  where r.tenant_id = p_tenant_id
    and (p_hotel_id is null or r.hotel_id = p_hotel_id)
    and (p_floor is null or r.floor = p_floor)
    and (p_room_type is null or r.room_type = p_room_type)
    and (p_status is null or r.status = p_status)
    and (p_search is null or r.room_number ilike '%' || p_search || '%')
    and (not p_missing_items_only or coalesce(rs.missing_items, 0) > 0)
  order by r.floor, r.room_number;
end;
$$ language plpgsql stable security definer;

create or replace function get_room_detail(p_room_id uuid)
returns jsonb as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'room', row_to_json(r.*),
    'hotel', row_to_json(h.*),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ri.id,
          'item_id', ri.item_id,
          'item_code', i.code,
          'item_name', i.name,
          'quantity', ri.quantity,
          'condition', ri.condition
        )
      )
      from room_items ri
      join items i on i.id = ri.item_id
      where ri.room_id = r.id
    ), '[]'::jsonb),
    'recent_checks', coalesce((
      select jsonb_agg(row_to_json(rc.*))
      from (
        select 
          rc.id,
          rc.check_type,
          rc.cleanliness_score,
          rc.items_complete,
          rc.checked_at,
          u.full_name as checked_by_name
        from room_checks rc
        left join users u on u.id = rc.checked_by
        where rc.room_id = p_room_id
        order by rc.checked_at desc
        limit 10
      ) rc
    ), '[]'::jsonb)
  ) into v_result
  from rooms r
  left join hotels h on h.id = r.hotel_id
  where r.id = p_room_id;
  
  return v_result;
end;
$$ language plpgsql stable security definer;