-- Fix type mismatch for last_check_score (INTEGER -> NUMERIC cast)
DROP FUNCTION IF EXISTS public.get_rooms_filtered(uuid, uuid, integer, text, text, text, boolean) CASCADE;

CREATE OR REPLACE FUNCTION public.get_rooms_filtered(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL,
  p_floor INTEGER DEFAULT NULL,
  p_room_type TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_missing_items_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  hotel_id UUID,
  room_number TEXT,
  floor INTEGER,
  room_type TEXT,
  status TEXT,
  bed_type TEXT,
  max_guests INTEGER,
  area_sqm NUMERIC,
  base_price NUMERIC,
  amenities TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  hotel_name TEXT,
  hotel_code TEXT,
  total_items BIGINT,
  missing_items BIGINT,
  items_in_laundry BIGINT,
  last_check_at TIMESTAMPTZ,
  last_check_score NUMERIC,
  has_balcony BOOLEAN,
  has_window BOOLEAN,
  smoking_allowed BOOLEAN,
  view_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH room_standards AS (
    SELECT 
      rts.room_type,
      rts.hotel_id,
      COALESCE(SUM(rts.quantity), 0) as standard_quantity
    FROM room_type_standards rts
    WHERE rts.hotel_id = COALESCE(p_hotel_id, rts.hotel_id)
    GROUP BY rts.room_type, rts.hotel_id
  ),
  room_actual_items AS (
    SELECT 
      ri.room_id,
      COUNT(DISTINCT ri.item_id) as actual_count,
      COALESCE(SUM(ri.quantity), 0) as actual_quantity
    FROM room_items ri
    GROUP BY ri.room_id
  ),
  room_missing_calc AS (
    SELECT 
      r.id as room_id,
      GREATEST(0, COALESCE(rs.standard_quantity, 0) - COALESCE(rai.actual_quantity, 0))::BIGINT as missing_count
    FROM rooms r
    LEFT JOIN room_standards rs ON r.room_type = rs.room_type AND r.hotel_id = rs.hotel_id
    LEFT JOIN room_actual_items rai ON r.id = rai.room_id
  ),
  last_checks AS (
    SELECT DISTINCT ON (rc.room_id)
      rc.room_id,
      rc.checked_at,
      rc.cleanliness_score::NUMERIC as cleanliness_score
    FROM room_checks rc
    ORDER BY rc.room_id, rc.checked_at DESC
  )
  SELECT 
    r.id,
    r.tenant_id,
    r.hotel_id,
    r.room_number,
    r.floor,
    r.room_type,
    r.status,
    r.bed_type,
    r.max_guests,
    r.area_sqm,
    r.base_price,
    r.amenities,
    r.notes,
    r.created_at,
    r.updated_at,
    h.name as hotel_name,
    h.code as hotel_code,
    COALESCE(rai.actual_count, 0)::BIGINT as total_items,
    COALESCE(rmc.missing_count, 0)::BIGINT as missing_items,
    0::BIGINT as items_in_laundry,
    lc.checked_at as last_check_at,
    lc.cleanliness_score as last_check_score,
    r.has_balcony,
    r.has_window,
    r.smoking_allowed,
    r.view_type
  FROM rooms r
  INNER JOIN hotels h ON r.hotel_id = h.id
  LEFT JOIN room_actual_items rai ON r.id = rai.room_id
  LEFT JOIN room_missing_calc rmc ON r.id = rmc.room_id
  LEFT JOIN last_checks lc ON r.id = lc.room_id
  WHERE r.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
    AND (p_floor IS NULL OR r.floor = p_floor)
    AND (p_room_type IS NULL OR r.room_type = p_room_type)
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_search IS NULL OR r.room_number ILIKE '%' || p_search || '%')
    AND (NOT p_missing_items_only OR COALESCE(rmc.missing_count, 0) > 0)
  ORDER BY r.room_number;
END;
$$;