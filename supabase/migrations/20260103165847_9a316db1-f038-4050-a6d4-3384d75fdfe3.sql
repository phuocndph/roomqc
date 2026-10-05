-- Add payment detail columns to room_bookings
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS early_checkin_charge NUMERIC DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS late_checkout_charge NUMERIC DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS service_charges NUMERIC DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 8;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS service_fee_rate NUMERIC DEFAULT 5;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS service_fee_amount NUMERIC DEFAULT 0;
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;

-- Create room pricing rules table for configurable surcharges
CREATE TABLE IF NOT EXISTS room_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  
  -- Standard times
  standard_checkin_time TIME DEFAULT '14:00',
  standard_checkout_time TIME DEFAULT '12:00',
  
  -- Early check-in surcharge (% of room price)
  early_checkin_5_9 NUMERIC DEFAULT 50,
  early_checkin_9_14 NUMERIC DEFAULT 30,
  
  -- Late check-out surcharge (% of room price)
  late_checkout_12_15 NUMERIC DEFAULT 30,
  late_checkout_15_18 NUMERIC DEFAULT 50,
  late_checkout_after_18 NUMERIC DEFAULT 100,
  
  -- Tax and fees
  default_vat_rate NUMERIC DEFAULT 8,
  default_service_fee_rate NUMERIC DEFAULT 5,
  
  -- Seasonal pricing
  weekend_surcharge NUMERIC DEFAULT 15,
  high_season_surcharge NUMERIC DEFAULT 25,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tenant_id, hotel_id)
);

-- Enable RLS on room_pricing_rules
ALTER TABLE room_pricing_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies for room_pricing_rules
CREATE POLICY "Users can view pricing rules for their tenant"
  ON room_pricing_rules FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can manage pricing rules for their tenant"
  ON room_pricing_rules FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_room_pricing_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_room_pricing_rules_timestamp
  BEFORE UPDATE ON room_pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_room_pricing_rules_updated_at();

-- Update calculate_payment_status function to use subtotal
CREATE OR REPLACE FUNCTION calculate_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate subtotal if not set
  IF NEW.subtotal IS NULL OR NEW.subtotal = 0 THEN
    NEW.subtotal := COALESCE(NEW.room_price, 0) * 
      GREATEST(1, EXTRACT(DAY FROM (NEW.check_out_date - NEW.check_in_date)))
      + COALESCE(NEW.early_checkin_charge, 0)
      + COALESCE(NEW.late_checkout_charge, 0)
      + COALESCE(NEW.service_charges, 0)
      + COALESCE(NEW.extra_charges, 0);
  END IF;
  
  -- Calculate VAT
  NEW.vat_amount := NEW.subtotal * COALESCE(NEW.vat_rate, 8) / 100;
  
  -- Calculate service fee
  NEW.service_fee_amount := NEW.subtotal * COALESCE(NEW.service_fee_rate, 5) / 100;
  
  -- Calculate total amount
  NEW.total_amount := NEW.subtotal + COALESCE(NEW.vat_amount, 0) + COALESCE(NEW.service_fee_amount, 0);
  
  -- Calculate payment status
  IF COALESCE(NEW.amount_paid, 0) + COALESCE(NEW.deposit_amount, 0) >= NEW.total_amount THEN
    NEW.payment_status := 'paid';
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  ELSIF COALESCE(NEW.amount_paid, 0) + COALESCE(NEW.deposit_amount, 0) > 0 THEN
    NEW.payment_status := 'partial';
  ELSE
    NEW.payment_status := 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;