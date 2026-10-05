-- Close the remaining payment integrity gaps around the SePay settlement RPCs.
-- The previous migration introduced the atomic implementations, but the new
-- public functions inherited PUBLIC/anon execute privileges and trusted
-- client-supplied group metadata too much.  Keep the implementation private,
-- expose narrow validating wrappers, and force booking payment creation and
-- cancellation through RPCs.

-- Preserve terminal booking payment states when the amount trigger runs.  A
-- refund/cancellation must not be rewritten to paid/partial on an unrelated
-- amount update.
CREATE OR REPLACE FUNCTION public.calculate_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_derived_subtotal numeric;
  v_total_paid numeric;
BEGIN
  IF COALESCE(NEW.payment_status, 'pending') IN ('refunded', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF NEW.subtotal IS NULL OR NEW.subtotal = 0 THEN
    v_derived_subtotal := COALESCE(NEW.room_price, 0) *
      GREATEST(1, (NEW.check_out_date - NEW.check_in_date))
      + COALESCE(NEW.early_checkin_charge, 0)
      + COALESCE(NEW.late_checkout_charge, 0)
      + COALESCE(NEW.service_charges, 0)
      + COALESCE(NEW.extra_charges, 0);

    IF v_derived_subtotal > 0 OR COALESCE(NEW.total_amount, 0) = 0 THEN
      NEW.subtotal := v_derived_subtotal;
    END IF;
  END IF;

  IF COALESCE(NEW.subtotal, 0) > 0 THEN
    NEW.vat_amount := NEW.subtotal * COALESCE(NEW.vat_rate, 8) / 100;
    NEW.service_fee_amount := NEW.subtotal * COALESCE(NEW.service_fee_rate, 5) / 100;
    NEW.total_amount := NEW.subtotal
      + COALESCE(NEW.vat_amount, 0)
      + COALESCE(NEW.service_fee_amount, 0);
  ELSIF NEW.total_amount IS NULL THEN
    NEW.total_amount := 0;
  END IF;

  v_total_paid := COALESCE(NEW.amount_paid, 0) + COALESCE(NEW.deposit_amount, 0);
  IF COALESCE(NEW.total_amount, 0) > 0 AND v_total_paid >= NEW.total_amount THEN
    NEW.payment_status := 'paid';
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  ELSIF v_total_paid > 0 THEN
    NEW.payment_status := 'partial';
  ELSE
    NEW.payment_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

-- Hide the atomic implementations from the exposed API.  The validating
-- wrappers below are the only client-callable entry points.
ALTER FUNCTION public.settle_booking_payment(uuid, text)
  RENAME TO settle_booking_payment_unchecked;
ALTER FUNCTION public.settle_booking_payment_unchecked(uuid, text)
  SET SCHEMA private;

ALTER FUNCTION public.settle_subscription_payment(uuid, text)
  RENAME TO settle_subscription_payment_unchecked;
ALTER FUNCTION public.settle_subscription_payment_unchecked(uuid, text)
  SET SCHEMA private;

-- Remove the linted dead declaration from the moved booking implementation
-- without duplicating 200+ lines of settlement SQL in this migration.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'private.settle_booking_payment_unchecked(uuid,text)'::regprocedure
  ) INTO v_definition;
  v_definition := replace(
    v_definition,
    E'  v_new_amount_paid numeric;\n',
    ''
  );
  EXECUTE v_definition;
END;
$$;

-- Validate JSON integer fields before the legacy implementation casts them.
-- This prevents malformed metadata from turning a webhook into a 500/error
-- loop and keeps the financial operation fail-closed.
CREATE OR REPLACE FUNCTION private.validate_subscription_payment_metadata(
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public, private'
AS $$
DECLARE
  v_value text;
  v_type text;
BEGIN
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METADATA' USING ERRCODE = '22023';
  END IF;

  v_type := NULLIF(trim(p_metadata ->> 'type'), '');
  IF v_type IS NOT NULL AND v_type NOT IN ('extend', 'add_rooms') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TYPE' USING ERRCODE = '22023';
  END IF;

  FOREACH v_value IN ARRAY ARRAY[
    NULLIF(trim(p_metadata ->> 'duration_days'), ''),
    NULLIF(trim(p_metadata ->> 'rooms'), ''),
    NULLIF(trim(p_metadata ->> 'additional_rooms'), '')
  ] LOOP
    IF v_value IS NOT NULL AND (
      v_value !~ '^[0-9]+$' OR length(v_value) > 6
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_METADATA_NUMBER' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_subscription_payment(
  p_payment_id uuid,
  p_gateway_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_payment record;
  v_gateway_key text := NULLIF(trim(p_gateway_transaction_id), '');
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT payment_method, payment_status, metadata
    INTO v_payment
  FROM public.payment_transactions
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_gateway_key IS NOT NULL THEN
    IF v_payment.payment_method IS DISTINCT FROM 'bank_transfer' THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_METHOD_FOR_GATEWAY' USING ERRCODE = '22023';
    END IF;
    IF length(v_gateway_key) > 200 OR v_gateway_key !~ '^[A-Za-z0-9._:-]+$' THEN
      RAISE EXCEPTION 'INVALID_GATEWAY_TRANSACTION_ID' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_payment.payment_status = 'pending' THEN
    PERFORM private.validate_subscription_payment_metadata(
      COALESCE(v_payment.metadata, '{}'::jsonb)
    );
  END IF;

  RETURN private.settle_subscription_payment_unchecked(
    p_payment_id,
    v_gateway_key
  );
END;
$$;

-- Validate group booking metadata before the implementation locks and updates
-- bookings.  Every booking must belong to the same tenant/hotel/group as the
-- parent payment; otherwise a forged metadata array could redirect funds.
CREATE OR REPLACE FUNCTION private.validate_booking_payment_metadata(
  p_payment_id uuid,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public, private'
AS $$
DECLARE
  v_payment record;
  v_booking record;
  v_booking_ids uuid[];
  v_group_id uuid;
  v_is_group boolean := false;
  v_seen integer := 0;
  v_value text;
BEGIN
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METADATA' USING ERRCODE = '22023';
  END IF;

  v_is_group := CASE
    WHEN jsonb_typeof(p_metadata -> 'is_group_payment') = 'boolean'
      THEN COALESCE((p_metadata ->> 'is_group_payment')::boolean, false)
    WHEN lower(COALESCE(p_metadata ->> 'is_group_payment', '')) IN ('true', 't', '1')
      THEN true
    ELSE false
  END;

  IF NOT v_is_group THEN
    RETURN;
  END IF;

  v_value := NULLIF(trim(p_metadata ->> 'booking_group_id'), '');
  IF v_value IS NULL OR v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'INVALID_BOOKING_GROUP' USING ERRCODE = '22023';
  END IF;
  v_group_id := v_value::uuid;

  IF jsonb_typeof(p_metadata -> 'booking_ids') <> 'array'
     OR jsonb_array_length(p_metadata -> 'booking_ids') = 0 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_GROUP' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p_metadata -> 'booking_ids') AS item(value)
    WHERE item.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_GROUP' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT item.value::uuid ORDER BY item.value::uuid)
    INTO v_booking_ids
  FROM jsonb_array_elements_text(p_metadata -> 'booking_ids') AS item(value);

  SELECT bp.tenant_id, bp.hotel_id, bp.booking_id
    INTO v_payment
  FROM public.booking_payments bp
  WHERE bp.id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR NOT (v_payment.booking_id = ANY(v_booking_ids)) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_GROUP' USING ERRCODE = '22023';
  END IF;

  FOR v_booking IN
    SELECT id, tenant_id, hotel_id, booking_group_id
    FROM public.room_bookings
    WHERE id = ANY(v_booking_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_seen := v_seen + 1;
    IF v_booking.tenant_id IS DISTINCT FROM v_payment.tenant_id
       OR v_booking.hotel_id IS DISTINCT FROM v_payment.hotel_id
       OR v_booking.booking_group_id IS DISTINCT FROM v_group_id THEN
      RAISE EXCEPTION 'BOOKING_GROUP_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF v_seen <> cardinality(v_booking_ids) THEN
    RAISE EXCEPTION 'BOOKING_GROUP_INCOMPLETE' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_payment_id uuid,
  p_gateway_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_payment record;
  v_gateway_key text := NULLIF(trim(p_gateway_transaction_id), '');
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT payment_method, payment_status, metadata
    INTO v_payment
  FROM public.booking_payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_gateway_key IS NOT NULL THEN
    IF v_payment.payment_method IS DISTINCT FROM 'bank_transfer' THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_METHOD_FOR_GATEWAY' USING ERRCODE = '22023';
    END IF;
    IF length(v_gateway_key) > 200 OR v_gateway_key !~ '^[A-Za-z0-9._:-]+$' THEN
      RAISE EXCEPTION 'INVALID_GATEWAY_TRANSACTION_ID' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_payment.payment_status = 'pending' THEN
    PERFORM private.validate_booking_payment_metadata(
      p_payment_id,
      COALESCE(v_payment.metadata, '{}'::jsonb)
    );
  END IF;

  RETURN private.settle_booking_payment_unchecked(
    p_payment_id,
    v_gateway_key
  );
END;
$$;

-- A pending payment row is now created only after the booking/group has been
-- locked and its outstanding balance validated.  This also gives cash group
-- payments a safe parent row that can be settled atomically by the existing
-- settlement implementation.
CREATE OR REPLACE FUNCTION public.create_booking_payment_pending(
  p_booking_id uuid,
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_transaction_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_total_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_booking record;
  v_candidate record;
  v_payment public.booking_payments%ROWTYPE;
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_booking_ids uuid[];
  v_group_id uuid;
  v_is_group boolean := false;
  v_seen integer := 0;
  v_total_owed numeric := 0;
  v_total numeric;
  v_owed numeric;
  v_tolerance numeric := 1000;
  v_reference text := NULLIF(trim(p_transaction_reference), '');
BEGIN
  IF p_booking_id IS NULL OR p_tenant_id IS NULL OR p_hotel_id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount <> p_amount
     OR p_amount IN ('Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF v_reference IS NOT NULL AND length(v_reference) > 200 THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_REFERENCE' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method = 'bank_transfer' AND v_reference IS NULL THEN
    RAISE EXCEPTION 'TRANSACTION_REFERENCE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METADATA' USING ERRCODE = '22023';
  END IF;

  SELECT b.* INTO v_booking
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
  PERFORM public.assert_rpc_actor(p_tenant_id, p_hotel_id, auth.uid(), false);

  v_is_group := CASE
    WHEN jsonb_typeof(v_metadata -> 'is_group_payment') = 'boolean'
      THEN COALESCE((v_metadata ->> 'is_group_payment')::boolean, false)
    WHEN lower(COALESCE(v_metadata ->> 'is_group_payment', '')) IN ('true', 't', '1')
      THEN true
    ELSE false
  END;

  IF v_is_group THEN
    IF (v_metadata ->> 'booking_group_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(v_metadata -> 'booking_ids') <> 'array'
       OR jsonb_array_length(v_metadata -> 'booking_ids') = 0 THEN
      RAISE EXCEPTION 'INVALID_BOOKING_GROUP' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_metadata -> 'booking_ids') AS item(value)
      WHERE item.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'INVALID_BOOKING_GROUP' USING ERRCODE = '22023';
    END IF;
    v_group_id := (v_metadata ->> 'booking_group_id')::uuid;
    SELECT array_agg(DISTINCT item.value::uuid ORDER BY item.value::uuid)
      INTO v_booking_ids
    FROM jsonb_array_elements_text(v_metadata -> 'booking_ids') AS item(value);
  ELSE
    v_booking_ids := ARRAY[p_booking_id];
  END IF;

  FOR v_candidate IN
    SELECT b.id, b.tenant_id, b.hotel_id, b.booking_group_id,
           b.total_amount, b.amount_paid, b.deposit_amount
    FROM public.room_bookings b
    WHERE b.id = ANY(v_booking_ids)
    ORDER BY b.id
    FOR UPDATE
  LOOP
    v_seen := v_seen + 1;
    IF v_candidate.tenant_id IS DISTINCT FROM p_tenant_id
       OR v_candidate.hotel_id IS DISTINCT FROM p_hotel_id
       OR (v_is_group AND v_candidate.booking_group_id IS DISTINCT FROM v_group_id) THEN
      RAISE EXCEPTION 'BOOKING_GROUP_MISMATCH' USING ERRCODE = '42501';
    END IF;
    v_total := COALESCE(NULLIF(v_candidate.total_amount, 0),
                        CASE WHEN cardinality(v_booking_ids) = 1 THEN p_total_amount ELSE NULL END);
    IF v_total IS NULL OR v_total <= 0 THEN
      RAISE EXCEPTION 'INVALID_TOTAL_AMOUNT' USING ERRCODE = '22023';
    END IF;
    v_owed := GREATEST(
      v_total - COALESCE(v_candidate.amount_paid, 0) - COALESCE(v_candidate.deposit_amount, 0),
      0
    );
    v_total_owed := v_total_owed + v_owed;
  END LOOP;

  IF v_seen <> cardinality(v_booking_ids) THEN
    RAISE EXCEPTION 'BOOKING_GROUP_INCOMPLETE' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(payment_tolerance_vnd, 1000)::numeric
    INTO v_tolerance
  FROM public.tenants
  WHERE id = p_tenant_id;
  v_tolerance := LEAST(GREATEST(COALESCE(v_tolerance, 1000), 0), 1000000);
  IF p_amount > v_total_owed + v_tolerance THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.booking_payments (
    tenant_id, hotel_id, booking_id, amount, payment_method,
    payment_status, transaction_reference, metadata, notes, created_by
  ) VALUES (
    p_tenant_id, p_hotel_id, p_booking_id, p_amount, p_payment_method,
    'pending', v_reference, v_metadata, p_notes, auth.uid()
  )
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'id', v_payment.id,
    'tenant_id', v_payment.tenant_id,
    'hotel_id', v_payment.hotel_id,
    'booking_id', v_payment.booking_id,
    'amount', v_payment.amount,
    'payment_method', v_payment.payment_method,
    'payment_status', v_payment.payment_status,
    'transaction_reference', v_payment.transaction_reference,
    'paid_at', v_payment.paid_at,
    'created_by', v_payment.created_by,
    'gateway_transaction_id', v_payment.gateway_transaction_id,
    'metadata', v_payment.metadata,
    'notes', v_payment.notes,
    'created_at', v_payment.created_at,
    'updated_at', v_payment.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_payment public.booking_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM public.booking_payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_rpc_actor(v_payment.tenant_id, v_payment.hotel_id, auth.uid(), false);
  IF v_payment.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_PENDING' USING ERRCODE = '22023';
  END IF;

  UPDATE public.booking_payments
  SET payment_status = 'cancelled', updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object('payment_id', v_payment.id, 'payment_status', 'cancelled');
END;
$$;

-- Direct table writes are no longer needed by the application after the RPC
-- paths above.  Keeping the policies but removing table privileges prevents a
-- client from marking a payment completed without updating the booking.
REVOKE INSERT, UPDATE ON TABLE public.booking_payments FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.settle_booking_payment_unchecked(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.settle_subscription_payment_unchecked(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_booking_payment_metadata(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_subscription_payment_metadata(jsonb)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.settle_booking_payment(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_subscription_payment(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_booking_payment_pending(
  uuid, uuid, uuid, numeric, text, text, jsonb, numeric, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_booking_payment(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.settle_booking_payment(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_subscription_payment(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_payment_pending(
  uuid, uuid, uuid, numeric, text, text, jsonb, numeric, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_payment(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
