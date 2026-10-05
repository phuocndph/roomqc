
-- 1) chargeable_consumptions: override fields
ALTER TABLE public.chargeable_consumptions
  ADD COLUMN IF NOT EXISTS final_status text,
  ADD COLUMN IF NOT EXISTS overridden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS source_issue_id uuid;

-- 2) room_check_issues: review fields (review_reason đã có)
ALTER TABLE public.room_check_issues
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_decision text;

CREATE INDEX IF NOT EXISTS idx_rci_pending_review
  ON public.room_check_issues(hotel_id, created_at DESC)
  WHERE needs_review = true AND review_decision IS NULL;

-- 3) Audit log
CREATE TABLE IF NOT EXISTS public.room_check_issue_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  issue_id uuid NOT NULL REFERENCES public.room_check_issues(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','overridden_approve','overridden_reject')),
  reason text,
  charge_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.room_check_issue_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rcir_tenant_select" ON public.room_check_issue_reviews
  FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_rcir_issue ON public.room_check_issue_reviews(issue_id);
CREATE INDEX IF NOT EXISTS idx_rcir_hotel ON public.room_check_issue_reviews(hotel_id, created_at DESC);

-- 4) Trigger fanout - mở rộng cho items_replaced & supplement
CREATE OR REPLACE FUNCTION public.trg_room_check_issues_outbox_fanout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_kinds text[] := ARRAY[]::text[];
  v_kind text;
  v_raw text;
  v_hash text;
  v_create_maint boolean;
  v_create_supp boolean;
BEGIN
  IF NEW.charge_status = 'not_applicable' THEN
    IF NEW.charge_to_guest IS TRUE THEN
      NEW.charge_status := 'pending_fo_confirm';
    ELSIF NEW.needs_review IS TRUE THEN
      NEW.charge_status := 'pending_manager_review';
    END IF;
  END IF;

  IF NEW.issue_role = 'derived_action' THEN
    RETURN NEW;
  END IF;

  -- Cần manager review trước → không enqueue (trừ laundry)
  IF NEW.needs_review = true AND NEW.bucket NOT IN ('items_sent_to_laundry') THEN
    RETURN NEW;
  END IF;

  v_create_maint := COALESCE((NEW.extra->>'create_maintenance')::boolean, false)
                    OR NEW.asset_group IN ('equipment_large','furniture','bathroom_hardware');
  v_create_supp  := COALESCE((NEW.extra->>'create_supplement')::boolean, false);

  CASE NEW.bucket
    WHEN 'items_sent_to_laundry' THEN
      v_kinds := ARRAY['laundry'];
    WHEN 'items_lost' THEN
      v_kinds := ARRAY['inventory_lost'];
      IF NEW.charge_to_guest IS TRUE THEN
        v_kinds := v_kinds || 'charge_guest';
      END IF;
      IF v_create_supp THEN v_kinds := v_kinds || 'supplement_request'; END IF;
    WHEN 'items_damaged' THEN
      v_kinds := ARRAY['inventory_damaged'];
      IF v_create_maint THEN v_kinds := v_kinds || 'maintenance'; END IF;
    WHEN 'items_consumed' THEN
      v_kinds := ARRAY['inventory_consumed'];
      IF NEW.charge_to_guest IS TRUE THEN
        v_kinds := v_kinds || 'charge_guest';
      END IF;
      IF v_create_supp THEN v_kinds := v_kinds || 'supplement_request'; END IF;
    WHEN 'items_replaced' THEN
      v_kinds := ARRAY['supplement_request'];
    ELSE
      v_kinds := ARRAY[]::text[];
  END CASE;

  FOREACH v_kind IN ARRAY v_kinds LOOP
    v_raw := NEW.tenant_id::text || ':' || NEW.id::text || ':' || v_kind;
    v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');
    INSERT INTO public.room_check_issue_outbox(
      tenant_id, hotel_id, room_check_id, issue_id, job_kind, status,
      payload, schema_version, retry_count, next_retry_at,
      idempotency_key_raw, idempotency_key_hash
    ) VALUES (
      NEW.tenant_id, NEW.hotel_id, NEW.room_check_id, NEW.id, v_kind, 'pending',
      jsonb_build_object(
        'bucket', NEW.bucket, 'asset_group', NEW.asset_group,
        'item_id', NEW.item_id, 'quantity', NEW.quantity, 'extra', NEW.extra
      ),
      1, 0, now(), v_raw, v_hash
    )
    ON CONFLICT (issue_id, job_kind) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 5) Worker - thêm nhánh supplement_request
CREATE OR REPLACE FUNCTION public.process_room_check_issue_outbox(_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_job record; v_iss record;
  v_done int := 0; v_failed int := 0; v_skipped int := 0; v_dead int := 0; v_processed int := 0;
  v_booking_id uuid; v_unit_price numeric; v_item_code text; v_signed_qty int;
  v_request_code text; v_existing_req uuid; v_supp_id uuid; v_err text;
BEGIN
  FOR v_job IN
    UPDATE public.room_check_issue_outbox o
    SET status = 'processing', attempts = o.attempts + 1
    WHERE o.id IN (
      SELECT id FROM public.room_check_issue_outbox
      WHERE status IN ('pending','retry')
        AND next_retry_at <= now() AND attempts < 5
      ORDER BY next_retry_at ASC LIMIT _limit FOR UPDATE SKIP LOCKED
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
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

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
            jsonb_build_array(jsonb_build_object('item_id', v_iss.item_id, 'item_name', v_iss.item_name, 'quantity', v_iss.quantity)),
            v_iss.quantity::int, NULL, 'Auto from room check issue ' || v_iss.id::text
          );
        ELSE
          UPDATE public.laundry_requests
          SET items = items || jsonb_build_array(jsonb_build_object(
                'item_id', v_iss.item_id, 'item_name', v_iss.item_name, 'quantity', v_iss.quantity)),
              total_quantity = total_quantity + v_iss.quantity::int
          WHERE id = v_existing_req;
        END IF;

      ELSIF v_job.job_kind IN ('inventory_lost','inventory_damaged','inventory_consumed') THEN
        v_signed_qty := -1 * v_iss.quantity::int;
        SELECT item_code, unit_price INTO v_item_code, v_unit_price FROM public.items WHERE id = v_iss.item_id;
        INSERT INTO public.inventory_transactions(
          tenant_id, hotel_id, item_id, transaction_type, quantity, unit_price, total_value,
          reference_type, reference_id, notes, idempotency_key_raw, idempotency_key_hash
        ) VALUES (
          v_iss.tenant_id, v_iss.hotel_id, v_iss.item_id,
          CASE v_job.job_kind WHEN 'inventory_lost' THEN 'loss' WHEN 'inventory_damaged' THEN 'damage' ELSE 'consume' END,
          v_signed_qty, COALESCE(v_unit_price,0), COALESCE(v_unit_price,0) * v_signed_qty,
          'room_check_issue', v_iss.id,
          'Auto from room check ' || v_iss.room_check_id::text,
          v_job.idempotency_key_raw, v_job.idempotency_key_hash
        )
        ON CONFLICT (idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL DO NOTHING;

      ELSIF v_job.job_kind = 'charge_guest' THEN
        SELECT id INTO v_booking_id FROM public.room_bookings
        WHERE room_id = v_iss.room_id AND status IN ('checked_in','confirmed')
        ORDER BY check_in_time DESC NULLS LAST LIMIT 1;
        IF v_booking_id IS NOT NULL THEN
          SELECT unit_price, item_code INTO v_unit_price, v_item_code FROM public.items WHERE id = v_iss.item_id;
          INSERT INTO public.chargeable_consumptions(
            tenant_id, booking_id, room_id, item_id, item_code, item_name,
            quantity, unit_price, approval_status, source_issue_id, notes
          ) VALUES (
            v_iss.tenant_id, v_booking_id, v_iss.room_id, v_iss.item_id,
            v_item_code, COALESCE(v_iss.item_name,'Khoản phí'),
            GREATEST(v_iss.quantity::int, 1), COALESCE(v_unit_price,0),
            'pending', v_iss.id, 'Phát sinh từ kiểm tra phòng'
          );
        END IF;

      ELSIF v_job.job_kind = 'maintenance' THEN
        INSERT INTO public.maintenance_requests(
          tenant_id, hotel_id, room_id, location, issue_type, title, description,
          priority, status, reported_by
        ) VALUES (
          v_iss.tenant_id, v_iss.hotel_id, v_iss.room_id,
          COALESCE((SELECT room_number FROM public.rooms WHERE id = v_iss.room_id), 'Phòng'),
          'repair',
          'MR-' || to_char(now(),'YYMMDDHH24MISS'),
          'Hỏng: ' || COALESCE(v_iss.item_name,'không rõ') || E'\n' || COALESCE(v_iss.notes,''),
          'medium', 'pending',
          COALESCE((SELECT id FROM public.users WHERE tenant_id = v_iss.tenant_id LIMIT 1), v_iss.tenant_id)
        );

      ELSIF v_job.job_kind = 'supplement_request' THEN
        SELECT id INTO v_supp_id FROM public.supplement_requests
        WHERE room_check_id = v_iss.room_check_id AND status = 'pending' LIMIT 1;
        IF v_supp_id IS NULL THEN
          INSERT INTO public.supplement_requests(
            tenant_id, hotel_id, room_id, room_check_id, request_code, status, request_type,
            items, total_value, notes
          ) VALUES (
            v_iss.tenant_id, v_iss.hotel_id, v_iss.room_id, v_iss.room_check_id,
            'SR-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(replace(v_iss.room_check_id::text,'-',''),1,4),
            'pending', 'replenish',
            jsonb_build_array(jsonb_build_object(
              'item_id', v_iss.item_id, 'item_name', v_iss.item_name,
              'quantity', v_iss.quantity, 'source_issue_id', v_iss.id
            )), 0, 'Auto from room check issue ' || v_iss.id::text
          );
        ELSE
          UPDATE public.supplement_requests
          SET items = items || jsonb_build_array(jsonb_build_object(
                'item_id', v_iss.item_id, 'item_name', v_iss.item_name,
                'quantity', v_iss.quantity, 'source_issue_id', v_iss.id))
          WHERE id = v_supp_id;
        END IF;
      END IF;

      UPDATE public.room_check_issue_outbox
      SET status = 'done', processed_at = now(), last_error = NULL
      WHERE id = v_job.id;
      v_done := v_done + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_job.attempts >= 5 THEN
        UPDATE public.room_check_issue_outbox
        SET status = 'dead_letter', dead_letter_at = now(), dead_letter_reason = v_err,
            last_error = v_err, processed_at = now()
        WHERE id = v_job.id;
        v_dead := v_dead + 1;
      ELSE
        UPDATE public.room_check_issue_outbox
        SET status = 'retry', retry_count = v_job.attempts,
            next_retry_at = public.outbox_next_retry_at(v_job.attempts), last_error = v_err
        WHERE id = v_job.id;
        v_failed := v_failed + 1;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed, 'done', v_done, 'failed', v_failed,
    'skipped', v_skipped, 'dead_letter', v_dead
  );
END;
$$;

-- 6) Helper kiểm tra quyền manager
CREATE OR REPLACE FUNCTION public.is_manager_or_above(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user
      AND role IN ('super_admin','owner','hotel_manager','department_manager')
  );
$$;

-- 7) RPC review issue
CREATE OR REPLACE FUNCTION public.review_room_check_issue(
  p_issue_id uuid, p_decision text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_iss record;
  v_kinds text[] := ARRAY[]::text[];
  v_kind text; v_raw text; v_hash text;
  v_create_maint boolean; v_create_supp boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF NOT public.is_manager_or_above(v_user) THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;

  SELECT * INTO v_iss FROM public.room_check_issues WHERE id = p_issue_id;
  IF v_iss.id IS NULL THEN RAISE EXCEPTION 'ISSUE_NOT_FOUND'; END IF;
  IF v_iss.review_decision IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_REVIEWED'; END IF;

  UPDATE public.room_check_issues
  SET review_decision = p_decision,
      reviewed_by = v_user, reviewed_at = now(),
      review_reason = p_reason,
      needs_review = CASE WHEN p_decision = 'approved' THEN false ELSE needs_review END,
      charge_status = CASE
        WHEN p_decision = 'approved' AND charge_to_guest IS TRUE THEN 'pending_fo_confirm'::charge_status
        WHEN p_decision = 'rejected' THEN 'chargeable_rejected'::charge_status
        ELSE charge_status END
  WHERE id = p_issue_id;

  INSERT INTO public.room_check_issue_reviews(
    tenant_id, hotel_id, issue_id, reviewer_id, decision, reason
  ) VALUES (v_iss.tenant_id, v_iss.hotel_id, p_issue_id, v_user, p_decision, p_reason);

  -- Khi approved: enqueue như fanout làm
  IF p_decision = 'approved' THEN
    v_create_maint := COALESCE((v_iss.extra->>'create_maintenance')::boolean, false)
                      OR v_iss.asset_group IN ('equipment_large','furniture','bathroom_hardware');
    v_create_supp  := COALESCE((v_iss.extra->>'create_supplement')::boolean, false);
    CASE v_iss.bucket
      WHEN 'items_lost' THEN
        v_kinds := ARRAY['inventory_lost'];
        IF v_iss.charge_to_guest IS TRUE THEN v_kinds := v_kinds || 'charge_guest'; END IF;
        IF v_create_supp THEN v_kinds := v_kinds || 'supplement_request'; END IF;
      WHEN 'items_damaged' THEN
        v_kinds := ARRAY['inventory_damaged'];
        IF v_create_maint THEN v_kinds := v_kinds || 'maintenance'; END IF;
      WHEN 'items_consumed' THEN
        v_kinds := ARRAY['inventory_consumed'];
        IF v_iss.charge_to_guest IS TRUE THEN v_kinds := v_kinds || 'charge_guest'; END IF;
      WHEN 'items_replaced' THEN
        v_kinds := ARRAY['supplement_request'];
      ELSE v_kinds := ARRAY[]::text[];
    END CASE;

    FOREACH v_kind IN ARRAY v_kinds LOOP
      v_raw := v_iss.tenant_id::text || ':' || v_iss.id::text || ':' || v_kind;
      v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');
      INSERT INTO public.room_check_issue_outbox(
        tenant_id, hotel_id, room_check_id, issue_id, job_kind, status,
        payload, schema_version, retry_count, next_retry_at,
        idempotency_key_raw, idempotency_key_hash
      ) VALUES (
        v_iss.tenant_id, v_iss.hotel_id, v_iss.room_check_id, v_iss.id, v_kind, 'pending',
        jsonb_build_object('bucket', v_iss.bucket, 'asset_group', v_iss.asset_group,
          'item_id', v_iss.item_id, 'quantity', v_iss.quantity, 'extra', v_iss.extra),
        1, 0, now(), v_raw, v_hash
      ) ON CONFLICT (issue_id, job_kind) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', p_decision);
END;
$$;

-- 8) RPC override charge
CREATE OR REPLACE FUNCTION public.manager_override_charge(
  p_charge_id uuid, p_decision text, p_override_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_charge record;
  v_audit_decision text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF p_override_reason IS NULL OR length(trim(p_override_reason)) < 5 THEN
    RAISE EXCEPTION 'OVERRIDE_REASON_REQUIRED';
  END IF;
  IF NOT public.is_manager_or_above(v_user) THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;

  SELECT * INTO v_charge FROM public.chargeable_consumptions WHERE id = p_charge_id;
  IF v_charge.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND'; END IF;
  IF v_charge.is_billed THEN RAISE EXCEPTION 'ALREADY_BILLED'; END IF;

  UPDATE public.chargeable_consumptions
  SET final_status = p_decision,
      approval_status = p_decision,
      overridden_by = v_user, overridden_at = now(),
      override_reason = p_override_reason,
      reject_reason = CASE WHEN p_decision='rejected' THEN p_override_reason ELSE reject_reason END,
      updated_at = now()
  WHERE id = p_charge_id;

  IF v_charge.source_issue_id IS NOT NULL THEN
    v_audit_decision := CASE WHEN p_decision='approved' THEN 'overridden_approve' ELSE 'overridden_reject' END;
    INSERT INTO public.room_check_issue_reviews(
      tenant_id, hotel_id, issue_id, reviewer_id, decision, reason, charge_id
    ) VALUES (
      v_charge.tenant_id,
      COALESCE((SELECT hotel_id FROM public.rooms WHERE id = v_charge.room_id), v_charge.tenant_id),
      v_charge.source_issue_id, v_user, v_audit_decision, p_override_reason, p_charge_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', p_decision);
END;
$$;
