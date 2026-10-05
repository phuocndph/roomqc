-- =============================================
-- PHASE 2: Backfill existing data
-- =============================================

-- 2.1 Backfill floor for distribution_orders from first room
UPDATE distribution_orders dist_ord
SET floor = subq.room_floor
FROM (
  SELECT DISTINCT ON (dor.distribution_order_id)
    dor.distribution_order_id,
    r.floor as room_floor
  FROM distribution_order_rooms dor
  JOIN rooms r ON r.id = dor.room_id
  ORDER BY dor.distribution_order_id, r.floor, r.room_number
) subq
WHERE dist_ord.id = subq.distribution_order_id
  AND dist_ord.floor IS NULL;

-- 2.2 Backfill batch_number for distribution_order_rooms
WITH numbered_rooms AS (
  SELECT 
    dor.id,
    dor.distribution_order_id,
    COALESCE(dist_ord.batch_size, 10) as batch_size,
    ROW_NUMBER() OVER (
      PARTITION BY dor.distribution_order_id 
      ORDER BY r.floor, r.room_number
    ) as room_seq
  FROM distribution_order_rooms dor
  JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
  JOIN rooms r ON r.id = dor.room_id
)
UPDATE distribution_order_rooms dor
SET batch_number = CEIL(nr.room_seq::numeric / nr.batch_size)::integer
FROM numbered_rooms nr
WHERE dor.id = nr.id
  AND (dor.batch_number IS NULL OR dor.batch_number = 1);

-- 2.3 Backfill stop_status based on existing status
UPDATE distribution_order_rooms
SET stop_status = CASE
  WHEN status = 'confirmed' THEN 'delivered'
  WHEN status = 'rejected' THEN 'cannot_access'
  ELSE 'pending'
END
WHERE stop_status IS NULL OR stop_status = 'pending';

-- 2.4 Create distribution_order_batches records for existing orders
INSERT INTO distribution_order_batches (distribution_order_id, batch_number, status, created_at)
SELECT DISTINCT
  dor.distribution_order_id,
  dor.batch_number,
  CASE
    WHEN dist_ord.status = 'completed' THEN 'done'
    WHEN dist_ord.status = 'in_progress' THEN 'received'
    WHEN dist_ord.status = 'pending' THEN 'open'
    ELSE 'open'
  END,
  dist_ord.created_at
FROM distribution_order_rooms dor
JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
WHERE NOT EXISTS (
  SELECT 1 FROM distribution_order_batches dob
  WHERE dob.distribution_order_id = dor.distribution_order_id
    AND dob.batch_number = dor.batch_number
)
ORDER BY dor.distribution_order_id, dor.batch_number;

-- 2.5 Backfill released_at for completed/in_progress orders
UPDATE distribution_orders
SET released_at = started_at,
    released_by = assigned_to
WHERE released_at IS NULL 
  AND status IN ('in_progress', 'completed')
  AND started_at IS NOT NULL;