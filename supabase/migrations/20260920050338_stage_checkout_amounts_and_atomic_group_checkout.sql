-- Keep the persisted checkout quote in sync with the pricing model used by
-- the frontend.  Damage compensation is included in subtotal but is not a
-- taxable service, so VAT and service fees must use the non-damage base.
CREATE OR REPLACE FUNCTION public.calculate_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_derived_subtotal numeric;
  v_taxable_subtotal numeric;
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
    v_taxable_subtotal := GREATEST(
      COALESCE(NEW.subtotal, 0) - COALESCE(NEW.damage_charges, 0),
      0
    );
    NEW.vat_amount := round(v_taxable_subtotal * COALESCE(NEW.vat_rate, 8) / 100);
    NEW.service_fee_amount := round(v_taxable_subtotal * COALESCE(NEW.service_fee_rate, 5) / 100);
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

-- Validate the JSON envelope used by the batch RPCs before any text-to-type
-- casts occur.  Invalid client input must fail closed with a stable error.
CREATE OR REPLACE FUNCTION private.validate_checkout_item(
  p_item jsonb,
  p_require_checkout_date boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public, private'
AS $$
DECLARE
  v_key text;
  v_value text;
  v_required text[] := ARRAY['booking_id', 'room_id', 'subtotal', 'damage_charges'];
  v_numeric text[] := ARRAY[
    'late_checkout_charge', 'service_charges', 'subtotal', 'damage_charges'
  ];
BEGIN
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_ITEM' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY v_required LOOP
    v_value := NULLIF(trim(p_item ->> v_key), '');
    IF v_value IS NULL THEN
      RAISE EXCEPTION 'CHECKOUT_FIELD_REQUIRED:%', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF (p_item ->> 'booking_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (p_item ->> 'room_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_CONTEXT' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY v_numeric LOOP
    v_value := COALESCE(NULLIF(trim(p_item ->> v_key), ''), '0');
    IF length(v_value) > 32 OR v_value !~ '^[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'INVALID_CHECKOUT_AMOUNT' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF jsonb_typeof(COALESCE(p_item -> 'damage_items', '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_item -> 'damage_items', '[]'::jsonb)) > 1000 THEN
    RAISE EXCEPTION 'INVALID_DAMAGE_ITEMS' USING ERRCODE = '22023';
  END IF;

  IF p_item ? 'damage_notes' AND p_item ->> 'damage_notes' IS NOT NULL
     AND length(p_item ->> 'damage_notes') > 10000 THEN
    RAISE EXCEPTION 'DAMAGE_NOTES_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  IF p_require_checkout_date AND NULLIF(trim(p_item ->> 'check_out_date'), '') IS NOT NULL
     AND (p_item ->> 'check_out_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_DATE' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Stage the authoritative monetary quote before a payment is created.  This
-- leaves the booking checked in, but makes the amount visible to the payment
-- RPC so newly discovered late/damage/service charges cannot be skipped.
CREATE OR REPLACE FUNCTION private.prepare_checkout_amounts_unchecked(
  p_booking_id uuid,
  p_room_id uuid,
  p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,
  p_subtotal numeric DEFAULT 0,
  p_damage_charges numeric DEFAULT 0,
  p_damage_notes text DEFAULT NULL,
  p_damage_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_actor uuid;
  v_booking record;
  v_vat_base numeric;
  v_vat_amount numeric;
  v_service_fee_amount numeric;
  v_total_amount numeric;
  v_payment_status text;
BEGIN
  IF p_booking_id IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_late_checkout_charge IS NULL OR p_late_checkout_charge < 0
     OR p_service_charges IS NULL OR p_service_charges < 0
     OR p_subtotal IS NULL OR p_subtotal < 0
     OR p_damage_charges IS NULL OR p_damage_charges < 0 THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF p_damage_charges > p_subtotal THEN
    RAISE EXCEPTION 'DAMAGE_EXCEEDS_SUBTOTAL' USING ERRCODE = '22023';
  END IF;
  IF p_damage_items IS NULL OR jsonb_typeof(p_damage_items) <> 'array'
     OR jsonb_array_length(p_damage_items) > 1000 THEN
    RAISE EXCEPTION 'INVALID_DAMAGE_ITEMS' USING ERRCODE = '22023';
  END IF;
  IF p_damage_notes IS NOT NULL AND length(p_damage_notes) > 10000 THEN
    RAISE EXCEPTION 'DAMAGE_NOTES_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  SELECT rb.tenant_id, rb.hotel_id, rb.room_id, rb.status,
         rb.check_in_date, rb.deposit_amount, rb.amount_paid,
         COALESCE(rb.vat_rate, 8) AS vat_rate,
         COALESCE(rb.service_fee_rate, 5) AS service_fee_rate
    INTO v_booking
  FROM public.room_bookings rb
  WHERE rb.id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_actor := public.assert_rpc_actor(v_booking.tenant_id, v_booking.hotel_id, auth.uid(), false);
  IF v_booking.room_id IS DISTINCT FROM p_room_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status IS DISTINCT FROM 'checked_in' THEN
    RAISE EXCEPTION 'BOOKING_NOT_CHECKED_IN' USING ERRCODE = '22023';
  END IF;
  IF v_booking.vat_rate < 0 OR v_booking.vat_rate > 100
     OR v_booking.service_fee_rate < 0 OR v_booking.service_fee_rate > 100 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FEE_RATE' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND r.tenant_id = v_booking.tenant_id
    AND r.hotel_id = v_booking.hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_CONTEXT_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_vat_base := p_subtotal - p_damage_charges;
  v_vat_amount := round(v_vat_base * v_booking.vat_rate / 100);
  v_service_fee_amount := round(v_vat_base * v_booking.service_fee_rate / 100);
  v_total_amount := p_subtotal + v_vat_amount + v_service_fee_amount;

  IF COALESCE(v_booking.deposit_amount, 0) + COALESCE(v_booking.amount_paid, 0) >= v_total_amount THEN
    v_payment_status := 'paid';
  ELSIF COALESCE(v_booking.deposit_amount, 0) + COALESCE(v_booking.amount_paid, 0) > 0 THEN
    v_payment_status := 'partial';
  ELSE
    v_payment_status := 'pending';
  END IF;

  UPDATE public.room_bookings
  SET late_checkout_charge = p_late_checkout_charge,
      service_charges = p_service_charges,
      subtotal = p_subtotal,
      vat_amount = v_vat_amount,
      service_fee_amount = v_service_fee_amount,
      total_amount = v_total_amount,
      payment_status = v_payment_status,
      damage_charges = p_damage_charges,
      damage_notes = p_damage_notes,
      damage_items = p_damage_items,
      paid_at = CASE
        WHEN v_payment_status = 'paid' THEN COALESCE(paid_at, now())
        ELSE paid_at
      END,
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'subtotal', p_subtotal,
    'vat_base', v_vat_base,
    'vat_amount', v_vat_amount,
    'service_fee_amount', v_service_fee_amount,
    'total_amount', v_total_amount,
    'payment_status', v_payment_status,
    'actor_id', v_actor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_checkout_amounts(
  p_booking_id uuid,
  p_room_id uuid,
  p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,
  p_subtotal numeric DEFAULT 0,
  p_damage_charges numeric DEFAULT 0,
  p_damage_notes text DEFAULT NULL,
  p_damage_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
BEGIN
  RETURN private.prepare_checkout_amounts_unchecked(
    p_booking_id, p_room_id, p_late_checkout_charge, p_service_charges,
    p_subtotal, p_damage_charges, p_damage_notes, p_damage_items
  );
END;
$$;

-- Batch staging is atomic, so a group never has only some of its new charges
-- persisted when the payment dialog opens.
CREATE OR REPLACE FUNCTION public.prepare_group_checkout_amounts(p_checkouts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  IF p_checkouts IS NULL OR jsonb_typeof(p_checkouts) <> 'array' THEN
    RAISE EXCEPTION 'CHECKOUT_ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_checkouts);
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_ITEMS' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_checkouts) AS x(item)
    GROUP BY x.item ->> 'booking_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_CHECKOUT_BOOKING' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_checkouts) AS items(value)
    ORDER BY value ->> 'booking_id'
  LOOP
    PERFORM private.validate_checkout_item(v_item, false);
    v_results := v_results || jsonb_build_array(
      private.prepare_checkout_amounts_unchecked(
        (v_item ->> 'booking_id')::uuid,
        (v_item ->> 'room_id')::uuid,
        COALESCE(NULLIF(v_item ->> 'late_checkout_charge', ''), '0')::numeric,
        COALESCE(NULLIF(v_item ->> 'service_charges', ''), '0')::numeric,
        (v_item ->> 'subtotal')::numeric,
        (v_item ->> 'damage_charges')::numeric,
        NULLIF(v_item ->> 'damage_notes', ''),
        COALESCE(v_item -> 'damage_items', '[]'::jsonb)
      )
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'booking_count', v_count, 'results', v_results);
END;
$$;

-- Execute all checkout mutations in one transaction.  The existing single
-- booking RPC remains the source of truth; this wrapper simply makes a group
-- call atomic and orders locks deterministically.
CREATE OR REPLACE FUNCTION public.perform_group_checkout(p_checkouts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  IF p_checkouts IS NULL OR jsonb_typeof(p_checkouts) <> 'array' THEN
    RAISE EXCEPTION 'CHECKOUT_ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_checkouts);
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_ITEMS' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_checkouts) AS x(item)
    GROUP BY x.item ->> 'booking_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_CHECKOUT_BOOKING' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_checkouts) AS items(value)
    ORDER BY value ->> 'booking_id'
  LOOP
    PERFORM private.validate_checkout_item(v_item, true);
    v_results := v_results || jsonb_build_array(
      public.perform_checkout(
        (v_item ->> 'booking_id')::uuid,
        (v_item ->> 'room_id')::uuid,
        COALESCE(NULLIF(v_item ->> 'late_checkout_charge', ''), '0')::numeric,
        COALESCE(NULLIF(v_item ->> 'service_charges', ''), '0')::numeric,
        (v_item ->> 'subtotal')::numeric,
        (v_item ->> 'damage_charges')::numeric,
        NULLIF(v_item ->> 'damage_notes', ''),
        COALESCE(v_item -> 'damage_items', '[]'::jsonb),
        NULL,
        NULLIF(v_item ->> 'check_out_date', '')::date
      )
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'booking_count', v_count, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION private.validate_checkout_item(jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prepare_checkout_amounts_unchecked(uuid, uuid, numeric, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_checkout_amounts(uuid, uuid, numeric, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_group_checkout_amounts(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perform_group_checkout(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.prepare_checkout_amounts(uuid, uuid, numeric, numeric, numeric, numeric, text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_group_checkout_amounts(jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perform_group_checkout(jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
