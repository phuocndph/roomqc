-- ============================================================
-- C1: Reorder Suggestions schema + RPC + realtime trigger
-- ============================================================

-- 1) ALTER items: thêm các cột reorder
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS reorder_max_qty integer,
  ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS is_perishable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS preferred_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_preferred_vendor ON public.items(preferred_vendor_id) WHERE preferred_vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_last_outbound ON public.items(tenant_id, last_outbound_at);

-- 2) Bảng reorder_suggestions
CREATE TABLE IF NOT EXISTS public.reorder_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  current_stock numeric NOT NULL DEFAULT 0,
  on_order_qty numeric NOT NULL DEFAULT 0,
  suggested_qty numeric NOT NULL CHECK (suggested_qty > 0),
  reason text NOT NULL DEFAULT 'below_min',  -- below_min | expiring | manual
  status text NOT NULL DEFAULT 'pending',    -- pending | approved | ignored | converted
  ignored_reason text,
  ignored_until date,
  converted_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_by uuid,
  approved_by uuid,
  ignored_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorder_pending
  ON public.reorder_suggestions(tenant_id, hotel_id, status)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reorder_pending_per_item
  ON public.reorder_suggestions(tenant_id, hotel_id, item_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reorder_item ON public.reorder_suggestions(item_id);
CREATE INDEX IF NOT EXISTS idx_reorder_created ON public.reorder_suggestions(tenant_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_reorder_suggestions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reorder_suggestions_updated_at ON public.reorder_suggestions;
CREATE TRIGGER trg_reorder_suggestions_updated_at
BEFORE UPDATE ON public.reorder_suggestions
FOR EACH ROW EXECUTE FUNCTION public.tg_reorder_suggestions_updated_at();

-- 3) RLS
ALTER TABLE public.reorder_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reorder_select_tenant" ON public.reorder_suggestions;
CREATE POLICY "reorder_select_tenant"
ON public.reorder_suggestions FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "reorder_insert_system" ON public.reorder_suggestions;
CREATE POLICY "reorder_insert_system"
ON public.reorder_suggestions FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "reorder_update_manager" ON public.reorder_suggestions;
CREATE POLICY "reorder_update_manager"
ON public.reorder_suggestions FOR UPDATE
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'hotel_manager'::app_role)
    OR public.has_role(auth.uid(), 'department_manager'::app_role)
  )
);

-- KHÔNG có policy DELETE → giữ audit

-- 4) RPC: compute_reorder_suggestions
CREATE OR REPLACE FUNCTION public.compute_reorder_suggestions(
  _tenant_id uuid,
  _hotel_id uuid DEFAULT NULL,
  _item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created int := 0;
  v_skipped int := 0;
  v_item record;
  v_on_order numeric;
  v_effective numeric;
  v_suggested numeric;
  v_target numeric;
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  FOR v_item IN
    SELECT i.id, i.tenant_id, i.hotel_id, i.name, i.quantity_in_stock,
           COALESCE(i.reorder_point, 0) AS reorder_point,
           COALESCE(i.reorder_max_qty, COALESCE(i.reorder_point, 0) * 2) AS reorder_max_qty
    FROM public.items i
    WHERE i.tenant_id = _tenant_id
      AND (_hotel_id IS NULL OR i.hotel_id = _hotel_id)
      AND (_item_id IS NULL OR i.id = _item_id)
      AND COALESCE(i.reorder_point, 0) > 0
  LOOP
    -- Tính on_order: tổng qty của PO chưa nhận đủ
    SELECT COALESCE(SUM(poi.quantity_ordered - COALESCE(poi.quantity_received, 0)), 0)
      INTO v_on_order
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.po_id
    WHERE poi.item_id = v_item.id
      AND po.status IN ('approved', 'partial', 'pending', 'draft');

    v_effective := COALESCE(v_item.quantity_in_stock, 0) + v_on_order;

    IF v_effective < v_item.reorder_point THEN
      -- Bỏ qua nếu có ignored_until > today
      IF EXISTS (
        SELECT 1 FROM public.reorder_suggestions
        WHERE item_id = v_item.id
          AND hotel_id = v_item.hotel_id
          AND status = 'ignored'
          AND ignored_until IS NOT NULL
          AND ignored_until >= CURRENT_DATE
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_target := GREATEST(v_item.reorder_max_qty, v_item.reorder_point * 2);
      v_suggested := v_target - v_effective;

      IF v_suggested <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- UPSERT: nhờ unique partial index → ON CONFLICT không match được, dùng INSERT WHERE NOT EXISTS
      INSERT INTO public.reorder_suggestions
        (tenant_id, hotel_id, item_id, current_stock, on_order_qty, suggested_qty, reason, status)
      SELECT v_item.tenant_id, v_item.hotel_id, v_item.id,
             COALESCE(v_item.quantity_in_stock, 0), v_on_order, v_suggested, 'below_min', 'pending'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.reorder_suggestions
        WHERE tenant_id = v_item.tenant_id
          AND hotel_id = v_item.hotel_id
          AND item_id = v_item.id
          AND status = 'pending'
      );

      IF FOUND THEN
        v_created := v_created + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped);
END;
$$;

-- 5) Trigger realtime: AFTER INSERT inventory_transactions kiểu 'out'
CREATE OR REPLACE FUNCTION public.tg_inventory_out_update_reorder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type = 'out' AND NEW.item_id IS NOT NULL THEN
    -- Update last_outbound_at
    UPDATE public.items
       SET last_outbound_at = COALESCE(NEW.transaction_date, NEW.created_at, now())
     WHERE id = NEW.item_id;

    -- Recompute reorder cho item này
    PERFORM public.compute_reorder_suggestions(NEW.tenant_id, NEW.hotel_id, NEW.item_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_out_reorder ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_out_reorder
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_inventory_out_update_reorder();

-- 6) RPC: approve_reorder_suggestions (gom theo vendor → tạo PO draft)
CREATE OR REPLACE FUNCTION public.approve_reorder_suggestions(
  _suggestion_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_vendor_groups record;
  v_po_id uuid;
  v_po_code text;
  v_seq int;
  v_po_ids uuid[] := ARRAY[]::uuid[];
  v_count int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _suggestion_ids IS NULL OR array_length(_suggestion_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_suggestions';
  END IF;

  -- Permission check
  IF NOT (
    public.has_role(v_user, 'super_admin'::app_role)
    OR public.has_role(v_user, 'owner'::app_role)
    OR public.has_role(v_user, 'hotel_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden_approve';
  END IF;

  -- Validate cùng tenant + còn pending
  SELECT DISTINCT s.tenant_id INTO v_tenant_id
  FROM public.reorder_suggestions s
  WHERE s.id = ANY(_suggestion_ids) AND s.status = 'pending'
  LIMIT 2;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no_pending_suggestions';
  END IF;

  IF (SELECT COUNT(DISTINCT tenant_id) FROM public.reorder_suggestions WHERE id = ANY(_suggestion_ids) AND status='pending') > 1 THEN
    RAISE EXCEPTION 'cross_tenant_not_allowed';
  END IF;

  -- Gom theo (hotel_id, vendor_id) → mỗi nhóm 1 PO
  FOR v_vendor_groups IN
    SELECT s.hotel_id,
           COALESCE(i.preferred_vendor_id, '00000000-0000-0000-0000-000000000000'::uuid) AS vendor_id,
           array_agg(s.id) AS suggestion_ids,
           array_agg(jsonb_build_object('item_id', i.id, 'qty', s.suggested_qty, 'unit_price', COALESCE(i.unit_price, 0))) AS lines
    FROM public.reorder_suggestions s
    JOIN public.items i ON i.id = s.item_id
    WHERE s.id = ANY(_suggestion_ids) AND s.status = 'pending'
    GROUP BY s.hotel_id, COALESCE(i.preferred_vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    v_seq := COALESCE((SELECT COUNT(*) FROM public.purchase_orders WHERE tenant_id = v_tenant_id), 0) + 1;
    v_po_code := 'PO-' || to_char(now(), 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');

    INSERT INTO public.purchase_orders
      (tenant_id, hotel_id, vendor_id, po_code, order_date, status, requested_by, notes)
    VALUES (
      v_tenant_id,
      v_vendor_groups.hotel_id,
      NULLIF(v_vendor_groups.vendor_id, '00000000-0000-0000-0000-000000000000'::uuid),
      v_po_code,
      CURRENT_DATE,
      'draft',
      v_user,
      'Tự động tạo từ ' || array_length(v_vendor_groups.suggestion_ids, 1) || ' đề xuất nhập hàng'
    )
    RETURNING id INTO v_po_id;

    -- Insert PO items
    INSERT INTO public.purchase_order_items (po_id, item_id, quantity_ordered, unit_price, total_price)
    SELECT v_po_id,
           (line->>'item_id')::uuid,
           (line->>'qty')::numeric,
           (line->>'unit_price')::numeric,
           (line->>'qty')::numeric * (line->>'unit_price')::numeric
    FROM unnest(v_vendor_groups.lines) AS line;

    -- Update suggestions
    UPDATE public.reorder_suggestions
       SET status = 'converted', approved_by = v_user, converted_po_id = v_po_id
     WHERE id = ANY(v_vendor_groups.suggestion_ids);

    v_po_ids := array_append(v_po_ids, v_po_id);
    v_count := v_count + array_length(v_vendor_groups.suggestion_ids, 1);

    -- Audit (best-effort)
    BEGIN
      PERFORM public.log_state_transition(
        'reorder_suggestion', v_po_id::text, 'pending', 'converted',
        v_user, jsonb_build_object('po_id', v_po_id, 'count', array_length(v_vendor_groups.suggestion_ids, 1))
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object('po_ids', v_po_ids, 'converted_count', v_count);
END;
$$;

-- 7) RPC: ignore_reorder_suggestion
CREATE OR REPLACE FUNCTION public.ignore_reorder_suggestion(
  _suggestion_id uuid,
  _reason text DEFAULT NULL,
  _ignore_days int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT * INTO v_row FROM public.reorder_suggestions WHERE id = _suggestion_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  IF NOT (
    public.has_role(v_user, 'super_admin'::app_role)
    OR public.has_role(v_user, 'owner'::app_role)
    OR public.has_role(v_user, 'hotel_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden_ignore';
  END IF;

  UPDATE public.reorder_suggestions
     SET status = 'ignored',
         ignored_reason = _reason,
         ignored_by = v_user,
         ignored_until = CURRENT_DATE + GREATEST(_ignore_days, 1)
   WHERE id = _suggestion_id;

  RETURN jsonb_build_object('ok', true, 'ignored_until', CURRENT_DATE + GREATEST(_ignore_days, 1));
END;
$$;

-- 8) Backfill last_outbound_at từ inventory_transactions
UPDATE public.items i
   SET last_outbound_at = sub.max_date
  FROM (
    SELECT item_id, MAX(COALESCE(transaction_date, created_at)) AS max_date
    FROM public.inventory_transactions
    WHERE transaction_type = 'out'
    GROUP BY item_id
  ) sub
 WHERE sub.item_id = i.id
   AND i.last_outbound_at IS NULL;

-- 9) Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.reorder_suggestions;