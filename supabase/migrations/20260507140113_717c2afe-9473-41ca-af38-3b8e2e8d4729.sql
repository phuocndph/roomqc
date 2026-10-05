CREATE TABLE IF NOT EXISTS public.room_check_issue_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  room_check_id uuid NOT NULL,
  issue_id uuid NOT NULL REFERENCES public.room_check_issues(id) ON DELETE CASCADE,
  job_kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb DEFAULT '{}'::jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (issue_id, job_kind)
);

CREATE INDEX IF NOT EXISTS idx_rcio_pending
  ON public.room_check_issue_outbox(status, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rcio_check ON public.room_check_issue_outbox(room_check_id);
CREATE INDEX IF NOT EXISTS idx_rcio_tenant ON public.room_check_issue_outbox(tenant_id);

ALTER TABLE public.room_check_issue_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rcio_tenant_select" ON public.room_check_issue_outbox;
CREATE POLICY "rcio_tenant_select"
ON public.room_check_issue_outbox
FOR SELECT
USING (tenant_id = public.get_current_user_tenant_id());

CREATE OR REPLACE FUNCTION public.enqueue_room_check_issue_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kinds text[] := ARRAY[]::text[];
  v_kind text;
BEGIN
  IF NEW.bucket = 'items_sent_to_laundry' THEN
    v_kinds := array_append(v_kinds, 'laundry');
  ELSIF NEW.bucket IN ('items_lost', 'items_damaged', 'items_missing') THEN
    v_kinds := array_append(v_kinds, 'asset_lifecycle');
  ELSIF NEW.bucket = 'items_replaced' THEN
    v_kinds := array_append(v_kinds, 'asset_lifecycle');
  ELSIF NEW.bucket = 'items_consumed' AND COALESCE(NEW.charge_to_guest, false) THEN
    v_kinds := array_append(v_kinds, 'charge_workflow');
  END IF;

  FOREACH v_kind IN ARRAY v_kinds LOOP
    INSERT INTO public.room_check_issue_outbox(
      tenant_id, hotel_id, room_check_id, issue_id, job_kind, status
    ) VALUES (
      NEW.tenant_id, NEW.hotel_id, NEW.room_check_id, NEW.id, v_kind, 'pending'
    )
    ON CONFLICT (issue_id, job_kind) DO NOTHING;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enqueue_rci_jobs ON public.room_check_issues;
CREATE TRIGGER trg_enqueue_rci_jobs
AFTER INSERT ON public.room_check_issues
FOR EACH ROW EXECUTE FUNCTION public.enqueue_room_check_issue_jobs();

CREATE OR REPLACE FUNCTION public.process_room_check_issue_outbox(_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
  v_iss record;
  v_done int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_processed int := 0;
  v_booking_id uuid;
  v_unit_price numeric;
  v_item_code text;
  v_room_item_qty int;
  v_signed_qty int;
  v_laundry_req_id uuid;
  v_request_code text;
  v_existing_req uuid;
BEGIN
  FOR v_job IN
    UPDATE public.room_check_issue_outbox o
    SET status = 'processing', attempts = o.attempts + 1
    WHERE o.id IN (
      SELECT id FROM public.room_check_issue_outbox
      WHERE status = 'pending' AND attempts < 5
      ORDER BY created_at ASC
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
        SELECT id INTO v_existing_req
        FROM public.laundry_requests
        WHERE room_check_id = v_iss.room_check_id
        LIMIT 1;

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
              'item_id', v_iss.item_id,
              'item_name', v_iss.item_name,
              'quantity', v_iss.quantity,
              'sub_reason', v_iss.sub_reason
            )),
            v_iss.quantity::int, NULL, v_iss.notes
          ) RETURNING id INTO v_laundry_req_id;
        ELSE
          UPDATE public.laundry_requests
          SET items = items || jsonb_build_array(jsonb_build_object(
                'item_id', v_iss.item_id,
                'item_name', v_iss.item_name,
                'quantity', v_iss.quantity,
                'sub_reason', v_iss.sub_reason
              )),
              total_quantity = total_quantity + v_iss.quantity::int,
              updated_at = now()
          WHERE id = v_existing_req
          RETURNING id INTO v_laundry_req_id;
        END IF;

        UPDATE public.room_check_issue_outbox
        SET status = 'done', processed_at = now(),
            result = jsonb_build_object('laundry_request_id', v_laundry_req_id)
        WHERE id = v_job.id;
        v_done := v_done + 1;

      -- ASSET LIFECYCLE
      ELSIF v_job.job_kind = 'asset_lifecycle' THEN
        IF v_iss.item_id IS NULL THEN
          UPDATE public.room_check_issue_outbox
          SET status = 'skipped', processed_at = now(), last_error = 'item_id_null'
          WHERE id = v_job.id;
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        v_signed_qty := CASE
          WHEN v_iss.bucket = 'items_replaced' THEN  v_iss.quantity::int
          ELSE -v_iss.quantity::int
        END;

        SELECT quantity INTO v_room_item_qty
        FROM public.room_items
        WHERE room_id = v_iss.room_id AND item_id = v_iss.item_id;

        IF v_room_item_qty IS NULL THEN
          IF v_iss.bucket = 'items_replaced' THEN
            INSERT INTO public.room_items(room_id, item_id, quantity, last_checked_at)
            VALUES (v_iss.room_id, v_iss.item_id, GREATEST(v_signed_qty, 0), now())
            ON CONFLICT (room_id, item_id) DO UPDATE
              SET quantity = public.room_items.quantity + EXCLUDED.quantity,
                  last_checked_at = now();
          END IF;
        ELSE
          UPDATE public.room_items
          SET quantity = GREATEST(0, quantity + v_signed_qty),
              last_checked_at = now()
          WHERE room_id = v_iss.room_id AND item_id = v_iss.item_id;
        END IF;

        INSERT INTO public.inventory_transactions(
          tenant_id, hotel_id, item_id,
          transaction_code, transaction_type, transaction_category,
          quantity, quantity_before, quantity_after,
          related_type, related_id,
          from_location, to_location,
          created_by, notes
        ) VALUES (
          v_iss.tenant_id, v_iss.hotel_id, v_iss.item_id,
          'RCI-' || substr(replace(v_iss.id::text, '-', ''), 1, 10),
          CASE WHEN v_signed_qty < 0 THEN 'out' ELSE 'in' END,
          v_iss.bucket,
          ABS(v_signed_qty),
          COALESCE(v_room_item_qty, 0),
          GREATEST(0, COALESCE(v_room_item_qty, 0) + v_signed_qty),
          'room_check_issue', v_iss.id,
          CASE WHEN v_signed_qty < 0 THEN 'room:' || v_iss.room_id::text ELSE NULL END,
          CASE WHEN v_signed_qty > 0 THEN 'room:' || v_iss.room_id::text ELSE NULL END,
          COALESCE((SELECT checked_by FROM public.room_checks WHERE id = v_iss.room_check_id), v_iss.tenant_id),
          'Room check issue: ' || v_iss.bucket
        );

        UPDATE public.room_check_issue_outbox
        SET status = 'done', processed_at = now(),
            result = jsonb_build_object('signed_quantity', v_signed_qty)
        WHERE id = v_job.id;
        v_done := v_done + 1;

      -- CHARGE WORKFLOW
      ELSIF v_job.job_kind = 'charge_workflow' THEN
        SELECT id INTO v_booking_id
        FROM public.room_bookings
        WHERE room_id = v_iss.room_id
          AND status IN ('checked_in','occupied','checked-in')
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_booking_id IS NULL THEN
          UPDATE public.room_check_issue_outbox
          SET status = 'skipped', processed_at = now(), last_error = 'no_active_booking'
          WHERE id = v_job.id;
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        IF v_iss.item_id IS NULL THEN
          UPDATE public.room_check_issue_outbox
          SET status = 'skipped', processed_at = now(), last_error = 'item_id_null'
          WHERE id = v_job.id;
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        SELECT COALESCE(unit_price, 0), item_code
          INTO v_unit_price, v_item_code
        FROM public.items WHERE id = v_iss.item_id;

        INSERT INTO public.chargeable_consumptions(
          tenant_id, booking_id, room_id,
          item_id, item_code, item_name,
          quantity, unit_price, recorded_by, notes
        ) VALUES (
          v_iss.tenant_id, v_booking_id, v_iss.room_id,
          v_iss.item_id, v_item_code, COALESCE(v_iss.item_name, ''),
          v_iss.quantity::int, COALESCE(v_unit_price, 0),
          (SELECT checked_by FROM public.room_checks WHERE id = v_iss.room_check_id),
          v_iss.notes
        );

        UPDATE public.room_check_issue_outbox
        SET status = 'done', processed_at = now(),
            result = jsonb_build_object('booking_id', v_booking_id, 'unit_price', v_unit_price)
        WHERE id = v_job.id;
        v_done := v_done + 1;

      ELSE
        UPDATE public.room_check_issue_outbox
        SET status = 'skipped', processed_at = now(), last_error = 'unknown_job_kind'
        WHERE id = v_job.id;
        v_skipped := v_skipped + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.room_check_issue_outbox
      SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
          last_error = SQLERRM
      WHERE id = v_job.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'done', v_done,
    'failed', v_failed,
    'skipped', v_skipped
  );
END $$;

REVOKE ALL ON FUNCTION public.process_room_check_issue_outbox(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_room_check_issue_outbox(int) TO authenticated, service_role;