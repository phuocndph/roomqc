
-- =====================================================
-- Sprint 1C: Laundry FSM + Audit + Atomic compensation
-- =====================================================

-- 1) Audit table
CREATE TABLE IF NOT EXISTS public.laundry_batch_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.laundry_batches(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  details jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lba_batch ON public.laundry_batch_audit(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lba_tenant ON public.laundry_batch_audit(tenant_id, created_at DESC);

ALTER TABLE public.laundry_batch_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lba_tenant_select" ON public.laundry_batch_audit;
CREATE POLICY "lba_tenant_select" ON public.laundry_batch_audit
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

-- 2) Trigger snapshot policy on insert
CREATE OR REPLACE FUNCTION public.trg_laundry_batch_snapshot_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
BEGIN
  IF NEW.policy_snapshot IS NULL OR NEW.policy_snapshot = '{}'::jsonb THEN
    SELECT COALESCE((value->>'days')::int, (value::text)::int, 30)
      INTO v_days
    FROM public.hotel_policy
    WHERE tenant_id = NEW.tenant_id
      AND hotel_id = NEW.hotel_id
      AND policy_key = 'laundry_compensation_after_days'
      AND is_active = true
    LIMIT 1;

    NEW.policy_snapshot := jsonb_build_object(
      'compensation_after_days', COALESCE(v_days, 30),
      'snapshot_at', now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_laundry_batch_policy_snapshot ON public.laundry_batches;
CREATE TRIGGER trg_laundry_batch_policy_snapshot
  BEFORE INSERT ON public.laundry_batches
  FOR EACH ROW EXECUTE FUNCTION public.trg_laundry_batch_snapshot_policy();

-- 3) FSM transition RPC
CREATE OR REPLACE FUNCTION public.transition_laundry_batch_status(
  _batch_id uuid,
  _to text,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_from text;
  v_uid uuid := auth.uid();
  v_is_mgr boolean;
  v_allowed boolean := false;
BEGIN
  SELECT * INTO v_batch FROM public.laundry_batches
   WHERE id = _batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Lô giặt không tồn tại';
  END IF;
  v_from := v_batch.status;

  IF v_from = _to THEN
    RETURN jsonb_build_object('ok', true, 'no_change', true);
  END IF;

  -- check allowed transitions
  v_allowed := CASE v_from
    WHEN 'draft' THEN _to IN ('delivered','cancelled')
    WHEN 'delivered' THEN _to IN ('washing','ready','cancelled')
    WHEN 'washing' THEN _to IN ('ready')
    WHEN 'ready' THEN _to IN ('received','partially_received')
    WHEN 'received' THEN _to IN ('stocked')
    WHEN 'stocked' THEN _to IN ('closed')
    WHEN 'partially_received' THEN _to IN ('compensation_needed','closed')
    WHEN 'compensation_needed' THEN _to IN ('closed')
    ELSE false
  END;

  -- Cancel chỉ được phép từ draft/delivered. Sau đó chỉ owner/manager override
  IF _to = 'cancelled' AND v_from NOT IN ('draft','delivered') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = v_uid
         AND role IN ('owner','hotel_manager','super_admin')
    ) INTO v_is_mgr;
    IF NOT v_is_mgr THEN
      RAISE EXCEPTION 'Không thể huỷ lô đã %; chỉ Manager/Owner mới có thể override', v_from;
    END IF;
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Không thể chuyển trạng thái % → %', v_from, _to;
  END IF;

  UPDATE public.laundry_batches
     SET status = _to,
         updated_at = now(),
         actual_return_date = CASE WHEN _to IN ('received','partially_received','stocked')
                                       AND actual_return_date IS NULL
                                  THEN now() ELSE actual_return_date END
   WHERE id = _batch_id;

  INSERT INTO public.laundry_batch_audit(
    tenant_id, hotel_id, batch_id, from_status, to_status, reason, performed_by
  ) VALUES (
    v_batch.tenant_id, v_batch.hotel_id, _batch_id, v_from, _to, _reason, v_uid
  );

  RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', _to);
END;
$$;

-- 4) Mark batch partially received — atomic
CREATE OR REPLACE FUNCTION public.mark_batch_partially_received(
  _batch_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_uid uuid := auth.uid();
  v_lost int := 0;
  v_item jsonb;
BEGIN
  SELECT * INTO v_batch FROM public.laundry_batches WHERE id = _batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Lô giặt không tồn tại';
  END IF;

  IF v_batch.status NOT IN ('delivered','washing','ready') THEN
    RAISE EXCEPTION 'Không thể ghi nhận nhận thiếu khi lô đang ở trạng thái %', v_batch.status;
  END IF;

  -- Tính tổng thiếu
  FOR v_item IN SELECT jsonb_array_elements(_items) LOOP
    v_lost := v_lost + GREATEST(0,
      COALESCE((v_item->>'quantity_sent')::int, 0)
      - COALESCE((v_item->>'quantity')::int, 0));
  END LOOP;

  UPDATE public.laundry_batches
     SET status = 'partially_received',
         partially_received_at = now(),
         actual_return_date = COALESCE(actual_return_date, now()),
         items_lost = COALESCE(items_lost, 0) + v_lost,
         updated_at = now()
   WHERE id = _batch_id;

  INSERT INTO public.laundry_batch_audit(
    tenant_id, hotel_id, batch_id, from_status, to_status,
    reason, details, performed_by
  ) VALUES (
    v_batch.tenant_id, v_batch.hotel_id, _batch_id,
    v_batch.status, 'partially_received',
    'Nhận thiếu', jsonb_build_object('items', _items, 'lost_total', v_lost),
    v_uid
  );

  RETURN jsonb_build_object('ok', true, 'lost_total', v_lost);
END;
$$;

-- 5) Settle compensation
CREATE OR REPLACE FUNCTION public.settle_batch_compensation(
  _batch_id uuid,
  _compensation_amount numeric,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_batch FROM public.laundry_batches WHERE id = _batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Lô giặt không tồn tại'; END IF;

  IF v_batch.status NOT IN ('partially_received','compensation_needed') THEN
    RAISE EXCEPTION 'Chỉ chốt đền bù được cho lô đang ở partially_received hoặc compensation_needed';
  END IF;

  UPDATE public.laundry_batches
     SET status = 'closed',
         compensation_amount = COALESCE(_compensation_amount, 0),
         compensation_settled_at = now(),
         compensation_settled_by = v_uid,
         return_notes = COALESCE(return_notes,'') ||
           CASE WHEN _notes IS NOT NULL
                THEN E'\n[Đền bù] ' || _notes ELSE '' END,
         updated_at = now()
   WHERE id = _batch_id;

  INSERT INTO public.laundry_batch_audit(
    tenant_id, hotel_id, batch_id, from_status, to_status,
    reason, details, performed_by
  ) VALUES (
    v_batch.tenant_id, v_batch.hotel_id, _batch_id,
    v_batch.status, 'closed',
    'Chốt đền bù',
    jsonb_build_object('amount', _compensation_amount, 'notes', _notes),
    v_uid
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
