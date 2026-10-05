-- Make SePay settlement idempotent across retries and concurrent workers.
-- The provider transaction id is scoped by account because some provider APIs
-- only guarantee uniqueness within a bank account.

ALTER TABLE public.booking_payments
  ADD COLUMN IF NOT EXISTS gateway_transaction_id text;

-- Keep the newest row as the canonical owner if an earlier deployment already
-- recorded the same provider key more than once. The duplicate rows remain
-- auditable, but their key is cleared so future settlements cannot collide.
WITH ranked_payment_keys AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY gateway_transaction_id
           ORDER BY updated_at DESC NULLS LAST, id DESC
         ) AS row_number
  FROM public.payment_transactions
  WHERE gateway_transaction_id IS NOT NULL
)
UPDATE public.payment_transactions payments
SET gateway_transaction_id = NULL
FROM ranked_payment_keys duplicates
WHERE payments.id = duplicates.id
  AND duplicates.row_number > 1;

WITH ranked_booking_keys AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY gateway_transaction_id
           ORDER BY updated_at DESC NULLS LAST, id DESC
         ) AS row_number
  FROM public.booking_payments
  WHERE gateway_transaction_id IS NOT NULL
)
UPDATE public.booking_payments payments
SET gateway_transaction_id = NULL
FROM ranked_booking_keys duplicates
WHERE payments.id = duplicates.id
  AND duplicates.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_payments_gateway_transaction_id
  ON public.booking_payments (gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_gateway_transaction_id
  ON public.payment_transactions (gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;

-- Older webhook code inserted a fresh audit row on every retry. Preserve those
-- rows, but keep the newest row as the canonical idempotency record before the
-- unique constraint is introduced.
WITH ranked_events AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY gateway, event_id
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) AS row_number
  FROM public.payment_webhook_logs
  WHERE event_id IS NOT NULL
)
UPDATE public.payment_webhook_logs logs
SET event_id = NULL
FROM ranked_events duplicates
WHERE logs.id = duplicates.id
  AND duplicates.row_number > 1;

ALTER TABLE public.payment_webhook_logs
  ADD CONSTRAINT payment_webhook_logs_gateway_event_unique
  UNIQUE (gateway, event_id);

COMMENT ON COLUMN public.booking_payments.gateway_transaction_id IS
  'Stable provider transaction key (account number + provider id) used for idempotent settlement.';

-- Keep the legacy helper callable by the authenticated UI, but enforce the
-- same tenant/hotel boundary as the newer payment RPCs.
CREATE OR REPLACE FUNCTION public.update_booking_amount_paid(
  p_booking_id uuid,
  p_amount_to_add numeric,
  p_total_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
  v_new_amount numeric;
  v_status text;
  v_total numeric;
BEGIN
  SELECT b.tenant_id, b.hotel_id, b.total_amount
    INTO v_booking
  FROM public.room_bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_rpc_actor(v_booking.tenant_id, v_booking.hotel_id, auth.uid(), false);

  IF p_amount_to_add IS NULL
     OR p_amount_to_add <= 0
     OR p_amount_to_add <> p_amount_to_add
     OR p_amount_to_add = 'Infinity'::numeric
     OR p_amount_to_add = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;

  -- Prefer the canonical amount stored on the booking. The argument remains
  -- a compatibility fallback for legacy rows whose total is still zero.
  v_total := NULLIF(v_booking.total_amount, 0);
  IF v_total IS NULL THEN
    v_total := p_total_amount;
  END IF;
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL_AMOUNT' USING ERRCODE = '22023';
  END IF;

  UPDATE public.room_bookings
  SET amount_paid = COALESCE(amount_paid, 0) + p_amount_to_add,
      payment_status = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount_to_add + COALESCE(deposit_amount, 0) >= v_total
          THEN 'paid'
        ELSE 'partial'
      END,
      paid_at = CASE
        WHEN COALESCE(amount_paid, 0) + p_amount_to_add + COALESCE(deposit_amount, 0) >= v_total
          THEN COALESCE(paid_at, now())
        ELSE paid_at
      END,
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING amount_paid, payment_status INTO v_new_amount, v_status;

  RETURN jsonb_build_object(
    'new_amount_paid', v_new_amount,
    'payment_status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_booking_amount_paid(uuid, numeric, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_booking_amount_paid(uuid, numeric, numeric)
  TO authenticated, service_role;
