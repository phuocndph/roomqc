-- Fix apply_room_standards function to properly sync standard_quantity
CREATE OR REPLACE FUNCTION apply_room_standards(p_room_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_room_type TEXT;
  v_tenant_id UUID;
  v_items_affected INTEGER := 0;
BEGIN
  -- Get room type and tenant_id
  SELECT room_type, tenant_id INTO v_room_type, v_tenant_id 
  FROM rooms 
  WHERE id = p_room_id;
  
  IF v_room_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Room not found'
    );
  END IF;
  
  -- Apply standards: INSERT/UPDATE room_items with standard_quantity
  INSERT INTO room_items (room_id, item_id, quantity, standard_quantity, condition)
  SELECT 
    p_room_id,
    rts.item_id,
    rts.quantity,
    rts.quantity,  -- Set standard_quantity from standards
    'good'
  FROM room_type_standards rts
  WHERE rts.room_type = v_room_type
    AND rts.tenant_id = v_tenant_id
  ON CONFLICT (room_id, item_id) 
  DO UPDATE SET 
    standard_quantity = EXCLUDED.standard_quantity,  -- Always update standard
    quantity = GREATEST(room_items.quantity, EXCLUDED.quantity),  -- Keep max quantity
    updated_at = now();
  
  GET DIAGNOSTICS v_items_affected = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'items_affected', v_items_affected
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_room_standards(UUID) IS 'Applies room type standards to a specific room, syncing standard_quantity for all items';