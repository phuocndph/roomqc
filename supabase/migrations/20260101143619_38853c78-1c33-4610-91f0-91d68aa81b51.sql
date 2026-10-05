-- Fix: Update get_room_items_with_standards to filter by hotel_id
-- Drop and recreate to handle return type change

DROP FUNCTION IF EXISTS get_room_items_with_standards(UUID);

CREATE OR REPLACE FUNCTION get_room_items_with_standards(p_room_id UUID)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  item_code TEXT,
  category_name TEXT,
  category_color TEXT,
  standard_quantity INT,
  actual_quantity INT,
  status TEXT,
  item_status TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_type TEXT;
  v_tenant_id UUID;
  v_hotel_id UUID;
BEGIN
  -- Get room info including hotel_id
  SELECT r.room_type, r.tenant_id, r.hotel_id
  INTO v_room_type, v_tenant_id, v_hotel_id
  FROM rooms r
  WHERE r.id = p_room_id;

  IF v_room_type IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH standards AS (
    -- Get room type standards filtered by BOTH tenant AND hotel
    SELECT 
      rts.item_id,
      rts.quantity as standard_qty
    FROM room_type_standards rts
    WHERE rts.room_type = v_room_type
      AND rts.tenant_id = v_tenant_id
      AND rts.hotel_id = v_hotel_id  -- Filter by hotel_id for consistency
  ),
  room_items AS (
    -- Get current items in the room
    SELECT 
      ri.item_id,
      ri.quantity as actual_qty,
      ri.status as item_status
    FROM room_items ri
    WHERE ri.room_id = p_room_id
  )
  SELECT 
    COALESCE(s.item_id, ri.item_id) as item_id,
    i.name as item_name,
    i.code as item_code,
    ic.name as category_name,
    ic.color as category_color,
    COALESCE(s.standard_qty, 0)::INT as standard_quantity,
    COALESCE(ri.actual_qty, 0)::INT as actual_quantity,
    CASE 
      WHEN s.item_id IS NULL THEN 'extra'
      WHEN ri.item_id IS NULL THEN 'missing'
      WHEN ri.actual_qty < s.standard_qty THEN 'insufficient'
      WHEN ri.actual_qty > s.standard_qty THEN 'excess'
      ELSE 'ok'
    END as status,
    COALESCE(ri.item_status, 'none') as item_status
  FROM standards s
  FULL OUTER JOIN room_items ri ON s.item_id = ri.item_id
  LEFT JOIN items i ON COALESCE(s.item_id, ri.item_id) = i.id
  LEFT JOIN item_categories ic ON i.category_id = ic.id
  WHERE i.id IS NOT NULL
    AND i.hotel_id = v_hotel_id  -- Filter items by hotel_id
  ORDER BY ic.name, i.name;
END;
$$;