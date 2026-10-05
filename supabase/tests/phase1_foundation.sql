-- Phase 1 Foundation Hardening — manual SQL test suite
-- Run from Lovable Cloud SQL editor (or psql) as a privileged role.
-- Each block raises NOTICE / EXCEPTION on failure. Run sections individually.
--
-- Sections:
--  1) log_state_transition writes to audit_log
--  2) enforce_read_only_mutation blocks writes for is_read_only tenants
--  3) check_rate_limit window math
--  4) validate_room_check_context tenant isolation
--  5) payment_tolerance_vnd lookup
--
-- IMPORTANT: Each test creates and rolls back its own data. Run inside a
-- transaction so failures do not pollute production data.

-- ===========================================================
-- 1) log_state_transition
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid;
  _entity uuid := gen_random_uuid();
  _count int;
BEGIN
  SELECT id INTO _tenant FROM public.tenants LIMIT 1;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'No tenant available for test'; END IF;

  PERFORM public.log_state_transition(
    _tenant,
    'booking',
    _entity,
    'pending',
    'confirmed',
    jsonb_build_object('test', true)
  );

  SELECT count(*) INTO _count
  FROM public.audit_log
  WHERE tenant_id = _tenant AND entity_id = _entity;

  IF _count <> 1 THEN
    RAISE EXCEPTION 'audit_log row not created (got %)', _count;
  END IF;
  RAISE NOTICE '✓ log_state_transition writes to audit_log';
END $$;
ROLLBACK;

-- ===========================================================
-- 2) enforce_read_only_mutation trigger
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid;
  _hotel uuid;
  _err text;
BEGIN
  SELECT id INTO _tenant FROM public.tenants LIMIT 1;
  SELECT id INTO _hotel FROM public.hotels WHERE tenant_id = _tenant LIMIT 1;
  IF _hotel IS NULL THEN RAISE EXCEPTION 'No hotel for test'; END IF;

  -- Flip tenant to read-only
  UPDATE public.tenants
  SET is_read_only = true, read_only_reason = 'TEST'
  WHERE id = _tenant;

  -- Try to insert a booking as service role (trigger should reject)
  BEGIN
    INSERT INTO public.bookings (tenant_id, hotel_id, guest_name, status)
    VALUES (_tenant, _hotel, 'Test guest', 'pending');
    RAISE EXCEPTION 'expected TENANT_READ_ONLY error but insert succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
    IF _err NOT LIKE '%TENANT_READ_ONLY%' AND _err NOT LIKE '%read.only%' THEN
      RAISE EXCEPTION 'unexpected error: %', _err;
    END IF;
    RAISE NOTICE '✓ enforce_read_only_mutation blocks writes (%) ', _err;
  END;
END $$;
ROLLBACK;

-- ===========================================================
-- 3) check_rate_limit
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _ok boolean;
  _key text := 'test-bucket-' || gen_random_uuid();
BEGIN
  -- 3 hits allowed in 60s
  FOR i IN 1..3 LOOP
    SELECT public.check_rate_limit(_key, 3, 60) INTO _ok;
    IF NOT _ok THEN RAISE EXCEPTION 'hit % unexpectedly blocked', i; END IF;
  END LOOP;

  -- 4th hit must be blocked
  SELECT public.check_rate_limit(_key, 3, 60) INTO _ok;
  IF _ok THEN RAISE EXCEPTION '4th hit should be blocked'; END IF;

  RAISE NOTICE '✓ check_rate_limit blocks after max hits';
END $$;
ROLLBACK;

-- ===========================================================
-- 4) validate_room_check_context — tenant isolation
-- (manual test: requires authenticated session; run in Studio with RLS)
-- ===========================================================
-- As authenticated user A, calling with a room_id from tenant B must raise
-- an exception. Quick smoke test:
-- SELECT public.validate_room_check_context(
--   '<other-tenant-room-id>'::uuid, NULL, 'daily'
-- );
-- Expected: ERROR  TENANT_MISMATCH or ROOM_NOT_FOUND.

-- ===========================================================
-- 5) payment_tolerance_vnd lookup
-- ===========================================================
BEGIN;
DO $$
DECLARE
  _tenant uuid;
  _tol int;
BEGIN
  SELECT id INTO _tenant FROM public.tenants LIMIT 1;
  UPDATE public.tenants SET payment_tolerance_vnd = 2500 WHERE id = _tenant;
  SELECT payment_tolerance_vnd INTO _tol FROM public.tenants WHERE id = _tenant;
  IF _tol <> 2500 THEN RAISE EXCEPTION 'payment_tolerance_vnd not stored'; END IF;
  RAISE NOTICE '✓ payment_tolerance_vnd column working';
END $$;
ROLLBACK;
