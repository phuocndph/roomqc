-- P1: Financial report — thêm revenue_summary, net_profit, profit_margin và monthly_trend có doanh thu
CREATE OR REPLACE FUNCTION public.get_financial_report(p_tenant_id uuid, p_hotel_id uuid, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_purchase NUMERIC;
  v_laundry NUMERIC;
  v_maintenance NUMERIC;
  v_total_cost NUMERIC;
  v_gross_revenue NUMERIC;
  v_paid_revenue NUMERIC;
  v_pending_revenue NUMERIC;
  v_ota_commission NUMERIC;
  v_vat NUMERIC;
  v_net_revenue NUMERIC;
BEGIN
  -- Costs
  SELECT COALESCE(SUM(total_value), 0) INTO v_purchase
  FROM inventory_transactions
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND transaction_type = 'in'
    AND transaction_category = 'purchase'
    AND transaction_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0) INTO v_laundry
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status IN ('delivered','washing','ready','received','stocked','completed')
    AND delivery_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(actual_cost), 0) INTO v_maintenance
  FROM maintenance_requests
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status = 'completed'
    AND completed_at BETWEEN p_start_date AND p_end_date;

  v_total_cost := v_purchase + v_laundry + v_maintenance;

  -- Revenue: chỉ booking đã trả phòng
  SELECT
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(COALESCE(amount_paid,0) + COALESCE(deposit_amount,0)), 0),
    COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(amount_paid,0) - COALESCE(deposit_amount,0))), 0),
    COALESCE(SUM(ota_commission_amount), 0),
    COALESCE(SUM(vat_amount), 0),
    COALESCE(SUM(COALESCE(net_revenue, total_amount - COALESCE(ota_commission_amount,0))), 0)
  INTO v_gross_revenue, v_paid_revenue, v_pending_revenue, v_ota_commission, v_vat, v_net_revenue
  FROM room_bookings
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status = 'checked_out'
    AND check_out_date::date BETWEEN p_start_date AND p_end_date;

  v_result := jsonb_build_object(
    'cost_summary', jsonb_build_object(
      'purchase_cost', v_purchase,
      'laundry_cost', v_laundry,
      'maintenance_cost', v_maintenance,
      'total_cost', v_total_cost
    ),
    'revenue_summary', jsonb_build_object(
      'gross_revenue', v_gross_revenue,
      'paid_revenue', v_paid_revenue,
      'pending_revenue', v_pending_revenue,
      'ota_commission', v_ota_commission,
      'vat_amount', v_vat,
      'net_revenue', v_net_revenue
    ),
    'profit_summary', jsonb_build_object(
      'net_profit', v_net_revenue - v_total_cost,
      'profit_margin', CASE WHEN v_net_revenue > 0
        THEN ROUND(((v_net_revenue - v_total_cost) / v_net_revenue * 100)::numeric, 1)
        ELSE 0 END
    ),
    'monthly_trend', (
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', p_start_date),
          date_trunc('month', p_end_date),
          '1 month'::interval
        )::date AS month
      )
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'Mon'),
        'purchase', COALESCE((SELECT SUM(total_value) FROM inventory_transactions
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND transaction_type='in' AND transaction_category='purchase'
            AND date_trunc('month', transaction_date) = m.month), 0),
        'laundry', COALESCE((SELECT SUM(COALESCE(actual_cost, estimated_cost, 0)) FROM laundry_batches
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND status IN ('delivered','washing','ready','received','stocked','completed')
            AND date_trunc('month', delivery_date) = m.month), 0),
        'maintenance', COALESCE((SELECT SUM(actual_cost) FROM maintenance_requests
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND status='completed'
            AND date_trunc('month', completed_at) = m.month), 0),
        'revenue', COALESCE((SELECT SUM(COALESCE(net_revenue, total_amount - COALESCE(ota_commission_amount,0)))
          FROM room_bookings
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND status='checked_out'
            AND date_trunc('month', check_out_date::date) = m.month), 0),
        'profit', COALESCE((SELECT SUM(COALESCE(net_revenue, total_amount - COALESCE(ota_commission_amount,0)))
          FROM room_bookings
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND status='checked_out'
            AND date_trunc('month', check_out_date::date) = m.month), 0)
        - COALESCE((SELECT SUM(total_value) FROM inventory_transactions
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND transaction_type='in'
            AND date_trunc('month', transaction_date) = m.month), 0)
        - COALESCE((SELECT SUM(COALESCE(actual_cost, estimated_cost, 0)) FROM laundry_batches
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND status IN ('delivered','washing','ready','received','stocked','completed')
            AND date_trunc('month', delivery_date) = m.month), 0)
        - COALESCE((SELECT SUM(actual_cost) FROM maintenance_requests
          WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
            AND status='completed'
            AND date_trunc('month', completed_at) = m.month), 0)
      ) ORDER BY m.month)
      FROM months m
    )
  );

  RETURN v_result;
END;
$function$;

-- P1: Laundry report — gồm cả batch đang xử lý, ưu tiên actual_cost fallback estimated_cost
CREATE OR REPLACE FUNCTION public.get_laundry_report(p_tenant_id uuid, p_hotel_id uuid, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active_statuses TEXT[] := ARRAY['delivered','washing','ready','received','stocked','completed'];
  v_result JSONB;
  v_summary JSONB;
  v_by_vendor JSONB;
  v_monthly_trend JSONB;
  v_period_comparison JSONB;
  v_processing_stats JSONB;
  v_status_breakdown JSONB;
  v_period_days INTEGER;
  v_previous_start DATE;
  v_previous_end DATE;
  v_prev_cost NUMERIC;
  v_prev_items INTEGER;
  v_cur_cost NUMERIC;
  v_cur_items INTEGER;
BEGIN
  v_period_days := (p_end_date - p_start_date) + 1;
  v_previous_start := p_start_date - v_period_days;
  v_previous_end := p_start_date - 1;

  -- Summary: dùng COALESCE(actual_cost, estimated_cost)
  SELECT jsonb_build_object(
    'total_batches', COUNT(*),
    'completed_batches', COUNT(*) FILTER (WHERE status IN ('received','stocked','completed')),
    'in_progress_batches', COUNT(*) FILTER (WHERE status IN ('delivered','washing','ready')),
    'total_items', COALESCE(SUM(total_items), 0),
    'total_cost', COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0),
    'actual_cost', COALESCE(SUM(actual_cost) FILTER (WHERE actual_cost IS NOT NULL), 0),
    'estimated_cost', COALESCE(SUM(estimated_cost) FILTER (WHERE actual_cost IS NULL), 0),
    'avg_cost_per_batch', COALESCE(AVG(COALESCE(actual_cost, estimated_cost, 0)), 0)
  ) INTO v_summary
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status = ANY(v_active_statuses)
    AND delivery_date BETWEEN p_start_date AND p_end_date;

  -- Status breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', status,
    'batches', cnt,
    'items', items,
    'cost', cost
  )), '[]'::jsonb) INTO v_status_breakdown
  FROM (
    SELECT status,
      COUNT(*) AS cnt,
      COALESCE(SUM(total_items), 0) AS items,
      COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0) AS cost
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status = ANY(v_active_statuses)
      AND delivery_date BETWEEN p_start_date AND p_end_date
    GROUP BY status
  ) s;

  -- By vendor
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'vendor_id', vendor_id,
    'vendor_name', vendor_name,
    'batches', batches,
    'items', items,
    'cost', cost
  ) ORDER BY cost DESC), '[]'::jsonb) INTO v_by_vendor
  FROM (
    SELECT lv.id AS vendor_id, lv.name AS vendor_name,
      COUNT(lb.id) AS batches,
      COALESCE(SUM(lb.total_items), 0) AS items,
      COALESCE(SUM(COALESCE(lb.actual_cost, lb.estimated_cost, 0)), 0) AS cost
    FROM laundry_vendors lv
    LEFT JOIN laundry_batches lb ON lb.vendor_id = lv.id
      AND lb.delivery_date BETWEEN p_start_date AND p_end_date
      AND lb.status = ANY(v_active_statuses)
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
    WHERE lv.tenant_id = p_tenant_id AND lv.status = 'active'
    GROUP BY lv.id, lv.name
  ) v;

  -- Monthly trend
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month', TO_CHAR(month_date, 'Mon'),
    'month_key', TO_CHAR(month_date, 'YYYY-MM'),
    'batches', batches,
    'items', items,
    'cost', cost
  ) ORDER BY month_key), '[]'::jsonb) INTO v_monthly_trend
  FROM (
    SELECT date_trunc('month', delivery_date)::date AS month_date,
      TO_CHAR(delivery_date, 'YYYY-MM') AS month_key,
      COUNT(*) AS batches,
      COALESCE(SUM(total_items), 0) AS items,
      COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0) AS cost
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status = ANY(v_active_statuses)
      AND delivery_date BETWEEN p_start_date AND p_end_date
    GROUP BY date_trunc('month', delivery_date), TO_CHAR(delivery_date, 'YYYY-MM')
  ) m;

  -- Period comparison
  SELECT COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0), COALESCE(SUM(total_items), 0)
  INTO v_cur_cost, v_cur_items
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status = ANY(v_active_statuses)
    AND delivery_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0), COALESCE(SUM(total_items), 0)
  INTO v_prev_cost, v_prev_items
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status = ANY(v_active_statuses)
    AND delivery_date BETWEEN v_previous_start AND v_previous_end;

  v_period_comparison := jsonb_build_object(
    'current_cost', v_cur_cost,
    'previous_cost', v_prev_cost,
    'cost_change_pct', CASE WHEN v_prev_cost > 0
      THEN ROUND(((v_cur_cost - v_prev_cost) / v_prev_cost * 100)::numeric, 1) ELSE 0 END,
    'current_items', v_cur_items,
    'previous_items', v_prev_items,
    'items_change_pct', CASE WHEN v_prev_items > 0
      THEN ROUND(((v_cur_items - v_prev_items)::numeric / v_prev_items * 100), 1) ELSE 0 END
  );

  -- Processing stats: chỉ tính batch đã trả về (mới có actual_return_date)
  SELECT jsonb_build_object(
    'avg_days', ROUND(COALESCE(AVG(EXTRACT(DAY FROM (actual_return_date - delivery_date))), 0)::numeric, 1),
    'min_days', COALESCE(MIN(EXTRACT(DAY FROM (actual_return_date - delivery_date)))::INTEGER, 0),
    'max_days', COALESCE(MAX(EXTRACT(DAY FROM (actual_return_date - delivery_date)))::INTEGER, 0),
    'completed_batches', COUNT(*)
  ) INTO v_processing_stats
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status IN ('received','stocked','completed')
    AND actual_return_date IS NOT NULL
    AND delivery_date BETWEEN p_start_date AND p_end_date;

  v_result := jsonb_build_object(
    'summary', v_summary,
    'status_breakdown', v_status_breakdown,
    'by_vendor', v_by_vendor,
    'monthly_trend', v_monthly_trend,
    'period_comparison', v_period_comparison,
    'processing_stats', v_processing_stats,
    'period', jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date)
  );

  RETURN v_result;
END;
$function$;