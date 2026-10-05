-- 1) Items: auto-reorder opt-in + safety factor
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS auto_reorder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_factor numeric NOT NULL DEFAULT 1.3;

-- 2) Notification preferences: 2 toggles mới
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_dead_stock_digest boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_critical_stock boolean NOT NULL DEFAULT true;

-- 3) RPC: compute_auto_reorder_suggestions
-- Logic: với item bật auto_reorder, suggested = avg_daily_consumption × lead_time × safety_factor − effective_stock
CREATE OR REPLACE FUNCTION public.compute_auto_reorder_suggestions(
  _tenant_id uuid,
  _hotel_id uuid DEFAULT NULL
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
  v_avg_daily numeric;
  v_target numeric;
  v_suggested numeric;
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_id_required'; END IF;

  FOR v_item IN
    SELECT i.id, i.tenant_id, i.hotel_id, i.quantity_in_stock,
           COALESCE(i.lead_time_days, 7)  AS lead_time_days,
           COALESCE(i.safety_factor, 1.3) AS safety_factor,
           COALESCE(i.reorder_max_qty, 0) AS reorder_max_qty
    FROM public.items i
    WHERE i.tenant_id = _tenant_id
      AND COALESCE(i.auto_reorder_enabled, false) = true
      AND (_hotel_id IS NULL OR i.hotel_id = _hotel_id)
  LOOP
    -- Lấy avg_daily từ snapshot mới nhất (30d window)
    SELECT cs.avg_daily_consumption INTO v_avg_daily
    FROM public.consumption_snapshots cs
    WHERE cs.tenant_id = v_item.tenant_id
      AND cs.hotel_id  = v_item.hotel_id
      AND cs.item_id   = v_item.id
      AND cs.window_days = 30
    ORDER BY cs.snapshot_date DESC
    LIMIT 1;

    IF v_avg_daily IS NULL OR v_avg_daily <= 0 THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    SELECT COALESCE(SUM(poi.quantity_ordered - COALESCE(poi.quantity_received, 0)), 0)
      INTO v_on_order
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.po_id
    WHERE poi.item_id = v_item.id
      AND po.status IN ('approved', 'partial', 'pending', 'draft');

    v_effective := COALESCE(v_item.quantity_in_stock, 0) + v_on_order;
    v_target := CEIL(v_avg_daily * v_item.lead_time_days * v_item.safety_factor);

    IF v_target <= v_effective THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- Bỏ qua nếu có ignored hiệu lực
    IF EXISTS (
      SELECT 1 FROM public.reorder_suggestions
      WHERE item_id = v_item.id AND hotel_id = v_item.hotel_id
        AND status = 'ignored' AND ignored_until IS NOT NULL
        AND ignored_until >= CURRENT_DATE
    ) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    v_suggested := v_target - v_effective;

    INSERT INTO public.reorder_suggestions (
      tenant_id, hotel_id, item_id, current_stock, on_order_qty,
      suggested_qty, reason, status, metadata
    )
    SELECT v_item.tenant_id, v_item.hotel_id, v_item.id,
           COALESCE(v_item.quantity_in_stock, 0), v_on_order,
           v_suggested, 'auto_predicted', 'pending',
           jsonb_build_object(
             'avg_daily', v_avg_daily,
             'lead_time_days', v_item.lead_time_days,
             'safety_factor', v_item.safety_factor,
             'target', v_target
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.reorder_suggestions r
      WHERE r.tenant_id = v_item.tenant_id
        AND r.hotel_id  = v_item.hotel_id
        AND r.item_id   = v_item.id
        AND r.status    = 'pending'
    );

    IF FOUND THEN v_created := v_created + 1;
    ELSE v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.compute_auto_reorder_suggestions(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_auto_reorder_suggestions(uuid, uuid) TO authenticated, service_role;

-- 4) Cron daily wrapper: chạy cho mọi tenant active
CREATE OR REPLACE FUNCTION public.run_auto_reorder_daily()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant record;
  v_total_created int := 0;
  v_tenants int := 0;
  v_res jsonb;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT t.id
    FROM public.tenants t
    WHERE COALESCE(t.subscription_status, 'active') IN ('active','trial')
  LOOP
    v_res := public.compute_auto_reorder_suggestions(v_tenant.id, NULL);
    v_total_created := v_total_created + COALESCE((v_res->>'created')::int, 0);
    v_tenants := v_tenants + 1;
  END LOOP;
  RETURN jsonb_build_object('tenants', v_tenants, 'created', v_total_created);
END;
$$;

REVOKE ALL ON FUNCTION public.run_auto_reorder_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_auto_reorder_daily() TO service_role;

-- Schedule cron 06:00 UTC mỗi ngày (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-reorder-daily') THEN
    PERFORM cron.unschedule('auto-reorder-daily');
  END IF;
  PERFORM cron.schedule(
    'auto-reorder-daily',
    '0 6 * * *',
    $cron$ SELECT public.run_auto_reorder_daily(); $cron$
  );
END $$;