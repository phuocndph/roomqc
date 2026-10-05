-- Function to get missing items for multiple rooms based on room type standards
CREATE OR REPLACE FUNCTION public.get_missing_items_for_rooms(p_room_ids uuid[])
RETURNS TABLE (
  room_id uuid,
  room_number text,
  item_id uuid,
  item_name text,
  current_qty integer,
  standard_qty integer,
  missing_qty integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as room_id,
    r.room_number,
    rts.item_id,
    i.name as item_name,
    COALESCE(ri.quantity, 0)::integer as current_qty,
    rts.quantity::integer as standard_qty,
    GREATEST(0, rts.quantity - COALESCE(ri.quantity, 0))::integer as missing_qty
  FROM rooms r
  INNER JOIN room_type_standards rts ON rts.room_type = r.room_type 
    AND rts.hotel_id = r.hotel_id
  INNER JOIN items i ON i.id = rts.item_id
  LEFT JOIN room_items ri ON ri.room_id = r.id AND ri.item_id = rts.item_id
  WHERE r.id = ANY(p_room_ids)
    AND rts.quantity > COALESCE(ri.quantity, 0)
    AND i.status = 'active'
  ORDER BY r.room_number, i.name;
END;
$$;