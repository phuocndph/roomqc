-- Update RPC to auto-filter by assigned_to for staff users
CREATE OR REPLACE FUNCTION public.get_distribution_orders_filtered(
  p_tenant_id uuid, 
  p_hotel_id uuid DEFAULT NULL::uuid, 
  p_status text DEFAULT NULL::text, 
  p_assigned_to uuid DEFAULT NULL::uuid, 
  p_limit integer DEFAULT 25, 
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, 
  order_code text, 
  status text, 
  total_rooms integer, 
  total_items integer, 
  rooms_completed integer, 
  assigned_to uuid, 
  assigned_to_name text, 
  created_by uuid, 
  created_by_name text, 
  notes text, 
  started_at timestamp with time zone, 
  completed_at timestamp with time zone, 
  created_at timestamp with time zone, 
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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
$function$;