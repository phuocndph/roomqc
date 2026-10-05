-- Update get_distribution_orders_filtered to support additional filters
CREATE OR REPLACE FUNCTION public.get_distribution_orders_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_floor integer DEFAULT NULL,
  p_shift_date date DEFAULT NULL,
  p_shift_code text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  order_code text,
  status text,
  floor integer,
  shift_date date,
  shift_code text,
  total_rooms integer,
  total_items integer,
  rooms_completed integer,
  assigned_to uuid,
  assigned_to_name text,
  created_by uuid,
  created_by_name text,
  notes text,
  released_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  hotel_id uuid,
  hotel_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_level text;
BEGIN
  -- Get user level
  SELECT user_level_code INTO v_user_level
  FROM users
  WHERE users.id = v_user_id AND users.tenant_id = p_tenant_id;

  RETURN QUERY
  SELECT 
    d.id,
    d.order_code,
    d.status,
    d.floor,
    d.shift_date,
    d.shift_code,
    d.total_rooms,
    d.total_items,
    d.rooms_completed,
    d.assigned_to,
    assignee.full_name AS assigned_to_name,
    d.created_by,
    creator.full_name AS created_by_name,
    d.notes,
    d.released_at,
    d.started_at,
    d.completed_at,
    d.created_at,
    d.hotel_id,
    h.name AS hotel_name
  FROM distribution_orders d
  LEFT JOIN users assignee ON d.assigned_to = assignee.id
  LEFT JOIN users creator ON d.created_by = creator.id
  LEFT JOIN hotels h ON d.hotel_id = h.id
  WHERE d.tenant_id = p_tenant_id
    -- Staff can only see their assigned orders
    AND (
      v_user_level IN ('tenant_owner', 'manager', 'supervisor', 'warehouse_manager')
      OR d.assigned_to = v_user_id
    )
    -- Optional filters
    AND (p_hotel_id IS NULL OR d.hotel_id = p_hotel_id)
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_assigned_to IS NULL OR d.assigned_to = p_assigned_to)
    AND (p_floor IS NULL OR d.floor = p_floor)
    AND (p_shift_date IS NULL OR d.shift_date = p_shift_date)
    AND (p_shift_code IS NULL OR d.shift_code = p_shift_code)
  ORDER BY d.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Create a count function for pagination
CREATE OR REPLACE FUNCTION public.get_distribution_orders_count(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_floor integer DEFAULT NULL,
  p_shift_date date DEFAULT NULL,
  p_shift_code text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_level text;
  v_count integer;
BEGIN
  -- Get user level
  SELECT user_level_code INTO v_user_level
  FROM users
  WHERE users.id = v_user_id AND users.tenant_id = p_tenant_id;

  SELECT COUNT(*)::integer INTO v_count
  FROM distribution_orders d
  WHERE d.tenant_id = p_tenant_id
    AND (
      v_user_level IN ('tenant_owner', 'manager', 'supervisor', 'warehouse_manager')
      OR d.assigned_to = v_user_id
    )
    AND (p_hotel_id IS NULL OR d.hotel_id = p_hotel_id)
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_assigned_to IS NULL OR d.assigned_to = p_assigned_to)
    AND (p_floor IS NULL OR d.floor = p_floor)
    AND (p_shift_date IS NULL OR d.shift_date = p_shift_date)
    AND (p_shift_code IS NULL OR d.shift_code = p_shift_code);

  RETURN v_count;
END;
$$;