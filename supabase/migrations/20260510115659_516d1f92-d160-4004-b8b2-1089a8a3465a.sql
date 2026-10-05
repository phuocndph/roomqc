-- ============================================
-- Sprint 3: FOR UPDATE locks + WAC cost
-- ============================================

-- 1) View: Weighted Average Cost per item (over all 'in' transactions)
CREATE OR REPLACE VIEW public.item_avg_cost AS
SELECT
  it.item_id,
  it.tenant_id,
  CASE
    WHEN SUM(it.quantity) > 0
      THEN SUM(it.quantity * COALESCE(it.unit_price, 0))::numeric / SUM(it.quantity)::numeric
    ELSE 0
  END AS avg_cost,
  SUM(it.quantity) AS total_qty_in,
  SUM(it.quantity * COALESCE(it.unit_price, 0)) AS total_value_in,
  MAX(it.transaction_date) AS last_inbound_at
FROM public.inventory_transactions it
WHERE it.transaction_type = 'in'
  AND COALESCE(it.unit_price, 0) > 0
GROUP BY it.item_id, it.tenant_id;

COMMENT ON VIEW public.item_avg_cost IS
  'Sprint3: Weighted Average Cost theo item dựa trên các giao dịch nhập kho có unit_price > 0.';

-- 2) RPC create_inbound_transaction — add FOR UPDATE locks
CREATE OR REPLACE FUNCTION public.create_inbound_transaction(
  p_tenant_id uuid, p_hotel_id uuid, p_transaction_category text,
  p_from_location text, p_to_location text, p_created_by uuid,
  p_items jsonb, p_related_type text DEFAULT NULL, p_related_id uuid DEFAULT NULL,
  p_documents text[] DEFAULT NULL, p_photos text[] DEFAULT NULL,
  p_notes text DEFAULT NULL, p_to_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_code text;
  v_item record;
  v_current_stock integer;
  v_new_stock integer;
  v_item_data record;
  v_total_items integer := 0;
  v_total_value numeric := 0;
  v_transaction_id uuid;
  v_retry_count integer := 0;
  v_max_retries integer := 5;
  v_code_exists boolean;
  v_warehouse_id uuid;
  v_item_ids uuid[];
BEGIN
  IF p_transaction_category NOT IN ('purchase', 'return', 'return_to_stock', 'laundry_return', 'other_in') THEN
    RAISE EXCEPTION 'Nhóm nhập kho không hợp lệ: %', p_transaction_category;
  END IF;

  v_warehouse_id := p_to_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM warehouses
    WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id
      AND is_default = true AND is_active = true
    LIMIT 1;
  END IF;

  -- Sprint3: Lock all items first (sorted) to avoid deadlock
  SELECT array_agg(DISTINCT (x->>'item_id')::uuid ORDER BY (x->>'item_id')::uuid)
    INTO v_item_ids
  FROM jsonb_array_elements(p_items) x;

  PERFORM 1 FROM items WHERE id = ANY(v_item_ids) ORDER BY id FOR UPDATE;
  IF v_warehouse_id IS NOT NULL THEN
    PERFORM 1 FROM warehouse_stock
      WHERE warehouse_id = v_warehouse_id AND item_id = ANY(v_item_ids)
      ORDER BY item_id FOR UPDATE;
  END IF;

  LOOP
    v_transaction_code := 'IN-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    SELECT EXISTS(SELECT 1 FROM inventory_transactions WHERE transaction_code = v_transaction_code) INTO v_code_exists;
    IF NOT v_code_exists THEN EXIT; END IF;
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= v_max_retries THEN
      v_transaction_code := 'IN-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, unit_price numeric, notes text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id;
    IF v_item_data IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item.item_id;
    END IF;

    v_current_stock := COALESCE(v_item_data.quantity_in_stock, 0);
    v_new_stock := v_current_stock + v_item.quantity;

    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      unit_price, total_value,
      from_location, to_location, to_warehouse_id, created_by,
      related_type, related_id, documents, photos, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_transaction_code, 'in', p_transaction_category,
      v_item.item_id, v_item.quantity, v_current_stock, v_new_stock,
      COALESCE(v_item.unit_price, v_item_data.unit_price, 0),
      v_item.quantity * COALESCE(v_item.unit_price, v_item_data.unit_price, 0),
      p_from_location, p_to_location, v_warehouse_id, p_created_by,
      p_related_type, p_related_id, p_documents, p_photos,
      COALESCE(v_item.notes, p_notes)
    )
    RETURNING id INTO v_transaction_id;

    -- Sprint3: KHÔNG ghi đè items.unit_price
    UPDATE items SET
      quantity_in_stock = v_new_stock,
      quantity_total = COALESCE(quantity_total, 0) + v_item.quantity,
      updated_at = now()
    WHERE id = v_item.item_id;

    IF v_warehouse_id IS NOT NULL THEN
      INSERT INTO warehouse_stock (warehouse_id, item_id, tenant_id, quantity, minimum_stock, last_transaction_id)
      VALUES (v_warehouse_id, v_item.item_id, p_tenant_id, v_item.quantity, 0, v_transaction_id)
      ON CONFLICT (warehouse_id, item_id) DO UPDATE
      SET quantity = warehouse_stock.quantity + v_item.quantity,
          last_transaction_id = v_transaction_id,
          last_updated = now();
    END IF;

    v_total_items := v_total_items + 1;
    v_total_value := v_total_value + (v_item.quantity * COALESCE(v_item.unit_price, v_item_data.unit_price, 0));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'total_items', v_total_items,
    'total_value', v_total_value
  );
END;
$function$;

-- 3) RPC create_outbound_transaction — FOR UPDATE + WAC
CREATE OR REPLACE FUNCTION public.create_outbound_transaction(
  p_tenant_id uuid, p_hotel_id uuid, p_transaction_category text,
  p_from_location text, p_to_location text, p_created_by uuid,
  p_items jsonb, p_related_type text DEFAULT NULL, p_related_id uuid DEFAULT NULL,
  p_recipient_name text DEFAULT NULL, p_recipient_signature text DEFAULT NULL,
  p_documents text[] DEFAULT NULL, p_photos text[] DEFAULT NULL,
  p_notes text DEFAULT NULL, p_from_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_code text;
  v_item record;
  v_current_stock integer;
  v_new_stock integer;
  v_item_data record;
  v_low_stock_items text[] := ARRAY[]::text[];
  v_transaction_id uuid;
  v_retry_count integer := 0;
  v_max_retries integer := 5;
  v_code_exists boolean;
  v_unit_price numeric;
  v_total_value numeric;
  v_warehouse_id uuid;
  v_warehouse_stock_qty integer;
  v_warehouse_name text;
  v_item_ids uuid[];
  v_avg_cost numeric;
BEGIN
  IF p_transaction_category = 'room_deliver' THEN
    RAISE EXCEPTION 'Giao đồ cho phòng phải tạo qua Phiếu cấp phát (Distribution Order)';
  END IF;
  IF p_transaction_category = 'room_assign' THEN
    RAISE EXCEPTION 'Nhóm "Cấp phòng (cũ)" đã ngừng dùng. Vui lòng tạo Phiếu cấp phát phòng';
  END IF;
  IF p_transaction_category NOT IN (
    'staff_assign', 'laundry_send', 'maintenance', 'disposal',
    'warehouse_release', 'adjustment_out', 'other_out'
  ) THEN
    RAISE EXCEPTION 'Nhóm xuất kho không hợp lệ: %', p_transaction_category;
  END IF;

  v_warehouse_id := p_from_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM warehouses
    WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id
      AND is_default = true AND is_active = true
    LIMIT 1;
  END IF;
  IF v_warehouse_id IS NOT NULL THEN
    SELECT name INTO v_warehouse_name FROM warehouses WHERE id = v_warehouse_id;
  END IF;

  -- Sprint3: Lock items + warehouse_stock in deterministic order
  SELECT array_agg(DISTINCT (x->>'item_id')::uuid ORDER BY (x->>'item_id')::uuid)
    INTO v_item_ids
  FROM jsonb_array_elements(p_items) x;

  PERFORM 1 FROM items WHERE id = ANY(v_item_ids) ORDER BY id FOR UPDATE;
  IF v_warehouse_id IS NOT NULL THEN
    PERFORM 1 FROM warehouse_stock
      WHERE warehouse_id = v_warehouse_id AND item_id = ANY(v_item_ids)
      ORDER BY item_id FOR UPDATE;
  END IF;

  LOOP
    v_transaction_code := 'OUT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
      lpad((floor(random() * 10000)::integer)::text, 4, '0');
    SELECT EXISTS(SELECT 1 FROM inventory_transactions WHERE transaction_code = v_transaction_code) INTO v_code_exists;
    IF NOT v_code_exists THEN EXIT; END IF;
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= v_max_retries THEN
      v_transaction_code := 'OUT-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  -- Validate stock (locks already held)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, notes text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id;
    IF v_item_data IS NULL THEN RAISE EXCEPTION 'Item not found: %', v_item.item_id; END IF;
    IF COALESCE(v_item_data.quantity_in_stock, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'Không đủ tồn cho sản phẩm "%". Tồn: %, Yêu cầu: %',
        v_item_data.name, COALESCE(v_item_data.quantity_in_stock, 0), v_item.quantity;
    END IF;
    IF v_warehouse_id IS NOT NULL THEN
      SELECT COALESCE(quantity, 0) INTO v_warehouse_stock_qty
      FROM warehouse_stock
      WHERE warehouse_id = v_warehouse_id AND item_id = v_item.item_id;
      IF COALESCE(v_warehouse_stock_qty, 0) < v_item.quantity THEN
        RAISE EXCEPTION 'Không đủ hàng trong kho "%" cho sản phẩm "%". Tồn: %, Yêu cầu: %',
          COALESCE(v_warehouse_name, 'Unknown'), v_item_data.name, COALESCE(v_warehouse_stock_qty, 0), v_item.quantity;
      END IF;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer, notes text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id;
    v_current_stock := COALESCE(v_item_data.quantity_in_stock, 0);
    v_new_stock := v_current_stock - v_item.quantity;

    -- Sprint3: WAC từ item_avg_cost, fallback items.unit_price
    SELECT avg_cost INTO v_avg_cost FROM item_avg_cost
      WHERE item_id = v_item.item_id AND tenant_id = p_tenant_id;
    v_unit_price := COALESCE(NULLIF(v_avg_cost, 0), v_item_data.unit_price, 0);
    v_total_value := v_item.quantity * v_unit_price;

    INSERT INTO inventory_transactions (
      tenant_id, hotel_id, transaction_code, transaction_type, transaction_category,
      item_id, quantity, quantity_before, quantity_after,
      unit_price, total_value,
      from_location, to_location, from_warehouse_id, created_by,
      related_type, related_id, documents, photos, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_transaction_code, 'out', p_transaction_category,
      v_item.item_id, v_item.quantity, v_current_stock, v_new_stock,
      v_unit_price, v_total_value,
      p_from_location, p_to_location, v_warehouse_id, p_created_by,
      p_related_type, p_related_id, p_documents, p_photos,
      COALESCE(v_item.notes, p_notes)
    )
    RETURNING id INTO v_transaction_id;

    UPDATE items SET
      quantity_in_stock = v_new_stock,
      updated_at = now()
    WHERE id = v_item.item_id;

    IF v_warehouse_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity = quantity - v_item.quantity,
          last_transaction_id = v_transaction_id,
          last_updated = now()
      WHERE warehouse_id = v_warehouse_id AND item_id = v_item.item_id;
    END IF;

    IF v_new_stock < COALESCE(v_item_data.minimum_stock, 0) THEN
      v_low_stock_items := array_append(v_low_stock_items, v_item_data.name);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_code', v_transaction_code,
    'total_items', jsonb_array_length(p_items),
    'low_stock_items', to_jsonb(v_low_stock_items)
  );
END;
$function$;

-- 4) RPC create_warehouse_transfer — FOR UPDATE locks
CREATE OR REPLACE FUNCTION public.create_warehouse_transfer(
  p_tenant_id uuid, p_hotel_id uuid,
  p_from_warehouse_id uuid, p_to_warehouse_id uuid,
  p_items jsonb, p_notes text DEFAULT NULL, p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_item_notes TEXT;
  v_from_quantity INTEGER;
  v_transaction_code TEXT;
  v_item_record RECORD;
  v_from_warehouse_name TEXT;
  v_to_warehouse_name TEXT;
  v_item_ids uuid[];
BEGIN
  SELECT name INTO v_from_warehouse_name FROM public.warehouses WHERE id = p_from_warehouse_id;
  SELECT name INTO v_to_warehouse_name FROM public.warehouses WHERE id = p_to_warehouse_id;

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

  -- Sprint3: Lock items and stock rows in deterministic order
  SELECT array_agg(DISTINCT (x->>'item_id')::uuid ORDER BY (x->>'item_id')::uuid)
    INTO v_item_ids
  FROM jsonb_array_elements(p_items) x;

  PERFORM 1 FROM items WHERE id = ANY(v_item_ids) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM warehouse_stock
    WHERE item_id = ANY(v_item_ids)
      AND warehouse_id IN (p_from_warehouse_id, p_to_warehouse_id)
    ORDER BY item_id, warehouse_id FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_item_notes := v_item->>'notes';

    SELECT * INTO v_item_record FROM public.items WHERE id = v_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % not found', v_item_id;
    END IF;

    SELECT quantity INTO v_from_quantity
    FROM public.warehouse_stock
    WHERE warehouse_id = p_from_warehouse_id AND item_id = v_item_id;

    IF v_from_quantity IS NULL OR v_from_quantity < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in source warehouse for item %', v_item_record.name;
    END IF;

    v_transaction_code := 'TRF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                          SUBSTRING(gen_random_uuid()::TEXT, 1, 6);

    INSERT INTO public.inventory_transactions (
      tenant_id, hotel_id, item_id, transaction_type, transaction_category,
      transaction_code, quantity, quantity_before, quantity_after,
      unit_price, total_value,
      from_warehouse_id, to_warehouse_id, from_location, to_location,
      notes, created_by, transaction_date
    ) VALUES (
      p_tenant_id, p_hotel_id, v_item_id, 'transfer', 'internal_transfer',
      v_transaction_code, v_quantity, v_from_quantity, v_from_quantity - v_quantity,
      v_unit_price, v_unit_price * v_quantity,
      p_from_warehouse_id, p_to_warehouse_id, v_from_warehouse_name, v_to_warehouse_name,
      COALESCE(v_item_notes, p_notes), p_created_by, NOW()
    )
    RETURNING id INTO v_transaction_id;

    UPDATE public.warehouse_stock
    SET quantity = quantity - v_quantity,
        last_transaction_id = v_transaction_id,
        last_updated = NOW()
    WHERE warehouse_id = p_from_warehouse_id AND item_id = v_item_id;

    INSERT INTO public.warehouse_stock (
      warehouse_id, item_id, tenant_id, quantity, last_transaction_id, last_updated
    ) VALUES (
      p_to_warehouse_id, v_item_id, p_tenant_id, v_quantity, v_transaction_id, NOW()
    )
    ON CONFLICT (warehouse_id, item_id) DO UPDATE
    SET quantity = warehouse_stock.quantity + v_quantity,
        last_transaction_id = v_transaction_id,
        last_updated = NOW();
  END LOOP;

  RETURN v_transaction_id;
END;
$function$;