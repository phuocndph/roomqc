-- Add verification field to room_items for manual item checking
ALTER TABLE room_items 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id);

-- Add comment for clarity
COMMENT ON COLUMN room_items.is_verified IS 'Indicates if this item has been manually verified/checked in the room';
COMMENT ON COLUMN room_items.verified_at IS 'Timestamp when the item was verified';
COMMENT ON COLUMN room_items.verified_by IS 'User who verified the item';

-- Create index for quick filtering of unverified items
CREATE INDEX IF NOT EXISTS idx_room_items_unverified ON room_items(room_id, is_verified) WHERE is_verified = false;