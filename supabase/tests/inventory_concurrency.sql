-- ============================================================
-- Sprint 3 — Concurrency test cho create_outbound_transaction
-- ------------------------------------------------------------
-- Mục tiêu:
--   * Mở 5 phiên dblink async cùng xuất 3 đơn vị của cùng 1 SKU
--     có tồn ban đầu = 10.
--   * Kỳ vọng: 3 phiên thành công (3*3=9), 2 phiên fail với
--     "Không đủ tồn" hoặc "Không đủ hàng trong kho".
--   * Tồn kho cuối cùng = 1, không âm, không deadlock.
--
-- Cách chạy (psql với role có quyền RPC):
--   \i supabase/tests/inventory_concurrency.sql
--
-- Yêu cầu: extension `dblink` đã cài (CREATE EXTENSION IF NOT EXISTS dblink;)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS dblink;

DO $test$
DECLARE
  v_tenant_id   uuid;
  v_hotel_id    uuid;
  v_warehouse_id uuid;
  v_item_id     uuid;
  v_user_id     uuid;
  v_dsn         text;
  v_sql         text;
  v_conn_name   text;
  i             int;
  v_success     int := 0;
  v_failed      int := 0;
  v_final_stock int;
  v_warehouse_stock int;
  v_msg         text;
  v_started_at  timestamptz := clock_timestamp();
  v_elapsed_ms  int;
BEGIN
  -- 0) Pick một tenant + hotel + warehouse có sẵn để test
  SELECT t.id, h.id, w.id
    INTO v_tenant_id, v_hotel_id, v_warehouse_id
  FROM tenants t
  JOIN hotels h    ON h.tenant_id = t.id
  JOIN warehouses w ON w.hotel_id = h.id AND w.is_active = true
  ORDER BY t.created_at
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tenant/hotel/warehouse để test';
  END IF;

  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  -- 1) Tạo 1 item test với tồn = 10
  INSERT INTO items (tenant_id, hotel_id, name, code, quantity_in_stock, unit_price, is_active)
  VALUES (v_tenant_id, v_hotel_id, 'TEST-CONCURRENCY-' || extract(epoch from now())::bigint,
          'TC-' || substring(gen_random_uuid()::text, 1, 8), 10, 1000, true)
  RETURNING id INTO v_item_id;

  INSERT INTO warehouse_stock (warehouse_id, item_id, tenant_id, quantity, minimum_stock)
  VALUES (v_warehouse_id, v_item_id, v_tenant_id, 10, 0);

  RAISE NOTICE 'Setup: tenant=%, hotel=%, warehouse=%, item=%, stock=10',
    v_tenant_id, v_hotel_id, v_warehouse_id, v_item_id;

  -- 2) DSN tới chính DB (dblink dùng connection mới = phiên độc lập)
  v_dsn := format(
    'host=%s port=%s dbname=%s user=%s password=%s',
    current_setting('listen_addresses', true),  -- thường 'localhost'
    coalesce(current_setting('port', true), '5432'),
    current_database(),
    current_user,
    coalesce(current_setting('test.db_password', true), '')
  );
  -- Trên Supabase managed: dùng socket mặc định
  v_dsn := format('dbname=%s', current_database());

  -- 3) Mở 5 connection async
  v_sql := format($q$
    SELECT public.create_outbound_transaction(
      %L::uuid, %L::uuid,
      'staff_assign',
      'Warehouse', 'Test',
      %L::uuid,
      %L::jsonb,
      NULL, NULL, NULL, NULL, NULL, NULL,
      %L::uuid
    )::text
  $q$,
    v_tenant_id, v_hotel_id, v_user_id,
    jsonb_build_array(jsonb_build_object('item_id', v_item_id, 'quantity', 3)),
    v_warehouse_id
  );

  FOR i IN 1..5 LOOP
    v_conn_name := 'tx_' || i;
    BEGIN
      PERFORM dblink_connect(v_conn_name, v_dsn);
      PERFORM dblink_send_query(v_conn_name, v_sql);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Connect/send fail tx_%: %', i, SQLERRM;
    END;
  END LOOP;

  -- 4) Thu kết quả
  FOR i IN 1..5 LOOP
    v_conn_name := 'tx_' || i;
    BEGIN
      PERFORM dblink_get_result(v_conn_name);
      v_success := v_success + 1;
      RAISE NOTICE 'tx_% OK', i;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      RAISE NOTICE 'tx_% FAIL: %', i, v_msg;
    END;
    BEGIN
      PERFORM dblink_disconnect(v_conn_name);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  v_elapsed_ms := extract(milliseconds from clock_timestamp() - v_started_at)::int;

  -- 5) Đọc lại tồn
  SELECT quantity_in_stock INTO v_final_stock FROM items WHERE id = v_item_id;
  SELECT quantity INTO v_warehouse_stock
    FROM warehouse_stock WHERE warehouse_id = v_warehouse_id AND item_id = v_item_id;

  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'KẾT QUẢ: % thành công, % thất bại, elapsed=% ms',
    v_success, v_failed, v_elapsed_ms;
  RAISE NOTICE 'Tồn items.quantity_in_stock cuối: %', v_final_stock;
  RAISE NOTICE 'Tồn warehouse_stock.quantity cuối: %', v_warehouse_stock;
  RAISE NOTICE '----------------------------------------';

  -- 6) Assertion
  IF v_success <> 3 THEN
    RAISE EXCEPTION 'FAIL: kỳ vọng 3 thành công, thực tế %', v_success;
  END IF;
  IF v_failed <> 2 THEN
    RAISE EXCEPTION 'FAIL: kỳ vọng 2 thất bại, thực tế %', v_failed;
  END IF;
  IF v_final_stock <> 1 THEN
    RAISE EXCEPTION 'FAIL: kỳ vọng items.quantity_in_stock=1, thực tế %', v_final_stock;
  END IF;
  IF v_warehouse_stock <> 1 THEN
    RAISE EXCEPTION 'FAIL: kỳ vọng warehouse_stock.quantity=1, thực tế %', v_warehouse_stock;
  END IF;
  IF v_final_stock < 0 OR v_warehouse_stock < 0 THEN
    RAISE EXCEPTION 'FAIL: tồn âm — race-condition KHÔNG được chặn';
  END IF;
  IF v_elapsed_ms > 30000 THEN
    RAISE EXCEPTION 'FAIL: chạy > 30s, nghi deadlock (elapsed=% ms)', v_elapsed_ms;
  END IF;

  -- 7) Cleanup
  DELETE FROM inventory_transactions WHERE item_id = v_item_id;
  DELETE FROM warehouse_stock WHERE item_id = v_item_id;
  DELETE FROM items WHERE id = v_item_id;

  RAISE NOTICE '✅ PASS — FOR UPDATE chống vượt tồn & không deadlock';
END;
$test$;
