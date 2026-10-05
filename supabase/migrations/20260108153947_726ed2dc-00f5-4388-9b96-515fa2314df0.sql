-- Thêm cột booking_group_id để nhóm các booking cùng nhóm
ALTER TABLE room_bookings 
ADD COLUMN IF NOT EXISTS booking_group_id uuid DEFAULT NULL;

-- Index để query nhanh theo group
CREATE INDEX IF NOT EXISTS idx_room_bookings_group ON room_bookings(booking_group_id) 
WHERE booking_group_id IS NOT NULL;

-- Comment giải thích
COMMENT ON COLUMN room_bookings.booking_group_id IS 'ID để nhóm các booking khi khách đặt nhiều phòng cùng lúc';