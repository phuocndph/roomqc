-- Create atomic registration completion function
CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_tenant_name text,
  p_hotel_name text,
  p_hotel_address text,
  p_hotel_phone text,
  p_hotel_email text,
  p_total_rooms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_hotel_id uuid;
BEGIN
  -- All operations in ONE transaction (atomic)
  
  -- 1. Create tenant
  INSERT INTO tenants (name, email, phone, subscription_plan, subscription_status)
  VALUES (p_tenant_name, p_email, p_phone, 'basic', 'trial')
  RETURNING id INTO v_tenant_id;
  
  -- 2. Create hotel
  INSERT INTO hotels (tenant_id, name, address, phone, email, total_rooms)
  VALUES (v_tenant_id, p_hotel_name, p_hotel_address, p_hotel_phone, p_hotel_email, p_total_rooms)
  RETURNING id INTO v_hotel_id;
  
  -- 3. Update user profile (created by trigger) with tenant and hotel
  UPDATE users SET
    tenant_id = v_tenant_id,
    hotel_id = v_hotel_id,
    phone = p_phone,
    full_name = p_full_name
  WHERE id = p_user_id;
  
  -- 4. Update user role from 'staff' to 'owner'
  UPDATE user_roles SET
    role = 'owner'
  WHERE user_id = p_user_id;
  
  -- 5. Create default categories (bulk insert)
  INSERT INTO item_categories (tenant_id, name, name_en, description, icon, color, sort_order)
  VALUES
    (v_tenant_id, 'Đồ vải', 'Fabric & Linens', 'Khăn tắm, ga giường, chăn gối...', 'shirt', '#3b82f6', 1),
    (v_tenant_id, 'Tiện nghi', 'Amenities', 'Bàn chải, dầu gội, sữa tắm...', 'sparkles', '#8b5cf6', 2),
    (v_tenant_id, 'Thiết bị điện', 'Electronics', 'Tivi, tủ lạnh, máy sấy...', 'tv', '#10b981', 3),
    (v_tenant_id, 'Nội thất', 'Furniture', 'Giường, tủ, bàn, ghế...', 'sofa', '#f59e0b', 4),
    (v_tenant_id, 'Đồ vệ sinh', 'Cleaning Supplies', 'Xà phòng, giấy vệ sinh...', 'spray', '#06b6d4', 5)
  ON CONFLICT DO NOTHING;
  
  -- 6. Create welcome notification
  INSERT INTO notifications (tenant_id, user_id, type, category, title, message)
  VALUES (
    v_tenant_id,
    p_user_id,
    'success',
    'system',
    'Chào mừng đến với hệ thống!',
    'Tài khoản của bạn đã được tạo thành công. Hãy bắt đầu bằng cách thêm tài sản vào kho.'
  );
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'hotel_id', v_hotel_id
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Auto rollback on any error
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;