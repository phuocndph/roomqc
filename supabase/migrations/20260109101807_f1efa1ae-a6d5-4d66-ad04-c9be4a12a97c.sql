-- Fix RPC apply_room_standards: Remove non-existent tenant_id and updated_at columns
CREATE OR REPLACE FUNCTION public.apply_room_standards(
  p_room_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_room_type text;
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_added integer := 0;
  v_updated integer := 0;
BEGIN
  -- Get room info including hotel_id
  SELECT room_type, tenant_id, hotel_id 
  INTO v_room_type, v_tenant_id, v_hotel_id
  FROM rooms 
  WHERE id = p_room_id;

  IF v_room_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  -- Apply standards with hotel_id filter
  -- FIXED: Removed tenant_id from INSERT (column doesn't exist in room_items)
  WITH upserted AS (
    INSERT INTO room_items (room_id, item_id, quantity, standard_quantity, condition, assigned_at)
    SELECT 
      p_room_id,
      rts.item_id,
      rts.quantity,
      rts.quantity,
      'good',
      NOW()
    FROM room_type_standards rts
    JOIN items i ON i.id = rts.item_id AND i.hotel_id = v_hotel_id
    WHERE rts.room_type = v_room_type
      AND rts.tenant_id = v_tenant_id
      AND rts.hotel_id = v_hotel_id
    ON CONFLICT (room_id, item_id) 
    DO UPDATE SET 
      standard_quantity = EXCLUDED.standard_quantity,
      quantity = GREATEST(room_items.quantity, EXCLUDED.quantity)
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT 
    COUNT(*) FILTER (WHERE is_insert)::integer,
    COUNT(*) FILTER (WHERE NOT is_insert)::integer
  INTO v_added, v_updated
  FROM upserted;

  RETURN jsonb_build_object('success', true, 'added', v_added, 'updated', v_updated);
END;
$function$;

-- Fix RPC setup_room_initial: Remove non-existent tenant_id and updated_at columns
CREATE OR REPLACE FUNCTION public.setup_room_initial(
  p_room_id uuid,
  p_reset_quantities boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_room_type text;
  v_hotel_id uuid;
  v_tenant_id uuid;
  v_added integer := 0;
  v_updated integer := 0;
  v_deleted integer := 0;
BEGIN
  -- Get room info
  SELECT room_type, hotel_id, tenant_id 
  INTO v_room_type, v_hotel_id, v_tenant_id
  FROM rooms WHERE id = p_room_id;

  IF v_room_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Không tìm thấy phòng'
    );
  END IF;

  -- If reset mode, delete items not in standards
  IF p_reset_quantities THEN
    DELETE FROM room_items ri
    WHERE ri.room_id = p_room_id
    AND NOT EXISTS (
      SELECT 1 FROM room_type_standards rts 
      WHERE rts.item_id = ri.item_id 
        AND rts.room_type = v_room_type 
        AND rts.hotel_id = v_hotel_id
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  -- Upsert items from standards
  -- FIXED: Removed tenant_id from INSERT (column doesn't exist in room_items)
  WITH upserted AS (
    INSERT INTO room_items (room_id, item_id, quantity, standard_quantity, condition, assigned_at)
    SELECT 
      p_room_id,
      rts.item_id,
      rts.quantity,
      rts.quantity,
      'good',
      NOW()
    FROM room_type_standards rts
    JOIN items i ON i.id = rts.item_id AND i.hotel_id = v_hotel_id
    WHERE rts.room_type = v_room_type
      AND rts.hotel_id = v_hotel_id
    ON CONFLICT (room_id, item_id) 
    DO UPDATE SET 
      standard_quantity = EXCLUDED.standard_quantity,
      quantity = CASE 
        WHEN p_reset_quantities THEN EXCLUDED.quantity
        ELSE GREATEST(room_items.quantity, EXCLUDED.quantity)
      END
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT 
    COUNT(*) FILTER (WHERE is_insert)::integer,
    COUNT(*) FILTER (WHERE NOT is_insert)::integer
  INTO v_added, v_updated
  FROM upserted;

  RETURN jsonb_build_object(
    'success', true,
    'added', v_added,
    'updated', v_updated,
    'deleted', v_deleted,
    'message', format('Setup hoàn tất: %s thêm, %s cập nhật, %s xóa', v_added, v_updated, v_deleted)
  );
END;
$function$;