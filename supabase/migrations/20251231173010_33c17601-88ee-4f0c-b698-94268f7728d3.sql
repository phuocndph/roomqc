-- Fix RPC to filter by room's hotel_id to avoid duplicates
-- room_type_standards can have entries for different hotels with same room_type and tenant_id

DROP FUNCTION IF EXISTS public.get_missing_items_from_room_detail(uuid[]);

CREATE OR REPLACE FUNCTION public.get_missing_items_from_room_detail(p_room_ids uuid[])
RETURNS TABLE (
  room_id uuid,
  room_number text,
  item_id uuid,
  item_code text,
  item_name text,
  current_qty integer,
  standard_qty integer,
  missing_qty integer,
  item_stock integer
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
    i.id as item_id,
    i.code as item_code,
    i.name as item_name,
    COALESCE(ri.quantity, 0)::integer as current_qty,
    rts.quantity::integer as standard_qty,
    GREATEST(0, rts.quantity - COALESCE(ri.quantity, 0))::integer as missing_qty,
    COALESCE(i.quantity_in_stock, 0)::integer as item_stock
  FROM rooms r
  INNER JOIN room_type_standards rts 
    ON rts.room_type = r.room_type 
    AND rts.tenant_id = r.tenant_id
    AND rts.hotel_id = r.hotel_id  -- CRITICAL: filter by room's hotel_id
  INNER JOIN items i ON i.id = rts.item_id
  LEFT JOIN room_items ri ON ri.room_id = r.id AND ri.item_id = rts.item_id
  WHERE r.id = ANY(p_room_ids)
    AND rts.quantity > COALESCE(ri.quantity, 0)  -- Only missing items
    AND i.status = 'active'
    AND i.quantity_in_stock > 0  -- Only items with stock
  ORDER BY r.room_number, i.name;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_missing_items_from_room_detail(uuid[]) TO authenticated;