-- Extend get_laundry_report with items_analysis, period_comparison, processing_stats, damage_breakdown, cost_optimization
DROP FUNCTION IF EXISTS public.get_laundry_report(UUID, UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.get_laundry_report(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_period_days INTEGER;
  v_previous_start DATE;
  v_previous_end DATE;
BEGIN
  -- Calculate period for comparison
  v_period_days := p_end_date - p_start_date;
  v_previous_end := p_start_date - 1;
  v_previous_start := v_previous_end - v_period_days;

  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_build_object(
        'total_batches', COUNT(*),
        'total_items', COALESCE(SUM(total_items), 0),
        'total_weight', COALESCE(SUM(total_weight_kg), 0),
        'total_cost', COALESCE(SUM(actual_cost), 0),
        'avg_cost_per_batch', ROUND(
          COALESCE(SUM(actual_cost) / NULLIF(COUNT(*), 0), 0), 0
        ),
        'avg_cost_per_kg', ROUND(
          COALESCE(SUM(actual_cost) / NULLIF(SUM(total_weight_kg), 0), 0), 0
        ),
        'avg_quality', ROUND(COALESCE(AVG(quality_rating), 0), 1),
        'avg_timeliness', ROUND(COALESCE(AVG(timeliness_rating), 0), 1),
        'items_damaged', COALESCE(SUM(items_damaged), 0),
        'items_lost', COALESCE(SUM(items_lost), 0),
        'total_compensation', COALESCE(SUM(compensation_amount), 0),
        'on_time_rate', ROUND(
          COALESCE(
            (COUNT(*) FILTER (WHERE actual_return_date <= expected_return_date)::NUMERIC / 
             NULLIF(COUNT(*) FILTER (WHERE actual_return_date IS NOT NULL), 0) * 100
            ), 0
          ), 1
        )
      )
      FROM laundry_batches
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND delivery_date BETWEEN p_start_date AND p_end_date
        AND status IN ('received', 'stocked', 'completed')
    ),
    
    'by_vendor', (
      SELECT COALESCE(jsonb_agg(vendor_data ORDER BY total_cost DESC), '[]'::jsonb)
      FROM (
        SELECT 
          jsonb_build_object(
            'vendor_id', v.id,
            'vendor_name', v.name,
            'vendor_code', v.code,
            'batches', COUNT(lb.id),
            'items', COALESCE(SUM(lb.total_items), 0),
            'weight', COALESCE(SUM(lb.total_weight_kg), 0),
            'cost', COALESCE(SUM(lb.actual_cost), 0),
            'cost_per_kg', ROUND(
              COALESCE(SUM(lb.actual_cost) / NULLIF(SUM(lb.total_weight_kg), 0), 0), 0
            ),
            'quality', ROUND(COALESCE(AVG(lb.quality_rating), 0), 1),
            'on_time_rate', ROUND(
              COALESCE(
                (COUNT(*) FILTER (WHERE lb.actual_return_date <= lb.expected_return_date)::NUMERIC / 
                 NULLIF(COUNT(*) FILTER (WHERE lb.actual_return_date IS NOT NULL), 0) * 100
                ), 0
              ), 1
            ),
            'issues', COALESCE(SUM(lb.items_damaged), 0) + COALESCE(SUM(lb.items_lost), 0)
          ) as vendor_data,
          COALESCE(SUM(lb.actual_cost), 0) as total_cost
        FROM laundry_vendors v
        LEFT JOIN laundry_batches lb ON lb.vendor_id = v.id
          AND lb.tenant_id = p_tenant_id
          AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
          AND lb.delivery_date BETWEEN p_start_date AND p_end_date
          AND lb.status IN ('received', 'stocked', 'completed')
        WHERE v.tenant_id = p_tenant_id
          AND v.status = 'active'
        GROUP BY v.id, v.name, v.code
        HAVING COUNT(lb.id) > 0
      ) sub
    ),
    
    'monthly_trend', (
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', p_start_date),
          date_trunc('month', p_end_date),
          '1 month'::interval
        )::date as month
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'month', to_char(m.month, 'Mon'),
          'batches', COUNT(lb.id),
          'items', COALESCE(SUM(lb.total_items), 0),
          'cost', COALESCE(SUM(lb.actual_cost), 0),
          'quality', ROUND(COALESCE(AVG(lb.quality_rating), 0), 1),
          'timeliness', ROUND(COALESCE(AVG(lb.timeliness_rating), 0), 1)
        )
        ORDER BY m.month
      ), '[]'::jsonb)
      FROM months m
      LEFT JOIN laundry_batches lb ON date_trunc('month', lb.delivery_date) = m.month
        AND lb.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
        AND lb.status IN ('received', 'stocked', 'completed')
    ),
    
    'period_comparison', (
      SELECT jsonb_build_object(
        'current', jsonb_build_object(
          'batches', (SELECT COUNT(*) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN p_start_date AND p_end_date AND status IN ('received', 'stocked', 'completed')),
          'items', (SELECT COALESCE(SUM(total_items), 0) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN p_start_date AND p_end_date AND status IN ('received', 'stocked', 'completed')),
          'cost', (SELECT COALESCE(SUM(actual_cost), 0) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN p_start_date AND p_end_date AND status IN ('received', 'stocked', 'completed')),
          'avg_quality', (SELECT ROUND(COALESCE(AVG(quality_rating), 0), 1) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN p_start_date AND p_end_date AND status IN ('received', 'stocked', 'completed'))
        ),
        'previous', jsonb_build_object(
          'batches', (SELECT COUNT(*) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN v_previous_start AND v_previous_end AND status IN ('received', 'stocked', 'completed')),
          'items', (SELECT COALESCE(SUM(total_items), 0) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN v_previous_start AND v_previous_end AND status IN ('received', 'stocked', 'completed')),
          'cost', (SELECT COALESCE(SUM(actual_cost), 0) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN v_previous_start AND v_previous_end AND status IN ('received', 'stocked', 'completed')),
          'avg_quality', (SELECT ROUND(COALESCE(AVG(quality_rating), 0), 1) FROM laundry_batches WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id) AND delivery_date BETWEEN v_previous_start AND v_previous_end AND status IN ('received', 'stocked', 'completed'))
        )
      )
    ),
    
    'processing_stats', (
      SELECT jsonb_build_object(
        'avg_days', ROUND(
          COALESCE(AVG(EXTRACT(DAY FROM (actual_return_date - delivery_date))), 0), 1
        ),
        'min_days', COALESCE(
          MIN(EXTRACT(DAY FROM (actual_return_date - delivery_date)))::INTEGER, 0
        ),
        'max_days', COALESCE(
          MAX(EXTRACT(DAY FROM (actual_return_date - delivery_date)))::INTEGER, 0
        ),
        'on_time_count', COUNT(*) FILTER (WHERE actual_return_date <= expected_return_date),
        'late_count', COUNT(*) FILTER (WHERE actual_return_date > expected_return_date)
      )
      FROM laundry_batches
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND delivery_date BETWEEN p_start_date AND p_end_date
        AND status IN ('received', 'stocked', 'completed')
        AND actual_return_date IS NOT NULL
    ),
    
    'items_analysis', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'item_id', i.id,
          'item_code', i.code,
          'item_name', i.name,
          'category_name', COALESCE(ic.name, 'Không phân loại'),
          'total_washed', COALESCE(SUM(lbi.quantity_delivered), 0),
          'total_weight_kg', ROUND(COALESCE(SUM(lbi.weight_kg), 0), 2),
          'total_damaged', COALESCE(SUM(lbi.quantity_damaged), 0),
          'total_lost', COALESCE(SUM(lbi.quantity_lost), 0),
          'estimated_cost', ROUND(COALESCE(SUM(lbi.weight_kg), 0) * 
            COALESCE((SELECT AVG(actual_cost / NULLIF(total_weight_kg, 0)) FROM laundry_batches WHERE tenant_id = p_tenant_id AND status IN ('received', 'stocked', 'completed')), 0)
          , 0)
        )
        ORDER BY COALESCE(SUM(lbi.quantity_delivered), 0) DESC
      ), '[]'::jsonb)
      FROM laundry_batch_items lbi
      JOIN laundry_batches lb ON lb.id = lbi.batch_id
      JOIN items i ON i.id = lbi.item_id
      LEFT JOIN item_categories ic ON ic.id = i.category_id
      WHERE lb.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
        AND lb.delivery_date BETWEEN p_start_date AND p_end_date
        AND lb.status IN ('received', 'stocked', 'completed')
      GROUP BY i.id, i.code, i.name, ic.name
    ),
    
    'damage_breakdown', (
      SELECT jsonb_build_object(
        'total_damage_value', COALESCE(SUM(compensation_amount), 0),
        'damage_rate', ROUND(
          COALESCE(
            (SUM(items_damaged) + SUM(items_lost))::NUMERIC / NULLIF(SUM(total_items), 0) * 100
          , 0), 2
        ),
        'by_item', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'item_name', i.name,
              'damaged', COALESCE(SUM(lbi.quantity_damaged), 0),
              'lost', COALESCE(SUM(lbi.quantity_lost), 0),
              'value', ROUND(COALESCE(i.unit_price, 0) * (COALESCE(SUM(lbi.quantity_damaged), 0) + COALESCE(SUM(lbi.quantity_lost), 0)), 0)
            )
            ORDER BY (COALESCE(SUM(lbi.quantity_damaged), 0) + COALESCE(SUM(lbi.quantity_lost), 0)) DESC
          ), '[]'::jsonb)
          FROM laundry_batch_items lbi
          JOIN laundry_batches lb2 ON lb2.id = lbi.batch_id
          JOIN items i ON i.id = lbi.item_id
          WHERE lb2.tenant_id = p_tenant_id
            AND (p_hotel_id IS NULL OR lb2.hotel_id = p_hotel_id)
            AND lb2.delivery_date BETWEEN p_start_date AND p_end_date
            AND lb2.status IN ('received', 'stocked', 'completed')
            AND (lbi.quantity_damaged > 0 OR lbi.quantity_lost > 0)
          GROUP BY i.id, i.name, i.unit_price
        )
      )
      FROM laundry_batches
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND delivery_date BETWEEN p_start_date AND p_end_date
        AND status IN ('received', 'stocked', 'completed')
    ),
    
    'cost_optimization', (
      WITH vendor_costs AS (
        SELECT 
          v.name as vendor_name,
          ROUND(COALESCE(SUM(lb.actual_cost) / NULLIF(SUM(lb.total_weight_kg), 0), 0), 0) as cost_per_kg,
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
      )
      SELECT jsonb_build_object(
        'cheapest_vendor', (SELECT jsonb_build_object('name', vendor_name, 'cost_per_kg', cost_per_kg) FROM vendor_costs ORDER BY cost_per_kg ASC LIMIT 1),
        'most_expensive_vendor', (SELECT jsonb_build_object('name', vendor_name, 'cost_per_kg', cost_per_kg) FROM vendor_costs ORDER BY cost_per_kg DESC LIMIT 1),
        'potential_monthly_savings', (
          SELECT ROUND(
            COALESCE(
              (SELECT SUM(total_weight * (cost_per_kg - (SELECT MIN(cost_per_kg) FROM vendor_costs))) FROM vendor_costs WHERE cost_per_kg > (SELECT MIN(cost_per_kg) FROM vendor_costs))
            , 0)
          , 0)
        )
      )
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;