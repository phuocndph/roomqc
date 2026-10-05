-- Fix CTE naming conflict in get_room_items_with_standards
-- CTEs were named same as actual tables causing reference errors

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
  SELECT r.room_type, r.hotel_id INTO v_room_type, v_hotel_id
  FROM rooms r
  WHERE r.id = p_room_id;

  RETURN QUERY
  WITH cte_room_standards AS (
    SELECT 
      rs.item_id,
      rs.standard_quantity
    FROM room_standards rs
    WHERE rs.room_id = p_room_id
  ),
  cte_type_standards AS (
    SELECT 
      rts.item_id,
      rts.standard_quantity
    FROM room_type_standards rts
    WHERE rts.room_type = v_room_type
      AND rts.hotel_id = v_hotel_id
  ),
  cte_combined_standards AS (
    SELECT 
      COALESCE(crs.item_id, cts.item_id) as item_id,
      COALESCE(crs.standard_quantity, cts.standard_quantity) as standard_quantity
    FROM cte_room_standards crs
    FULL OUTER JOIN cte_type_standards cts ON crs.item_id = cts.item_id
  ),
  cte_room_item_data AS (
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
    COALESCE(ccs.standard_quantity, 0)::integer as standard_quantity,
    COALESCE(crid.current_quantity, 0)::integer as current_quantity,
    GREATEST(COALESCE(ccs.standard_quantity, 0) - COALESCE(crid.current_quantity, 0), 0)::integer as missing_quantity,
    (ccs.item_id IS NOT NULL) as has_standard,
    COALESCE(crid.item_condition, 'good') as item_condition,
    crid.room_item_id as room_item_id,
    COALESCE(crid.is_verified, false) as is_verified,
    crid.verified_at as verified_at,
    crid.verified_by as verified_by
  FROM items i
  LEFT JOIN item_categories ic ON i.category_id = ic.id
  LEFT JOIN cte_combined_standards ccs ON i.id = ccs.item_id
  LEFT JOIN cte_room_item_data crid ON i.id = crid.item_id
  WHERE i.hotel_id = v_hotel_id
    AND i.status = 'active'
    AND (ccs.item_id IS NOT NULL OR crid.item_id IS NOT NULL)
  ORDER BY ic.sort_order NULLS LAST, ic.name, i.name;
END;
$$;