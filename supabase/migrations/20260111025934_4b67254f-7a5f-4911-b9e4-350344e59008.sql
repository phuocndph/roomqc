-- =====================================================
-- PHASE 1: MULTI-WAREHOUSE MANAGEMENT - DATABASE FOUNDATION
-- =====================================================

-- 1. Create warehouse_location_type enum
CREATE TYPE public.warehouse_location_type AS ENUM ('warehouse', 'room', 'floor', 'external');

-- 2. Create warehouses table
CREATE TABLE public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_type public.warehouse_location_type NOT NULL DEFAULT 'warehouse',
  address TEXT,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, code)
);

-- 3. Create warehouse_stock table (inventory per warehouse)
CREATE TABLE public.warehouse_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  minimum_stock INTEGER DEFAULT 0,
  maximum_stock INTEGER,
  last_transaction_id UUID,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, item_id)
);

-- 4. Add warehouse columns to inventory_transactions
ALTER TABLE public.inventory_transactions 
ADD COLUMN from_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
ADD COLUMN to_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- 5. Create indexes for performance
CREATE INDEX idx_warehouses_tenant_id ON public.warehouses(tenant_id);
CREATE INDEX idx_warehouses_hotel_id ON public.warehouses(hotel_id);
CREATE INDEX idx_warehouses_is_default ON public.warehouses(hotel_id, is_default) WHERE is_default = true;
CREATE INDEX idx_warehouse_stock_warehouse_id ON public.warehouse_stock(warehouse_id);
CREATE INDEX idx_warehouse_stock_item_id ON public.warehouse_stock(item_id);
CREATE INDEX idx_warehouse_stock_tenant_id ON public.warehouse_stock(tenant_id);
CREATE INDEX idx_inventory_transactions_from_warehouse ON public.inventory_transactions(from_warehouse_id);
CREATE INDEX idx_inventory_transactions_to_warehouse ON public.inventory_transactions(to_warehouse_id);

-- 6. Enable RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for warehouses
CREATE POLICY "Users can view warehouses of their tenant"
ON public.warehouses FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create warehouses for their tenant"
ON public.warehouses FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update warehouses of their tenant"
ON public.warehouses FOR UPDATE
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can delete warehouses of their tenant"
ON public.warehouses FOR DELETE
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- 8. RLS Policies for warehouse_stock
CREATE POLICY "Users can view warehouse_stock of their tenant"
ON public.warehouse_stock FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create warehouse_stock for their tenant"
ON public.warehouse_stock FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update warehouse_stock of their tenant"
ON public.warehouse_stock FOR UPDATE
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can delete warehouse_stock of their tenant"
ON public.warehouse_stock FOR DELETE
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- 9. Trigger to update updated_at
CREATE TRIGGER update_warehouses_updated_at
BEFORE UPDATE ON public.warehouses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Trigger to ensure only one default warehouse per hotel
CREATE OR REPLACE FUNCTION public.ensure_single_default_warehouse()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.warehouses
    SET is_default = false
    WHERE hotel_id = NEW.hotel_id 
      AND id != NEW.id 
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ensure_single_default_warehouse_trigger
BEFORE INSERT OR UPDATE ON public.warehouses
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION public.ensure_single_default_warehouse();

-- 11. Function to create default warehouse for a hotel
CREATE OR REPLACE FUNCTION public.create_default_warehouse_for_hotel(
  p_hotel_id UUID,
  p_tenant_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_warehouse_id UUID;
  v_hotel_code TEXT;
BEGIN
  -- Get hotel code
  SELECT code INTO v_hotel_code FROM public.hotels WHERE id = p_hotel_id;
  
  -- Create default warehouse
  INSERT INTO public.warehouses (
    tenant_id,
    hotel_id,
    code,
    name,
    location_type,
    is_default,
    is_active
  ) VALUES (
    p_tenant_id,
    p_hotel_id,
    'KHO-' || COALESCE(v_hotel_code, 'MAIN'),
    'Kho chính',
    'warehouse',
    true,
    true
  )
  RETURNING id INTO v_warehouse_id;
  
  RETURN v_warehouse_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 12. Function to initialize warehouse stock from existing items
CREATE OR REPLACE FUNCTION public.initialize_warehouse_stock(
  p_warehouse_id UUID,
  p_hotel_id UUID,
  p_tenant_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Insert warehouse_stock records for all items in this hotel
  INSERT INTO public.warehouse_stock (
    warehouse_id,
    item_id,
    tenant_id,
    quantity,
    minimum_stock
  )
  SELECT 
    p_warehouse_id,
    i.id,
    p_tenant_id,
    COALESCE(i.quantity_in_stock, 0),
    COALESCE(i.minimum_stock, 0)
  FROM public.items i
  WHERE i.hotel_id = p_hotel_id
    AND i.status = 'active'
  ON CONFLICT (warehouse_id, item_id) DO NOTHING;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. Function to get warehouse stock summary
CREATE OR REPLACE FUNCTION public.get_warehouse_stock_summary(
  p_warehouse_id UUID
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  item_code TEXT,
  category_name TEXT,
  quantity INTEGER,
  minimum_stock INTEGER,
  stock_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ws.item_id,
    i.name as item_name,
    i.code as item_code,
    ic.name as category_name,
    ws.quantity,
    ws.minimum_stock,
    CASE 
      WHEN ws.quantity <= 0 THEN 'out_of_stock'
      WHEN ws.quantity <= ws.minimum_stock THEN 'low_stock'
      ELSE 'in_stock'
    END as stock_status
  FROM public.warehouse_stock ws
  JOIN public.items i ON i.id = ws.item_id
  LEFT JOIN public.item_categories ic ON ic.id = i.category_id
  WHERE ws.warehouse_id = p_warehouse_id
  ORDER BY i.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 14. Function to transfer stock between warehouses
CREATE OR REPLACE FUNCTION public.create_warehouse_transfer(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_from_warehouse_id UUID,
  p_to_warehouse_id UUID,
  p_items JSONB, -- [{ item_id, quantity, unit_price, notes }]
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_item_notes TEXT;
  v_from_quantity INTEGER;
  v_to_quantity INTEGER;
  v_transaction_code TEXT;
  v_item_record RECORD;
BEGIN
  -- Validate warehouses exist and belong to same hotel
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = p_from_warehouse_id AND hotel_id = p_hotel_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Source warehouse not found or inactive';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = p_to_warehouse_id AND hotel_id = p_hotel_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Destination warehouse not found or inactive';
  END IF;
  
  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Cannot transfer to same warehouse';
  END IF;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_item_notes := v_item->>'notes';
    
    -- Get item info
    SELECT * INTO v_item_record FROM public.items WHERE id = v_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % not found', v_item_id;
    END IF;
    
    -- Check source warehouse has enough stock
    SELECT quantity INTO v_from_quantity
    FROM public.warehouse_stock
    WHERE warehouse_id = p_from_warehouse_id AND item_id = v_item_id;
    
    IF v_from_quantity IS NULL OR v_from_quantity < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in source warehouse for item %', v_item_record.name;
    END IF;
    
    -- Generate transaction code
    v_transaction_code := 'TRF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                          SUBSTRING(gen_random_uuid()::TEXT, 1, 6);
    
    -- Create transaction record
    INSERT INTO public.inventory_transactions (
      tenant_id,
      hotel_id,
      item_id,
      transaction_type,
      transaction_category,
      transaction_code,
      quantity,
      quantity_before,
      quantity_after,
      unit_price,
      total_value,
      from_warehouse_id,
      to_warehouse_id,
      notes,
      created_by,
      transaction_date
    ) VALUES (
      p_tenant_id,
      p_hotel_id,
      v_item_id,
      'transfer',
      'internal_transfer',
      v_transaction_code,
      v_quantity,
      v_from_quantity,
      v_from_quantity - v_quantity,
      v_unit_price,
      v_unit_price * v_quantity,
      p_from_warehouse_id,
      p_to_warehouse_id,
      COALESCE(v_item_notes, p_notes),
      p_created_by,
      NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    -- Update source warehouse stock
    UPDATE public.warehouse_stock
    SET quantity = quantity - v_quantity,
        last_transaction_id = v_transaction_id,
        last_updated = NOW()
    WHERE warehouse_id = p_from_warehouse_id AND item_id = v_item_id;
    
    -- Update or create destination warehouse stock
    INSERT INTO public.warehouse_stock (
      warehouse_id,
      item_id,
      tenant_id,
      quantity,
      last_transaction_id,
      last_updated
    ) VALUES (
      p_to_warehouse_id,
      v_item_id,
      p_tenant_id,
      v_quantity,
      v_transaction_id,
      NOW()
    )
    ON CONFLICT (warehouse_id, item_id) DO UPDATE
    SET quantity = warehouse_stock.quantity + v_quantity,
        last_transaction_id = v_transaction_id,
        last_updated = NOW();
  END LOOP;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 15. Migrate existing data: Create default warehouses and move stock
DO $$
DECLARE
  v_hotel RECORD;
  v_warehouse_id UUID;
  v_items_count INTEGER;
BEGIN
  -- For each hotel, create a default warehouse and initialize stock
  FOR v_hotel IN 
    SELECT DISTINCT h.id, h.tenant_id, h.code
    FROM public.hotels h
    WHERE h.status = 'active'
  LOOP
    -- Check if default warehouse already exists
    SELECT id INTO v_warehouse_id
    FROM public.warehouses
    WHERE hotel_id = v_hotel.id AND is_default = true;
    
    IF v_warehouse_id IS NULL THEN
      -- Create default warehouse
      v_warehouse_id := public.create_default_warehouse_for_hotel(v_hotel.id, v_hotel.tenant_id);
      
      -- Initialize stock from existing items
      v_items_count := public.initialize_warehouse_stock(v_warehouse_id, v_hotel.id, v_hotel.tenant_id);
      
      RAISE NOTICE 'Created default warehouse for hotel % with % items', v_hotel.code, v_items_count;
    END IF;
  END LOOP;
END $$;

-- 16. Enable realtime for warehouse tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_stock;