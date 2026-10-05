-- =============================================
-- PHASE 1: Route/Batch/Stop System Migration
-- =============================================

-- 1.1 Create distribution_order_batches table
CREATE TABLE IF NOT EXISTS distribution_order_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_order_id uuid NOT NULL REFERENCES distribution_orders(id) ON DELETE CASCADE,
  batch_number integer NOT NULL CHECK (batch_number >= 1),
  
  -- Status: open -> handed_over -> received -> done
  status text NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'handed_over', 'received', 'done')),
  
  -- Storekeeper hands over
  handed_over_at timestamptz,
  handed_over_by uuid REFERENCES users(id),
  
  -- Assignee receives
  received_at timestamptz,
  received_by uuid REFERENCES users(id),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE (distribution_order_id, batch_number)
);

-- Indexes for batches
CREATE INDEX IF NOT EXISTS idx_dist_batches_order ON distribution_order_batches(distribution_order_id);
CREATE INDEX IF NOT EXISTS idx_dist_batches_status ON distribution_order_batches(status) WHERE status != 'done';

-- Enable RLS
ALTER TABLE distribution_order_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for batches
CREATE POLICY "Users can view batches from their tenant"
  ON distribution_order_batches FOR SELECT
  USING (
    distribution_order_id IN (
      SELECT id FROM distribution_orders 
      WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Managers can manage batches"
  ON distribution_order_batches FOR ALL
  USING (
    distribution_order_id IN (
      SELECT id FROM distribution_orders 
      WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
    AND (
      has_role(auth.uid(), 'owner'::app_role) OR
      has_role(auth.uid(), 'hotel_manager'::app_role) OR
      has_role(auth.uid(), 'department_manager'::app_role)
    )
  );

-- 1.2 Add columns to distribution_orders (Route)
ALTER TABLE distribution_orders 
  ADD COLUMN IF NOT EXISTS floor integer;

ALTER TABLE distribution_orders 
  ADD COLUMN IF NOT EXISTS shift_date date DEFAULT CURRENT_DATE;

ALTER TABLE distribution_orders 
  ADD COLUMN IF NOT EXISTS shift_code text DEFAULT 'morning' 
    CHECK (shift_code IS NULL OR shift_code IN ('morning', 'afternoon', 'night'));

ALTER TABLE distribution_orders 
  ADD COLUMN IF NOT EXISTS batch_size integer DEFAULT 10;

ALTER TABLE distribution_orders 
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

ALTER TABLE distribution_orders 
  ADD COLUMN IF NOT EXISTS released_by uuid REFERENCES users(id);

-- Index for route filtering
CREATE INDEX IF NOT EXISTS idx_dist_orders_floor_shift 
  ON distribution_orders(hotel_id, floor, shift_date, shift_code);

-- 1.3 Add columns to distribution_order_rooms (Stop)
ALTER TABLE distribution_order_rooms 
  ADD COLUMN IF NOT EXISTS batch_number integer DEFAULT 1;

ALTER TABLE distribution_order_rooms 
  ADD COLUMN IF NOT EXISTS stop_status text DEFAULT 'pending'
    CHECK (stop_status IS NULL OR stop_status IN ('pending', 'delivered', 'cannot_access', 'resolved'));

ALTER TABLE distribution_order_rooms 
  ADD COLUMN IF NOT EXISTS exception_type text 
    CHECK (exception_type IS NULL OR exception_type IN ('guest_inside', 'dnd', 'locked', 'retry', 'other'));

ALTER TABLE distribution_order_rooms 
  ADD COLUMN IF NOT EXISTS exception_reason text;

ALTER TABLE distribution_order_rooms 
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

ALTER TABLE distribution_order_rooms 
  ADD COLUMN IF NOT EXISTS handover_to_order_id uuid REFERENCES distribution_orders(id);

ALTER TABLE distribution_order_rooms 
  ADD COLUMN IF NOT EXISTS handover_at timestamptz;

-- Indexes for stops
CREATE INDEX IF NOT EXISTS idx_dist_rooms_batch 
  ON distribution_order_rooms(distribution_order_id, batch_number);

CREATE INDEX IF NOT EXISTS idx_dist_rooms_stop_status 
  ON distribution_order_rooms(stop_status) WHERE stop_status IN ('pending', 'cannot_access');

CREATE INDEX IF NOT EXISTS idx_dist_rooms_handover 
  ON distribution_order_rooms(handover_to_order_id) 
  WHERE handover_to_order_id IS NOT NULL;

-- 1.4 Update trigger for distribution_order_batches
CREATE TRIGGER update_distribution_order_batches_updated_at
  BEFORE UPDATE ON distribution_order_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();