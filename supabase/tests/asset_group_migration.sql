-- ============================================================
-- Test: Đợt A — Asset Group Migration & Hotel Policy
-- Run via: psql -f supabase/tests/asset_group_migration.sql
-- ============================================================

BEGIN;

-- 1. Enum 9 nhóm có đủ
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON e.enumtypid=t.oid
          WHERE t.typname='asset_group') = 9, 'enum asset_group must have 9 values';
END $$;

-- 2. Cột asset_group + migration_review_required tồn tại
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='items' AND column_name='asset_group');
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='items' AND column_name='migration_review_required');
END $$;

-- 3. preview_asset_group_mapping yêu cầu tenant guard
-- (không chạy với role anon được — giả định test chạy bằng service_role hoặc psql admin)

-- 4. Hotel policy có 8 key được seed cho mỗi hotel
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(DISTINCT policy_key) INTO v_count FROM hotel_policy;
  ASSERT v_count = 8, format('expected 8 distinct policy_keys, got %s', v_count);
END $$;

-- 5. Update policy → version tăng + history ghi
DO $$
DECLARE v_id uuid; v_old_v int; v_new_v int; v_history_count int;
BEGIN
  SELECT id, version INTO v_id, v_old_v FROM hotel_policy LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'No hotel_policy rows to test history trigger';
    RETURN;
  END IF;

  UPDATE hotel_policy SET policy_value = '{"test":"v1.2"}'::jsonb WHERE id = v_id;
  SELECT version INTO v_new_v FROM hotel_policy WHERE id = v_id;
  ASSERT v_new_v = v_old_v + 1, format('version must bump: %s -> %s', v_old_v, v_new_v);

  SELECT count(*) INTO v_history_count FROM hotel_policy_history WHERE policy_id = v_id;
  ASSERT v_history_count >= 1, 'history row must exist after update';
END $$;

-- 6. apply_asset_group_mapping yêu cầu role
-- (chạy ở app layer — chỉ test signature)
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='apply_asset_group_mapping');
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='preview_asset_group_mapping');
END $$;

-- 7. View room_check_staff_items_view tồn tại + KHÔNG trả về unit_price/charge_price
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(column_name, ',') INTO v_cols
  FROM information_schema.columns
  WHERE table_name='room_check_staff_items_view';

  ASSERT v_cols IS NOT NULL, 'view must exist';
  ASSERT v_cols NOT LIKE '%unit_price%', 'view MUST NOT expose unit_price';
  ASSERT v_cols NOT LIKE '%charge_price%', 'view MUST NOT expose charge_price';
  ASSERT v_cols NOT LIKE '%wash_cycles%', 'view MUST NOT expose wash_cycles';
  ASSERT v_cols NOT LIKE '%quantity_in_stock%', 'view MUST NOT expose quantity_in_stock';
END $$;

-- 8. Charge status enum có đủ 7 giá trị
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON e.enumtypid=t.oid
          WHERE t.typname='charge_status') = 7, 'charge_status must have 7 values';
END $$;

-- 9. Idempotency unique index tồn tại
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE indexname='uq_inv_tx_idempotency');
END $$;

ROLLBACK;
