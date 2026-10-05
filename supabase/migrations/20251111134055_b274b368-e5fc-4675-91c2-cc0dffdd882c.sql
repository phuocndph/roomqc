-- Create function for hotel performance stats
CREATE OR REPLACE FUNCTION public.get_hotel_performance_stats(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH hotel_data AS (
    SELECT 
      h.id,
      h.name,
      h.code,
      h.total_rooms
    FROM hotels h
    WHERE h.id = p_hotel_id AND h.tenant_id = p_tenant_id
  ),
  inventory_stats AS (
    SELECT
      COALESCE(SUM(i.quantity_total * i.unit_price), 0) as inventory_value,
      COALESCE(SUM(i.quantity_total), 0) as total_items,
      COALESCE(SUM(i.quantity_in_stock), 0) as in_stock,
      COUNT(*) FILTER (WHERE i.quantity_in_stock < i.minimum_stock) as low_stock_count
    FROM items i
    WHERE i.hotel_id = p_hotel_id AND i.status = 'active'
  ),
  period_transactions AS (
    SELECT
      COUNT(*) as transaction_count,
      COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'in'), 0) as inbound_value,
      COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'out'), 0) as outbound_value
    FROM inventory_transactions
    WHERE hotel_id = p_hotel_id
      AND transaction_date >= p_from_date
      AND transaction_date <= p_to_date
  ),
  laundry_stats AS (
    SELECT
      COUNT(*) as total_batches,
      COALESCE(SUM(actual_cost), 0) as total_cost,
      COALESCE(AVG(quality_rating), 0) as avg_quality,
      COALESCE(AVG(timeliness_rating), 0) as avg_timeliness
    FROM laundry_batches
    WHERE hotel_id = p_hotel_id
      AND delivery_date >= p_from_date
      AND delivery_date <= p_to_date
      AND status = 'received'
  ),
  maintenance_stats AS (
    SELECT
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_requests,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_requests,
      COALESCE(SUM(actual_cost), 0) as total_cost,
      COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - reported_at))/3600), 0) as avg_resolution_hours
    FROM maintenance_requests
    WHERE hotel_id = p_hotel_id
      AND reported_at >= p_from_date
      AND reported_at <= p_to_date
  ),
  purchase_stats AS (
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_value
    FROM purchase_orders
    WHERE hotel_id = p_hotel_id
      AND order_date >= p_from_date
      AND order_date <= p_to_date
  )
  SELECT jsonb_build_object(
    'hotel', (SELECT row_to_json(h.*) FROM hotel_data h),
    'inventory', (
      SELECT jsonb_build_object(
        'value', inventory_value,
        'total_items', total_items,
        'in_stock', in_stock,
        'low_stock_count', low_stock_count,
        'utilization_rate', CASE 
          WHEN total_items > 0 THEN ROUND(((total_items - in_stock)::NUMERIC / total_items * 100), 2)
          ELSE 0
        END
      ) FROM inventory_stats
    ),
    'transactions', (
      SELECT jsonb_build_object(
        'count', transaction_count,
        'inbound_value', inbound_value,
        'outbound_value', outbound_value
      ) FROM period_transactions
    ),
    'laundry', (
      SELECT jsonb_build_object(
        'batches', total_batches,
        'cost', total_cost,
        'avg_quality', ROUND(avg_quality, 2),
        'avg_timeliness', ROUND(avg_timeliness, 2),
        'cost_per_room', CASE 
          WHEN (SELECT total_rooms FROM hotel_data) > 0 
          THEN ROUND(total_cost / (SELECT total_rooms FROM hotel_data), 0)
          ELSE 0
        END
      ) FROM laundry_stats
    ),
    'maintenance', (
      SELECT jsonb_build_object(
        'total_requests', total_requests,
        'completed', completed_requests,
        'pending', pending_requests,
        'cost', total_cost,
        'avg_resolution_hours', ROUND(avg_resolution_hours, 2),
        'completion_rate', CASE 
          WHEN total_requests > 0 THEN ROUND((completed_requests::NUMERIC / total_requests * 100), 2)
          ELSE 0
        END
      ) FROM maintenance_stats
    ),
    'purchases', (
      SELECT jsonb_build_object(
        'orders', total_orders,
        'value', total_value
      ) FROM purchase_stats
    ),
    'total_operating_cost', (
      SELECT COALESCE(
        (SELECT total_cost FROM laundry_stats) +
        (SELECT total_cost FROM maintenance_stats) +
        (SELECT total_value FROM purchase_stats),
        0
      )
    ),
    'cost_per_room_per_month', (
      SELECT CASE 
        WHEN (SELECT total_rooms FROM hotel_data) > 0 THEN
          ROUND((
            (SELECT total_cost FROM laundry_stats) +
            (SELECT total_cost FROM maintenance_stats) +
            (SELECT total_value FROM purchase_stats)
          ) / (SELECT total_rooms FROM hotel_data) / GREATEST(1, EXTRACT(MONTH FROM AGE(p_to_date, p_from_date))), 0)
        ELSE 0
      END
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Create function for hotel performance comparison
CREATE OR REPLACE FUNCTION public.get_hotels_performance_comparison(
  p_tenant_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(
  hotel_id UUID,
  hotel_name TEXT,
  hotel_code TEXT,
  total_rooms INTEGER,
  inventory_value NUMERIC,
  inventory_turnover_rate NUMERIC,
  total_operating_cost NUMERIC,
  cost_per_room NUMERIC,
  laundry_cost NUMERIC,
  maintenance_cost NUMERIC,
  purchase_value NUMERIC,
  laundry_quality NUMERIC,
  maintenance_completion_rate NUMERIC,
  efficiency_score NUMERIC
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH hotel_inventory AS (
    SELECT
      i.hotel_id,
      COALESCE(SUM(i.quantity_total * i.unit_price), 0) as inventory_value,
      COALESCE(SUM(i.quantity_total), 0) as total_items,
      COALESCE(SUM(i.quantity_in_use), 0) as in_use_items
    FROM items i
    WHERE i.tenant_id = p_tenant_id AND i.status = 'active'
    GROUP BY i.hotel_id
  ),
  hotel_laundry AS (
    SELECT
      lb.hotel_id,
      COALESCE(SUM(lb.actual_cost), 0) as total_cost,
      COALESCE(AVG(lb.quality_rating), 0) as avg_quality
    FROM laundry_batches lb
    WHERE lb.tenant_id = p_tenant_id
      AND lb.delivery_date >= p_from_date
      AND lb.delivery_date <= p_to_date
      AND lb.status = 'received'
    GROUP BY lb.hotel_id
  ),
  hotel_maintenance AS (
    SELECT
      mr.hotel_id,
      COALESCE(SUM(mr.actual_cost), 0) as total_cost,
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE mr.status = 'completed') as completed_requests
    FROM maintenance_requests mr
    WHERE mr.tenant_id = p_tenant_id
      AND mr.reported_at >= p_from_date
      AND mr.reported_at <= p_to_date
    GROUP BY mr.hotel_id
  ),
  hotel_purchases AS (
    SELECT
      po.hotel_id,
      COALESCE(SUM(po.total_amount), 0) as total_value
    FROM purchase_orders po
    WHERE po.tenant_id = p_tenant_id
      AND po.order_date >= p_from_date
      AND po.order_date <= p_to_date
    GROUP BY po.hotel_id
  )
  SELECT
    h.id as hotel_id,
    h.name as hotel_name,
    h.code as hotel_code,
    h.total_rooms,
    COALESCE(hi.inventory_value, 0) as inventory_value,
    CASE 
      WHEN COALESCE(hi.total_items, 0) > 0 
      THEN ROUND((COALESCE(hi.in_use_items, 0)::NUMERIC / hi.total_items * 100), 2)
      ELSE 0
    END as inventory_turnover_rate,
    (COALESCE(hl.total_cost, 0) + COALESCE(hm.total_cost, 0) + COALESCE(hp.total_value, 0)) as total_operating_cost,
    CASE 
      WHEN h.total_rooms > 0 
      THEN ROUND((COALESCE(hl.total_cost, 0) + COALESCE(hm.total_cost, 0) + COALESCE(hp.total_value, 0)) / h.total_rooms, 0)
      ELSE 0
    END as cost_per_room,
    COALESCE(hl.total_cost, 0) as laundry_cost,
    COALESCE(hm.total_cost, 0) as maintenance_cost,
    COALESCE(hp.total_value, 0) as purchase_value,
    COALESCE(hl.avg_quality, 0) as laundry_quality,
    CASE 
      WHEN COALESCE(hm.total_requests, 0) > 0 
      THEN ROUND((COALESCE(hm.completed_requests, 0)::NUMERIC / hm.total_requests * 100), 2)
      ELSE 0
    END as maintenance_completion_rate,
    -- Efficiency score (0-100)
    ROUND((
      CASE WHEN COALESCE(hi.total_items, 0) > 0 
        THEN (COALESCE(hi.in_use_items, 0)::NUMERIC / hi.total_items * 30)
        ELSE 0 END +
      LEAST(30, COALESCE(hl.avg_quality, 0) * 6) +
      CASE WHEN COALESCE(hm.total_requests, 0) > 0 
        THEN (COALESCE(hm.completed_requests, 0)::NUMERIC / hm.total_requests * 40)
        ELSE 0 END
    ), 2) as efficiency_score
  FROM hotels h
  LEFT JOIN hotel_inventory hi ON hi.hotel_id = h.id
  LEFT JOIN hotel_laundry hl ON hl.hotel_id = h.id
  LEFT JOIN hotel_maintenance hm ON hm.hotel_id = h.id
  LEFT JOIN hotel_purchases hp ON hp.hotel_id = h.id
  WHERE h.tenant_id = p_tenant_id AND h.status = 'active'
  ORDER BY efficiency_score DESC;
END;
$$;