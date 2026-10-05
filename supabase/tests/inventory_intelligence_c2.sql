-- Phase C2 test suite — consumption snapshots & dead stock
-- Run inside a transaction; ROLLBACK at the end to keep prod data clean.
BEGIN;

DO $$
DECLARE
  v_tenant uuid;
  v_hotel  uuid;
  v_user   uuid;
  v_item_a uuid;
  v_item_b uuid;
  v_item_dead uuid;
  v_item_inactive uuid;
  v_snap consumption_snapshots%ROWTYPE;
  v_dead_count int;
  v_dead_value numeric;
  v_trend_count int;
  v_assertions int := 0;
  v_passed int := 0;
BEGIN
  -- pick first active tenant + hotel for the harness
  SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT_FOUND'; END IF;

  SELECT id INTO v_hotel FROM public.hotels WHERE tenant_id = v_tenant LIMIT 1;
  IF v_hotel IS NULL THEN RAISE EXCEPTION 'NO_HOTEL for tenant %', v_tenant; END IF;

  SELECT ur.user_id INTO v_user
  FROM public.user_roles ur
  WHERE ur.role IN ('super_admin'::app_role, 'owner'::app_role, 'hotel_manager'::app_role)
  LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'NO_PRIVILEGED_USER'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ============ SETUP ============
  -- Item A: active, recently consumed (should land in snapshot)
  INSERT INTO items (tenant_id, hotel_id, code, name, unit, item_type,
                     quantity_total, quantity_in_stock, unit_price, status, last_outbound_at)
  VALUES (v_tenant, v_hotel, 'C2_A_'||substr(gen_random_uuid()::text,1,6),
          'C2 Item A', 'cái', 'consumable', 100, 100, 50000, 'active', now() - INTERVAL '2 days')
  RETURNING id INTO v_item_a;

  -- Item B: active, no recent outbound
  INSERT INTO items (tenant_id, hotel_id, code, name, unit, item_type,
                     quantity_total, quantity_in_stock, unit_price, status)
  VALUES (v_tenant, v_hotel, 'C2_B_'||substr(gen_random_uuid()::text,1,6),
          'C2 Item B', 'cái', 'consumable', 30, 30, 20000, 'active')
  RETURNING id INTO v_item_b;

  -- Item DEAD: stock > 0, no outbound for >120 days
  INSERT INTO items (tenant_id, hotel_id, code, name, unit, item_type,
                     quantity_total, quantity_in_stock, unit_price, status, last_outbound_at)
  VALUES (v_tenant, v_hotel, 'C2_DEAD_'||substr(gen_random_uuid()::text,1,6),
          'C2 Dead Item', 'cái', 'consumable', 50, 50, 100000, 'active',
          now() - INTERVAL '120 days')
  RETURNING id INTO v_item_dead;

  -- Item INACTIVE: should be excluded everywhere
  INSERT INTO items (tenant_id, hotel_id, code, name, unit, item_type,
                     quantity_total, quantity_in_stock, unit_price, status, last_outbound_at)
  VALUES (v_tenant, v_hotel, 'C2_INA_'||substr(gen_random_uuid()::text,1,6),
          'C2 Inactive', 'cái', 'consumable', 999, 999, 99999, 'inactive',
          now() - INTERVAL '200 days')
  RETURNING id INTO v_item_inactive;

  -- Outbound transactions for Item A: 30 units in last 30 days, 5 in last 7
  INSERT INTO inventory_transactions (tenant_id, hotel_id, item_id, transaction_code,
    transaction_type, quantity, quantity_before, quantity_after, transaction_date, created_by)
  VALUES
    (v_tenant, v_hotel, v_item_a, 'TX_A1', 'out',  5, 105, 100, now() - INTERVAL '2 days',  v_user),
    (v_tenant, v_hotel, v_item_a, 'TX_A2', 'out', 10, 115, 105, now() - INTERVAL '20 days', v_user),
    (v_tenant, v_hotel, v_item_a, 'TX_A3', 'out', 15, 130, 115, now() - INTERVAL '28 days', v_user),
    -- adjustment must be IGNORED by snapshot
    (v_tenant, v_hotel, v_item_a, 'TX_A4', 'adjust', 999, 130, 130, now() - INTERVAL '1 day', v_user);

  -- ============ TEST 1: refresh_consumption_snapshots populates 7d/30d ============
  PERFORM public.refresh_consumption_snapshots(v_tenant, v_hotel);

  SELECT * INTO v_snap FROM consumption_snapshots
   WHERE item_id = v_item_a AND snapshot_date = CURRENT_DATE;

  v_assertions := v_assertions + 1;
  IF v_snap.qty_consumed_7d = 5 THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T1.1 qty_consumed_7d = 5 (got %)', v_snap.qty_consumed_7d;
  ELSE
    RAISE WARNING '✗ T1.1 expected 5, got %', v_snap.qty_consumed_7d;
  END IF;

  v_assertions := v_assertions + 1;
  IF v_snap.qty_consumed_30d = 30 THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T1.2 qty_consumed_30d = 30 (adjust ignored)';
  ELSE
    RAISE WARNING '✗ T1.2 expected 30, got % (adjust must be ignored)', v_snap.qty_consumed_30d;
  END IF;

  -- ============ TEST 2: stock_days_remaining math ============
  -- avg_daily = 30/30 = 1, stock=100 → days_remaining = 100
  v_assertions := v_assertions + 1;
  IF v_snap.stock_days_remaining = 100 THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T2 stock_days_remaining = 100';
  ELSE
    RAISE WARNING '✗ T2 expected 100, got %', v_snap.stock_days_remaining;
  END IF;

  -- ============ TEST 3: stock_days_remaining IS NULL when avg=0 (Item B) ============
  SELECT * INTO v_snap FROM consumption_snapshots
   WHERE item_id = v_item_b AND snapshot_date = CURRENT_DATE;

  v_assertions := v_assertions + 1;
  IF v_snap.stock_days_remaining IS NULL AND v_snap.avg_daily_consumption = 0 THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T3 days_remaining = NULL when no consumption';
  ELSE
    RAISE WARNING '✗ T3 expected NULL, got % (avg=%)', v_snap.stock_days_remaining, v_snap.avg_daily_consumption;
  END IF;

  -- ============ TEST 4: snapshot is idempotent same-day ============
  PERFORM public.refresh_consumption_snapshots(v_tenant, v_hotel);
  PERFORM public.refresh_consumption_snapshots(v_tenant, v_hotel);

  v_assertions := v_assertions + 1;
  IF (SELECT COUNT(*) FROM consumption_snapshots
       WHERE item_id = v_item_a AND snapshot_date = CURRENT_DATE) = 1 THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T4 idempotent (one row per item-day)';
  ELSE
    RAISE WARNING '✗ T4 duplicate rows detected';
  END IF;

  -- ============ TEST 5: inactive item excluded from snapshot ============
  v_assertions := v_assertions + 1;
  IF NOT EXISTS (SELECT 1 FROM consumption_snapshots
                  WHERE item_id = v_item_inactive AND snapshot_date = CURRENT_DATE) THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T5 inactive item excluded from snapshot';
  ELSE
    RAISE WARNING '✗ T5 inactive item should not have a snapshot';
  END IF;

  -- ============ TEST 6: dead stock report ============
  SELECT COUNT(*), COALESCE(SUM(total_value),0)
    INTO v_dead_count, v_dead_value
    FROM public.get_dead_stock_report(v_tenant, v_hotel, 90);

  v_assertions := v_assertions + 1;
  IF EXISTS (
    SELECT 1 FROM public.get_dead_stock_report(v_tenant, v_hotel, 90)
     WHERE item_id = v_item_dead
  ) THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T6.1 dead stock includes Item DEAD';
  ELSE
    RAISE WARNING '✗ T6.1 missing Item DEAD';
  END IF;

  v_assertions := v_assertions + 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_dead_stock_report(v_tenant, v_hotel, 90)
     WHERE item_id = v_item_inactive
  ) THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T6.2 dead stock excludes inactive items';
  ELSE
    RAISE WARNING '✗ T6.2 inactive item leaked into report';
  END IF;

  v_assertions := v_assertions + 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_dead_stock_report(v_tenant, v_hotel, 90)
     WHERE item_id = v_item_a
  ) THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T6.3 recently-moved item excluded';
  ELSE
    RAISE WARNING '✗ T6.3 Item A (recent outbound) leaked';
  END IF;

  -- ============ TEST 7: consumption trend series ============
  SELECT COUNT(*) INTO v_trend_count
    FROM public.get_consumption_trend(v_item_a, 30);

  v_assertions := v_assertions + 1;
  IF v_trend_count = 30 THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T7.1 trend returns 30 days';
  ELSE
    RAISE WARNING '✗ T7.1 expected 30 days, got %', v_trend_count;
  END IF;

  v_assertions := v_assertions + 1;
  IF (SELECT SUM(qty_out) FROM public.get_consumption_trend(v_item_a, 30)) = 30 THEN
    v_passed := v_passed + 1;
    RAISE NOTICE '✓ T7.2 trend sum = 30 over 30d window';
  ELSE
    RAISE WARNING '✗ T7.2 trend sum mismatch';
  END IF;

  RAISE NOTICE '==== SUMMARY: % / % assertions passed ====', v_passed, v_assertions;
END $$;

ROLLBACK;
