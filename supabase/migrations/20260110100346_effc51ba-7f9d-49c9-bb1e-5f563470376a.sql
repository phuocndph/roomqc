-- RPC function to get stock audit report data
CREATE OR REPLACE FUNCTION public.get_stock_audit_report(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_start_date date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_summary jsonb;
  v_audits_list jsonb;
  v_discrepancy_by_category jsonb;
  v_monthly_trend jsonb;
  v_investigation_summary jsonb;
BEGIN
  -- Summary statistics
  SELECT jsonb_build_object(
    'total_audits', COALESCE(COUNT(DISTINCT sa.id), 0),
    'total_items_checked', COALESCE(SUM((SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id)), 0),
    'match_count', COALESCE(SUM((SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id AND actual_quantity IS NOT NULL AND difference = 0)), 0),
    'discrepancy_count', COALESCE(SUM((SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id AND actual_quantity IS NOT NULL AND difference != 0)), 0),
    'total_shortage_qty', COALESCE(SUM((SELECT COALESCE(SUM(ABS(difference)), 0) FROM stock_adjustment_items WHERE adjustment_id = sa.id AND difference < 0)), 0),
    'total_excess_qty', COALESCE(SUM((SELECT COALESCE(SUM(difference), 0) FROM stock_adjustment_items WHERE adjustment_id = sa.id AND difference > 0)), 0),
    'total_discrepancy_value', COALESCE(SUM((SELECT COALESCE(SUM(ABS(difference) * COALESCE(i.unit_price, 0)), 0) FROM stock_adjustment_items sai JOIN items i ON i.id = sai.item_id WHERE sai.adjustment_id = sa.id AND sai.difference != 0)), 0)
  ) INTO v_summary
  FROM stock_adjustments sa
  WHERE sa.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR sa.hotel_id = p_hotel_id)
    AND sa.scheduled_date >= p_start_date
    AND sa.scheduled_date <= p_end_date;

  -- Calculate accuracy rate
  v_summary := v_summary || jsonb_build_object(
    'accuracy_rate', CASE 
      WHEN (v_summary->>'total_items_checked')::int > 0 
      THEN ROUND(((v_summary->>'match_count')::numeric / (v_summary->>'total_items_checked')::numeric) * 100, 1)
      ELSE 100
    END
  );

  -- Audits list
  SELECT COALESCE(jsonb_agg(audit_row ORDER BY audit_row->>'scheduled_date' DESC), '[]'::jsonb) INTO v_audits_list
  FROM (
    SELECT jsonb_build_object(
      'id', sa.id,
      'adjustment_code', sa.adjustment_code,
      'adjustment_type', sa.adjustment_type,
      'status', sa.status,
      'scheduled_date', sa.scheduled_date,
      'completed_at', sa.completed_at,
      'approved_at', sa.approved_at,
      'created_by_name', COALESCE(u.full_name, u.email),
      'items_count', (SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id),
      'match_count', (SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id AND actual_quantity IS NOT NULL AND difference = 0),
      'discrepancy_count', (SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id AND actual_quantity IS NOT NULL AND difference != 0),
      'adjustment_value', (SELECT COALESCE(SUM(ABS(sai.difference) * COALESCE(i.unit_price, 0)), 0) FROM stock_adjustment_items sai JOIN items i ON i.id = sai.item_id WHERE sai.adjustment_id = sa.id AND sai.difference != 0)
    ) AS audit_row
    FROM stock_adjustments sa
    LEFT JOIN users u ON u.id = sa.created_by
    WHERE sa.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR sa.hotel_id = p_hotel_id)
      AND sa.scheduled_date >= p_start_date
      AND sa.scheduled_date <= p_end_date
  ) sub;

  -- Discrepancy by category
  SELECT COALESCE(jsonb_agg(cat_row ORDER BY cat_row->>'adjustment_value' DESC), '[]'::jsonb) INTO v_discrepancy_by_category
  FROM (
    SELECT jsonb_build_object(
      'category_id', ic.id,
      'category_name', ic.name,
      'category_color', COALESCE(ic.color, '#6b7280'),
      'shortage_qty', COALESCE(SUM(CASE WHEN sai.difference < 0 THEN ABS(sai.difference) ELSE 0 END), 0),
      'excess_qty', COALESCE(SUM(CASE WHEN sai.difference > 0 THEN sai.difference ELSE 0 END), 0),
      'adjustment_value', COALESCE(SUM(ABS(sai.difference) * COALESCE(i.unit_price, 0)), 0),
      'audit_count', COUNT(DISTINCT sa.id)
    ) AS cat_row
    FROM stock_adjustment_items sai
    JOIN stock_adjustments sa ON sa.id = sai.adjustment_id
    JOIN items i ON i.id = sai.item_id
    LEFT JOIN item_categories ic ON ic.id = i.category_id
    WHERE sa.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR sa.hotel_id = p_hotel_id)
      AND sa.scheduled_date >= p_start_date
      AND sa.scheduled_date <= p_end_date
      AND sai.difference != 0
    GROUP BY ic.id, ic.name, ic.color
    HAVING SUM(ABS(sai.difference)) > 0
  ) sub;

  -- Monthly trend
  SELECT COALESCE(jsonb_agg(month_row ORDER BY month_row->>'month' ASC), '[]'::jsonb) INTO v_monthly_trend
  FROM (
    SELECT jsonb_build_object(
      'month', to_char(sa.scheduled_date, 'YYYY-MM'),
      'audits', COUNT(DISTINCT sa.id),
      'items_checked', COALESCE(SUM((SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id)), 0),
      'accuracy_rate', CASE 
        WHEN SUM((SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id)) > 0
        THEN ROUND(
          (SUM((SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id AND actual_quantity IS NOT NULL AND difference = 0))::numeric 
          / SUM((SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = sa.id))::numeric) * 100, 1
        )
        ELSE 100
      END,
      'adjustment_value', COALESCE(SUM((SELECT COALESCE(SUM(ABS(sai.difference) * COALESCE(itm.unit_price, 0)), 0) FROM stock_adjustment_items sai JOIN items itm ON itm.id = sai.item_id WHERE sai.adjustment_id = sa.id AND sai.difference != 0)), 0)
    ) AS month_row
    FROM stock_adjustments sa
    WHERE sa.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR sa.hotel_id = p_hotel_id)
      AND sa.scheduled_date >= p_start_date
      AND sa.scheduled_date <= p_end_date
    GROUP BY to_char(sa.scheduled_date, 'YYYY-MM')
  ) sub;

  -- Investigation summary
  SELECT jsonb_build_object(
    'total_investigations', COALESCE(COUNT(DISTINCT il.id), 0),
    'resolved_count', COALESCE(COUNT(DISTINCT il.id) FILTER (WHERE il.resolution_type IS NOT NULL), 0),
    'pending_count', COALESCE(COUNT(DISTINCT il.id) FILTER (WHERE il.resolution_type IS NULL), 0),
    'compensation_total', COALESCE((SELECT SUM(cr.total_amount) FROM compensation_requests cr WHERE cr.tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR cr.hotel_id = p_hotel_id) AND cr.created_at >= p_start_date AND cr.created_at <= p_end_date), 0),
    'compensation_collected', COALESCE((SELECT SUM(cr.total_amount) FROM compensation_requests cr WHERE cr.tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR cr.hotel_id = p_hotel_id) AND cr.created_at >= p_start_date AND cr.created_at <= p_end_date AND cr.status = 'paid'), 0)
  ) INTO v_investigation_summary
  FROM investigation_logs il
  WHERE il.tenant_id = p_tenant_id
    AND il.performed_at >= p_start_date
    AND il.performed_at <= p_end_date;

  -- Build final result
  v_result := jsonb_build_object(
    'summary', v_summary,
    'audits_list', v_audits_list,
    'discrepancy_by_category', v_discrepancy_by_category,
    'monthly_trend', v_monthly_trend,
    'investigation_summary', v_investigation_summary
  );

  RETURN v_result;
END;
$$;