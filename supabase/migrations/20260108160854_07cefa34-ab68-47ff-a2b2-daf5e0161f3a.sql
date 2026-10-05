-- Add OTA payment related columns to room_bookings table
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS 
  ota_payment_type text DEFAULT NULL;
-- Values: 'prepaid' | 'pay_at_hotel' | 'partial_prepaid' | null

ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS 
  ota_paid_amount numeric DEFAULT 0;
-- Amount OTA collected from guest

ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS 
  ota_commission_rate numeric DEFAULT NULL;
-- OTA commission rate (%)

ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS 
  ota_commission_amount numeric DEFAULT 0;
-- OTA commission amount (calculated)

ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS 
  net_revenue numeric DEFAULT 0;
-- Net revenue = total_amount - ota_commission_amount

-- Add comment for documentation
COMMENT ON COLUMN room_bookings.ota_payment_type IS 'OTA payment type: prepaid, pay_at_hotel, partial_prepaid';
COMMENT ON COLUMN room_bookings.ota_paid_amount IS 'Amount already collected by OTA from guest';
COMMENT ON COLUMN room_bookings.ota_commission_rate IS 'OTA commission percentage';
COMMENT ON COLUMN room_bookings.ota_commission_amount IS 'Calculated OTA commission amount';
COMMENT ON COLUMN room_bookings.net_revenue IS 'Net revenue after OTA commission';