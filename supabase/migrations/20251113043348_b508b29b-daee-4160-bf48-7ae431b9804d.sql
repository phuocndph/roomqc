-- Drop existing function if exists
DROP FUNCTION IF EXISTS get_room_items_with_standards(UUID);

-- Function to get room items with standards comparison
CREATE OR REPLACE FUNCTION get_room_items_with_standards(p_room_id UUID)
RETURNS TABLE (
  item_id UUID,
  item_code TEXT,
  item_name TEXT,
  item_thumbnail TEXT,
  category_name TEXT,
  standard_quantity INTEGER,
  current_quantity INTEGER,
  missing_quantity INTEGER,
  condition TEXT,
  is_verified BOOLEAN,
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  room_item_id UUID,
  has_standard BOOLEAN
) AS $$
DECLARE
  v_room_type TEXT;
  v_tenant_id UUID;
BEGIN
  -- Get room type and tenant
  SELECT r.room_type, r.tenant_id
  INTO v_room_type, v_tenant_id
  FROM rooms r
  WHERE r.id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Return all standards with current room items data
  RETURN QUERY
  SELECT
    i.id as item_id,
    i.code as item_code,
    i.name as item_name,
    (SELECT ii.url FROM item_images ii WHERE ii.item_id = i.id AND ii.is_primary = true LIMIT 1) as item_thumbnail,
    c.name as category_name,
    rts.quantity as standard_quantity,
    COALESCE(ri.quantity, 0) as current_quantity,
    GREATEST(0, rts.quantity - COALESCE(ri.quantity, 0)) as missing_quantity,
    COALESCE(ri.condition, 'good') as condition,
    COALESCE(ri.is_verified, false) as is_verified,
    ri.verified_at,
    ri.verified_by,
    ri.id as room_item_id,
    true as has_standard
  FROM room_type_standards rts
  JOIN items i ON i.id = rts.item_id
  LEFT JOIN item_categories c ON c.id = i.category_id
  LEFT JOIN room_items ri ON ri.room_id = p_room_id AND ri.item_id = rts.item_id
  WHERE rts.room_type = v_room_type
    AND rts.tenant_id = v_tenant_id
  
  UNION ALL
  
  -- Also include room items that don't have standards (legacy items)
  SELECT
    i.id as item_id,
    i.code as item_code,
    i.name as item_name,
    (SELECT ii.url FROM item_images ii WHERE ii.item_id = i.id AND ii.is_primary = true LIMIT 1) as item_thumbnail,
    c.name as category_name,
    0 as standard_quantity,
    ri.quantity as current_quantity,
    0 as missing_quantity,
    ri.condition,
    ri.is_verified,
    ri.verified_at,
    ri.verified_by,
    ri.id as room_item_id,
    false as has_standard
  FROM room_items ri
  JOIN items i ON i.id = ri.item_id
  LEFT JOIN item_categories c ON c.id = i.category_id
  WHERE ri.room_id = p_room_id
    AND NOT EXISTS (
      SELECT 1 FROM room_type_standards rts2
      WHERE rts2.item_id = ri.item_id
        AND rts2.room_type = v_room_type
        AND rts2.tenant_id = v_tenant_id
    )
  ORDER BY has_standard DESC, item_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;