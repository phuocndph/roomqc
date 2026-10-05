-- Add time columns for check-in/check-out
ALTER TABLE room_bookings 
ADD COLUMN IF NOT EXISTS expected_check_in_time TIME DEFAULT '14:00',
ADD COLUMN IF NOT EXISTS expected_check_out_time TIME DEFAULT '12:00';

-- Add payment tracking columns
ALTER TABLE room_bookings 
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 0;

-- Create function to auto-calculate payment_status based on amount_paid
CREATE OR REPLACE FUNCTION calculate_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-calculate if not manually set to 'refunded'
  IF NEW.payment_status != 'refunded' THEN
    IF COALESCE(NEW.amount_paid, 0) = 0 THEN
      NEW.payment_status := 'pending';
    ELSIF COALESCE(NEW.amount_paid, 0) >= COALESCE(NEW.total_amount, 0) THEN
      NEW.payment_status := 'paid';
      -- Set paid_at if not already set
      IF NEW.paid_at IS NULL THEN
        NEW.paid_at := now();
      END IF;
    ELSE
      NEW.payment_status := 'partial';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto payment status
DROP TRIGGER IF EXISTS trigger_calculate_payment_status ON room_bookings;
CREATE TRIGGER trigger_calculate_payment_status
  BEFORE INSERT OR UPDATE OF amount_paid, total_amount
  ON room_bookings
  FOR EACH ROW
  EXECUTE FUNCTION calculate_payment_status();