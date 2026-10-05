-- B-Test 2: batch_inventory FIFO
-- Mục tiêu:
--   1. INSERT trực tiếp 3 batch (B1 cũ nhất → B3 mới nhất) cho cùng item.
--   2. allocate_linen_fifo phải tiêu thụ theo received_at ASC.
--   3. Batch có retired_at IS NOT NULL phải bị bỏ qua.
--   4. wash_cycles tăng đúng cho batch được pick.
--   5. Khi yêu cầu vượt tổng → trả shortage > 0.
-- An toàn: chạy trong BEGIN/ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_item   record;
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b_ret uuid;
  v_res jsonb;
  v_q1 int; v_q2 int; v_q3 int; v_q_ret int;
  v_w1 int; v_w2 int; v_w3 int;
  v_alloc_count int;
BEGIN
  SELECT id, tenant_id, hotel_id INTO v_item
  FROM items
  WHERE quantity_in_stock >= 10
  ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST SETUP FAILED: no item'; END IF;

  -- Tạo 3 batch + 1 batch retired (lưu ý: dùng INSERT trực tiếp để by-pass auth.uid() check)
  INSERT INTO batch_inventory(tenant_id, hotel_id, item_id, batch_code,
        quantity_initial, quantity_available, wash_cycles, received_at)
  VALUES (v_item.tenant_id, v_item.hotel_id, v_item.id, 'FIFO-OLD-'||gen_random_uuid(),
          10, 10, 0, now() - interval '10 days') RETURNING id INTO v_b1;

  INSERT INTO batch_inventory(tenant_id, hotel_id, item_id, batch_code,
        quantity_initial, quantity_available, wash_cycles, received_at)
  VALUES (v_item.tenant_id, v_item.hotel_id, v_item.id, 'FIFO-MID-'||gen_random_uuid(),
          10, 10, 0, now() - interval '5 days') RETURNING id INTO v_b2;

  INSERT INTO batch_inventory(tenant_id, hotel_id, item_id, batch_code,
        quantity_initial, quantity_available, wash_cycles, received_at)
  VALUES (v_item.tenant_id, v_item.hotel_id, v_item.id, 'FIFO-NEW-'||gen_random_uuid(),
          10, 10, 0, now() - interval '1 days') RETURNING id INTO v_b3;

  INSERT INTO batch_inventory(tenant_id, hotel_id, item_id, batch_code,
        quantity_initial, quantity_available, wash_cycles, received_at, retired_at)
  VALUES (v_item.tenant_id, v_item.hotel_id, v_item.id, 'FIFO-RET-'||gen_random_uuid(),
          10, 10, 0, now() - interval '20 days', now()) RETURNING id INTO v_b_ret;

  -- Case A: yêu cầu 12 → phải lấy hết B1 (10) + 2 từ B2; B3 còn nguyên; B_ret bị bỏ qua
  v_res := public.allocate_linen_fifo(v_item.id, 12);
  RAISE NOTICE '[alloc 12] result=%', v_res;

  IF (v_res->>'allocated_total')::int <> 12 OR (v_res->>'shortage')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL [fifo-A]: expected allocated=12 shortage=0, got %', v_res;
  END IF;

  SELECT quantity_available, wash_cycles INTO v_q1, v_w1 FROM batch_inventory WHERE id=v_b1;
  SELECT quantity_available, wash_cycles INTO v_q2, v_w2 FROM batch_inventory WHERE id=v_b2;
  SELECT quantity_available, wash_cycles INTO v_q3, v_w3 FROM batch_inventory WHERE id=v_b3;
  SELECT quantity_available           INTO v_q_ret      FROM batch_inventory WHERE id=v_b_ret;

  IF v_q1 <> 0  OR v_w1 <> 1 THEN RAISE EXCEPTION 'FAIL [fifo-B1]: q=% w=% (expect 0,1)', v_q1, v_w1; END IF;
  IF v_q2 <> 8  OR v_w2 <> 1 THEN RAISE EXCEPTION 'FAIL [fifo-B2]: q=% w=% (expect 8,1)', v_q2, v_w2; END IF;
  IF v_q3 <> 10 OR v_w3 <> 0 THEN RAISE EXCEPTION 'FAIL [fifo-B3]: q=% w=% (expect 10,0)', v_q3, v_w3; END IF;
  IF v_q_ret <> 10 THEN RAISE EXCEPTION 'FAIL [fifo-RET]: retired batch was touched (q=%)', v_q_ret; END IF;
  RAISE NOTICE 'PASS [fifo-A] FIFO order + retired skip';

  -- Case B: yêu cầu vượt tổng còn lại (8+10=18 ⇒ request 25 → shortage 7)
  v_res := public.allocate_linen_fifo(v_item.id, 25);
  RAISE NOTICE '[alloc 25] result=%', v_res;
  IF (v_res->>'allocated_total')::int <> 18 OR (v_res->>'shortage')::int <> 7 THEN
    RAISE EXCEPTION 'FAIL [fifo-B]: expected allocated=18 shortage=7, got %', v_res;
  END IF;
  RAISE NOTICE 'PASS [fifo-B] shortage báo cáo đúng';

  -- Case C: invalid quantity
  BEGIN
    PERFORM public.allocate_linen_fifo(v_item.id, 0);
    RAISE EXCEPTION 'FAIL [fifo-C]: quantity=0 không bị reject';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid_quantity%' THEN
      RAISE EXCEPTION 'FAIL [fifo-C]: wrong error: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS [fifo-C] invalid_quantity rejected';
  END;

  RAISE NOTICE '✅ ALL batch_inventory_fifo tests PASSED';
END $$;

ROLLBACK;
