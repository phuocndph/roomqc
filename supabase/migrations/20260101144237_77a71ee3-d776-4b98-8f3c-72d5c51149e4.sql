-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS public.get_room_items_with_standards(uuid);

-- Recreate with fixed column name (ri.condition instead of ri.status)
CREATE OR REPLACE FUNCTION public.get_room_items_with_standards(p_room_id uuid)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  item_code text,
  item_unit text,
  item_thumbnail text,
  category_id uuid,
  category_name text,
  category_color text,
  standard_quantity integer,
  current_quantity integer,
  missing_quantity integer,
  has_standard boolean,
  item_condition text
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
  FROM rooms r WHERE r.id = p_room_id;

  IF v_room_type IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH standards AS (
    SELECT 
      rts.item_id,
      rts.quantity as standard_qty
    FROM room_type_standards rts
    WHERE rts.tenant_id = v_tenant_id
      AND rts.hotel_id = v_hotel_id
      AND rts.room_type = v_room_type
  ),
  room_items AS (
    SELECT 
      ri.item_id,
      ri.quantity,
      ri.condition as item_cond
    FROM public.room_items ri
    WHERE ri.room_id = p_room_id
  ),
  item_thumbnails AS (
    SELECT DISTINCT ON (ii.item_id)
      ii.item_id,
      ii.url
    FROM item_images ii
    WHERE ii.is_primary = true
    ORDER BY ii.item_id, ii.created_at DESC
  )
  SELECT 
    i.id as item_id,
    i.name as item_name,
    i.code as item_code,
    i.unit as item_unit,
    it.url as item_thumbnail,
    i.category_id,
    ic.name as category_name,
    ic.color as category_color,
    COALESCE(s.standard_qty, 0)::integer as standard_quantity,
    COALESCE(ri.quantity, 0)::integer as current_quantity,
    GREATEST(0, COALESCE(s.standard_qty, 0) - COALESCE(ri.quantity, 0))::integer as missing_quantity,
    (s.item_id IS NOT NULL) as has_standard,
    ri.item_cond as item_condition
  FROM items i
  LEFT JOIN standards s ON s.item_id = i.id
  LEFT JOIN room_items ri ON ri.item_id = i.id
  LEFT JOIN item_categories ic ON ic.id = i.category_id
  LEFT JOIN item_thumbnails it ON it.item_id = i.id
  WHERE i.hotel_id = v_hotel_id
    AND i.tenant_id = v_tenant_id
    AND (s.item_id IS NOT NULL OR ri.item_id IS NOT NULL)
  ORDER BY ic.name NULLS LAST, i.name;
END;
$$;

-- Data-fix: Update cross-hotel room_type_standards to reference correct hotel items
WITH cross_hotel_standards AS (
  SELECT 
    rts.id as standard_id,
    rts.hotel_id as correct_hotel_id,
    rts.item_id as wrong_item_id,
    i_wrong.name as item_name
  FROM room_type_standards rts
  JOIN items i_wrong ON i_wrong.id = rts.item_id
  WHERE i_wrong.hotel_id != rts.hotel_id
),
correct_items AS (
  SELECT 
    chs.standard_id,
    i_correct.id as correct_item_id
  FROM cross_hotel_standards chs
  JOIN items i_correct ON i_correct.name = chs.item_name 
    AND i_correct.hotel_id = chs.correct_hotel_id
    AND i_correct.status = 'active'
)
UPDATE room_type_standards rts
SET item_id = ci.correct_item_id
FROM correct_items ci
WHERE rts.id = ci.standard_id;