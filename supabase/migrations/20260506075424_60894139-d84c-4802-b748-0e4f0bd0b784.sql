-- Phase C2 — Consumption Snapshots & Dead Stock Analytics

CREATE TABLE IF NOT EXISTS public.consumption_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  qty_consumed_7d numeric(15,2) NOT NULL DEFAULT 0,
  qty_consumed_30d numeric(15,2) NOT NULL DEFAULT 0,
  qty_consumed_90d numeric(15,2) NOT NULL DEFAULT 0,
  avg_daily_consumption numeric(15,4) NOT NULL DEFAULT 0,
  stock_on_date numeric(15,2) NOT NULL DEFAULT 0,
  stock_days_remaining numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_consumption_snapshot UNIQUE (tenant_id, hotel_id, item_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_consumption_snap_tenant_date 
  ON public.consumption_snapshots(tenant_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_snap_item_date 
  ON public.consumption_snapshots(item_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_snap_hotel 
  ON public.consumption_snapshots(tenant_id, hotel_id, snapshot_date DESC);

ALTER TABLE public.consumption_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consumption_snapshots_read"
  ON public.consumption_snapshots FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_current_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'hotel_manager'::app_role)
      OR public.has_role(auth.uid(), 'department_manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_hotels uh
        WHERE uh.user_id = auth.uid() AND uh.hotel_id = consumption_snapshots.hotel_id
      )
    )
  );

CREATE POLICY "consumption_snapshots_service_write"
  ON public.consumption_snapshots FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "consumption_snapshots_service_update"
  ON public.consumption_snapshots FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

-- RPC: refresh snapshots (idempotent UPSERT)
CREATE OR REPLACE FUNCTION public.refresh_consumption_snapshots(
  _tenant_id uuid,
  _hotel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_processed int := 0;
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  INSERT INTO consumption_snapshots (
    tenant_id, hotel_id, item_id, snapshot_date,
    qty_consumed_7d, qty_consumed_30d, qty_consumed_90d,
    avg_daily_consumption, stock_on_date, stock_days_remaining
  )
  SELECT
    i.tenant_id, i.hotel_id, i.id, v_today,
    COALESCE(SUM(CASE WHEN it.transaction_date >= v_today - INTERVAL '7 days' THEN it.quantity END), 0),
    COALESCE(SUM(CASE WHEN it.transaction_date >= v_today - INTERVAL '30 days' THEN it.quantity END), 0),
    COALESCE(SUM(CASE WHEN it.transaction_date >= v_today - INTERVAL '90 days' THEN it.quantity END), 0),
    COALESCE(SUM(CASE WHEN it.transaction_date >= v_today - INTERVAL '30 days' THEN it.quantity END), 0)::numeric / 30.0,
    COALESCE(i.quantity_in_stock, 0),
    CASE
      WHEN COALESCE(SUM(CASE WHEN it.transaction_date >= v_today - INTERVAL '30 days' THEN it.quantity END), 0) > 0
      THEN ROUND(
        COALESCE(i.quantity_in_stock, 0)::numeric
        / (COALESCE(SUM(CASE WHEN it.transaction_date >= v_today - INTERVAL '30 days' THEN it.quantity END), 0)::numeric / 30.0),
        2
      )
      ELSE NULL
    END
  FROM items i
  LEFT JOIN inventory_transactions it
    ON it.item_id = i.id
    AND it.tenant_id = i.tenant_id
    AND it.transaction_type = 'out'
    AND it.transaction_date >= v_today - INTERVAL '90 days'
  WHERE i.tenant_id = _tenant_id
    AND i.status = 'active'
    AND (_hotel_id IS NULL OR i.hotel_id = _hotel_id)
  GROUP BY i.id, i.tenant_id, i.hotel_id, i.quantity_in_stock
  ON CONFLICT (tenant_id, hotel_id, item_id, snapshot_date)
  DO UPDATE SET
    qty_consumed_7d = EXCLUDED.qty_consumed_7d,
    qty_consumed_30d = EXCLUDED.qty_consumed_30d,
    qty_consumed_90d = EXCLUDED.qty_consumed_90d,
    avg_daily_consumption = EXCLUDED.avg_daily_consumption,
    stock_on_date = EXCLUDED.stock_on_date,
    stock_days_remaining = EXCLUDED.stock_days_remaining;

  GET DIAGNOSTICS v_processed = ROW_COUNT;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'snapshot_date', v_today,
    'tenant_id', _tenant_id
  );
END;
$$;

-- RPC: dead stock report
CREATE OR REPLACE FUNCTION public.get_dead_stock_report(
  _tenant_id uuid,
  _hotel_id uuid DEFAULT NULL,
  _days_threshold int DEFAULT 90
)
RETURNS TABLE (
  item_id uuid,
  item_code text,
  item_name text,
  hotel_id uuid,
  category_id uuid,
  asset_group asset_group,
  quantity_in_stock integer,
  unit_price numeric,
  total_value numeric,
  last_outbound_at timestamptz,
  days_since_last_out integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.code, i.name, i.hotel_id, i.category_id, i.asset_group,
    i.quantity_in_stock, i.unit_price,
    (COALESCE(i.quantity_in_stock, 0) * COALESCE(i.unit_price, 0))::numeric,
    i.last_outbound_at,
    CASE WHEN i.last_outbound_at IS NULL THEN NULL
         ELSE EXTRACT(DAY FROM (now() - i.last_outbound_at))::int END
  FROM items i
  WHERE i.tenant_id = _tenant_id
    AND i.status = 'active'
    AND COALESCE(i.quantity_in_stock, 0) > 0
    AND (_hotel_id IS NULL OR i.hotel_id = _hotel_id)
    AND (
      i.last_outbound_at IS NULL
      OR i.last_outbound_at < now() - (_days_threshold || ' days')::interval
    )
  ORDER BY (COALESCE(i.quantity_in_stock, 0) * COALESCE(i.unit_price, 0)) DESC;
$$;

-- RPC: consumption trend
CREATE OR REPLACE FUNCTION public.get_consumption_trend(
  _item_id uuid,
  _days int DEFAULT 90
)
RETURNS TABLE (day date, qty_out numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (_days - 1))::date,
      CURRENT_DATE,
      INTERVAL '1 day'
    )::date AS day
  )
  SELECT d.day,
         COALESCE(SUM(it.quantity), 0)::numeric
  FROM days d
  LEFT JOIN inventory_transactions it
    ON it.item_id = _item_id
   AND it.transaction_type = 'out'
   AND it.transaction_date::date = d.day
  GROUP BY d.day
  ORDER BY d.day;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_consumption_snapshots(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dead_stock_report(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_consumption_trend(uuid, int) TO authenticated;