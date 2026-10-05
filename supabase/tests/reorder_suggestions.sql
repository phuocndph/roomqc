-- =============================================================================
-- Test suite: reorder_suggestions (Inventory Intelligence C1)
-- Mục tiêu: Verify 7 case của trigger realtime + RPC compute/approve/ignore
--   1. compute tạo đúng đề xuất cho item dưới ngưỡng (A,D); skip B,C
--   2. compute idempotent — không tạo trùng (unique partial index)
--   3. Trigger realtime trên outbound transaction → tự sinh suggestion + last_outbound_at
--   4. ignore_reorder_suggestion → status=ignored + ignored_until tương lai
--   5. compute tôn trọng ignored_until → không sinh lại suggestion đang ignore
--   6. approve_reorder_suggestions gom theo (hotel,vendor) → tạo PO draft
--   7. Guard: no_pending_suggestions + forbidden_approve khi user không có role
--
-- Chạy:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/reorder_suggestions.sql
--   (cần role có quyền UPDATE/DELETE trên public.items, public.user_roles —
--    service_role hoặc postgres trong staging; KHÔNG dùng sandbox_exec)
--
  -- ✅ KẾT QUẢ (2026-05-06, sau migration fix RPC):
--   - TEST 1–5: PASS (12 assertion)
--   - TEST 6: PASS sau khi RPC bỏ insert total_price (GENERATED) và
--            skip suggestion thiếu preferred_vendor (vendor_id NOT NULL).
--   - TEST 7: PASS — guards no_pending_suggestions + forbidden_approve OK.
-- An toàn: Toàn bộ chạy trong 1 transaction, ROLLBACK ở cuối → không ảnh hưởng prod
-- =============================================================================

BEGIN;
SET LOCAL row_security = off;


-- Helper assertion (sẽ ROLLBACK cùng transaction)
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(_label text, _actual text, _expected text)
RETURNS int LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS NOT DISTINCT FROM _expected THEN
    RAISE NOTICE '  ✅ % | got=%', _label, _actual;
    RETURN 1;
  ELSE
    RAISE WARNING '  ❌ % | expected=% got=%', _label, _expected, _actual;
    RETURN 0;
  END IF;
END;
$$;

DO $TEST$
DECLARE
  v_tenant_id  uuid;
  v_hotel_id   uuid;
  v_user_id    uuid;
  v_vendor_id  uuid;
  v_vendor_id2 uuid;
  v_cat_id     uuid;
  v_item_a     uuid;  -- below reorder_point → expect suggestion
  v_item_b     uuid;  -- above reorder_point → expect NO suggestion
  v_item_c     uuid;  -- no reorder_point set → expect NO suggestion
  v_item_d     uuid;  -- below + no preferred_vendor → fallback group
  v_item_e     uuid;  -- chỉ dùng cho TEST 3 (chưa compute trước)
  v_sugg_id    uuid;
  v_sugg_a     uuid;
  v_sugg_d     uuid;
  v_po_id      uuid;
  v_count      int;
  v_result     jsonb;
  v_failed     int := 0;
  v_passed     int := 0;
  v_total      int := 0;

BEGIN
  -- ───────────────────────────────────────────────────────────────────────────
  -- SETUP: pick a real tenant/hotel để có FK hợp lệ; tạo user fake để bypass auth
  -- ───────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'NO_TENANT_FOUND — cần ít nhất 1 tenant trong DB'; END IF;

  SELECT id INTO v_hotel_id FROM public.hotels WHERE tenant_id = v_tenant_id LIMIT 1;
  IF v_hotel_id IS NULL THEN RAISE EXCEPTION 'NO_HOTEL_FOUND cho tenant %', v_tenant_id; END IF;

  -- Lấy user thật có role owner/hotel_manager/super_admin để pass permission check
  SELECT ur.user_id INTO v_user_id
  FROM public.user_roles ur
  WHERE ur.role IN ('super_admin'::app_role, 'owner'::app_role, 'hotel_manager'::app_role)
  LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'NO_PRIVILEGED_USER — cần ít nhất 1 user có role owner/hotel_manager'; END IF;

  -- Set jwt.claims để auth.uid() trả về user này
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);

  -- 2 vendors khác nhau để test gom theo vendor → 2 PO riêng
  INSERT INTO public.vendors (tenant_id, name, code, category)
  VALUES (v_tenant_id, 'TEST Vendor Reorder',
          'TEST-V-RO-' || substr(gen_random_uuid()::text, 1, 8), 'supplier')
  RETURNING id INTO v_vendor_id;

  INSERT INTO public.vendors (tenant_id, name, code, category)
  VALUES (v_tenant_id, 'TEST Vendor Reorder 2',
          'TEST-V-RO2-' || substr(gen_random_uuid()::text, 1, 8), 'supplier')
  RETURNING id INTO v_vendor_id2;

  -- Category (nếu cần)
  SELECT id INTO v_cat_id FROM public.item_categories WHERE tenant_id = v_tenant_id LIMIT 1;

  -- Items
  INSERT INTO public.items (tenant_id, hotel_id, category_id, name, unit, unit_price,
                            quantity_in_stock, quantity_total, minimum_stock,
                            reorder_point, reorder_max_qty, preferred_vendor_id, status)
  VALUES (v_tenant_id, v_hotel_id, v_cat_id, 'TEST_RO_A_below', 'cái', 10000,
          5, 5, 3, 10, 50, v_vendor_id, 'active')
  RETURNING id INTO v_item_a;

  INSERT INTO public.items (tenant_id, hotel_id, category_id, name, unit, unit_price,
                            quantity_in_stock, quantity_total, minimum_stock,
                            reorder_point, reorder_max_qty, preferred_vendor_id, status)
  VALUES (v_tenant_id, v_hotel_id, v_cat_id, 'TEST_RO_B_above', 'cái', 10000,
          100, 100, 3, 10, 50, v_vendor_id, 'active')
  RETURNING id INTO v_item_b;

  INSERT INTO public.items (tenant_id, hotel_id, category_id, name, unit, unit_price,
                            quantity_in_stock, quantity_total, minimum_stock,
                            reorder_point, status)
  VALUES (v_tenant_id, v_hotel_id, v_cat_id, 'TEST_RO_C_no_threshold', 'cái', 10000,
          0, 0, 0, 0, 'active')
  RETURNING id INTO v_item_c;

  INSERT INTO public.items (tenant_id, hotel_id, category_id, name, unit, unit_price,
                            quantity_in_stock, quantity_total, minimum_stock,
                            reorder_point, reorder_max_qty, preferred_vendor_id, status)
  VALUES (v_tenant_id, v_hotel_id, v_cat_id, 'TEST_RO_D_vendor2', 'cái', 8000,
          2, 2, 1, 5, 20, v_vendor_id2, 'active')
  RETURNING id INTO v_item_d;

  RAISE NOTICE '────────────────────────────────────────────────────────────';
  RAISE NOTICE 'SETUP done: tenant=% hotel=% items=A/B/C/D', v_tenant_id, v_hotel_id;
  RAISE NOTICE '────────────────────────────────────────────────────────────';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TEST 1: compute_reorder_suggestions tạo đúng 2 đề xuất (A, D); skip B, C
  -- ═══════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '🧪 TEST 1 — compute tạo đúng đề xuất cho item dưới ngưỡng';

  -- Scope theo từng item test để tránh nhiễu bởi item thật của tenant
  v_result := public.compute_reorder_suggestions(v_tenant_id, v_hotel_id, v_item_a);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  item A: created = 1', ((v_result->>'created')::int)::text, '1');

  v_result := public.compute_reorder_suggestions(v_tenant_id, v_hotel_id, v_item_d);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  item D: created = 1', ((v_result->>'created')::int)::text, '1');

  v_result := public.compute_reorder_suggestions(v_tenant_id, v_hotel_id, v_item_b);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  item B (đủ stock): created = 0', ((v_result->>'created')::int)::text, '0');

  v_result := public.compute_reorder_suggestions(v_tenant_id, v_hotel_id, v_item_c);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  item C (no threshold): created = 0', ((v_result->>'created')::int)::text, '0');

  SELECT count(*) INTO v_count FROM public.reorder_suggestions
   WHERE item_id IN (v_item_b, v_item_c);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  không có row nào cho B, C', (v_count)::text, '0');

  -- Verify suggested_qty = max(reorder_max_qty, reorder_point*2) - effective_stock
  -- Item A: max(50, 10*2)=50, effective=5, suggested=45
  SELECT suggested_qty INTO v_count FROM public.reorder_suggestions WHERE item_id = v_item_a;
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  item A suggested_qty = 45', (v_count)::text, '45');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TEST 2: idempotent — gọi lại compute không tạo trùng (unique partial index)
  -- ═══════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '🧪 TEST 2 — compute idempotent (không tạo trùng)';
  v_result := public.compute_reorder_suggestions(v_tenant_id, v_hotel_id, v_item_a);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  item A lần 2: created = 0', ((v_result->>'created')::int)::text, '0');
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  item A lần 2: skipped = 1', ((v_result->>'skipped')::int)::text, '1');

  SELECT count(*) INTO v_count FROM public.reorder_suggestions
   WHERE item_id IN (v_item_a, v_item_d) AND status = 'pending';
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  vẫn chỉ có 2 row pending cho A,D (no duplicate)', (v_count)::text, '2');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TEST 3: realtime trigger — INSERT inventory_transactions kiểu 'out' tự sinh
  --        suggestion + cập nhật last_outbound_at (KHÔNG cần UPDATE items)
  -- ═══════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '🧪 TEST 3 — trigger realtime trên outbound transaction';

  -- Tạo item E mới đã sẵn dưới ngưỡng (stock=2, reorder_point=10), chưa compute
  INSERT INTO public.items (tenant_id, hotel_id, category_id, name, unit, unit_price,
                            quantity_in_stock, quantity_total, minimum_stock,
                            reorder_point, reorder_max_qty, preferred_vendor_id, status)
  VALUES (v_tenant_id, v_hotel_id, v_cat_id, 'TEST_RO_E_trigger', 'cái', 5000,
          2, 2, 1, 10, 30, v_vendor_id, 'active')
  RETURNING id INTO v_item_e;

  -- Verify chưa có suggestion
  SELECT count(*) INTO v_count FROM public.reorder_suggestions WHERE item_id = v_item_e;
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  pre-insert: chưa có suggestion cho E', (v_count)::text, '0');

  -- Insert outbound → trigger phải tự compute
  INSERT INTO public.inventory_transactions
    (tenant_id, hotel_id, item_id, transaction_type, transaction_category,
     quantity, unit_price, total_value, quantity_before, quantity_after,
     transaction_code, created_by, transaction_date)
  VALUES
    (v_tenant_id, v_hotel_id, v_item_e, 'out', 'other',
     1, 5000, 5000, 2, 1,
     'TEST-OUT-' || substr(gen_random_uuid()::text, 1, 8), v_user_id, now());

  SELECT count(*) INTO v_count FROM public.reorder_suggestions
   WHERE item_id = v_item_e AND status = 'pending';
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  trigger tự sinh suggestion cho E sau outbound', (v_count)::text, '1');

  -- last_outbound_at được trigger cập nhật
  PERFORM 1 FROM public.items WHERE id = v_item_e AND last_outbound_at IS NOT NULL;
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  last_outbound_at đã set cho E', (FOUND)::text, 'true');


  -- ═══════════════════════════════════════════════════════════════════════════
  -- TEST 4: ignore_reorder_suggestion → status='ignored' + ignored_until tương lai
  -- ═══════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '🧪 TEST 4 — ignore suggestion với ignore_days=14';
  SELECT id INTO v_sugg_a FROM public.reorder_suggestions
   WHERE item_id = v_item_a AND status = 'pending';

  v_result := public.ignore_reorder_suggestion(v_sugg_a, 'Đang chờ giá tốt hơn', 14);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  ok = true', ((v_result->>'ok')::boolean)::text, (true)::text);

  DECLARE v_status text;
  BEGIN
    SELECT status INTO v_status FROM public.reorder_suggestions WHERE id = v_sugg_a;
    v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  status = ignored', v_status, 'ignored');
  END;

  PERFORM 1 FROM public.reorder_suggestions
   WHERE id = v_sugg_a AND ignored_until = CURRENT_DATE + 14 AND ignored_reason = 'Đang chờ giá tốt hơn';
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  ignored_until = today+14 và reason đúng', (FOUND)::text, (true)::text);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TEST 5: compute respect ignored_until → KHÔNG sinh lại suggestion cho A
  -- ═══════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '🧪 TEST 5 — compute tôn trọng ignored_until';
  v_result := public.compute_reorder_suggestions(v_tenant_id, v_hotel_id, v_item_a);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  created = 0 cho item A đang bị ignore', ((v_result->>'created')::int)::text, (0)::text);

  SELECT count(*) INTO v_count FROM public.reorder_suggestions
   WHERE item_id = v_item_a AND status = 'pending';
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  không có pending mới cho A', (v_count)::text, (0)::text);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TEST 6: approve_reorder_suggestions — gom theo (hotel, vendor) → tạo PO draft
  --   - Item D có vendor v_vendor_id2 → 1 PO
  --   - Item E có vendor v_vendor_id → 1 PO
  --   → kỳ vọng 2 PO (2 vendors khác nhau)
  -- ═══════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '🧪 TEST 6 — approve gom theo vendor → tạo PO draft';
  SELECT id INTO v_sugg_d FROM public.reorder_suggestions
   WHERE item_id = v_item_d AND status = 'pending';
  SELECT id INTO v_sugg_id FROM public.reorder_suggestions
   WHERE item_id = v_item_e AND status = 'pending';

  v_result := public.approve_reorder_suggestions(ARRAY[v_sugg_d, v_sugg_id]);
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  converted_count = 2', ((v_result->>'converted_count')::int)::text, '2');
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  tạo 2 PO (2 vendors khác nhau)', (jsonb_array_length(v_result->'po_ids'))::text, '2');
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  skipped_no_vendor_count = 0', ((v_result->>'skipped_no_vendor_count')::int)::text, '0');

  SELECT count(*) INTO v_count FROM public.reorder_suggestions
   WHERE id IN (v_sugg_d, v_sugg_id) AND status = 'converted' AND converted_po_id IS NOT NULL;
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  2 suggestion đã chuyển status=converted + có po_id', (v_count)::text, '2');

  SELECT count(*) INTO v_count FROM public.purchase_orders
   WHERE id::text IN (
     SELECT jsonb_array_elements_text(v_result->'po_ids')
   ) AND status = 'draft';
  v_total := v_total + 1; v_passed := v_passed + pg_temp.assert_eq('  cả 2 PO đều ở status=draft', (v_count)::text, '2');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- TEST 7: permission & validation guard
  --   - approve khi không có pending nào trong array → no_pending_suggestions
  --   - approve khi user không có role → forbidden_approve
  -- ═══════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '🧪 TEST 7 — guards: no_pending_suggestions + forbidden_approve';

  v_total := v_total + 1;
  BEGIN
    PERFORM public.approve_reorder_suggestions(ARRAY[v_sugg_d]); -- đã converted
    RAISE WARNING '  ❌ kỳ vọng raise no_pending_suggestions, nhưng không raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%no_pending_suggestions%' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE '  ✅ raise đúng "no_pending_suggestions"';
    ELSE
      RAISE WARNING '  ❌ raise sai: %', SQLERRM;
    END IF;
  END;

  -- Đổi sang user UUID không có role để test forbidden_approve
  -- (KHÔNG cần INSERT vào auth.users vì has_role chỉ query user_roles)
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);

  -- Cần 1 suggestion pending để test guard. Item D đã converted, item A bị ignored,
  -- item E đã converted ở TEST 6 → tạo lại suggestion cho E bằng cách insert outbound mới
  -- (item E hiện stock=1, vẫn dưới ngưỡng → trigger sẽ compute → có pending mới)
  INSERT INTO public.inventory_transactions
    (tenant_id, hotel_id, item_id, transaction_type, transaction_category,
     quantity, unit_price, total_value, quantity_before, quantity_after,
     transaction_code, created_by, transaction_date)
  VALUES
    (v_tenant_id, v_hotel_id, v_item_e, 'out', 'other',
     0, 5000, 0, 1, 1,
     'TEST-OUT2-' || substr(gen_random_uuid()::text, 1, 8), v_user_id, now());

  SELECT id INTO v_sugg_id FROM public.reorder_suggestions
   WHERE item_id = v_item_e AND status = 'pending' LIMIT 1;

  v_total := v_total + 1;
  BEGIN
    PERFORM public.approve_reorder_suggestions(ARRAY[v_sugg_id]);
    RAISE WARNING '  ❌ kỳ vọng raise forbidden_approve, nhưng không raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%forbidden_approve%' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE '  ✅ raise đúng "forbidden_approve" khi user không có role';
    ELSE
      RAISE WARNING '  ❌ raise sai: %', SQLERRM;
    END IF;
  END;

  -- ───────────────────────────────────────────────────────────────────────────
  -- SUMMARY
  -- ───────────────────────────────────────────────────────────────────────────
  v_failed := v_total - v_passed;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '📊 KẾT QUẢ: %/% passed, % failed', v_passed, v_total, v_failed;
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'TEST SUITE FAILED: % assertions failed', v_failed;
  END IF;
END;
$TEST$;

ROLLBACK;
