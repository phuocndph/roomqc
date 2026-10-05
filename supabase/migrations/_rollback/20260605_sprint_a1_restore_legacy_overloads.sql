CREATE OR REPLACE FUNCTION public.get_categories_with_stats(p_tenant_id uuid)
 RETURNS TABLE(id uuid, name text, name_en text, description text, icon text, color text, sort_order integer, items_count bigint, total_value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select 
    c.id,
    c.name,
    c.name_en,
    c.description,
    c.icon,
    c.color,
    c.sort_order,
    count(i.id) as items_count,
    coalesce(sum(i.quantity_total * i.unit_price), 0) as total_value
  from item_categories c
  left join items i on i.category_id = c.id and i.status = 'active'
  where c.tenant_id = p_tenant_id
  group by c.id
  order by c.sort_order, c.name;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.get_distribution_orders_filtered(p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_assigned_to uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, order_code text, status text, total_rooms integer, total_items integer, rooms_completed integer, assigned_to uuid, assigned_to_name text, created_by uuid, created_by_name text, notes text, started_at timestamp with time zone, completed_at timestamp with time zone, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_level_code text;
  v_is_staff boolean := false;
  v_effective_assigned_to uuid;
BEGIN
  -- Get user level to determine if staff
  SELECT user_level_code INTO v_user_level_code
  FROM users
  WHERE id = v_user_id;
  
  -- Check if user is staff (not owner/manager/super_admin)
  v_is_staff := v_user_level_code = 'staff';
  
  -- If staff, force filter to only show their assigned orders
  -- If not staff, use the provided filter
  IF v_is_staff THEN
    v_effective_assigned_to := v_user_id;
  ELSE
    v_effective_assigned_to := p_assigned_to;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT 
      d_ord.id,
      d_ord.order_code,
      d_ord.status,
      d_ord.total_rooms,
      d_ord.total_items,
      (SELECT COUNT(*) FROM distribution_order_rooms dor WHERE dor.distribution_order_id = d_ord.id AND dor.status = 'confirmed')::INTEGER as rooms_completed,
      d_ord.assigned_to,
      au.full_name as assigned_to_name,
      d_ord.created_by,
      cu.full_name as created_by_name,
      d_ord.notes,
      d_ord.started_at,
      d_ord.completed_at,
      d_ord.created_at
    FROM distribution_orders d_ord
    LEFT JOIN users au ON au.id = d_ord.assigned_to
    LEFT JOIN users cu ON cu.id = d_ord.created_by
    WHERE d_ord.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR d_ord.hotel_id = p_hotel_id)
      AND (p_status IS NULL OR d_ord.status = p_status)
      AND (v_effective_assigned_to IS NULL OR d_ord.assigned_to = v_effective_assigned_to)
  )
  SELECT 
    f.*,
    COUNT(*) OVER() as total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.get_items_filtered(p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_stock_status text DEFAULT NULL::text, p_status text DEFAULT 'active'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, code text, name text, name_en text, category_id uuid, category_name text, category_color text, hotel_id uuid, unit text, unit_price numeric, brand text, model text, quantity_total integer, quantity_in_stock integer, quantity_in_use integer, quantity_in_laundry integer, quantity_damaged integer, quantity_lost integer, minimum_stock integer, reorder_point integer, status text, description text, created_at timestamp with time zone, updated_at timestamp with time zone, stock_status text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM items i
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND (p_category_id IS NULL OR i.category_id = p_category_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_search IS NULL OR p_search = '' OR 
         i.name ILIKE '%' || p_search || '%' OR 
         i.code ILIKE '%' || p_search || '%' OR
         i.brand ILIKE '%' || p_search || '%')
    AND (p_stock_status IS NULL OR
         CASE 
           WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
           WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
           ELSE 'in_stock'
         END = p_stock_status);

  RETURN QUERY
  SELECT 
    i.id,
    i.code,
    i.name,
    i.name_en,
    i.category_id,
    c.name as category_name,
    c.color as category_color,
    i.hotel_id,
    i.unit,
    i.unit_price,
    i.brand,
    i.model,
    i.quantity_total,
    i.quantity_in_stock,
    i.quantity_in_use,
    i.quantity_in_laundry,
    i.quantity_damaged,
    i.quantity_lost,
    i.minimum_stock,
    i.reorder_point,
    i.status,
    i.description,
    i.created_at,
    i.updated_at,
    CASE 
      WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
      WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
      ELSE 'in_stock'
    END as stock_status,
    v_total as total_count
  FROM items i
  LEFT JOIN item_categories c ON c.id = i.category_id 
    AND c.tenant_id = i.tenant_id 
    AND c.hotel_id = i.hotel_id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND (p_category_id IS NULL OR i.category_id = p_category_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_search IS NULL OR p_search = '' OR 
         i.name ILIKE '%' || p_search || '%' OR 
         i.code ILIKE '%' || p_search || '%' OR
         i.brand ILIKE '%' || p_search || '%')
    AND (p_stock_status IS NULL OR
         CASE 
           WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
           WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
           ELSE 'in_stock'
         END = p_stock_status)
  ORDER BY i.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.get_monthly_expenses(p_tenant_id uuid, p_months integer DEFAULT 12)
 RETURNS TABLE(month text, purchase bigint, laundry bigint, maintenance bigint, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with months_range as (
    select generate_series(
      date_trunc('month', now() - (p_months || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date as month
  )
  select 
    to_char(mr.month, 'Mon') as month,
    coalesce(me.purchase_amount, 0)::bigint as purchase,
    coalesce(me.laundry_amount, 0)::bigint as laundry,
    coalesce(me.maintenance_amount, 0)::bigint as maintenance,
    coalesce(me.total_amount, 0)::bigint as total
  from months_range mr
  left join monthly_expenses me on me.month = mr.month and me.tenant_id = p_tenant_id
  order by mr.month asc;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.get_recent_activities(p_tenant_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, type text, description text, user_name text, user_avatar text, created_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select 
    da.id,
    da.type,
    da.description,
    da.user_name,
    da.user_avatar,
    da.created_at,
    da.metadata
  from dashboard_activities da
  where da.tenant_id = p_tenant_id
  order by da.created_at desc
  limit p_limit;
end;
$function$
;


