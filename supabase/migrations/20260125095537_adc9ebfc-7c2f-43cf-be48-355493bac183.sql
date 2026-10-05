-- Add chargeable columns to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_chargeable BOOLEAN DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN DEFAULT true;
ALTER TABLE items ADD COLUMN IF NOT EXISTS charge_price NUMERIC DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN items.is_chargeable IS 'Items that are charged to guests (minibar, snacks)';
COMMENT ON COLUMN items.is_complimentary IS 'Free items provided with room (soap, shampoo)';
COMMENT ON COLUMN items.charge_price IS 'Sale price to guest - can differ from unit_price (cost)';

-- Create chargeable_consumptions table for tracking guest charges
CREATE TABLE IF NOT EXISTS chargeable_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES room_bookings(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  item_code TEXT,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_amount NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  is_billed BOOLEAN DEFAULT false,
  billed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chargeable_consumptions_booking ON chargeable_consumptions(booking_id);
CREATE INDEX IF NOT EXISTS idx_chargeable_consumptions_tenant ON chargeable_consumptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chargeable_consumptions_room ON chargeable_consumptions(room_id);
CREATE INDEX IF NOT EXISTS idx_chargeable_consumptions_is_billed ON chargeable_consumptions(is_billed);

-- Enable RLS
ALTER TABLE chargeable_consumptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chargeable_consumptions
CREATE POLICY "Tenant users can view their own consumptions"
ON chargeable_consumptions
FOR SELECT
TO authenticated
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Tenant users can insert consumptions"
ON chargeable_consumptions
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Tenant users can update their own consumptions"
ON chargeable_consumptions
FOR UPDATE
TO authenticated
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Tenant users can delete their own consumptions"
ON chargeable_consumptions
FOR DELETE
TO authenticated
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Enable realtime for chargeable_consumptions
ALTER PUBLICATION supabase_realtime ADD TABLE chargeable_consumptions;

-- Function to calculate total chargeable consumptions for a booking
CREATE OR REPLACE FUNCTION get_booking_chargeable_total(p_booking_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(total_amount), 0)
  FROM chargeable_consumptions
  WHERE booking_id = p_booking_id AND is_billed = false;
$$;