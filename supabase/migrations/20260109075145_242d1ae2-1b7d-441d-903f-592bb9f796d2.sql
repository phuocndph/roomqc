-- Fix apply_room_standards to filter by hotel_id
-- Create setup_room_initial for easy room setup
-- Fix existing data with wrong hotel_id mapping

-- 1. Fix apply_room_standards RPC
DROP FUNCTION IF EXISTS apply_room_standards(uuid, uuid);

CREATE OR REPLACE FUNCTION apply_room_standards(p_room_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_room_type TEXT;
  v_tenant_id UUID;
  v_hotel_id UUID;
  v_added INTEGER := 0;
  v_updated INTEGER := 0;
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
      quantity = GREATEST(room_items.quantity, EXCLUDED.quantity),
      updated_at = NOW()
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT 
    COUNT(*) FILTER (WHERE is_insert),
    COUNT(*) FILTER (WHERE NOT is_insert)
  INTO v_added, v_updated
  FROM upserted;

  -- Update room timestamp
  UPDATE rooms SET updated_at = NOW() WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true, 
    'added', v_added, 
    'updated', v_updated,
    'message', format('Đã thêm %s, cập nhật %s items', v_added, v_updated)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Create setup_room_initial RPC
CREATE OR REPLACE FUNCTION setup_room_initial(
  p_room_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_reset_quantities BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_room_type TEXT;
  v_hotel_id UUID;
  v_tenant_id UUID;
  v_added INT := 0;
  v_updated INT := 0;
  v_deleted INT := 0;
BEGIN
  -- Get room info
  SELECT room_type, hotel_id, tenant_id 
  INTO v_room_type, v_hotel_id, v_tenant_id
  FROM rooms WHERE id = p_room_id;

  IF v_room_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF p_reset_quantities THEN
    -- Reset mode: delete items not in standard
    DELETE FROM room_items del_ri
    WHERE del_ri.room_id = p_room_id
    AND NOT EXISTS (
      SELECT 1 FROM room_type_standards rts 
      WHERE rts.item_id = del_ri.item_id 
        AND rts.room_type = v_room_type 
        AND rts.hotel_id = v_hotel_id
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  -- Upsert items from standards
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
      END,
      updated_at = NOW()
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT 
    COUNT(*) FILTER (WHERE is_insert),
    COUNT(*) FILTER (WHERE NOT is_insert)
  INTO v_added, v_updated
  FROM upserted;

  -- Update room timestamp
  UPDATE rooms SET updated_at = NOW() WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'added', v_added,
    'updated', v_updated,
    'deleted', v_deleted,
    'message', format('Setup hoàn tất: %s thêm, %s cập nhật, %s xóa', v_added, v_updated, v_deleted)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Fix existing data: remove room_items with wrong hotel_id
DELETE FROM room_items del_ri
USING rooms r, items i
WHERE del_ri.room_id = r.id
  AND del_ri.item_id = i.id
  AND r.hotel_id != i.hotel_id;

-- 4. Update standard_quantity for room_items from room_type_standards
UPDATE room_items 
SET standard_quantity = rts.quantity
FROM rooms r, room_type_standards rts
WHERE room_items.room_id = r.id
  AND rts.room_type = r.room_type 
  AND rts.hotel_id = r.hotel_id 
  AND rts.item_id = room_items.item_id
  AND (room_items.standard_quantity IS NULL OR room_items.standard_quantity = 0);