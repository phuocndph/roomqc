-- Add standard_quantity column to room_items table
-- This column stores the expected standard quantity for each item in the room based on room type standards
ALTER TABLE room_items 
ADD COLUMN IF NOT EXISTS standard_quantity INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN room_items.standard_quantity IS 'Expected standard quantity for this item based on room type standards';

-- Create index for filtering items below standard
CREATE INDEX IF NOT EXISTS idx_room_items_below_standard 
ON room_items(room_id, quantity, standard_quantity) 
WHERE quantity < standard_quantity;