-- ============================================
-- Phase 1: Update RPC get_distribution_order_detail to include new fields
-- ============================================

CREATE OR REPLACE FUNCTION public.get_distribution_order_detail(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_order_exists boolean;
BEGIN
  -- Check if order exists
  SELECT EXISTS(SELECT 1 FROM distribution_orders WHERE id = p_order_id) INTO v_order_exists;
  
  IF NOT v_order_exists THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', dist_ord.id,
    'order_code', dist_ord.order_code,
    'status', dist_ord.status,
    'floor', dist_ord.floor,
    'shift_date', dist_ord.shift_date,
    'shift_code', dist_ord.shift_code,
    'batch_size', COALESCE(dist_ord.batch_size, 10),
    'total_rooms', dist_ord.total_rooms,
    'total_items', dist_ord.total_items,
    'rooms_completed', dist_ord.rooms_completed,
    'assigned_to', dist_ord.assigned_to,
    'assigned_to_name', assigned_user.full_name,
    'created_by', dist_ord.created_by,
    'created_by_name', created_user.full_name,
    'released_at', dist_ord.released_at,
    'released_by', dist_ord.released_by,
    'started_at', dist_ord.started_at,
    'completed_at', dist_ord.completed_at,
    'created_at', dist_ord.created_at,
    'notes', dist_ord.notes,
    'hotel_id', dist_ord.hotel_id,
    'rooms', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', dor.id,
          'distribution_order_id', dor.distribution_order_id,
          'room_id', dor.room_id,
          'room_number', r.room_number,
          'floor', r.floor,
          'batch_number', COALESCE(dor.batch_number, 1),
          'status', dor.status,
          'stop_status', COALESCE(dor.stop_status, 'pending'),
          'exception_type', dor.exception_type,
          'exception_reason', dor.exception_reason,
          'delivered_at', dor.delivered_at,
          'delivered_by', dor.delivered_by,
          'delivered_by_name', delivered_user.full_name,
          'confirmed_at', dor.confirmed_at,
          'confirmed_by', dor.confirmed_by,
          'confirmed_by_name', confirmed_user.full_name,
          'returned_at', dor.returned_at,
          'handover_to_order_id', dor.handover_to_order_id,
          'handover_at', dor.handover_at,
          'notes', dor.notes,
          'rejection_reason', dor.rejection_reason,
          'items', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', doi.id,
                'item_id', doi.item_id,
                'item_name', i.name,
                'item_code', i.code,
                'quantity', doi.quantity,
                'quantity_confirmed', COALESCE(doi.quantity_confirmed, 0),
                'status', doi.status
              )
              ORDER BY i.name
            )
            FROM distribution_order_items doi
            JOIN items i ON i.id = doi.item_id
            WHERE doi.distribution_order_room_id = dor.id
          ), '[]'::jsonb)
        )
        ORDER BY r.floor, r.room_number
      )
      FROM distribution_order_rooms dor
      JOIN rooms r ON r.id = dor.room_id
      LEFT JOIN users delivered_user ON delivered_user.id = dor.delivered_by
      LEFT JOIN users confirmed_user ON confirmed_user.id = dor.confirmed_by
      WHERE dor.distribution_order_id = dist_ord.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM distribution_orders dist_ord
  LEFT JOIN users assigned_user ON assigned_user.id = dist_ord.assigned_to
  LEFT JOIN users created_user ON created_user.id = dist_ord.created_by
  WHERE dist_ord.id = p_order_id;

  RETURN v_result;
END;
$$;

-- ============================================
-- Phase 2: Create trigger to auto-assign batch_number when room is inserted
-- ============================================

CREATE OR REPLACE FUNCTION public.auto_assign_batch_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_size integer;
  v_room_count integer;
  v_batch_number integer;
BEGIN
  -- Get batch_size from the distribution order (default 10)
  SELECT COALESCE(batch_size, 10) INTO v_batch_size
  FROM distribution_orders
  WHERE id = NEW.distribution_order_id;

  -- Count existing rooms for this order (before this insert)
  SELECT COUNT(*) INTO v_room_count
  FROM distribution_order_rooms
  WHERE distribution_order_id = NEW.distribution_order_id
    AND id != NEW.id;

  -- Calculate batch number (1-indexed)
  v_batch_number := (v_room_count / v_batch_size) + 1;

  -- Set the batch_number
  NEW.batch_number := v_batch_number;
  
  -- Set default stop_status if not provided
  IF NEW.stop_status IS NULL THEN
    NEW.stop_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_auto_assign_batch_number ON distribution_order_rooms;

CREATE TRIGGER trg_auto_assign_batch_number
  BEFORE INSERT ON distribution_order_rooms
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_batch_number();

-- ============================================
-- Phase 3: Create trigger to auto-create batch records after room insert
-- ============================================

CREATE OR REPLACE FUNCTION public.auto_create_batch_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_exists boolean;
BEGIN
  -- Check if batch record exists for this batch_number
  SELECT EXISTS(
    SELECT 1 FROM distribution_order_batches
    WHERE distribution_order_id = NEW.distribution_order_id
      AND batch_number = NEW.batch_number
  ) INTO v_batch_exists;

  -- Create batch record if not exists
  IF NOT v_batch_exists THEN
    INSERT INTO distribution_order_batches (
      distribution_order_id,
      batch_number,
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.distribution_order_id,
      NEW.batch_number,
      'open',
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_auto_create_batch_records ON distribution_order_rooms;

CREATE TRIGGER trg_auto_create_batch_records
  AFTER INSERT ON distribution_order_rooms
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_batch_records();

-- ============================================
-- Phase 4: Create trigger to auto-update floor on distribution_orders
-- ============================================

CREATE OR REPLACE FUNCTION public.auto_update_order_floor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_floor integer;
BEGIN
  -- Get the floor from the first room (by room_number)
  SELECT r.floor INTO v_first_floor
  FROM distribution_order_rooms dor
  JOIN rooms r ON r.id = dor.room_id
  WHERE dor.distribution_order_id = NEW.distribution_order_id
  ORDER BY r.floor, r.room_number
  LIMIT 1;

  -- Update the floor on the distribution order if not set
  IF v_first_floor IS NOT NULL THEN
    UPDATE distribution_orders
    SET floor = v_first_floor,
        updated_at = now()
    WHERE id = NEW.distribution_order_id
      AND floor IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_auto_update_order_floor ON distribution_order_rooms;

CREATE TRIGGER trg_auto_update_order_floor
  AFTER INSERT ON distribution_order_rooms
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_order_floor();

-- ============================================
-- Phase 5: Backfill batch_number for existing rooms that don't have it
-- ============================================

WITH numbered_rooms AS (
  SELECT 
    dor.id,
    dor.distribution_order_id,
    COALESCE(dist_ord.batch_size, 10) as batch_size,
    ROW_NUMBER() OVER (
      PARTITION BY dor.distribution_order_id 
      ORDER BY r.floor, r.room_number
    ) - 1 as room_index
  FROM distribution_order_rooms dor
  JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
  JOIN rooms r ON r.id = dor.room_id
  WHERE dor.batch_number IS NULL
)
UPDATE distribution_order_rooms dor
SET batch_number = (nr.room_index / nr.batch_size) + 1
FROM numbered_rooms nr
WHERE dor.id = nr.id;

-- Set default stop_status for rooms that don't have it
UPDATE distribution_order_rooms
SET stop_status = 'pending'
WHERE stop_status IS NULL;

-- ============================================
-- Phase 6: Backfill batch records for existing orders
-- ============================================

INSERT INTO distribution_order_batches (distribution_order_id, batch_number, status, created_at, updated_at)
SELECT DISTINCT 
  dor.distribution_order_id,
  dor.batch_number,
  'open',
  now(),
  now()
FROM distribution_order_rooms dor
WHERE dor.batch_number IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM distribution_order_batches dob
    WHERE dob.distribution_order_id = dor.distribution_order_id
      AND dob.batch_number = dor.batch_number
  );

-- ============================================
-- Phase 7: Backfill floor for existing orders that don't have it
-- ============================================

UPDATE distribution_orders dist_ord
SET floor = (
  SELECT r.floor
  FROM distribution_order_rooms dor
  JOIN rooms r ON r.id = dor.room_id
  WHERE dor.distribution_order_id = dist_ord.id
  ORDER BY r.floor, r.room_number
  LIMIT 1
)
WHERE dist_ord.floor IS NULL;