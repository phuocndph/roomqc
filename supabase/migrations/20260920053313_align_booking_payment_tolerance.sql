-- Keep booking-payment settlement aligned with the tenant-specific tolerance
-- already used when a pending payment is created and matched by SePay.
-- The implementation was moved to private in the previous hardening
-- migration, so patch its definition in place without re-exposing it.
DO $$
DECLARE
  v_definition text;
  v_old_check text := E'  IF v_payment.amount > v_total_owed + 1000 THEN\n';
BEGIN
  SELECT pg_get_functiondef(
    'private.settle_booking_payment_unchecked(uuid,text)'::regprocedure
  ) INTO v_definition;

  IF position(E'  v_unallocated numeric;\n' IN v_definition) = 0
     OR position(v_old_check IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected settle_booking_payment_unchecked definition; aborting tolerance patch';
  END IF;

  v_definition := replace(
    v_definition,
    E'  v_unallocated numeric;\n',
    E'  v_unallocated numeric;\n  v_tolerance numeric := 1000;\n'
  );
  v_definition := replace(
    v_definition,
    v_old_check,
    E'  SELECT COALESCE(payment_tolerance_vnd, 1000)::numeric\n'
      || E'    INTO v_tolerance\n'
      || E'  FROM public.tenants\n'
      || E'  WHERE id = v_payment.tenant_id;\n'
      || E'  v_tolerance := LEAST(GREATEST(COALESCE(v_tolerance, 1000), 0), 1000000);\n'
      || E'  IF v_payment.amount > v_total_owed + v_tolerance THEN\n'
  );

  EXECUTE v_definition;
END;
$$;

COMMENT ON FUNCTION private.settle_booking_payment_unchecked(uuid, text)
  IS 'Atomic booking payment settlement; applies tenant payment_tolerance_vnd.';
