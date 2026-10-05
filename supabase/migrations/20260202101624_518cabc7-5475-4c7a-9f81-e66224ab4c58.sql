-- Drop all existing versions of get_laundry_report function
DROP FUNCTION IF EXISTS get_laundry_report(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_laundry_report(UUID, UUID, DATE, DATE);

-- Recreate the function with fixed SQL (no nested aggregates)
CREATE OR REPLACE FUNCTION get_laundry_report(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_summary JSONB;
  v_by_vendor JSONB;
  v_monthly_trend JSONB;
  v_period_comparison JSONB;
  v_processing_stats JSONB;
  v_items_analysis JSONB;
  v_damage_breakdown JSONB;
  v_cost_optimization JSONB;
  v_period_days INTEGER;
  v_previous_start DATE;
  v_previous_end DATE;
  v_avg_cost_per_kg NUMERIC;
BEGIN
  -- Calculate period for comparison
  v_period_days := p_end_date - p_start_date;
  v_previous_end := p_start_date - 1;
  v_previous_start := v_previous_end - v_period_days;

  -- Calculate average cost per kg first (avoid nested aggregates)
  SELECT COALESCE(SUM(actual_cost) / NULLIF(SUM(total_weight_kg), 0), 0)
  INTO v_avg_cost_per_kg
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status IN ('received', 'stocked', 'completed')
    AND delivery_date BETWEEN p_start_date AND p_end_date;

  -- Summary statistics
  SELECT jsonb_build_object(
    'total_batches', COALESCE(COUNT(*), 0),
    'total_items', COALESCE(SUM(total_items), 0),
    'total_weight', COALESCE(ROUND(SUM(total_weight_kg)::numeric, 1), 0),
    'total_cost', COALESCE(SUM(actual_cost), 0),
    'avg_cost_per_batch', ROUND(COALESCE(SUM(actual_cost) / NULLIF(COUNT(*), 0), 0), 0),
    'avg_cost_per_kg', COALESCE(ROUND(v_avg_cost_per_kg, 0), 0),
    'avg_quality', COALESCE(ROUND(AVG(quality_rating)::numeric, 1), 0),
    'avg_timeliness', COALESCE(ROUND(AVG(timeliness_rating)::numeric, 1), 0),
    'items_damaged', COALESCE(SUM(items_damaged), 0),
    'items_lost', COALESCE(SUM(items_lost), 0),
    'total_compensation', COALESCE(SUM(compensation_amount), 0),
    'on_time_rate', COALESCE(
      ROUND(
        (COUNT(*) FILTER (WHERE actual_return_date <= expected_return_date)::numeric / 
         NULLIF(COUNT(*) FILTER (WHERE actual_return_date IS NOT NULL), 0)) * 100, 1
      ), 0
    )
  )
  INTO v_summary
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND delivery_date BETWEEN p_start_date AND p_end_date
    AND status IN ('received', 'stocked', 'completed');

  -- By vendor statistics
  SELECT COALESCE(jsonb_agg(vendor_data ORDER BY total_cost DESC), '[]'::jsonb)
  INTO v_by_vendor
  FROM (
    SELECT jsonb_build_object(
      'vendor_id', lv.id,
      'vendor_name', lv.name,
      'vendor_code', lv.code,
      'batches', COUNT(lb.id),
      'items', COALESCE(SUM(lb.total_items), 0),
      'weight', COALESCE(ROUND(SUM(lb.total_weight_kg)::numeric, 1), 0),
      'cost', COALESCE(SUM(lb.actual_cost), 0),
      'cost_per_kg', COALESCE(
        ROUND((SUM(lb.actual_cost) / NULLIF(SUM(lb.total_weight_kg), 0))::numeric, 0), 0
      ),
      'quality', COALESCE(ROUND(AVG(lb.quality_rating)::numeric, 1), 0),
      'on_time_rate', COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE lb.actual_return_date <= lb.expected_return_date)::numeric / 
           NULLIF(COUNT(*) FILTER (WHERE lb.actual_return_date IS NOT NULL), 0)) * 100, 1
        ), 0
      ),
      'issues', COALESCE(SUM(lb.items_damaged), 0) + COALESCE(SUM(lb.items_lost), 0)
    ) as vendor_data,
    COALESCE(SUM(lb.actual_cost), 0) as total_cost
    FROM laundry_vendors lv
    LEFT JOIN laundry_batches lb ON lb.vendor_id = lv.id
      AND lb.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
      AND lb.delivery_date BETWEEN p_start_date AND p_end_date
      AND lb.status IN ('received', 'stocked', 'completed')
    WHERE lv.tenant_id = p_tenant_id
      AND lv.status = 'active'
    GROUP BY lv.id, lv.name, lv.code
    HAVING COUNT(lb.id) > 0
  ) sub;

  -- Monthly trend
  SELECT COALESCE(jsonb_agg(month_data ORDER BY month_key), '[]'::jsonb)
  INTO v_monthly_trend
  FROM (
    SELECT jsonb_build_object(
      'month', TO_CHAR(delivery_date, 'Mon'),
      'month_key', TO_CHAR(delivery_date, 'YYYY-MM'),
      'batches', COUNT(*),
      'items', COALESCE(SUM(total_items), 0),
      'cost', COALESCE(SUM(actual_cost), 0),
      'quality', COALESCE(ROUND(AVG(quality_rating)::numeric, 1), 0),
      'timeliness', COALESCE(ROUND(AVG(timeliness_rating)::numeric, 1), 0)
    ) as month_data,
    TO_CHAR(delivery_date, 'YYYY-MM') as month_key
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND delivery_date BETWEEN p_start_date AND p_end_date
      AND status IN ('received', 'stocked', 'completed')
    GROUP BY TO_CHAR(delivery_date, 'YYYY-MM'), TO_CHAR(delivery_date, 'Mon')
  ) sub;

  -- Period comparison
  SELECT jsonb_build_object(
    'current', jsonb_build_object(
      'batches', COUNT(*),
      'items', COALESCE(SUM(total_items), 0),
      'cost', COALESCE(SUM(actual_cost), 0),
      'avg_quality', COALESCE(ROUND(AVG(quality_rating)::numeric, 1), 0)
    )
  )
  INTO v_period_comparison
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND delivery_date BETWEEN p_start_date AND p_end_date
    AND status IN ('received', 'stocked', 'completed');

  -- Add previous period data
  SELECT v_period_comparison || jsonb_build_object(
    'previous', jsonb_build_object(
      'batches', COUNT(*),
      'items', COALESCE(SUM(total_items), 0),
      'cost', COALESCE(SUM(actual_cost), 0),
      'avg_quality', COALESCE(ROUND(AVG(quality_rating)::numeric, 1), 0)
    )
  )
  INTO v_period_comparison
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND delivery_date BETWEEN v_previous_start AND v_previous_end
    AND status IN ('received', 'stocked', 'completed');

  -- Processing stats
  SELECT jsonb_build_object(
    'avg_days', ROUND(COALESCE(AVG(EXTRACT(DAY FROM (actual_return_date - delivery_date))), 0)::numeric, 1),
    'min_days', COALESCE(MIN(EXTRACT(DAY FROM (actual_return_date - delivery_date)))::INTEGER, 0),
    'max_days', COALESCE(MAX(EXTRACT(DAY FROM (actual_return_date - delivery_date)))::INTEGER, 0),
    'on_time_count', COUNT(*) FILTER (WHERE actual_return_date <= expected_return_date),
    'late_count', COUNT(*) FILTER (WHERE actual_return_date > expected_return_date)
  )
  INTO v_processing_stats
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND delivery_date BETWEEN p_start_date AND p_end_date
    AND status IN ('received', 'stocked', 'completed')
    AND actual_return_date IS NOT NULL;

  -- Items analysis (separate query to avoid nested aggregates)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'item_code', item_code,
      'item_name', item_name,
      'category_name', category_name,
      'total_washed', total_washed,
      'total_weight_kg', total_weight_kg,
      'total_damaged', total_damaged,
      'total_lost', total_lost,
      'estimated_cost', ROUND(total_weight_kg * v_avg_cost_per_kg, 0)
    )
    ORDER BY total_washed DESC
  ), '[]'::jsonb)
  INTO v_items_analysis
  FROM (
    SELECT 
      i.id as item_id,
      i.code as item_code,
      i.name as item_name,
      COALESCE(ic.name, 'Không phân loại') as category_name,
      COALESCE(SUM(lbi.quantity_delivered), 0) as total_washed,
      ROUND(COALESCE(SUM(lbi.weight_kg), 0)::numeric, 2) as total_weight_kg,
      COALESCE(SUM(lbi.quantity_damaged), 0) as total_damaged,
      COALESCE(SUM(lbi.quantity_lost), 0) as total_lost
    FROM laundry_batch_items lbi
    JOIN laundry_batches lb ON lb.id = lbi.batch_id
    JOIN items i ON i.id = lbi.item_id
    LEFT JOIN item_categories ic ON ic.id = i.category_id
    WHERE lb.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
      AND lb.delivery_date BETWEEN p_start_date AND p_end_date
      AND lb.status IN ('received', 'stocked', 'completed')
    GROUP BY i.id, i.code, i.name, ic.name
  ) sub;

  -- Damage breakdown (separate queries to avoid nested aggregates)
  WITH damage_summary AS (
    SELECT
      COALESCE(SUM(compensation_amount), 0) as total_damage_value,
      ROUND(
        COALESCE((SUM(items_damaged) + SUM(items_lost))::NUMERIC / NULLIF(SUM(total_items), 0) * 100, 0)::numeric, 2
      ) as damage_rate
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND delivery_date BETWEEN p_start_date AND p_end_date
      AND status IN ('received', 'stocked', 'completed')
  ),
  damage_by_item AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'item_name', item_name,
        'damaged', total_damaged,
        'lost', total_lost,
        'value', damage_value
      )
      ORDER BY total_damage DESC
    ), '[]'::jsonb) as by_item
    FROM (
      SELECT
        i.name as item_name,
        COALESCE(SUM(lbi.quantity_damaged), 0) as total_damaged,
        COALESCE(SUM(lbi.quantity_lost), 0) as total_lost,
        COALESCE(SUM(lbi.quantity_damaged), 0) + COALESCE(SUM(lbi.quantity_lost), 0) as total_damage,
        ROUND(COALESCE(i.unit_price, 0) * (COALESCE(SUM(lbi.quantity_damaged), 0) + COALESCE(SUM(lbi.quantity_lost), 0)), 0) as damage_value
      FROM laundry_batch_items lbi
      JOIN laundry_batches lb ON lb.id = lbi.batch_id
      JOIN items i ON i.id = lbi.item_id
      WHERE lb.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
        AND lb.delivery_date BETWEEN p_start_date AND p_end_date
        AND lb.status IN ('received', 'stocked', 'completed')
        AND (lbi.quantity_damaged > 0 OR lbi.quantity_lost > 0)
      GROUP BY i.id, i.name, i.unit_price
    ) sub
  )
  SELECT jsonb_build_object(
    'total_damage_value', ds.total_damage_value,
    'damage_rate', ds.damage_rate,
    'by_item', dbi.by_item
  )
  INTO v_damage_breakdown
  FROM damage_summary ds, damage_by_item dbi;

  -- Cost optimization (separate query to avoid nested aggregates)
  WITH vendor_costs AS (
    SELECT 
      v.name as vendor_name,
      ROUND(COALESCE(SUM(lb.actual_cost) / NULLIF(SUM(lb.total_weight_kg), 0), 0)::numeric, 0) as cost_per_kg,
      COALESCE(SUM(lb.total_weight_kg), 0) as total_weight
    FROM laundry_vendors v
    LEFT JOIN laundry_batches lb ON lb.vendor_id = v.id
      AND lb.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
      AND lb.delivery_date BETWEEN p_start_date AND p_end_date
      AND lb.status IN ('received', 'stocked', 'completed')
    WHERE v.tenant_id = p_tenant_id AND v.status = 'active'
    GROUP BY v.id, v.name
    HAVING COUNT(lb.id) > 0
  ),
  min_cost AS (
    SELECT MIN(cost_per_kg) as min_cost_per_kg FROM vendor_costs
  )
  SELECT jsonb_build_object(
    'cheapest_vendor', (SELECT jsonb_build_object('name', vendor_name, 'cost_per_kg', cost_per_kg) FROM vendor_costs ORDER BY cost_per_kg ASC LIMIT 1),
    'most_expensive_vendor', (SELECT jsonb_build_object('name', vendor_name, 'cost_per_kg', cost_per_kg) FROM vendor_costs ORDER BY cost_per_kg DESC LIMIT 1),
    'potential_monthly_savings', ROUND(
      COALESCE(
        (SELECT SUM(vc.total_weight * (vc.cost_per_kg - mc.min_cost_per_kg)) 
         FROM vendor_costs vc, min_cost mc 
         WHERE vc.cost_per_kg > mc.min_cost_per_kg)
      , 0)::numeric
    , 0)
  )
  INTO v_cost_optimization;

  -- Build final result
  v_result := jsonb_build_object(
    'summary', v_summary,
    'by_vendor', v_by_vendor,
    'monthly_trend', v_monthly_trend,
    'period_comparison', v_period_comparison,
    'processing_stats', v_processing_stats,
    'items_analysis', v_items_analysis,
    'damage_breakdown', COALESCE(v_damage_breakdown, jsonb_build_object('total_damage_value', 0, 'damage_rate', 0, 'by_item', '[]'::jsonb)),
    'cost_optimization', COALESCE(v_cost_optimization, jsonb_build_object('cheapest_vendor', null, 'most_expensive_vendor', null, 'potential_monthly_savings', 0))
  );

  RETURN v_result;
END;
$$;