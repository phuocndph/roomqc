-- Make payment settlement a single, idempotent database transaction.
-- Both the SePay webhook and authenticated UI call these functions so a
-- retry cannot mark a payment complete while only part of its side effects
-- were applied.

CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_payment_id uuid,
  p_gateway_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment public.booking_payments%ROWTYPE;
  v_booking record;
  v_metadata jsonb;
  v_booking_ids uuid[];
  v_seen_count integer := 0;
  v_total_owed numeric := 0;
  v_remaining numeric;
  v_apply numeric;
  v_owed numeric;
  v_total numeric;
  v_new_amount_paid numeric;
  v_applied numeric;
  v_unallocated numeric;
  v_is_group boolean := false;
  v_gateway_key text := NULLIF(trim(p_gateway_transaction_id), '');
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Only the trusted service role may attach a provider transaction id.
  -- Authenticated users may settle a pending payment manually, but cannot
  -- forge a bank transaction key.
  IF v_gateway_key IS NOT NULL AND NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'TRUSTED_CALL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_gateway_key IS NOT NULL AND (length(v_gateway_key) > 200 OR v_gateway_key !~ '^[A-Za-z0-9._:-]+$') THEN
    RAISE EXCEPTION 'INVALID_GATEWAY_TRANSACTION_ID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.booking_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.rpc_request_is_trusted() THEN
    PERFORM public.assert_rpc_actor(v_payment.tenant_id, v_payment.hotel_id, auth.uid(), false);
  END IF;

  IF v_payment.payment_status = 'completed' THEN
    IF v_gateway_key IS NULL OR v_payment.gateway_transaction_id = v_gateway_key THEN
      RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'already_processed', true,
        'applied_amount', COALESCE((v_payment.metadata ->> '_roomqc_applied_amount')::numeric, 0),
        'gateway_transaction_id', v_payment.gateway_transaction_id
      );
    END IF;
    RAISE EXCEPTION 'PAYMENT_ALREADY_COMPLETED' USING ERRCODE = '23505';
  END IF;

  IF v_payment.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE = '22023';
  END IF;
  IF v_payment.gateway_transaction_id IS NOT NULL THEN
    IF v_gateway_key IS NOT NULL AND v_payment.gateway_transaction_id = v_gateway_key THEN
      RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'already_processed', true,
        'gateway_transaction_id', v_payment.gateway_transaction_id
      );
    END IF;
    RAISE EXCEPTION 'PAYMENT_ALREADY_CLAIMED' USING ERRCODE = '23505';
  END IF;

  IF v_gateway_key IS NOT NULL THEN
    -- A unique index per table cannot prevent the same bank event from being
    -- claimed once in booking_payments and once in payment_transactions.
    -- The transaction-level advisory lock gives both flows one shared keyspace.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_gateway_key, 0));
    IF EXISTS (
      SELECT 1 FROM public.booking_payments
      WHERE gateway_transaction_id = v_gateway_key AND id <> v_payment.id
    ) OR EXISTS (
      SELECT 1 FROM public.payment_transactions
      WHERE gateway_transaction_id = v_gateway_key
    ) THEN
      RAISE EXCEPTION 'GATEWAY_TRANSACTION_ALREADY_PROCESSED' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF v_payment.payment_method <> 'bank_transfer' AND v_gateway_key IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD_FOR_GATEWAY' USING ERRCODE = '22023';
  END IF;
  IF v_payment.amount IS NULL OR v_payment.amount <= 0
     OR v_payment.amount <> v_payment.amount
     OR v_payment.amount IN ('Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;

  v_metadata := COALESCE(v_payment.metadata, '{}'::jsonb);
  v_is_group := COALESCE((v_metadata ->> 'is_group_payment')::boolean, false);

  IF v_is_group AND jsonb_typeof(v_metadata -> 'booking_ids') = 'array' THEN
    SELECT array_agg(value::uuid ORDER BY value::uuid)
      INTO v_booking_ids
    FROM jsonb_array_elements_text(v_metadata -> 'booking_ids') AS ids(value);
  ELSE
    v_booking_ids := ARRAY[v_payment.booking_id];
  END IF;

  IF v_booking_ids IS NULL OR cardinality(v_booking_ids) = 0
     OR NOT (v_payment.booking_id = ANY(v_booking_ids)) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_GROUP' USING ERRCODE = '22023';
  END IF;

  -- Lock every affected booking in deterministic order. This both prevents
  -- lost updates and makes concurrent group settlements serialize cleanly.
  FOR v_booking IN
    SELECT b.id, b.tenant_id, b.hotel_id, b.total_amount,
           b.amount_paid, b.deposit_amount, b.status
    FROM public.room_bookings b
    WHERE b.id = ANY(v_booking_ids)
    ORDER BY b.id
    FOR UPDATE
  LOOP
    v_seen_count := v_seen_count + 1;
    IF v_booking.tenant_id IS DISTINCT FROM v_payment.tenant_id
       OR v_booking.hotel_id IS DISTINCT FROM v_payment.hotel_id THEN
      RAISE EXCEPTION 'BOOKING_TENANT_MISMATCH' USING ERRCODE = '42501';
    END IF;
    v_total := COALESCE(NULLIF(v_booking.total_amount, 0), 0);
    IF v_total <= 0 THEN
      RAISE EXCEPTION 'INVALID_TOTAL_AMOUNT' USING ERRCODE = '22023';
    END IF;
    v_owed := GREATEST(
      v_total - COALESCE(v_booking.amount_paid, 0) - COALESCE(v_booking.deposit_amount, 0),
      0
    );
    v_total_owed := v_total_owed + v_owed;
  END LOOP;

  IF v_seen_count <> cardinality(v_booking_ids) THEN
    RAISE EXCEPTION 'BOOKING_GROUP_INCOMPLETE' USING ERRCODE = 'P0002';
  END IF;

  -- A small overage can be caused by the tenant's configured matching
  -- tolerance. Do not silently over-credit a booking; preserve the excess in
  -- metadata for reconciliation. Large overages are rejected for manual review.
  IF v_payment.amount > v_total_owed + 1000 THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE' USING ERRCODE = '22023';
  END IF;

  v_remaining := v_payment.amount;

  -- Apply checked-out rooms first, then the largest outstanding balance. The
  -- deterministic order is shared by webhook retries and manual confirmation.
  FOR v_booking IN
    SELECT b.id, b.total_amount, b.amount_paid, b.deposit_amount
    FROM public.room_bookings b
    WHERE b.id = ANY(v_booking_ids)
    ORDER BY
      CASE b.status WHEN 'checked_out' THEN 0 WHEN 'checked_in' THEN 1 ELSE 2 END,
      GREATEST(COALESCE(b.total_amount, 0) - COALESCE(b.amount_paid, 0) - COALESCE(b.deposit_amount, 0), 0) DESC,
      b.id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_total := COALESCE(NULLIF(v_booking.total_amount, 0), 0);
    v_owed := GREATEST(
      v_total - COALESCE(v_booking.amount_paid, 0) - COALESCE(v_booking.deposit_amount, 0),
      0
    );
    IF v_owed <= 0 THEN
      CONTINUE;
    END IF;

    v_apply := LEAST(v_remaining, v_owed);
    UPDATE public.room_bookings
    SET amount_paid = COALESCE(amount_paid, 0) + v_apply,
        payment_status = CASE
          WHEN COALESCE(amount_paid, 0) + v_apply + COALESCE(deposit_amount, 0) >= v_total
            THEN 'paid'
          ELSE 'partial'
        END,
        paid_at = CASE
          WHEN COALESCE(amount_paid, 0) + v_apply + COALESCE(deposit_amount, 0) >= v_total
            THEN COALESCE(paid_at, now())
          ELSE paid_at
        END,
        updated_at = now()
    WHERE id = v_booking.id;
    v_remaining := v_remaining - v_apply;
  END LOOP;

  v_applied := v_payment.amount - v_remaining;
  v_unallocated := GREATEST(v_remaining, 0);

  UPDATE public.booking_payments
  SET payment_status = 'completed',
      paid_at = COALESCE(paid_at, now()),
      gateway_transaction_id = COALESCE(v_gateway_key, gateway_transaction_id),
      metadata = v_metadata || jsonb_build_object(
        '_roomqc_applied_amount', v_applied,
        '_roomqc_unallocated_amount', v_unallocated,
        '_roomqc_settled_at', now()
      ),
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'already_processed', false,
    'applied_amount', v_applied,
    'unallocated_amount', v_unallocated,
    'booking_count', cardinality(v_booking_ids),
    'gateway_transaction_id', v_gateway_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_subscription_payment(
  p_payment_id uuid,
  p_gateway_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment public.payment_transactions%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_metadata jsonb;
  v_type text;
  v_duration integer;
  v_rooms integer;
  v_additional_rooms integer;
  v_max_rooms integer;
  v_base_date date;
  v_new_end_date date;
  v_gateway_key text := NULLIF(trim(p_gateway_transaction_id), '');
  v_invoice_updated integer := 0;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_gateway_key IS NOT NULL AND NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'TRUSTED_CALL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_gateway_key IS NOT NULL AND (length(v_gateway_key) > 200 OR v_gateway_key !~ '^[A-Za-z0-9._:-]+$') THEN
    RAISE EXCEPTION 'INVALID_GATEWAY_TRANSACTION_ID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.rpc_request_is_trusted() THEN
    PERFORM public.assert_rpc_actor(v_payment.tenant_id, NULL, auth.uid(), false);
  END IF;

  IF v_payment.payment_status = 'completed' THEN
    IF v_gateway_key IS NULL OR v_payment.gateway_transaction_id = v_gateway_key THEN
      RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'already_processed', true,
        'gateway_transaction_id', v_payment.gateway_transaction_id
      );
    END IF;
    RAISE EXCEPTION 'PAYMENT_ALREADY_COMPLETED' USING ERRCODE = '23505';
  END IF;
  IF v_payment.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE = '22023';
  END IF;
  IF v_payment.gateway_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_CLAIMED' USING ERRCODE = '23505';
  END IF;

  IF v_gateway_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_gateway_key, 0));
    IF EXISTS (
      SELECT 1 FROM public.payment_transactions
      WHERE gateway_transaction_id = v_gateway_key AND id <> v_payment.id
    ) OR EXISTS (
      SELECT 1 FROM public.booking_payments
      WHERE gateway_transaction_id = v_gateway_key
    ) THEN
      RAISE EXCEPTION 'GATEWAY_TRANSACTION_ALREADY_PROCESSED' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF v_payment.amount IS NULL OR v_payment.amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;

  v_metadata := COALESCE(v_payment.metadata, '{}'::jsonb);
  v_type := NULLIF(v_metadata ->> 'type', '');
  v_duration := CASE
    WHEN v_metadata ? 'duration_days' THEN (v_metadata ->> 'duration_days')::integer
    ELSE 30
  END;
  v_rooms := CASE
    WHEN v_metadata ? 'rooms' THEN (v_metadata ->> 'rooms')::integer
    ELSE NULL
  END;
  v_additional_rooms := CASE
    WHEN v_metadata ? 'additional_rooms' THEN (v_metadata ->> 'additional_rooms')::integer
    WHEN v_metadata ? 'rooms' AND v_type = 'add_rooms' THEN (v_metadata ->> 'rooms')::integer
    ELSE NULL
  END;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_payment.tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT sp.max_rooms INTO v_max_rooms
  FROM public.subscription_plans sp
  WHERE sp.id = v_tenant.subscription_plan_id;

  IF v_type = 'add_rooms' THEN
    IF v_additional_rooms IS NULL OR v_additional_rooms <= 0 OR v_additional_rooms > 100000 THEN
      RAISE EXCEPTION 'INVALID_ADDITIONAL_ROOMS' USING ERRCODE = '22023';
    END IF;
    UPDATE public.tenants
    SET registered_rooms = CASE
          WHEN v_max_rooms IS NULL THEN COALESCE(registered_rooms, 0) + v_additional_rooms
          ELSE LEAST(COALESCE(registered_rooms, 0) + v_additional_rooms, v_max_rooms)
        END,
        subscription_status = 'active',
        grace_period_ends_at = NULL,
        updated_at = now()
    WHERE id = v_tenant.id;
  ELSIF v_type = 'extend' OR v_metadata ? 'duration_days' THEN
    IF v_duration IS NULL OR v_duration <= 0 OR v_duration > 3660 THEN
      RAISE EXCEPTION 'INVALID_DURATION_DAYS' USING ERRCODE = '22023';
    END IF;
    IF v_rooms IS NOT NULL AND (v_rooms <= 0 OR v_rooms > 100000) THEN
      RAISE EXCEPTION 'INVALID_REGISTERED_ROOMS' USING ERRCODE = '22023';
    END IF;
    v_base_date := GREATEST(COALESCE(v_tenant.subscription_end_date, current_date), current_date);
    v_new_end_date := v_base_date + v_duration;
    UPDATE public.tenants
    SET subscription_end_date = v_new_end_date,
        subscription_current_period_start = CASE
          WHEN v_tenant.subscription_end_date IS NULL OR v_tenant.subscription_end_date < current_date
            THEN now()
          ELSE subscription_current_period_start
        END,
        subscription_current_period_end = v_new_end_date::timestamptz,
        next_billing_date = v_new_end_date,
        subscription_duration_days = v_duration,
        registered_rooms = CASE
          WHEN v_rooms IS NULL THEN registered_rooms
          WHEN v_max_rooms IS NULL THEN v_rooms
          ELSE LEAST(v_rooms, v_max_rooms)
        END,
        subscription_status = 'active',
        grace_period_ends_at = NULL,
        updated_at = now()
    WHERE id = v_tenant.id;
  END IF;

  IF v_payment.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
    SET status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now()
    WHERE id = v_payment.invoice_id AND tenant_id = v_payment.tenant_id;
    GET DIAGNOSTICS v_invoice_updated = ROW_COUNT;
    IF v_invoice_updated = 0 THEN
      RAISE EXCEPTION 'INVOICE_TENANT_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.payment_transactions
  SET payment_status = 'completed',
      payment_date = COALESCE(payment_date, now()),
      gateway_transaction_id = COALESCE(v_gateway_key, gateway_transaction_id),
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'already_processed', false,
    'gateway_transaction_id', v_gateway_key,
    'invoice_id', v_payment.invoice_id
  );
END;
$$;

-- Harden the UI-facing insert path against stale balances and missing rows.
CREATE OR REPLACE FUNCTION private.record_booking_payment_unchecked(
  p_booking_id uuid,
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_transaction_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
  v_payment_id uuid;
  v_total numeric;
  v_owed numeric;
  v_new_amount_paid numeric;
  v_payment_status text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount <> p_amount
     OR p_amount IN ('Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;

  SELECT b.tenant_id, b.hotel_id, b.total_amount, b.amount_paid, b.deposit_amount
    INTO v_booking
  FROM public.room_bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.tenant_id IS DISTINCT FROM p_tenant_id
     OR v_booking.hotel_id IS DISTINCT FROM p_hotel_id THEN
    RAISE EXCEPTION 'BOOKING_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_total := COALESCE(NULLIF(v_booking.total_amount, 0), p_total_amount);
  v_owed := GREATEST(v_total - COALESCE(v_booking.amount_paid, 0) - COALESCE(v_booking.deposit_amount, 0), 0);
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF p_amount > v_owed THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.booking_payments (
    id, tenant_id, hotel_id, booking_id, amount, payment_method,
    transaction_reference, payment_status, metadata, paid_at
  ) VALUES (
    gen_random_uuid(), p_tenant_id, p_hotel_id, p_booking_id, p_amount,
    p_payment_method, p_transaction_reference, 'completed', p_metadata, now()
  ) RETURNING id INTO v_payment_id;

  UPDATE public.room_bookings
  SET amount_paid = COALESCE(amount_paid, 0) + p_amount,
      payment_status = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount + COALESCE(deposit_amount, 0) >= v_total
          THEN 'paid'
        ELSE 'partial'
      END,
      paid_at = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount + COALESCE(deposit_amount, 0) >= v_total
          THEN COALESCE(paid_at, now())
        ELSE paid_at
      END,
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING amount_paid, payment_status INTO v_new_amount_paid, v_payment_status;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'new_amount_paid', v_new_amount_paid,
    'payment_status', v_payment_status
  );
END;
$$;

-- Manual confirmation must be idempotent. The old implementation updated the
-- booking again when a webhook had already completed the same pending row.
CREATE OR REPLACE FUNCTION public.confirm_booking_payment_manual(
  p_payment_id uuid,
  p_booking_id uuid,
  p_amount numeric,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment record;
BEGIN
  SELECT bp.tenant_id, bp.hotel_id, bp.booking_id
    INTO v_payment
  FROM public.booking_payments bp
  WHERE bp.id = p_payment_id;
  IF NOT FOUND OR v_payment.booking_id IS DISTINCT FROM p_booking_id THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_rpc_actor(v_payment.tenant_id, v_payment.hotel_id, auth.uid(), false);
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;
  RETURN public.settle_booking_payment(p_payment_id, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_booking_payment(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_subscription_payment(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment_manual(uuid, uuid, numeric, numeric)
  TO authenticated, service_role;
