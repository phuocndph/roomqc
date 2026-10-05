-- ============================================================
-- pgTAP-style tests for Room Check Lean RPCs
-- Run: psql $DATABASE_URL -f supabase/tests/room_check_lean.sql
--
-- Yêu cầu:
--   - Extension pgtap đã cài (CREATE EXTENSION IF NOT EXISTS pgtap;)
--   - DB đã có ≥2 tenants với ≥1 user (tenant_owner) và ≥1 room.
--
-- Chạy ở read-only mode: KHÔNG chèn dữ liệu, chỉ gọi RPC kỳ vọng exception.
-- Dùng ROLLBACK ở cuối để trả lại state an toàn.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

-- ───────── Lấy fixtures từ DB hiện có ─────────
CREATE TEMP TABLE _fix AS
WITH t AS (
  SELECT u.tenant_id,
         (SELECT id FROM users WHERE tenant_id = u.tenant_id
            AND user_level_code = 'tenant_owner' LIMIT 1) AS owner_id,
         (SELECT id FROM users WHERE tenant_id = u.tenant_id
            AND user_level_code = 'staff' LIMIT 1) AS staff_id,
         (SELECT id FROM rooms WHERE tenant_id = u.tenant_id LIMIT 1) AS room_id
  FROM (SELECT DISTINCT tenant_id FROM users
          WHERE user_level_code IN ('tenant_owner','staff')
            AND tenant_id IS NOT NULL) u
)
SELECT tenant_id, owner_id, staff_id, room_id
FROM t
WHERE owner_id IS NOT NULL AND room_id IS NOT NULL
LIMIT 2;

-- Đảm bảo lấy được 2 tenant
SELECT is(
  (SELECT count(*)::int FROM _fix),
  2,
  'Có ≥2 tenants với owner+room để test cross-tenant'
);

-- Helper: chỉ set claims, KHÔNG SET ROLE (sandbox không có quyền)
CREATE OR REPLACE FUNCTION pg_temp._set_jwt(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
END $$;

-- Bind 2 tenants vào _t (k,v)
CREATE TEMP TABLE _t (k text PRIMARY KEY, v uuid);
INSERT INTO _t
  SELECT 'tenant_a', tenant_id FROM _fix LIMIT 1;
INSERT INTO _t
  SELECT 'owner_a', owner_id FROM _fix LIMIT 1;
INSERT INTO _t
  SELECT 'room_a', room_id FROM _fix LIMIT 1;
INSERT INTO _t
  SELECT 'tenant_b', tenant_id FROM (
    SELECT tenant_id FROM _fix
    WHERE tenant_id <> (SELECT v FROM _t WHERE k='tenant_a') LIMIT 1
  ) s;
INSERT INTO _t
  SELECT 'owner_b', owner_id FROM _fix
  WHERE tenant_id = (SELECT v FROM _t WHERE k='tenant_b') LIMIT 1;

-- ───────── Test: invalid_check_type ─────────
SELECT pg_temp._set_jwt((SELECT v FROM _t WHERE k='owner_a'));

SELECT throws_like(
  format($q$ SELECT submit_room_check_lean(
    %L::uuid, 'invalid_xx', now(),
    NULL, ARRAY[]::text[], '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL
  ) $q$, (SELECT v FROM _t WHERE k='room_a')),
  '%invalid_check_type%',
  'Reject invalid check_type'
);

-- ───────── Test: invalid_quantity ─────────
SELECT throws_like(
  format($q$ SELECT submit_room_check_lean(
    %L::uuid, 'daily', now(),
    NULL, ARRAY[]::text[], '[]'::jsonb,
    %L::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL
  ) $q$,
    (SELECT v FROM _t WHERE k='room_a'),
    '[{"item_id":"00000000-0000-0000-0000-000000000001","item_name":"X","quantity":0,"photos":[],"charge_to_guest":false}]'),
  '%invalid_quantity%',
  'Reject quantity = 0'
);

-- ───────── Test: photo_required:damaged_lost (default ON) ─────────
SELECT throws_like(
  format($q$ SELECT submit_room_check_lean(
    %L::uuid, 'daily', now(),
    NULL, ARRAY[]::text[], '[]'::jsonb,
    %L::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL
  ) $q$,
    (SELECT v FROM _t WHERE k='room_a'),
    '[{"item_id":"00000000-0000-0000-0000-000000000001","item_name":"X","quantity":1,"photos":[],"charge_to_guest":false}]'),
  '%photo_required:damaged_lost%',
  'Require photo when item is damaged (default config)'
);

-- ───────── Test: forbidden_tenant — owner_b cố submit room_a ─────────
SELECT pg_temp._set_jwt((SELECT v FROM _t WHERE k='owner_b'));

SELECT throws_like(
  format($q$ SELECT submit_room_check_lean(
    %L::uuid, 'daily', now(),
    NULL, ARRAY[]::text[], '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL
  ) $q$, (SELECT v FROM _t WHERE k='room_a')),
  '%forbidden_tenant%',
  'Cross-tenant submit must be forbidden'
);

-- ───────── Test: cross-tenant quick path ─────────
SELECT throws_like(
  format($q$ SELECT perform_quick_room_check(%L::uuid, 'daily', NULL) $q$,
    (SELECT v FROM _t WHERE k='room_a')),
  '%forbidden_tenant%',
  'Cross-tenant quick path forbidden'
);

-- ───────── Test: quick_path_not_allowed for checkin ─────────
SELECT pg_temp._set_jwt((SELECT v FROM _t WHERE k='owner_a'));

SELECT throws_like(
  format($q$ SELECT perform_quick_room_check(%L::uuid, 'checkin', NULL) $q$,
    (SELECT v FROM _t WHERE k='room_a')),
  '%quick_path_not_allowed%',
  'Quick path is daily/periodic only'
);

-- ───────── Test: validate_room_check_context accepts periodic ─────────
SELECT lives_ok(
  format($q$ SELECT validate_room_check_context(%L::uuid, 'periodic') $q$,
    (SELECT v FROM _t WHERE k='room_a')),
  'periodic is a valid check_type'
);

-- ───────── Test: itemId được trả về cùng photo_required ─────────
-- Submit damaged item không photo, item_id = '11111111-...'
SELECT throws_like(
  format($q$ SELECT submit_room_check_lean(
    %L::uuid, 'daily', now(),
    NULL, ARRAY[]::text[], '[]'::jsonb,
    %L::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL
  ) $q$,
    (SELECT v FROM _t WHERE k='room_a'),
    '[{"item_id":"11111111-1111-1111-1111-111111111111","item_name":"X","quantity":2,"photos":[],"charge_to_guest":false}]'),
  '%photo_required:damaged_lost:11111111-1111-1111-1111-111111111111%',
  'Server includes item_id in photo_required tag'
);

-- ───────── Test: itemId trong invalid_quantity ─────────
SELECT throws_like(
  format($q$ SELECT submit_room_check_lean(
    %L::uuid, 'daily', now(),
    NULL, ARRAY[]::text[], '[]'::jsonb,
    %L::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL
  ) $q$,
    (SELECT v FROM _t WHERE k='room_a'),
    '[{"item_id":"22222222-2222-2222-2222-222222222222","item_name":"X","quantity":0,"photos":[],"charge_to_guest":false}]'),
  '%invalid_quantity:22222222-2222-2222-2222-222222222222%',
  'Server includes item_id in invalid_quantity tag'
);

-- ───────── Skipped: rate-limit + reopen ─────────
-- Yêu cầu role có quyền DELETE/INSERT trực tiếp trên room_checks
-- (sandbox auth role bị RLS chặn). Khi chạy bằng service_role, bỏ comment
-- block dưới + đổi plan() lên 13.
--
-- DELETE FROM public.room_checks
--   WHERE room_id = (SELECT v FROM _t WHERE k='room_a')
--     AND check_mode = 'quick'
--     AND checked_at > now() - interval '60 minutes';
-- SELECT lives_ok( format($q$ SELECT perform_quick_room_check(%L::uuid,'daily',NULL) $q$,
--   (SELECT v FROM _t WHERE k='room_a')), 'Quick path lần đầu thành công');
-- SELECT throws_like( format($q$ SELECT perform_quick_room_check(%L::uuid,'daily',NULL) $q$,
--   (SELECT v FROM _t WHERE k='room_a')),
--   '%quick_rate_limited%','Quick path lần 2 phải bị chặn');
-- DO $$ DECLARE v uuid; BEGIN
--   SELECT id INTO v FROM public.room_checks
--    WHERE room_id=(SELECT v FROM _t WHERE k='room_a') AND check_mode='quick'
--    ORDER BY checked_at DESC LIMIT 1;
--   INSERT INTO _t VALUES ('check_a', v) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v;
-- END $$;
-- SELECT lives_ok( format($q$ SELECT reopen_room_check(%L::uuid,'lý do test') $q$,
--   (SELECT v FROM _t WHERE k='check_a')), 'tenant_owner có thể reopen');
-- SELECT pg_temp._set_jwt((SELECT v FROM _t WHERE k='owner_b'));
-- SELECT throws_like( format($q$ SELECT reopen_room_check(%L::uuid,'x') $q$,
--   (SELECT v FROM _t WHERE k='check_a')),
--   '%forbidden_tenant%','Cross-tenant reopen bị từ chối');

SELECT * FROM finish();
ROLLBACK;
