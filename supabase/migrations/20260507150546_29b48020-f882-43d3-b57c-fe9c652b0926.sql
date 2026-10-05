
-- =====================================================
-- Sprint 1B: Outbox hardening (retry curve + dead-letter + idempotency)
-- =====================================================

-- 1) Add new columns to room_check_issue_outbox
ALTER TABLE public.room_check_issue_outbox
  ADD COLUMN IF NOT EXISTS schema_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idempotency_key_raw text,
  ADD COLUMN IF NOT EXISTS idempotency_key_hash text,
  ADD COLUMN IF NOT EXISTS dead_letter_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter_reason text;

-- Backfill idempotency for existing rows
UPDATE public.room_check_issue_outbox
SET idempotency_key_raw = COALESCE(idempotency_key_raw,
      tenant_id::text || ':' || issue_id::text || ':' || job_kind),
    idempotency_key_hash = COALESCE(idempotency_key_hash,
      encode(extensions.digest(
        tenant_id::text || ':' || issue_id::text || ':' || job_kind, 'sha256'), 'hex'))
WHERE idempotency_key_hash IS NULL;

-- Unique idempotency per tenant+hotel
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcio_idempotency
  ON public.room_check_issue_outbox(tenant_id, hotel_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

-- New index for ready-to-process jobs (uses next_retry_at)
DROP INDEX IF EXISTS idx_rcio_pending;
CREATE INDEX IF NOT EXISTS idx_rcio_ready
  ON public.room_check_issue_outbox(next_retry_at)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_rcio_dead_letter
  ON public.room_check_issue_outbox(hotel_id, dead_letter_at DESC)
  WHERE status = 'dead_letter';

-- 2) Helper function: compute next_retry_at by retry_count
-- Curve: 1, 5, 15, 60, 180 minutes
CREATE OR REPLACE FUNCTION public.outbox_next_retry_at(_retry_count int)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT now() + (CASE _retry_count
    WHEN 0 THEN interval '1 minute'
    WHEN 1 THEN interval '5 minutes'
    WHEN 2 THEN interval '15 minutes'
    WHEN 3 THEN interval '60 minutes'
    ELSE interval '180 minutes'
  END);
$$;

-- 3) Refactor the worker — wrap existing logic with retry-curve + dead-letter
-- Change: pick by next_retry_at, on failure compute next_retry_at; after 5 attempts → dead_letter
CREATE OR REPLACE FUNCTION public.process_room_check_issue_outbox(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_iss record;
  v_done int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_dead int := 0;
  v_processed int := 0;
  v_booking_id uuid;
  v_unit_price numeric;
  v_item_code text;
  v_room_item_qty int;
  v_signed_qty int;
  v_request_code text;
  v_existing_req uuid;
  v_err text;
BEGIN
  FOR v_job IN
    UPDATE public.room_check_issue_outbox o
    SET status = 'processing', attempts = o.attempts + 1
    WHERE o.id IN (
      SELECT id FROM public.room_check_issue_outbox
      WHERE status IN ('pending','retry')
        AND next_retry_at <= now()
        AND attempts < 5
      ORDER BY next_retry_at ASC
      LIMIT _limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  LOOP
    v_processed := v_processed + 1;
    BEGIN
      SELECT * INTO v_iss FROM public.room_check_issues WHERE id = v_job.issue_id;
      IF v_iss.id IS NULL THEN
        UPDATE public.room_check_issue_outbox
        SET status = 'skipped', processed_at = now(), last_error = 'issue_missing'
        WHERE id = v_job.id;
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- LAUNDRY
      IF v_job.job_kind = 'laundry' THEN
        SELECT id INTO v_existing_req FROM public.laundry_requests
        WHERE room_check_id = v_iss.room_check_id LIMIT 1;
        IF v_existing_req IS NULL THEN
          v_request_code := 'LR-' || to_char(now(), 'YYMMDDHH24MISS') || '-'
                          || substr(replace(v_iss.room_check_id::text, '-', ''), 1, 4);
          INSERT INTO public.laundry_requests(
            tenant_id, hotel_id, room_id, room_check_id,
            request_code, status, items, total_quantity, requested_by, notes
          ) VALUES (
            v_iss.tenant_id, v_iss.hotel_id, v_iss.room_id, v_iss.room_check_id,
            v_request_code, 'pending',
            jsonb_build_array(jsonb_build_object(
              'item_id', v_iss.item_id, 'item_name', v_iss.item_name,
              'quantity', v_iss.quantity)),
            v_iss.quantity::int, NULL,
            'Auto-generated from room check issue ' || v_iss.id::text
          );
        ELSE
          UPDATE public.laundry_requests
          SET items = items || jsonb_build_array(jsonb_build_object(
                'item_id', v_iss.item_id, 'item_name', v_iss.item_name,
                'quantity', v_iss.quantity)),
              total_quantity = total_quantity + v_iss.quantity::int
          WHERE id = v_existing_req;
        END IF;

      -- LOST / DAMAGED / CONSUMED → trừ kho qua inventory_transactions
      ELSIF v_job.job_kind IN ('inventory_lost','inventory_damaged','inventory_consumed') THEN
        v_signed_qty := -1 * v_iss.quantity::int;
        SELECT item_code, unit_price INTO v_item_code, v_unit_price
        FROM public.items WHERE id = v_iss.item_id;
        INSERT INTO public.inventory_transactions(
          tenant_id, hotel_id, item_id, transaction_type,
          quantity, unit_price, total_value, reference_type, reference_id,
          notes, idempotency_key_raw, idempotency_key_hash
        ) VALUES (
          v_iss.tenant_id, v_iss.hotel_id, v_iss.item_id,
          CASE v_job.job_kind
            WHEN 'inventory_lost' THEN 'loss'
            WHEN 'inventory_damaged' THEN 'damage'
            ELSE 'consume' END,
          v_signed_qty, COALESCE(v_unit_price,0),
          COALESCE(v_unit_price,0) * v_signed_qty,
          'room_check_issue', v_iss.id,
          'Auto from room check ' || v_iss.room_check_id::text,
          v_job.idempotency_key_raw,
          v_job.idempotency_key_hash
        )
        ON CONFLICT (idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL
        DO NOTHING;

      -- CHARGE — tạo chargeable_consumptions chờ FO duyệt
      ELSIF v_job.job_kind = 'charge_guest' THEN
        SELECT id INTO v_booking_id FROM public.bookings
        WHERE room_id = v_iss.room_id
          AND status IN ('checked_in','confirmed')
        ORDER BY checkin_time DESC LIMIT 1;
        IF v_booking_id IS NOT NULL THEN
          SELECT unit_price INTO v_unit_price FROM public.items WHERE id = v_iss.item_id;
          INSERT INTO public.chargeable_consumptions(
            tenant_id, hotel_id, booking_id, room_id, item_id,
            quantity, unit_price, total_amount, status, source_issue_id, notes
          ) VALUES (
            v_iss.tenant_id, v_iss.hotel_id, v_booking_id, v_iss.room_id, v_iss.item_id,
            v_iss.quantity, COALESCE(v_unit_price,0),
            COALESCE(v_unit_price,0) * v_iss.quantity,
            'pending_fo_confirm', v_iss.id,
            'Phát sinh từ kiểm tra phòng'
          );
        END IF;

      -- MAINTENANCE — auto tạo request
      ELSIF v_job.job_kind = 'maintenance' THEN
        INSERT INTO public.maintenance_requests(
          tenant_id, hotel_id, room_id, title, description,
          priority, status, source, source_id
        ) VALUES (
          v_iss.tenant_id, v_iss.hotel_id, v_iss.room_id,
          'Hỏng: ' || COALESCE(v_iss.item_name, 'không rõ'),
          COALESCE(v_iss.notes, 'Phát hiện từ kiểm tra phòng'),
          'medium', 'pending', 'room_check', v_iss.id::text
        )
        ON CONFLICT DO NOTHING;
      END IF;

      UPDATE public.room_check_issue_outbox
      SET status = 'done', processed_at = now(), last_error = NULL
      WHERE id = v_job.id;
      v_done := v_done + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_job.attempts >= 5 THEN
        UPDATE public.room_check_issue_outbox
        SET status = 'dead_letter',
            dead_letter_at = now(),
            dead_letter_reason = v_err,
            last_error = v_err,
            processed_at = now()
        WHERE id = v_job.id;
        v_dead := v_dead + 1;
      ELSE
        UPDATE public.room_check_issue_outbox
        SET status = 'retry',
            retry_count = v_job.attempts,
            next_retry_at = public.outbox_next_retry_at(v_job.attempts),
            last_error = v_err
        WHERE id = v_job.id;
        v_failed := v_failed + 1;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'done', v_done,
    'failed', v_failed,
    'skipped', v_skipped,
    'dead_letter', v_dead
  );
END;
$function$;

-- 4) Reconciliation function: liệt kê issue chưa có side-effect
CREATE OR REPLACE FUNCTION public.reconcile_room_check_outbox(_hours int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dead int;
  v_stuck int;
  v_orphan int;
BEGIN
  SELECT count(*) INTO v_dead FROM public.room_check_issue_outbox
   WHERE status = 'dead_letter' AND dead_letter_at >= now() - make_interval(hours => _hours);

  SELECT count(*) INTO v_stuck FROM public.room_check_issue_outbox
   WHERE status IN ('pending','retry')
     AND created_at < now() - interval '6 hours';

  SELECT count(*) INTO v_orphan FROM public.room_check_issues i
   WHERE i.created_at >= now() - make_interval(hours => _hours)
     AND i.bucket IN ('items_missing','items_damaged','items_lost','items_consumed','items_replaced','items_sent_to_laundry')
     AND NOT EXISTS (
       SELECT 1 FROM public.room_check_issue_outbox o
       WHERE o.issue_id = i.id
     );

  RETURN jsonb_build_object(
    'window_hours', _hours,
    'dead_letter', v_dead,
    'stuck_pending', v_stuck,
    'orphan_issues', v_orphan,
    'checked_at', now()
  );
END;
$$;
