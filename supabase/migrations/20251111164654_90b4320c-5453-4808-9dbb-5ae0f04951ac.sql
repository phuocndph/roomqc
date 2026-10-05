-- Migration: Fix ambiguous unit_price in get_dashboard_stats and modernize complete_registration

-- ============================================================================
-- PART 1: Fix ambiguous unit_price column in get_dashboard_stats
-- ============================================================================

-- Drop old overloaded versions first
DROP FUNCTION IF EXISTS get_dashboard_stats(uuid);
DROP FUNCTION IF EXISTS get_dashboard_stats(uuid, uuid);

-- Recreate with properly qualified column references
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_tenant_id UUID, 
  p_hotel_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_current_month_start DATE := date_trunc('month', now())::date;
  v_last_month_start DATE := (date_trunc('month', now()) - interval '1 month')::date;
  v_result JSONB;
BEGIN
  WITH current_stats AS (
    SELECT 
      COALESCE(SUM(i.quantity_total * i.unit_price), 0) as total_value,
      COALESCE(SUM(i.quantity_total), 0) as total_items,
      COALESCE(SUM(i.quantity_in_stock), 0) as in_stock,
      COALESCE(SUM(i.quantity_in_use), 0) as in_use,
      COALESCE(SUM(i.quantity_in_laundry), 0) as in_laundry,
      COUNT(*) FILTER (WHERE i.quantity_in_stock < i.minimum_stock AND i.status = 'active') as low_stock_count
    FROM items i
    WHERE i.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
      AND i.status = 'active'
  ),
  last_month_value AS (
    SELECT COALESCE(SUM(lmi.quantity_before * lmi.unit_price), 0) as value
    FROM (
      SELECT DISTINCT ON (it.item_id) 
        it.item_id,
        it.quantity_before,
        i.unit_price
      FROM inventory_transactions it
      JOIN items i ON i.id = it.item_id
      WHERE it.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR it.hotel_id = p_hotel_id)
        AND it.transaction_date >= v_last_month_start
        AND it.transaction_date < v_current_month_start
      ORDER BY it.item_id, it.transaction_date DESC
    ) lmi
  ),
  room_stats AS (
    SELECT 
      COUNT(*) as total_rooms,
      COUNT(*) FILTER (WHERE status = 'occupied') as occupied_rooms,
      COUNT(*) FILTER (WHERE status = 'cleaning') as cleaning_rooms,
      COUNT(*) FILTER (WHERE status = 'vacant') as vacant_rooms,
      COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance_rooms
    FROM rooms
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
  ),
  laundry_batches_active AS (
    SELECT COUNT(*) as active_batches
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status IN ('delivered', 'washing', 'ready')
  ),
  maintenance_pending AS (
    SELECT COUNT(*) as pending_requests
    FROM maintenance_requests
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status IN ('pending', 'in_progress')
  )
  SELECT jsonb_build_object(
    'total_value', (SELECT total_value FROM current_stats),
    'total_value_last_month', (SELECT value FROM last_month_value),
    'total_value_change_percent', 
      CASE 
        WHEN (SELECT value FROM last_month_value) = 0 THEN NULL
        ELSE ROUND(
          (((SELECT total_value FROM current_stats) - (SELECT value FROM last_month_value)) * 100.0) / 
          NULLIF((SELECT value FROM last_month_value), 0),
          2
        )
      END,
    'total_items', (SELECT total_items FROM current_stats),
    'in_stock', (SELECT in_stock FROM current_stats),
    'in_use', (SELECT in_use FROM current_stats),
    'in_laundry', (SELECT in_laundry FROM current_stats),
    'low_stock_count', (SELECT low_stock_count FROM current_stats),
    'total_rooms', (SELECT total_rooms FROM room_stats),
    'occupied_rooms', (SELECT occupied_rooms FROM room_stats),
    'cleaning_rooms', (SELECT cleaning_rooms FROM room_stats),
    'vacant_rooms', (SELECT vacant_rooms FROM room_stats),
    'maintenance_rooms', (SELECT maintenance_rooms FROM room_stats),
    'active_laundry_batches', (SELECT active_batches FROM laundry_batches_active),
    'pending_maintenance_requests', (SELECT pending_requests FROM maintenance_pending)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 2: Modernize complete_registration function
-- ============================================================================

DROP FUNCTION IF EXISTS complete_registration(uuid, text, text, text, text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION complete_registration(
  p_user_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_tenant_name TEXT,
  p_hotel_name TEXT,
  p_hotel_address TEXT,
  p_hotel_phone TEXT,
  p_hotel_email TEXT,
  p_total_rooms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
  v_hotel_id UUID;
  v_basic_plan_id UUID;
  v_hotel_code TEXT;
BEGIN
  -- Get the basic plan ID
  SELECT id INTO v_basic_plan_id
  FROM subscription_plans
  WHERE code = 'basic' AND is_active = true
  LIMIT 1;

  IF v_basic_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Basic subscription plan not found'
    );
  END IF;

  -- 1. Create tenant with proper subscription setup
  INSERT INTO tenants (
    name, 
    email, 
    phone, 
    subscription_plan_id,
    subscription_status,
    trial_ends_at,
    subscription_start_date,
    subscription_end_date,
    trial_end_date
  )
  VALUES (
    p_tenant_name, 
    p_email, 
    p_phone,
    v_basic_plan_id,
    'trial',
    now() + interval '30 days',
    CURRENT_DATE,
    CURRENT_DATE + interval '30 days',
    CURRENT_DATE + interval '30 days'
  )
  RETURNING id INTO v_tenant_id;
  
  -- 2. Generate hotel code
  v_hotel_code := 'HTL-' || LPAD(EXTRACT(epoch FROM now())::TEXT, 10, '0');
  
  -- 3. Create hotel
  INSERT INTO hotels (
    tenant_id, 
    code,
    name, 
    address, 
    phone, 
    email, 
    total_rooms,
    status
  )
  VALUES (
    v_tenant_id, 
    v_hotel_code,
    p_hotel_name, 
    p_hotel_address, 
    p_hotel_phone, 
    p_hotel_email, 
    p_total_rooms,
    'active'
  )
  RETURNING id INTO v_hotel_id;
  
  -- 4. Update user profile with tenant, hotel, and level
  UPDATE users SET
    tenant_id = v_tenant_id,
    hotel_id = v_hotel_id,
    phone = p_phone,
    full_name = p_full_name,
    user_level_code = 'tenant_owner',
    is_primary_owner = true
  WHERE id = p_user_id;
  
  -- 5. Ensure user has 'owner' role (upsert)
  INSERT INTO user_roles (user_id, tenant_id, role)
  VALUES (p_user_id, v_tenant_id, 'owner')
  ON CONFLICT (user_id, tenant_id) 
  DO UPDATE SET role = 'owner';
  
  -- 6. Create user_hotels relationship
  INSERT INTO user_hotels (user_id, hotel_id, tenant_id, is_primary)
  VALUES (p_user_id, v_hotel_id, v_tenant_id, true)
  ON CONFLICT (user_id, hotel_id) DO NOTHING;
  
  -- 7. Initialize tenant usage tracking
  INSERT INTO tenant_usage (
    tenant_id,
    current_hotels_count,
    current_users_count,
    current_rooms_count,
    current_items_count,
    current_storage_mb
  )
  VALUES (v_tenant_id, 1, 1, 0, 0, 0)
  ON CONFLICT (tenant_id) DO NOTHING;
  
  -- 8. Create default item categories
  INSERT INTO item_categories (tenant_id, name, name_en, description, icon, color, sort_order, status)
  VALUES
    (v_tenant_id, 'Đồ vải', 'Fabric & Linens', 'Khăn tắm, ga giường, chăn gối...', 'shirt', '#3b82f6', 1, 'active'),
    (v_tenant_id, 'Tiện nghi', 'Amenities', 'Bàn chải, dầu gội, sữa tắm...', 'sparkles', '#8b5cf6', 2, 'active'),
    (v_tenant_id, 'Thiết bị điện', 'Electronics', 'Tivi, tủ lạnh, máy sấy...', 'tv', '#10b981', 3, 'active'),
    (v_tenant_id, 'Nội thất', 'Furniture', 'Giường, tủ, bàn, ghế...', 'sofa', '#f59e0b', 4, 'active'),
    (v_tenant_id, 'Đồ vệ sinh', 'Cleaning Supplies', 'Xà phòng, giấy vệ sinh...', 'spray', '#06b6d4', 5, 'active')
  ON CONFLICT DO NOTHING;
  
  -- 9. Create default laundry categories
  INSERT INTO laundry_categories (tenant_id, code, name, status, display_order)
  VALUES
    (v_tenant_id, 'TOWEL', 'Khăn tắm', 'active', 1),
    (v_tenant_id, 'BEDSHEET', 'Ga giường', 'active', 2),
    (v_tenant_id, 'PILLOW', 'Gối & Chăn', 'active', 3),
    (v_tenant_id, 'UNIFORM', 'Đồng phục', 'active', 4)
  ON CONFLICT DO NOTHING;
  
  -- 10. Create default maintenance categories
  INSERT INTO maintenance_categories (tenant_id, code, name, status, display_order)
  VALUES
    (v_tenant_id, 'PLUMBING', 'Sửa chữa hệ thống nước', 'active', 1),
    (v_tenant_id, 'ELECTRICAL', 'Sửa chữa điện', 'active', 2),
    (v_tenant_id, 'HVAC', 'Điều hòa & Thông gió', 'active', 3),
    (v_tenant_id, 'FURNITURE', 'Sửa chữa nội thất', 'active', 4)
  ON CONFLICT DO NOTHING;
  
  -- 11. Save user preference for selected hotel
  INSERT INTO user_preferences (user_id, preferences)
  VALUES (
    p_user_id, 
    jsonb_build_object('selectedHotelId', v_hotel_id)
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET preferences = jsonb_build_object('selectedHotelId', v_hotel_id);
  
  -- Return success with all IDs
  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'hotel_id', v_hotel_id,
    'user_id', p_user_id
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Auto rollback on any error
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION get_dashboard_stats IS 'Get dashboard statistics for a tenant, optionally filtered by hotel';
COMMENT ON FUNCTION complete_registration IS 'Complete user registration by creating tenant, hotel, and setting up initial data';