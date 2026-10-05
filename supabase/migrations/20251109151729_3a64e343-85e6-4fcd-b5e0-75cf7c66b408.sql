-- Add missing room management functions

create or replace function get_room_standards(
  p_hotel_id uuid,
  p_room_type text
)
returns table (
  id uuid,
  item_id uuid,
  item_code text,
  item_name text,
  item_thumbnail text,
  category_name text,
  category_color text,
  quantity integer
) as $$
begin
  return query
  select 
    rts.id,
    rts.item_id,
    i.code as item_code,
    i.name as item_name,
    i.images[1] as item_thumbnail,
    c.name as category_name,
    c.color as category_color,
    rts.quantity
  from room_type_standards rts
  join items i on i.id = rts.item_id
  left join item_categories c on c.id = i.category_id
  where rts.hotel_id = p_hotel_id
    and rts.room_type = p_room_type
  order by c.sort_order, i.name;
end;
$$ language plpgsql stable security definer;

create or replace function apply_room_standards(
  p_room_id uuid,
  p_user_id uuid
)
returns jsonb as $$
declare
  v_room record;
  v_standard record;
  v_added_count integer := 0;
  v_updated_count integer := 0;
begin
  select * into v_room from rooms where id = p_room_id;
  
  if not found then
    return jsonb_build_object('success', false, 'error', 'Room not found');
  end if;
  
  for v_standard in
    select item_id, quantity
    from room_type_standards
    where hotel_id = v_room.hotel_id
      and room_type = v_room.room_type
  loop
    insert into room_items (room_id, item_id, quantity, condition)
    values (p_room_id, v_standard.item_id, v_standard.quantity, 'good')
    on conflict (room_id, item_id) do update
    set quantity = v_standard.quantity
    where room_items.quantity != v_standard.quantity;
    
    if found then
      v_updated_count := v_updated_count + 1;
    else
      v_added_count := v_added_count + 1;
    end if;
  end loop;
  
  return jsonb_build_object(
    'success', true,
    'added', v_added_count,
    'updated', v_updated_count
  );
end;
$$ language plpgsql security definer;

create or replace function get_floor_plan(
  p_hotel_id uuid
)
returns jsonb as $$
begin
  return (
    select jsonb_object_agg(
      floor::text,
      rooms
    )
    from (
      select 
        floor,
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'room_number', room_number,
            'room_type', room_type,
            'status', status
          )
          order by room_number
        ) as rooms
      from rooms
      where hotel_id = p_hotel_id
      group by floor
      order by floor
    ) floors
  );
end;
$$ language plpgsql stable security definer;