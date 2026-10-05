
-- ========================================================
-- SPRINT 1 (retry): Standardize inventory_transactions.transaction_category
-- ========================================================

-- 0) Drop legacy CHECK first so we can backfill new values
ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_category_check;

-- 1) Backfill legacy values to new canonical names
UPDATE public.inventory_transactions
SET transaction_category = 'laundry_return'
WHERE transaction_type = 'in' AND transaction_category = 'laundry';

UPDATE public.inventory_transactions
SET transaction_category = 'laundry_send'
WHERE transaction_type = 'out' AND transaction_category = 'laundry';

UPDATE public.inventory_transactions
SET transaction_category = 'other_in'
WHERE transaction_type = 'in' AND transaction_category = 'other';

UPDATE public.inventory_transactions
SET transaction_category = 'adjustment_out'
WHERE transaction_type = 'out' AND transaction_category = 'adjustment';

-- 2) Add new CHECK (room_assign kept as legacy-allowed; blocked at RPC level)
ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_category_check
  CHECK (
    transaction_category IS NULL
    OR (transaction_type = 'in' AND transaction_category IN (
      'purchase', 'return', 'return_to_stock', 'laundry_return', 'other_in'
    ))
    OR (transaction_type = 'out' AND transaction_category IN (
      'room_deliver', 'room_assign', 'staff_assign', 'laundry_send',
      'maintenance', 'disposal', 'warehouse_release', 'adjustment_out', 'other_out'
    ))
    OR (transaction_type = 'transfer' AND transaction_category IN (
      'internal_transfer'
    ))
  );

-- 3) create_inbound_transaction
CREATE OR REPLACE FUNCTION public.create_inbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_type text DEFAULT NULL::text,
  p_related_id uuid DEFAULT NULL::uuid,
  p_documents text[] DEFAULT NULL::text[],
  p_photos text[] DEFAULT NULL::text[],
  p_notes text DEFAULT NULL::text,
  p_to_warehouse_id uuid DEFAULT NULL::uuid
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
  v_result jsonb;
  v_total_items integer := 0;
  v_total_value numeric := 0;
  v_transaction_id uuid;
  v_retry_count integer := 0;
  v_max_retries integer := 5;
  v_code_exists boolean;
  v_warehouse_id uuid;
BEGIN
  IF p_transaction_category NOT IN ('purchase', 'return', 'return_to_stock', 'laundry_return', 'other_in') THEN
    RAISE EXCEPTION 'Nhóm nhập kho không hợp lệ: %', p_transaction_category;
  END IF;

  v_warehouse_id := p_to_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id
      AND is_default = true AND is_active = true
    LIMIT 1;
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

    -- Preserve historical unit_price (no override)
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

-- 4) create_outbound_transaction
CREATE OR REPLACE FUNCTION public.create_outbound_transaction(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_transaction_category text,
  p_from_location text,
  p_to_location text,
  p_created_by uuid,
  p_items jsonb,
  p_related_type text DEFAULT NULL::text,
  p_related_id uuid DEFAULT NULL::uuid,
  p_recipient_name text DEFAULT NULL::text,
  p_recipient_signature text DEFAULT NULL::text,
  p_documents text[] DEFAULT NULL::text[],
  p_photos text[] DEFAULT NULL::text[],
  p_notes text DEFAULT NULL::text,
  p_from_warehouse_id uuid DEFAULT NULL::uuid
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
    v_unit_price := COALESCE(v_item_data.unit_price, 0);
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

-- 5) delete_inventory_transaction
CREATE OR REPLACE FUNCTION public.delete_inventory_transaction(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction RECORD;
  v_hours_since_creation NUMERIC;
  v_warehouse_id UUID;
  v_skip_reverse BOOLEAN := false;
BEGIN
  SELECT * INTO v_transaction FROM inventory_transactions WHERE id = p_transaction_id;
  IF v_transaction IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy giao dịch');
  END IF;

  v_hours_since_creation := EXTRACT(EPOCH FROM (NOW() - v_transaction.created_at)) / 3600;
  IF v_hours_since_creation > 24 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể hủy giao dịch trong vòng 24 giờ');
  END IF;

  IF v_transaction.transaction_category IN (
    'laundry_send', 'laundry_return', 'adjustment_out',
    'room_deliver', 'return_to_stock', 'internal_transfer'
  ) THEN
    v_skip_reverse := true;
  END IF;

  IF v_transaction.transaction_type IN ('in', 'inbound') THEN
    v_warehouse_id := v_transaction.to_warehouse_id;
  ELSIF v_transaction.transaction_type IN ('out', 'outbound') THEN
    v_warehouse_id := v_transaction.from_warehouse_id;
  END IF;

  IF NOT v_skip_reverse THEN
    IF v_transaction.transaction_type IN ('in', 'inbound') THEN
      UPDATE items
      SET quantity_in_stock = GREATEST(0, COALESCE(quantity_in_stock, 0) - v_transaction.quantity),
          quantity_total = GREATEST(0, COALESCE(quantity_total, 0) - v_transaction.quantity),
          updated_at = NOW()
      WHERE id = v_transaction.item_id;
      IF v_warehouse_id IS NOT NULL THEN
        UPDATE warehouse_stock
        SET quantity = GREATEST(0, COALESCE(quantity, 0) - v_transaction.quantity),
            last_updated = NOW()
        WHERE warehouse_id = v_warehouse_id AND item_id = v_transaction.item_id;
      END IF;
    ELSIF v_transaction.transaction_type IN ('out', 'outbound') THEN
      UPDATE items
      SET quantity_in_stock = COALESCE(quantity_in_stock, 0) + v_transaction.quantity,
          quantity_total = COALESCE(quantity_total, 0) + v_transaction.quantity,
          updated_at = NOW()
      WHERE id = v_transaction.item_id;
      IF v_warehouse_id IS NOT NULL THEN
        UPDATE warehouse_stock
        SET quantity = COALESCE(quantity, 0) + v_transaction.quantity,
            last_updated = NOW()
        WHERE warehouse_id = v_warehouse_id AND item_id = v_transaction.item_id;
      END IF;
    END IF;
  END IF;

  DELETE FROM inventory_transactions WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', v_transaction.item_id,
    'reversed_quantity', CASE WHEN v_skip_reverse THEN 0 ELSE v_transaction.quantity END,
    'transaction_type', v_transaction.transaction_type,
    'warehouse_id', v_warehouse_id,
    'skipped_reverse', v_skip_reverse
  );
END;
$function$;
