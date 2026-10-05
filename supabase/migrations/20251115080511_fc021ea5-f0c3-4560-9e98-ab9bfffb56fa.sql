-- Add is_launderable column to item_categories
ALTER TABLE item_categories 
ADD COLUMN IF NOT EXISTS is_launderable boolean DEFAULT false;

-- Set "Đồ vải" categories as launderable
UPDATE item_categories 
SET is_launderable = true 
WHERE name ILIKE '%vải%' OR name ILIKE '%khăn%' OR name ILIKE '%chăn%' OR name ILIKE '%ga%';

-- Add comment
COMMENT ON COLUMN item_categories.is_launderable IS 'Indicates if items in this category can be sent to laundry';