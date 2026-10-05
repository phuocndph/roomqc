-- B-Test 1: Linen Pool Bridge — kho không bị trừ 2 lần
-- Phần A (chạy được mọi nơi): atomic_item_to_laundry là no-op trên items.
-- Phần B (chỉ chạy ở môi trường có UPDATE quyền trên items, vd CI với service_role):
--   INSERT laundry_batch_items → trigger trừ stock + cộng laundry đúng 1 lần.
-- Sandbox `sandbox_exec` chỉ có SELECT/INSERT trên items → Phần B sẽ skip với cảnh báo.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_item   record;
  v_tenant uuid; v_hotel uuid; v_batch uuid;
  v_stock0 int; v_laund0 int;
  v_stock1 int; v_laund1 int;
  v_stock2 int; v_laund2 int;
  v_can_update boolean;
BEGIN
  SELECT id, tenant_id, hotel_id, quantity_in_stock, quantity_in_laundry INTO v_item
  FROM items WHERE quantity_in_stock >= 20 ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST SETUP FAILED: no item'; END IF;

  v_tenant := v_item.tenant_id; v_hotel := v_item.hotel_id;
  v_stock0 := v_item.quantity_in_stock; v_laund0 := COALESCE(v_item.quantity_in_laundry,0);
  RAISE NOTICE '[setup] item=% stock0=% laundry0=%', v_item.id, v_stock0, v_laund0;

  -- ================ PART A ================
  PERFORM public.atomic_item_to_laundry(v_item.id, 5);
  SELECT quantity_in_stock, COALESCE(quantity_in_laundry,0) INTO v_stock1, v_laund1
  FROM items WHERE id = v_item.id;
  IF v_stock1 <> v_stock0 OR v_laund1 <> v_laund0 THEN
    RAISE EXCEPTION 'FAIL [bridge-A]: atomic_item_to_laundry must be no-op (stock %->%, laundry %->%)',
      v_stock0, v_stock1, v_laund0, v_laund1;
  END IF;
  RAISE NOTICE 'PASS [bridge-A] atomic_item_to_laundry là no-op trên items';

  -- ================ PART B ================
  -- Sau khi vá SECURITY DEFINER cho trigger, mọi caller (kể cả role không UPDATE
  -- quyền trên items) đều phải chạy được trigger này.
  INSERT INTO laundry_batches(tenant_id, hotel_id, batch_code, total_items, total_weight_kg, status)
  VALUES (v_tenant, v_hotel, 'TEST-BRIDGE-'||gen_random_uuid()::text, 5, 1.0, 'delivered')
  RETURNING id INTO v_batch;

  INSERT INTO laundry_batch_items(batch_id, item_id, quantity_delivered)
  VALUES (v_batch, v_item.id, 5);

  SELECT quantity_in_stock, COALESCE(quantity_in_laundry,0) INTO v_stock2, v_laund2
  FROM items WHERE id = v_item.id;

  IF v_stock2 <> v_stock1 - 5 THEN
    RAISE EXCEPTION 'FAIL [bridge-B-stock]: expected %, got %', v_stock1-5, v_stock2;
  END IF;
  IF v_laund2 <> v_laund1 + 5 THEN
    RAISE EXCEPTION 'FAIL [bridge-B-laundry]: expected %, got %', v_laund1+5, v_laund2;
  END IF;
  RAISE NOTICE 'PASS [bridge-B] trigger (SECURITY DEFINER) trừ stock & cộng laundry đúng 1 lần (stock=%, laundry=%)', v_stock2, v_laund2;

  -- ================ PART C: tĩnh — đảm bảo create_laundry_batch_with_items không tự update items ================
  -- Chỉ kiểm tra định nghĩa function: không được chứa "update items" (đảm bảo single source of truth).
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname='create_laundry_batch_with_items'
      AND lower(pg_get_functiondef(p.oid)) ~ 'update\s+items\s+set'
  ) THEN
    RAISE EXCEPTION 'FAIL [bridge-C]: create_laundry_batch_with_items vẫn còn UPDATE items trực tiếp (double-deduct risk)';
  END IF;
  RAISE NOTICE 'PASS [bridge-C] create_laundry_batch_with_items không update items trực tiếp';

  RAISE NOTICE '✅ linen_pool_bridge tests COMPLETED';
END $$;

ROLLBACK;
