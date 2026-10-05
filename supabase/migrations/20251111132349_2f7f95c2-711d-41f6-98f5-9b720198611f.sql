
-- Drop the old images column since we now use item_images table
ALTER TABLE items DROP COLUMN IF EXISTS images CASCADE;
