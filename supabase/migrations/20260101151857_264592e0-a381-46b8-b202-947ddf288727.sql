-- Data fix: Update room_items with cross-hotel item_ids to correct item_ids
-- Find items with same name in the correct hotel and update

-- First, fix room_items where item belongs to different hotel than room
WITH cross_hotel_items AS (
  SELECT 
    ri.id as room_item_id,
    ri.room_id,
    ri.item_id as old_item_id,
    i.name as item_name,
    r.hotel_id as room_hotel_id,
    i.hotel_id as item_hotel_id
  FROM room_items ri
  JOIN items i ON i.id = ri.item_id
  JOIN rooms r ON r.id = ri.room_id
  WHERE i.hotel_id != r.hotel_id
),
correct_items AS (
  SELECT 
    chi.room_item_id,
    chi.old_item_id,
    chi.item_name,
    i2.id as new_item_id
  FROM cross_hotel_items chi
  LEFT JOIN items i2 ON i2.hotel_id = chi.room_hotel_id 
    AND i2.name = chi.item_name 
    AND i2.status = 'active'
)
UPDATE room_items ri
SET item_id = ci.new_item_id
FROM correct_items ci
WHERE ri.id = ci.room_item_id
  AND ci.new_item_id IS NOT NULL;

-- Delete room_items that couldn't be remapped (no matching item in correct hotel)
DELETE FROM room_items ri
WHERE EXISTS (
  SELECT 1 FROM items i
  JOIN rooms r ON r.id = ri.room_id
  WHERE i.id = ri.item_id AND i.hotel_id != r.hotel_id
);

-- Create validation function to prevent cross-hotel room_items
CREATE OR REPLACE FUNCTION public.validate_room_item_hotel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_hotel_id uuid;
  v_room_hotel_id uuid;
BEGIN
  -- Get item's hotel_id
  SELECT hotel_id INTO v_item_hotel_id
  FROM items WHERE id = NEW.item_id;
  
  -- Get room's hotel_id
  SELECT hotel_id INTO v_room_hotel_id
  FROM rooms WHERE id = NEW.room_id;
  
  -- Validate they match
  IF v_item_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Item not found: %', NEW.item_id;
  END IF;
  
  IF v_room_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Room not found: %', NEW.room_id;
  END IF;
  
  IF v_item_hotel_id != v_room_hotel_id THEN
    RAISE EXCEPTION 'Item (hotel_id: %) must belong to the same hotel as the room (hotel_id: %)', 
      v_item_hotel_id, v_room_hotel_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce hotel consistency
DROP TRIGGER IF EXISTS tr_validate_room_item_hotel ON room_items;
CREATE TRIGGER tr_validate_room_item_hotel
  BEFORE INSERT OR UPDATE OF item_id, room_id ON room_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_room_item_hotel();