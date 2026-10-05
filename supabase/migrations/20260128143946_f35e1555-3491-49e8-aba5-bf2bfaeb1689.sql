-- Create booking_payments table for tracking room payment transactions
CREATE TABLE public.booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES room_bookings(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'cancelled')),
  transaction_reference TEXT UNIQUE, -- Mã chuyển khoản: BP-XXXXXX
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_booking_payments_booking ON booking_payments(booking_id);
CREATE INDEX idx_booking_payments_tenant ON booking_payments(tenant_id);
CREATE INDEX idx_booking_payments_hotel ON booking_payments(hotel_id);
CREATE INDEX idx_booking_payments_reference ON booking_payments(transaction_reference);
CREATE INDEX idx_booking_payments_status ON booking_payments(payment_status);

-- Enable RLS
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "booking_payments_select" ON booking_payments
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "booking_payments_insert" ON booking_payments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "booking_payments_update" ON booking_payments
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE booking_payments;

-- Trigger for updated_at
CREATE TRIGGER update_booking_payments_updated_at
  BEFORE UPDATE ON booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();