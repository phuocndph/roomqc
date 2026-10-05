-- ============================================
-- FIX: Update SQL functions to use item_images table
-- ============================================

-- 1. Fix get_top_items function (remove old version)
DROP FUNCTION IF EXISTS get_top_items(UUID, INTEGER);

-- Recreate get_top_items with item_images
CREATE OR REPLACE FUNCTION get_top_items(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  thumbnail TEXT,
  category_name TEXT,
  category_color TEXT,
  quantity_in_use INTEGER,
  quantity_total INTEGER,
  utilization_rate NUMERIC,
  stock_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.code,
    i.name,
    (SELECT ii.url FROM item_images ii WHERE ii.item_id = i.id AND ii.is_primary = true LIMIT 1) as thumbnail,
    c.name as category_name,
    c.color as category_color,
    i.quantity_in_use,
    i.quantity_total,
    CASE 
      WHEN i.quantity_total = 0 THEN 0
      ELSE ROUND((i.quantity_in_use::NUMERIC / i.quantity_total::NUMERIC) * 100, 2)
    END as utilization_rate,
    CASE
      WHEN i.quantity_in_stock = 0 THEN 'out_of_stock'
      WHEN i.quantity_in_stock < i.minimum_stock THEN 'low_stock'
      ELSE 'in_stock'
    END::TEXT as stock_status
  FROM items i
  LEFT JOIN item_categories c ON c.id = i.category_id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND i.status = 'active'
    AND i.quantity_in_use > 0
  ORDER BY i.quantity_in_use DESC
  LIMIT p_limit;
END;
$$;

-- 2. Fix get_room_standards function
CREATE OR REPLACE FUNCTION get_room_standards(
  p_hotel_id UUID,
  p_room_type TEXT
)
RETURNS TABLE (
  id UUID,
  item_id UUID,
  item_code TEXT,
  item_name TEXT,
  item_thumbnail TEXT,
  category_name TEXT,
  category_color TEXT,
  quantity INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rts.id,
    rts.item_id,
    i.code as item_code,
    i.name as item_name,
    (SELECT ii.url FROM item_images ii WHERE ii.item_id = i.id AND ii.is_primary = true LIMIT 1) as item_thumbnail,
    c.name as category_name,
    c.color as category_color,
    rts.quantity
  FROM room_type_standards rts
  JOIN items i ON i.id = rts.item_id
  LEFT JOIN item_categories c ON c.id = i.category_id
  WHERE rts.hotel_id = p_hotel_id
    AND rts.room_type = p_room_type
  ORDER BY c.sort_order, i.name;
END;
$$;

-- 3. Fix get_laundry_batch_detail function
CREATE OR REPLACE FUNCTION get_laundry_batch_detail(p_batch_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'batch', row_to_json(lb.*),
    'vendor', row_to_json(lv.*),
    'hotel', row_to_json(h.*),
    'delivery_staff', row_to_json(ds.*),
    'return_staff', row_to_json(rs.*),
    'items', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', lbi.id,
          'item_id', lbi.item_id,
          'item_code', i.code,
          'item_name', i.name,
          'item_thumbnail', (SELECT ii.url FROM item_images ii WHERE ii.item_id = i.id AND ii.is_primary = true LIMIT 1),
          'category_name', c.name,
          'quantity_delivered', lbi.quantity_delivered,
          'weight_kg', lbi.weight_kg,
          'condition_note', lbi.condition_note,
          'quantity_returned', lbi.quantity_returned,
          'quantity_lost', lbi.quantity_lost,
          'quantity_damaged', lbi.quantity_damaged,
          'return_condition', lbi.return_condition
        )
      )
      FROM laundry_batch_items lbi
      JOIN items i ON i.id = lbi.item_id
      LEFT JOIN item_categories c ON c.id = i.category_id
      WHERE lbi.batch_id = lb.id
    )
  ) INTO v_result
  FROM laundry_batches lb
  JOIN laundry_vendors lv ON lv.id = lb.vendor_id
  JOIN hotels h ON h.id = lb.hotel_id
  LEFT JOIN users ds ON ds.id = lb.delivery_staff_id
  LEFT JOIN users rs ON rs.id = lb.return_staff_id
  WHERE lb.id = p_batch_id;
  
  RETURN v_result;
END;
$$;

-- ============================================
-- CREATE SUPER ADMIN USER
-- ============================================

-- Create super admin user function
CREATE OR REPLACE FUNCTION create_super_admin(
  p_email TEXT,
  p_full_name TEXT DEFAULT 'Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result jsonb;
BEGIN
  -- Check if auth user exists
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found in auth.users. Please create account first via auth signup.'
    );
  END IF;

  -- Check if user already exists in users table
  IF EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
    -- Update existing user to super admin
    UPDATE users 
    SET 
      user_level_code = 'super_admin',
      is_super_admin = true,
      is_primary_owner = false,
      tenant_id = '00000000-0000-0000-0000-000000000000',
      status = 'active',
      full_name = p_full_name
    WHERE id = v_user_id;
  ELSE
    -- Insert new user record
    INSERT INTO users (
      id,
      tenant_id,
      user_level_code,
      is_super_admin,
      is_primary_owner,
      email,
      full_name,
      phone_verified,
      status,
      login_count
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'super_admin',
      true,
      false,
      p_email,
      p_full_name,
      false,
      'active',
      0
    );
  END IF;

  -- Create or update role in user_roles
  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'email', p_email,
    'message', 'Super admin created/updated successfully'
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_super_admin TO authenticated;

COMMENT ON FUNCTION create_super_admin IS 'Creates or promotes a user to super admin. User must exist in auth.users first.';