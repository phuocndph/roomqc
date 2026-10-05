
-- Fix complete_registration function by removing phone_verified column reference
CREATE OR REPLACE FUNCTION public.complete_registration(
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
  v_user_exists BOOLEAN;
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

  -- 1. Create tenant
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
  
  -- 4. Check if user exists in public.users
  SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id) INTO v_user_exists;
  
  IF v_user_exists THEN
    -- Update existing user
    UPDATE users SET
      tenant_id = v_tenant_id,
      hotel_id = v_hotel_id,
      phone = p_phone,
      full_name = p_full_name,
      user_level_code = 'tenant_owner',
      is_primary_owner = true
    WHERE id = p_user_id;
  ELSE
    -- Insert new user (removed phone_verified column)
    INSERT INTO users (
      id,
      tenant_id,
      hotel_id,
      email,
      phone,
      full_name,
      user_level_code,
      is_primary_owner,
      status,
      login_count
    ) VALUES (
      p_user_id,
      v_tenant_id,
      v_hotel_id,
      p_email,
      p_phone,
      p_full_name,
      'tenant_owner',
      true,
      'active',
      0
    );
  END IF;
  
  -- 5. Create user role
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, 'owner')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- 6. Create user_hotels relationship
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
    (v_tenant_id, 'Đồ dùng khác', 'Other Items', 'Các vật dụng khác...', 'package', '#6b7280', 5, 'active');

  -- 9. Create default laundry categories
  INSERT INTO laundry_categories (tenant_id, name, code, description, price_per_kg, price_per_item, status)
  VALUES
    (v_tenant_id, 'Giặt thông thường', 'STANDARD', 'Giặt sấy thông thường', 15000, 5000, 'active'),
    (v_tenant_id, 'Giặt khô', 'DRY_CLEAN', 'Giặt khô chuyên nghiệp', 30000, 15000, 'active'),
    (v_tenant_id, 'Giặt hấp', 'STEAM', 'Giặt và là hấp', 20000, 8000, 'active');

  -- 10. Create default maintenance categories
  INSERT INTO maintenance_categories (tenant_id, name, code, description, icon, color, status)
  VALUES
    (v_tenant_id, 'Điện', 'ELECTRIC', 'Sửa chữa hệ thống điện', 'zap', '#eab308', 'active'),
    (v_tenant_id, 'Nước', 'PLUMBING', 'Sửa chữa hệ thống nước', 'droplet', '#3b82f6', 'active'),
    (v_tenant_id, 'Điều hòa', 'HVAC', 'Sửa chữa điều hòa nhiệt độ', 'wind', '#06b6d4', 'active'),
    (v_tenant_id, 'Nội thất', 'FURNITURE', 'Sửa chữa nội thất', 'hammer', '#f59e0b', 'active'),
    (v_tenant_id, 'Khác', 'OTHER', 'Bảo trì khác', 'wrench', '#6b7280', 'active');

  -- 11. Create default room types
  INSERT INTO room_types (tenant_id, name, code, description, base_price, status)
  VALUES
    (v_tenant_id, 'Phòng Standard', 'STD', 'Phòng tiêu chuẩn', 500000, 'active'),
    (v_tenant_id, 'Phòng Superior', 'SUP', 'Phòng cao cấp', 700000, 'active'),
    (v_tenant_id, 'Phòng Deluxe', 'DLX', 'Phòng sang trọng', 1000000, 'active'),
    (v_tenant_id, 'Phòng Suite', 'SUI', 'Phòng hạng thương gia', 1500000, 'active');

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'hotel_id', v_hotel_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
