-- B-Test 3: validate_room_check_issue_entries
-- Trigger logic:
--   * quantity NULL hoặc <= 0 → reject (invalid_quantity:<bucket>)
--   * issue_role nếu có MUST in ('primary_issue','derived_action') → ngược lại reject
--   * issue_role là TÙY CHỌN.
-- An toàn: BEGIN/ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_room  record;
  v_user  uuid;
  v_id    uuid;
BEGIN
  SELECT r.id, r.tenant_id, r.hotel_id INTO v_room FROM rooms r LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST SETUP FAILED: no room'; END IF;

  -- Lấy user thuộc cùng tenant; nếu không có (sandbox bị RLS chặn) → fallback any user
  SELECT id INTO v_user FROM users WHERE tenant_id = v_room.tenant_id LIMIT 1;
  IF v_user IS NULL THEN
    SELECT id INTO v_user FROM users LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    SELECT id INTO v_user FROM auth.users LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: no user available';
  END IF;
  RAISE NOTICE '[setup] room=% user=%', v_room.id, v_user;

  -- Case 1: quantity = 0 → reject
  BEGIN
    INSERT INTO room_checks(room_id, checked_by, check_type, tenant_id, hotel_id,
        items_missing, summary_ok_count, summary_issue_count)
    VALUES (v_room.id, v_user, 'daily', v_room.tenant_id, v_room.hotel_id,
        '[{"item_id":"00000000-0000-0000-0000-000000000001","quantity":0}]'::jsonb, 0, 1);
    RAISE EXCEPTION 'FAIL [val-1]: quantity=0 không bị reject';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%invalid_quantity%' THEN
      RAISE EXCEPTION 'FAIL [val-1]: wrong error: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS [val-1] quantity<=0 rejected';
  END;

  -- Case 2: invalid issue_role
  BEGIN
    INSERT INTO room_checks(room_id, checked_by, check_type, tenant_id, hotel_id,
        items_damaged, summary_ok_count, summary_issue_count)
    VALUES (v_room.id, v_user, 'daily', v_room.tenant_id, v_room.hotel_id,
        '[{"item_id":"00000000-0000-0000-0000-000000000001","quantity":1,"issue_role":"made_up"}]'::jsonb,
        0, 1);
    RAISE EXCEPTION 'FAIL [val-2]: issue_role lạ không bị reject';
  EXCEPTION WHEN sqlstate '22023' THEN
    IF SQLERRM NOT LIKE '%invalid_issue_role%' THEN
      RAISE EXCEPTION 'FAIL [val-2]: wrong error: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS [val-2] invalid issue_role rejected';
  END;

  -- Case 3: hợp lệ — quantity > 0 + issue_role primary_issue
  INSERT INTO room_checks(room_id, checked_by, check_type, tenant_id, hotel_id,
      items_missing, summary_ok_count, summary_issue_count)
  VALUES (v_room.id, v_user, 'daily', v_room.tenant_id, v_room.hotel_id,
      '[{"item_id":"00000000-0000-0000-0000-000000000001","quantity":2,"issue_role":"primary_issue"}]'::jsonb,
      0, 1)
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FAIL [val-3]: insert hợp lệ thất bại'; END IF;
  RAISE NOTICE 'PASS [val-3] valid entry accepted (id=%)', v_id;

  -- Case 4: không có issue_role vẫn OK (optional) — dùng check_type khác để né anti-duplicate
  INSERT INTO room_checks(room_id, checked_by, check_type, tenant_id, hotel_id,
      items_consumed, summary_ok_count, summary_issue_count)
  VALUES (v_room.id, v_user, 'periodic', v_room.tenant_id, v_room.hotel_id,
      '[{"item_id":"00000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      0, 1)
  RETURNING id INTO v_id;
  RAISE NOTICE 'PASS [val-4] entry không có issue_role vẫn được chấp nhận (id=%)', v_id;

  -- Case 5: derived_action role hợp lệ
  INSERT INTO room_checks(room_id, checked_by, check_type, tenant_id, hotel_id,
      items_replaced, summary_ok_count, summary_issue_count)
  VALUES (v_room.id, v_user, 'checkin', v_room.tenant_id, v_room.hotel_id,
      '[{"item_id":"00000000-0000-0000-0000-000000000001","quantity":3,"issue_role":"derived_action"}]'::jsonb,
      0, 1)
  RETURNING id INTO v_id;
  RAISE NOTICE 'PASS [val-5] derived_action role accepted (id=%)', v_id;

  RAISE NOTICE '✅ ALL issue_validation tests PASSED';
END $$;

ROLLBACK;
