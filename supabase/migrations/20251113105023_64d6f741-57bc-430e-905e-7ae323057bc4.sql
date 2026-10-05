-- Create positions table for custom job titles
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  user_level_code TEXT NOT NULL CHECK (user_level_code IN ('manager', 'staff')),
  department TEXT CHECK (department IN ('housekeeping', 'laundry', 'inventory', 'maintenance', 'accounting', 'other')),
  display_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- Enable RLS
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for positions
CREATE POLICY "Users can view positions in their tenant"
  ON public.positions FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.users WHERE id = auth.uid()
  ));

CREATE POLICY "Owners and managers can manage positions"
  ON public.positions FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users 
      WHERE id = auth.uid() 
      AND user_level_code IN ('tenant_owner', 'manager')
    )
  );

-- Add position_id to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_positions_tenant ON public.positions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_positions_level ON public.positions(user_level_code);
CREATE INDEX IF NOT EXISTS idx_users_position ON public.users(position_id);

-- Insert default positions for existing tenants
INSERT INTO public.positions (tenant_id, code, name, user_level_code, department, display_order)
SELECT DISTINCT 
  t.id as tenant_id,
  'manager_general',
  'Quản lý chung',
  'manager',
  NULL,
  1
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p 
  WHERE p.tenant_id = t.id AND p.code = 'manager_general'
);

INSERT INTO public.positions (tenant_id, code, name, user_level_code, department, display_order)
SELECT DISTINCT 
  t.id as tenant_id,
  'accountant',
  'Kế toán',
  'staff',
  'accounting',
  2
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p 
  WHERE p.tenant_id = t.id AND p.code = 'accountant'
);

INSERT INTO public.positions (tenant_id, code, name, user_level_code, department, display_order)
SELECT DISTINCT 
  t.id as tenant_id,
  'warehouse_staff',
  'Nhân viên kho',
  'staff',
  'inventory',
  3
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p 
  WHERE p.tenant_id = t.id AND p.code = 'warehouse_staff'
);

INSERT INTO public.positions (tenant_id, code, name, user_level_code, department, display_order)
SELECT DISTINCT 
  t.id as tenant_id,
  'room_staff',
  'Nhân viên buồng phòng',
  'staff',
  'housekeeping',
  4
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p 
  WHERE p.tenant_id = t.id AND p.code = 'room_staff'
);

INSERT INTO public.positions (tenant_id, code, name, user_level_code, department, display_order)
SELECT DISTINCT 
  t.id as tenant_id,
  'laundry_staff',
  'Nhân viên giặt là',
  'staff',
  'laundry',
  5
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p 
  WHERE p.tenant_id = t.id AND p.code = 'laundry_staff'
);

INSERT INTO public.positions (tenant_id, code, name, user_level_code, department, display_order)
SELECT DISTINCT 
  t.id as tenant_id,
  'maintenance_staff',
  'Nhân viên bảo trì',
  'staff',
  'maintenance',
  6
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p 
  WHERE p.tenant_id = t.id AND p.code = 'maintenance_staff'
);