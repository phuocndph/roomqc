-- Enhance item_categories table
ALTER TABLE item_categories
ADD COLUMN IF NOT EXISTS code TEXT,
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES item_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock_level INTEGER,
ADD COLUMN IF NOT EXISTS max_stock_level INTEGER,
ADD COLUMN IF NOT EXISTS reorder_point INTEGER,
ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS depreciable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS depreciation_rate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS useful_life_months INTEGER,
ADD COLUMN IF NOT EXISTS track_serial_numbers BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS require_inspection BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- Create unique code constraint
CREATE UNIQUE INDEX IF NOT EXISTS item_categories_tenant_code_unique 
ON item_categories(tenant_id, code) WHERE code IS NOT NULL;

-- Create maintenance_categories table
CREATE TABLE IF NOT EXISTS maintenance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  
  -- Auto-assignment
  default_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  default_priority TEXT DEFAULT 'medium' CHECK (default_priority IN ('low', 'medium', 'high', 'critical')),
  
  -- SLA
  sla_hours INTEGER DEFAULT 24,
  require_approval BOOLEAN DEFAULT false,
  require_photos BOOLEAN DEFAULT false,
  
  -- Checklist template
  checklist_items TEXT[],
  
  -- Display
  display_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- Create item_units table
CREATE TABLE IF NOT EXISTS item_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  symbol TEXT,
  type TEXT NOT NULL CHECK (type IN ('count', 'weight', 'volume', 'length')),
  
  -- Conversion
  base_unit_id UUID REFERENCES item_units(id) ON DELETE SET NULL,
  conversion_factor NUMERIC(10,4),
  
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- Create laundry_categories table
CREATE TABLE IF NOT EXISTS laundry_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  
  -- Pricing
  price_per_kg NUMERIC(10,2),
  price_per_item NUMERIC(10,2),
  
  -- Processing time
  standard_turnaround_hours INTEGER DEFAULT 48,
  express_turnaround_hours INTEGER,
  express_surcharge NUMERIC(10,2),
  
  -- Quality checks
  require_count_verification BOOLEAN DEFAULT true,
  require_weight_verification BOOLEAN DEFAULT true,
  
  display_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- Create room_types table (if not exists - for standardization)
CREATE TABLE IF NOT EXISTS room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  
  -- Capacity
  max_guests INTEGER DEFAULT 2,
  beds_count INTEGER DEFAULT 1,
  bed_type TEXT,
  
  -- Amenities
  has_balcony BOOLEAN DEFAULT false,
  has_kitchen BOOLEAN DEFAULT false,
  has_bathtub BOOLEAN DEFAULT false,
  square_meters NUMERIC(10,2),
  
  -- Default items assignment (JSONB array)
  default_items JSONB DEFAULT '[]',
  
  -- Pricing
  base_price NUMERIC(10,2),
  
  -- Display
  display_order INTEGER DEFAULT 0,
  icon TEXT,
  color TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_item_categories_parent ON item_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_item_categories_status ON item_categories(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_categories_tenant ON maintenance_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_item_units_tenant ON item_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_laundry_categories_tenant ON laundry_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_room_types_tenant ON room_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_room_types_hotel ON room_types(hotel_id);

-- Add RLS policies
ALTER TABLE maintenance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;

-- Policies for maintenance_categories
CREATE POLICY "Users can view categories from their tenant"
ON maintenance_categories FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage categories"
ON maintenance_categories FOR ALL
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'owner', 'hotel_manager')
  )
);

-- Policies for item_units
CREATE POLICY "Users can view units from their tenant"
ON item_units FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage units"
ON item_units FOR ALL
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'owner', 'hotel_manager')
  )
);

-- Policies for laundry_categories
CREATE POLICY "Users can view laundry categories from their tenant"
ON laundry_categories FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage laundry categories"
ON laundry_categories FOR ALL
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'owner', 'hotel_manager')
  )
);

-- Policies for room_types
CREATE POLICY "Users can view room types from their tenant"
ON room_types FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage room types"
ON room_types FOR ALL
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_admin', 'owner', 'hotel_manager')
  )
);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_maintenance_categories_updated_at
BEFORE UPDATE ON maintenance_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_units_updated_at
BEFORE UPDATE ON item_units
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_laundry_categories_updated_at
BEFORE UPDATE ON laundry_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_room_types_updated_at
BEFORE UPDATE ON room_types
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();