-- Add booking type and related columns to room_bookings
ALTER TABLE public.room_bookings
ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'daily' CHECK (booking_type IN ('daily', 'hourly', 'monthly')),
ADD COLUMN IF NOT EXISTS hourly_rate numeric,
ADD COLUMN IF NOT EXISTS monthly_rate numeric,
ADD COLUMN IF NOT EXISTS booking_hours integer,
ADD COLUMN IF NOT EXISTS booking_months integer,
ADD COLUMN IF NOT EXISTS hourly_start_time timestamptz,
ADD COLUMN IF NOT EXISTS hourly_end_time timestamptz;

-- Add hourly and monthly pricing to rooms table
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS hourly_price numeric DEFAULT 100000,
ADD COLUMN IF NOT EXISTS monthly_price numeric DEFAULT 5000000,
ADD COLUMN IF NOT EXISTS min_hours integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_hours integer DEFAULT 8;

-- Add index for booking_type for filtering
CREATE INDEX IF NOT EXISTS idx_room_bookings_booking_type ON public.room_bookings(booking_type);

-- Comment for documentation
COMMENT ON COLUMN public.room_bookings.booking_type IS 'Type of booking: daily (overnight), hourly (short stay), monthly (long stay)';
COMMENT ON COLUMN public.room_bookings.hourly_start_time IS 'Exact start datetime for hourly bookings';
COMMENT ON COLUMN public.room_bookings.hourly_end_time IS 'Exact end datetime for hourly bookings';
COMMENT ON COLUMN public.rooms.hourly_price IS 'Default hourly rate for this room';
COMMENT ON COLUMN public.rooms.monthly_price IS 'Default monthly rate for this room';