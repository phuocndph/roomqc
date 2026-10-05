-- Sprint 4 #33: mở rộng RPC get_room_items_with_standards để trả về sẵn
-- is_chargeable / unit_price / asset_group / default_item_type — Lean Inspection
-- không phải bắn thêm query SELECT items.in(ids) ở client mỗi lần vào trang.

DROP FUNCTION IF EXISTS public.get_room_items_with_standards(uuid);

CREATE OR REPLACE FUNCTION public.get_room_items_with_standards(p_room_id uuid)
 RETURNS TABLE(
   id uuid,
   room_id uuid,
   item_id uuid,
   quantity integer,
   standard_quantity integer,
   condition text,
   notes text,
   item_name text,
   item_code text,
   item_type text,
   category_id uuid,
   category_name text,
   unit text,
   is_chargeable boolean,
   unit_price numeric,
   asset_group text,
   default_item_type text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type text;
  v_hotel_id uuid;
BEGIN
  SELECT r.room_type, r.hotel_id INTO v_room_type, v_hotel_id
  FROM rooms r WHERE r.id = p_room_id;

  RETURN QUERY
  SELECT
    ri.id,
    ri.room_id,
    ri.item_id,
    ri.quantity,
    COALESCE(ri.standard_quantity, rts.quantity, 0)::integer as standard_quantity,
    ri.condition,
    ri.notes,
    i.name as item_name,
    i.code as item_code,
    i.item_type::text as item_type,
    i.category_id,
    ic.name as category_name,
    i.unit,
    COALESCE(i.is_chargeable, false) as is_chargeable,
    i.unit_price,
    i.asset_group::text as asset_group,
    ic.default_item_type::text as default_item_type
  FROM room_items ri
  JOIN items i ON i.id = ri.item_id
  LEFT JOIN item_categories ic ON ic.id = i.category_id
  LEFT JOIN room_type_standards rts ON rts.item_id = ri.item_id
    AND rts.room_type = v_room_type
    AND rts.hotel_id = v_hotel_id
  WHERE ri.room_id = p_room_id
  ORDER BY ic.name NULLS LAST, i.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_room_items_with_standards(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_items_with_standards(uuid) TO service_role;