-- ============================================
-- FIX: Update complete_registration for actual user_hotels schema
-- ============================================

CREATE OR REPLACE FUNCTION complete_registration(
  p_user_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_tenant_name TEXT,
  p_email TEXT,
  p_hotel_name TEXT,
  p_hotel_address TEXT,
  p_hotel_phone TEXT,
  p_hotel_email TEXT,
  p_total_rooms INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    subscription_started_at,
    subscription_current_period_start,
    subscription_current_period_end
  )
  VALUES (
    p_tenant_name, 
    p_email, 
    p_phone,
    v_basic_plan_id,
    'trialing',
    now() + interval '30 days',
    now(),
    now(),
    now() + interval '30 days'
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
  
  -- 4. Update user profile FIRST (before creating role)
  UPDATE users SET
    tenant_id = v_tenant_id,
    hotel_id = v_hotel_id,
    phone = p_phone,
    full_name = p_full_name,
    user_level_code = 'tenant_owner',
    is_primary_owner = true
  WHERE id = p_user_id;
  
  -- 5. Create user role (NO tenant_id column!)
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, 'owner')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- 6. Create user_hotels relationship with actual schema columns
  INSERT INTO user_hotels (
    user_id, 
    hotel_id,
    assigned_by,
    can_create_managers,
    can_create_staff,
    can_view_reports,
    can_export_data,
    can_approve_requests
  )
  VALUES (
    p_user_id, 
    v_hotel_id,
    p_user_id,
    true,
    true,
    true,
    true,
    true
  )
  ON CONFLICT (user_id, hotel_id) DO NOTHING;
  
  -- 7. Initialize tenant usage tracking
  INSERT INTO tenant_usage (
    tenant_id,
    current_hotels_count,
    current_users_count,
    current_rooms_count,
    current_items_count,
    current_storage_bytes
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
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;