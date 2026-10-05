-- Drop and recreate function with additional columns
DROP FUNCTION IF EXISTS get_room_items_with_standards(uuid);

CREATE OR REPLACE FUNCTION get_room_items_with_standards(p_room_id uuid)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  item_code text,
  item_unit text,
  item_thumbnail text,
  item_type text,
  category_id uuid,
  category_name text,
  category_color text,
  standard_quantity integer,
  current_quantity integer,
  missing_quantity integer,
  has_standard boolean,
  item_condition text,
  room_item_id uuid,
  is_verified boolean,
  verified_at timestamptz,
  verified_by uuid
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_type text;
  v_hotel_id uuid;
BEGIN
  -- Get room type and hotel_id
  SELECT r.room_type, r.hotel_id INTO v_room_type, v_hotel_id
  FROM rooms r
  WHERE r.id = p_room_id;

  RETURN QUERY
  WITH room_standards AS (
    -- Get standards from room_standards table (room-specific)
    SELECT 
      rs.item_id,
      rs.standard_quantity
    FROM room_standards rs
    WHERE rs.room_id = p_room_id
  ),
  type_standards AS (
    -- Get standards from room_type_standards table (room type level)
    SELECT 
      rts.item_id,
      rts.standard_quantity
    FROM room_type_standards rts
    WHERE rts.room_type = v_room_type
      AND rts.hotel_id = v_hotel_id
  ),
  combined_standards AS (
    -- Combine both, room-specific takes priority
    SELECT 
      COALESCE(rs.item_id, ts.item_id) as item_id,
      COALESCE(rs.standard_quantity, ts.standard_quantity) as standard_quantity
    FROM room_standards rs
    FULL OUTER JOIN type_standards ts ON rs.item_id = ts.item_id
  ),
  room_item_data AS (
    -- Get current room items
    SELECT 
      ri.id as room_item_id,
      ri.item_id,
      ri.quantity as current_quantity,
      ri.item_condition,
      ri.is_verified,
      ri.verified_at,
      ri.verified_by
    FROM room_items ri
    WHERE ri.room_id = p_room_id
  )
  SELECT 
    i.id as item_id,
    i.name as item_name,
    i.code as item_code,
    i.unit as item_unit,
    (SELECT url FROM item_images ii WHERE ii.item_id = i.id AND ii.is_primary = true LIMIT 1) as item_thumbnail,
    i.item_type::text as item_type,
    ic.id as category_id,
    ic.name as category_name,
    ic.color as category_color,
    COALESCE(cs.standard_quantity, 0)::integer as standard_quantity,
    COALESCE(rid.current_quantity, 0)::integer as current_quantity,
    GREATEST(COALESCE(cs.standard_quantity, 0) - COALESCE(rid.current_quantity, 0), 0)::integer as missing_quantity,
    (cs.item_id IS NOT NULL) as has_standard,
    COALESCE(rid.item_condition, 'good') as item_condition,
    rid.room_item_id,
    COALESCE(rid.is_verified, false) as is_verified,
    rid.verified_at,
    rid.verified_by
  FROM items i
  LEFT JOIN item_categories ic ON i.category_id = ic.id
  LEFT JOIN combined_standards cs ON i.id = cs.item_id
  LEFT JOIN room_item_data rid ON i.id = rid.item_id
  WHERE i.hotel_id = v_hotel_id
    AND i.status = 'active'
    AND (cs.item_id IS NOT NULL OR rid.item_id IS NOT NULL)
  ORDER BY ic.sort_order NULLS LAST, ic.name, i.name;
END;
$$;