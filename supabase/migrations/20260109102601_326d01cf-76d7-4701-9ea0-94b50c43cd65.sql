-- Add damage tracking columns to room_bookings
ALTER TABLE room_bookings 
ADD COLUMN IF NOT EXISTS damage_charges NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_notes TEXT,
ADD COLUMN IF NOT EXISTS damage_items JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN room_bookings.damage_charges IS 'Total damage compensation charges collected from guest';
COMMENT ON COLUMN room_bookings.damage_notes IS 'Notes about damage adjustments or waivers';
COMMENT ON COLUMN room_bookings.damage_items IS 'JSONB array of damaged/lost items with costs';