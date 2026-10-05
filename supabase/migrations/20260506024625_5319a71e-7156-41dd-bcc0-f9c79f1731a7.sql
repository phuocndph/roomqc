-- Fix 2 bugs trong approve_reorder_suggestions:
--   1) purchase_orders.vendor_id NOT NULL → skip suggestions không có preferred_vendor (báo skipped)
--   2) purchase_order_items.total_price là GENERATED → không insert thẳng

CREATE OR REPLACE FUNCTION public.approve_reorder_suggestions(_suggestion_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_tenant_id uuid;
  v_vendor_groups record;
  v_line jsonb;
  v_po_id uuid;
  v_po_code text;
  v_seq int;
  v_po_ids uuid[] := ARRAY[]::uuid[];
  v_count int := 0;
  v_skipped_no_vendor int := 0;
  v_skipped_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _suggestion_ids IS NULL OR array_length(_suggestion_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_suggestions';
  END IF;

  IF NOT (
    public.has_role(v_user, 'super_admin'::app_role)
    OR public.has_role(v_user, 'owner'::app_role)
    OR public.has_role(v_user, 'hotel_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden_approve';
  END IF;

  SELECT DISTINCT s.tenant_id INTO v_tenant_id
  FROM public.reorder_suggestions s
  WHERE s.id = ANY(_suggestion_ids) AND s.status = 'pending'
  LIMIT 2;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no_pending_suggestions';
  END IF;

  IF (SELECT COUNT(DISTINCT tenant_id) FROM public.reorder_suggestions
      WHERE id = ANY(_suggestion_ids) AND status='pending') > 1 THEN
    RAISE EXCEPTION 'cross_tenant_not_allowed';
  END IF;

  -- Đếm + thu thập các suggestion bị skip vì thiếu vendor
  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]), COALESCE(COUNT(*), 0)::int
    INTO v_skipped_ids, v_skipped_no_vendor
  FROM public.reorder_suggestions s
  JOIN public.items i ON i.id = s.item_id
  WHERE s.id = ANY(_suggestion_ids)
    AND s.status = 'pending'
    AND i.preferred_vendor_id IS NULL;

  -- Gom theo (hotel_id, vendor_id) — CHỈ items có preferred_vendor_id
  FOR v_vendor_groups IN
    SELECT s.hotel_id,
           i.preferred_vendor_id AS vendor_id,
           array_agg(s.id) AS suggestion_ids,
           jsonb_agg(jsonb_build_object(
             'item_id', i.id,
             'qty', s.suggested_qty,
             'unit_price', COALESCE(i.unit_price, 0)
           )) AS lines
    FROM public.reorder_suggestions s
    JOIN public.items i ON i.id = s.item_id
    WHERE s.id = ANY(_suggestion_ids)
      AND s.status = 'pending'
      AND i.preferred_vendor_id IS NOT NULL
    GROUP BY s.hotel_id, i.preferred_vendor_id
  LOOP
    v_seq := COALESCE((SELECT COUNT(*) FROM public.purchase_orders WHERE tenant_id = v_tenant_id), 0) + 1;
    v_po_code := 'PO-' || to_char(now(), 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');

    INSERT INTO public.purchase_orders
      (tenant_id, hotel_id, vendor_id, po_code, order_date, status, requested_by, notes)
    VALUES (
      v_tenant_id,
      v_vendor_groups.hotel_id,
      v_vendor_groups.vendor_id,
      v_po_code,
      CURRENT_DATE,
      'draft',
      v_user,
      'Tự động tạo từ ' || array_length(v_vendor_groups.suggestion_ids, 1) || ' đề xuất nhập hàng'
    )
    RETURNING id INTO v_po_id;

    -- Insert PO items (KHÔNG insert total_price — generated column)
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_vendor_groups.lines)
    LOOP
      INSERT INTO public.purchase_order_items
        (po_id, item_id, quantity_ordered, unit_price)
      VALUES (
        v_po_id,
        (v_line->>'item_id')::uuid,
        (v_line->>'qty')::int,
        (v_line->>'unit_price')::numeric
      );
    END LOOP;

    -- Đánh dấu suggestions converted
    UPDATE public.reorder_suggestions
       SET status = 'converted',
           converted_po_id = v_po_id,
           updated_at = now()
     WHERE id = ANY(v_vendor_groups.suggestion_ids);

    v_po_ids := v_po_ids || v_po_id;
    v_count := v_count + array_length(v_vendor_groups.suggestion_ids, 1);

    -- Audit best-effort
    BEGIN
      PERFORM public.log_state_transition(
        'purchase_order', v_po_id, NULL, 'draft',
        jsonb_build_object('source', 'reorder_approve', 'suggestion_count', array_length(v_vendor_groups.suggestion_ids, 1))
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'po_ids', to_jsonb(v_po_ids),
    'converted_count', v_count,
    'skipped_no_vendor_count', v_skipped_no_vendor,
    'skipped_no_vendor_ids', to_jsonb(v_skipped_ids)
  );
END;
$function$;