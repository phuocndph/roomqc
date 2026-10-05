
-- =============================================
-- PHASE 1: DISTRIBUTION ORDERS SYSTEM
-- =============================================

-- 1. Add quantity_pending to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS quantity_pending integer DEFAULT 0;

-- 2. Create distribution_orders table (Phiếu giao hàng)
CREATE TABLE IF NOT EXISTS distribution_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  hotel_id UUID NOT NULL REFERENCES hotels(id),
  order_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  transaction_id UUID REFERENCES inventory_transactions(id),
  total_rooms INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create distribution_order_rooms table (Phòng trong phiếu)
CREATE TABLE IF NOT EXISTS distribution_order_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_order_id UUID NOT NULL REFERENCES distribution_orders(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'confirmed', 'rejected')),
  delivered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(distribution_order_id, room_id)
);

-- 4. Create distribution_order_items table (Đồ cho mỗi phòng)
CREATE TABLE IF NOT EXISTS distribution_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_order_room_id UUID NOT NULL REFERENCES distribution_order_rooms(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  quantity_confirmed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'confirmed', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_distribution_orders_tenant ON distribution_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_distribution_orders_hotel ON distribution_orders(hotel_id);
CREATE INDEX IF NOT EXISTS idx_distribution_orders_status ON distribution_orders(status);
CREATE INDEX IF NOT EXISTS idx_distribution_orders_assigned ON distribution_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_distribution_order_rooms_order ON distribution_order_rooms(distribution_order_id);
CREATE INDEX IF NOT EXISTS idx_distribution_order_rooms_room ON distribution_order_rooms(room_id);
CREATE INDEX IF NOT EXISTS idx_distribution_order_items_room ON distribution_order_items(distribution_order_room_id);
CREATE INDEX IF NOT EXISTS idx_distribution_order_items_item ON distribution_order_items(item_id);

-- 6. Enable RLS
ALTER TABLE distribution_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_order_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_order_items ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for distribution_orders
CREATE POLICY "Users can view distribution orders in their tenant"
  ON distribution_orders FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()) OR is_super_admin());

CREATE POLICY "Users can create distribution orders in their tenant"
  ON distribution_orders FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update distribution orders in their tenant"
  ON distribution_orders FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete distribution orders in their tenant"
  ON distribution_orders FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- 8. RLS Policies for distribution_order_rooms
CREATE POLICY "Users can view distribution order rooms"
  ON distribution_order_rooms FOR SELECT
  USING (
    distribution_order_id IN (
      SELECT id FROM distribution_orders 
      WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    ) OR is_super_admin()
  );

CREATE POLICY "Users can manage distribution order rooms"
  ON distribution_order_rooms FOR ALL
  USING (
    distribution_order_id IN (
      SELECT id FROM distribution_orders 
      WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    )
  );

-- 9. RLS Policies for distribution_order_items
CREATE POLICY "Users can view distribution order items"
  ON distribution_order_items FOR SELECT
  USING (
    distribution_order_room_id IN (
      SELECT dor.id FROM distribution_order_rooms dor
      JOIN distribution_orders d_ord ON d_ord.id = dor.distribution_order_id
      WHERE d_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    ) OR is_super_admin()
  );

CREATE POLICY "Users can manage distribution order items"
  ON distribution_order_items FOR ALL
  USING (
    distribution_order_room_id IN (
      SELECT dor.id FROM distribution_order_rooms dor
      JOIN distribution_orders d_ord ON d_ord.id = dor.distribution_order_id
      WHERE d_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    )
  );

-- 10. Create RPC function to create distribution order with outbound transaction
CREATE OR REPLACE FUNCTION create_distribution_order(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_created_by UUID,
  p_assigned_to UUID,
  p_rooms JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_order_code TEXT;
  v_room JSONB;
  v_room_id UUID;
  v_room_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_quantity INTEGER;
  v_current_stock INTEGER;
  v_total_rooms INTEGER := 0;
  v_total_items INTEGER := 0;
  v_item_totals JSONB := '{}';
  v_retry_count INTEGER := 0;
  v_code_exists BOOLEAN;
BEGIN
  -- Generate unique order code
  LOOP
    v_order_code := 'DIS-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || 
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    
    SELECT EXISTS(SELECT 1 FROM distribution_orders WHERE order_code = v_order_code)
    INTO v_code_exists;
    
    IF NOT v_code_exists THEN EXIT; END IF;
    
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= 5 THEN
      v_order_code := 'DIS-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  -- First pass: aggregate total quantities needed per item and validate stock
  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
  LOOP
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'items')
    LOOP
      v_item_id := (v_item->>'item_id')::UUID;
      v_quantity := (v_item->>'quantity')::INTEGER;
      
      IF v_item_totals ? v_item_id::TEXT THEN
        v_item_totals := jsonb_set(v_item_totals, ARRAY[v_item_id::TEXT], 
          to_jsonb((v_item_totals->>v_item_id::TEXT)::INTEGER + v_quantity));
      ELSE
        v_item_totals := jsonb_set(v_item_totals, ARRAY[v_item_id::TEXT], to_jsonb(v_quantity));
      END IF;
    END LOOP;
  END LOOP;

  -- Validate all items have sufficient stock
  FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals)
  LOOP
    v_quantity := (v_item_totals->>v_item_id::TEXT)::INTEGER;
    
    SELECT quantity_in_stock INTO v_current_stock
    FROM items WHERE id = v_item_id AND tenant_id = p_tenant_id;
    
    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item_id;
    END IF;
    
    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Không đủ hàng trong kho. Yêu cầu: %, Tồn kho: %', v_quantity, v_current_stock;
    END IF;
  END LOOP;

  -- Create distribution order
  INSERT INTO distribution_orders (tenant_id, hotel_id, order_code, created_by, assigned_to, notes)
  VALUES (p_tenant_id, p_hotel_id, v_order_code, p_created_by, p_assigned_to, p_notes)
  RETURNING id INTO v_order_id;

  -- Process each room
  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms)
  LOOP
    v_room_id := (v_room->>'room_id')::UUID;
    v_total_rooms := v_total_rooms + 1;
    
    INSERT INTO distribution_order_rooms (distribution_order_id, room_id)
    VALUES (v_order_id, v_room_id)
    RETURNING id INTO v_room_order_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_room->'items')
    LOOP
      v_item_id := (v_item->>'item_id')::UUID;
      v_quantity := (v_item->>'quantity')::INTEGER;
      v_total_items := v_total_items + v_quantity;
      
      INSERT INTO distribution_order_items (distribution_order_room_id, item_id, quantity)
      VALUES (v_room_order_id, v_item_id, v_quantity);
    END LOOP;
  END LOOP;

  -- Update items: decrease stock, increase pending
  FOR v_item_id IN SELECT key::UUID FROM jsonb_each_text(v_item_totals)
  LOOP
    v_quantity := (v_item_totals->>v_item_id::TEXT)::INTEGER;
    
    UPDATE items SET
      quantity_in_stock = quantity_in_stock - v_quantity,
      quantity_pending = COALESCE(quantity_pending, 0) + v_quantity,
      updated_at = now()
    WHERE id = v_item_id;
  END LOOP;

  UPDATE distribution_orders SET
    total_rooms = v_total_rooms,
    total_items = v_total_items
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_code', v_order_code,
    'total_rooms', v_total_rooms,
    'total_items', v_total_items
  );
END;
$$;

-- 11. Create RPC function to complete room delivery
CREATE OR REPLACE FUNCTION complete_room_delivery(
  p_distribution_order_room_id UUID,
  p_confirmed_by UUID,
  p_items JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id UUID;
  v_order_id UUID;
  v_tenant_id UUID;
  v_item RECORD;
  v_confirmed_qty INTEGER;
  v_all_rooms_completed BOOLEAN;
BEGIN
  SELECT dor.room_id, dor.distribution_order_id, d_ord.tenant_id
  INTO v_room_id, v_order_id, v_tenant_id
  FROM distribution_order_rooms dor
  JOIN distribution_orders d_ord ON d_ord.id = dor.distribution_order_id
  WHERE dor.id = p_distribution_order_room_id;
  
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Distribution order room not found';
  END IF;

  FOR v_item IN 
    SELECT doi.id, doi.item_id, doi.quantity, doi.quantity_confirmed
    FROM distribution_order_items doi
    WHERE doi.distribution_order_room_id = p_distribution_order_room_id
  LOOP
    IF p_items IS NOT NULL THEN
      SELECT (item->>'quantity_confirmed')::INTEGER INTO v_confirmed_qty
      FROM jsonb_array_elements(p_items) AS item
      WHERE (item->>'item_id')::UUID = v_item.item_id;
      
      IF v_confirmed_qty IS NULL THEN
        v_confirmed_qty := v_item.quantity;
      END IF;
    ELSE
      v_confirmed_qty := v_item.quantity;
    END IF;
    
    UPDATE distribution_order_items SET
      quantity_confirmed = v_confirmed_qty,
      status = 'confirmed',
      updated_at = now()
    WHERE id = v_item.id;
    
    INSERT INTO room_items (room_id, item_id, quantity, standard_quantity, condition, is_verified, verified_at, verified_by)
    VALUES (v_room_id, v_item.item_id, v_confirmed_qty, v_confirmed_qty, 'good', true, now(), p_confirmed_by)
    ON CONFLICT (room_id, item_id) DO UPDATE SET
      quantity = room_items.quantity + v_confirmed_qty,
      is_verified = true,
      verified_at = now(),
      verified_by = p_confirmed_by,
      updated_at = now();
    
    UPDATE items SET
      quantity_pending = GREATEST(0, COALESCE(quantity_pending, 0) - v_confirmed_qty),
      quantity_in_use = COALESCE(quantity_in_use, 0) + v_confirmed_qty,
      updated_at = now()
    WHERE id = v_item.item_id;
  END LOOP;

  UPDATE distribution_order_rooms SET
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = p_confirmed_by,
    updated_at = now()
  WHERE id = p_distribution_order_room_id;

  SELECT NOT EXISTS(
    SELECT 1 FROM distribution_order_rooms
    WHERE distribution_order_id = v_order_id AND status != 'confirmed'
  ) INTO v_all_rooms_completed;

  IF v_all_rooms_completed THEN
    UPDATE distribution_orders SET
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'all_completed', v_all_rooms_completed
  );
END;
$$;

-- 12. Create function to get distribution orders with details
CREATE OR REPLACE FUNCTION get_distribution_orders_filtered(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  order_code TEXT,
  status TEXT,
  total_rooms INTEGER,
  total_items INTEGER,
  rooms_completed INTEGER,
  assigned_to UUID,
  assigned_to_name TEXT,
  created_by UUID,
  created_by_name TEXT,
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT 
      d_ord.id,
      d_ord.order_code,
      d_ord.status,
      d_ord.total_rooms,
      d_ord.total_items,
      (SELECT COUNT(*) FROM distribution_order_rooms dor WHERE dor.distribution_order_id = d_ord.id AND dor.status = 'confirmed')::INTEGER as rooms_completed,
      d_ord.assigned_to,
      au.full_name as assigned_to_name,
      d_ord.created_by,
      cu.full_name as created_by_name,
      d_ord.notes,
      d_ord.started_at,
      d_ord.completed_at,
      d_ord.created_at
    FROM distribution_orders d_ord
    LEFT JOIN users au ON au.id = d_ord.assigned_to
    LEFT JOIN users cu ON cu.id = d_ord.created_by
    WHERE d_ord.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR d_ord.hotel_id = p_hotel_id)
      AND (p_status IS NULL OR d_ord.status = p_status)
      AND (p_assigned_to IS NULL OR d_ord.assigned_to = p_assigned_to)
  )
  SELECT 
    f.*,
    COUNT(*) OVER() as total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 13. Create function to get distribution order detail
CREATE OR REPLACE FUNCTION get_distribution_order_detail(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', d_ord.id,
    'order_code', d_ord.order_code,
    'status', d_ord.status,
    'total_rooms', d_ord.total_rooms,
    'total_items', d_ord.total_items,
    'assigned_to', d_ord.assigned_to,
    'assigned_to_name', au.full_name,
    'created_by', d_ord.created_by,
    'created_by_name', cu.full_name,
    'notes', d_ord.notes,
    'started_at', d_ord.started_at,
    'completed_at', d_ord.completed_at,
    'created_at', d_ord.created_at,
    'rooms', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', dor.id,
          'room_id', dor.room_id,
          'room_number', r.room_number,
          'floor', r.floor,
          'status', dor.status,
          'confirmed_at', dor.confirmed_at,
          'confirmed_by_name', cbu.full_name,
          'items', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', doi.id,
                'item_id', doi.item_id,
                'item_name', i.name,
                'item_code', i.code,
                'quantity', doi.quantity,
                'quantity_confirmed', doi.quantity_confirmed,
                'status', doi.status
              )
            )
            FROM distribution_order_items doi
            JOIN items i ON i.id = doi.item_id
            WHERE doi.distribution_order_room_id = dor.id
          )
        )
        ORDER BY r.floor, r.room_number
      )
      FROM distribution_order_rooms dor
      JOIN rooms r ON r.id = dor.room_id
      LEFT JOIN users cbu ON cbu.id = dor.confirmed_by
      WHERE dor.distribution_order_id = d_ord.id
    )
  )
  INTO v_result
  FROM distribution_orders d_ord
  LEFT JOIN users au ON au.id = d_ord.assigned_to
  LEFT JOIN users cu ON cu.id = d_ord.created_by
  WHERE d_ord.id = p_order_id;
  
  RETURN v_result;
END;
$$;

-- 14. Trigger to update distribution order status when started
CREATE OR REPLACE FUNCTION update_distribution_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status = 'pending' THEN
    UPDATE distribution_orders SET
      status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      updated_at = now()
    WHERE id = NEW.distribution_order_id AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_distribution_order_status ON distribution_order_rooms;
CREATE TRIGGER trigger_distribution_order_status
  AFTER UPDATE ON distribution_order_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_distribution_order_status();
