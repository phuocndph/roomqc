-- Add financial tracking columns to room_bookings
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS room_price numeric DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS extra_charges numeric DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

-- Add index for payment queries
CREATE INDEX IF NOT EXISTS idx_room_bookings_payment_status ON room_bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_room_bookings_paid_at ON room_bookings(paid_at);