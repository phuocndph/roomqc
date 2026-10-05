DROP FUNCTION IF EXISTS public.get_monthly_expenses(uuid, integer, uuid);

CREATE FUNCTION public.get_monthly_expenses(
  p_tenant_id uuid,
  p_months integer,
  p_hotel_id uuid DEFAULT NULL
)
RETURNS TABLE(
  month text,
  purchase bigint,
  laundry bigint,
  maintenance bigint,
  total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH months_range AS (
    SELECT generate_series(
      date_trunc('month', now() - ((p_months - 1) || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date as month
  ),
  purchase_expenses AS (
    SELECT 
      date_trunc('month', it.transaction_date)::date as month,
      COALESCE(SUM(it.total_value), 0) as amount
    FROM inventory_transactions it
    WHERE it.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR it.hotel_id = p_hotel_id)
      AND it.transaction_type = 'in'
      AND it.transaction_category = 'purchase'
      AND it.transaction_date >= date_trunc('month', now() - ((p_months - 1) || ' months')::interval)
    GROUP BY date_trunc('month', it.transaction_date)::date
  ),
  laundry_expenses AS (
    SELECT 
      date_trunc('month', lb.delivery_date)::date as month,
      COALESCE(SUM(lb.actual_cost), 0) as amount
    FROM laundry_batches lb
    WHERE lb.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
      AND lb.status = 'received'
      AND lb.delivery_date >= date_trunc('month', now() - ((p_months - 1) || ' months')::interval)
    GROUP BY date_trunc('month', lb.delivery_date)::date
  ),
  maintenance_expenses AS (
    SELECT 
      date_trunc('month', mr.completed_at)::date as month,
      COALESCE(SUM(mr.actual_cost), 0) as amount
    FROM maintenance_requests mr
    WHERE mr.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR mr.hotel_id = p_hotel_id)
      AND mr.status = 'completed'
      AND mr.completed_at >= date_trunc('month', now() - ((p_months - 1) || ' months')::interval)
    GROUP BY date_trunc('month', mr.completed_at)::date
  )
  SELECT 
    to_char(mr.month, 'Mon') as month,
    COALESCE(pe.amount, 0)::BIGINT as purchase,
    COALESCE(le.amount, 0)::BIGINT as laundry,
    COALESCE(me.amount, 0)::BIGINT as maintenance,
    (COALESCE(pe.amount, 0) + COALESCE(le.amount, 0) + COALESCE(me.amount, 0))::BIGINT as total
  FROM months_range mr
  LEFT JOIN purchase_expenses pe ON pe.month = mr.month
  LEFT JOIN laundry_expenses le ON le.month = mr.month
  LEFT JOIN maintenance_expenses me ON me.month = mr.month
  ORDER BY mr.month ASC;
END;
$$;