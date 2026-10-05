-- Add new JSONB columns for detailed room check tracking by item type
ALTER TABLE room_checks ADD COLUMN IF NOT EXISTS items_sent_to_laundry JSONB DEFAULT '[]'::jsonb;
ALTER TABLE room_checks ADD COLUMN IF NOT EXISTS items_consumed JSONB DEFAULT '[]'::jsonb;
ALTER TABLE room_checks ADD COLUMN IF NOT EXISTS items_replaced JSONB DEFAULT '[]'::jsonb;

-- Update items_lost to use JSONB instead of existing format for consistency
-- Note: items_lost already exists, we keep it but ensure it has proper default

COMMENT ON COLUMN room_checks.items_sent_to_laundry IS 'Linen items sent to laundry: [{item_id, item_name, quantity, notes}]';
COMMENT ON COLUMN room_checks.items_consumed IS 'Consumable items used by guest: [{item_id, item_name, quantity, need_refill}]';
COMMENT ON COLUMN room_checks.items_replaced IS 'Items replaced from stock: [{item_id, item_name, quantity, from_stock}]';