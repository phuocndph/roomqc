-- Registration is called after the auth trigger has provisioned a default
-- tenant and hotel. Reuse those rows so retries cannot create duplicates.
CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_tenant_name text,
  p_email text,
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
AS $function$
DECLARE
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_plan_id uuid;
  v_hotel_code text;
  v_conflicting_tenant_id uuid;
BEGIN
  -- Only the signed-in user (or a server-side service-role call) may finish
  -- its own registration.
  IF p_user_id IS NULL OR (
    auth.uid() IS DISTINCT FROM p_user_id
    AND coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF nullif(btrim(p_email), '') IS NULL
     OR nullif(btrim(p_tenant_name), '') IS NULL
     OR nullif(btrim(p_hotel_name), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Required registration fields are missing');
  END IF;

  -- Prefer the current trial plan. Older projects may still have a basic or
  -- standard plan, so retain those as compatibility fallbacks.
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE is_active = true
    AND code IN ('free_trial', 'basic', 'standard')
  ORDER BY CASE code
    WHEN 'free_trial' THEN 1
    WHEN 'basic' THEN 2
    WHEN 'standard' THEN 3
    ELSE 99
  END
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active subscription plan found');
  END IF;

  -- The auth trigger normally creates this profile before the RPC runs.
  SELECT tenant_id, hotel_id INTO v_tenant_id, v_hotel_id
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  -- If a partially provisioned profile is missing its tenant link, recover a
  -- tenant created for the same email before attempting an insert.
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id
    FROM tenants
    WHERE lower(email) = lower(btrim(p_email))
    LIMIT 1;
  END IF;

  SELECT id INTO v_conflicting_tenant_id
  FROM tenants
  WHERE lower(email) = lower(btrim(p_email))
    AND (v_tenant_id IS NULL OR id <> v_tenant_id)
  LIMIT 1;

  IF v_conflicting_tenant_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A tenant already uses this email');
  END IF;

  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (
      name,
      email,
      phone,
      subscription_plan,
      subscription_plan_id,
      subscription_status,
      trial_ends_at,
      subscription_start_date,
      subscription_end_date,
      trial_end_date,
      billing_cycle,
      approval_status,
      approved_at
    )
    VALUES (
      btrim(p_tenant_name),
      btrim(p_email),
      nullif(btrim(p_phone), ''),
      'free_trial',
      v_plan_id,
      'trial',
      now() + interval '30 days',
      current_date,
      current_date + 30,
      current_date + 30,
      'monthly',
      'approved',
      now()
    )
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE tenants
    SET name = btrim(p_tenant_name),
        email = btrim(p_email),
        phone = coalesce(nullif(btrim(p_phone), ''), phone),
        subscription_plan = CASE
          WHEN subscription_plan_id IS NULL THEN 'free_trial'
          ELSE subscription_plan
        END,
        subscription_plan_id = coalesce(subscription_plan_id, v_plan_id),
        subscription_status = coalesce(nullif(subscription_status, ''), 'trial'),
        trial_ends_at = coalesce(trial_ends_at, now() + interval '30 days'),
        subscription_start_date = coalesce(subscription_start_date, current_date),
        subscription_end_date = coalesce(subscription_end_date, current_date + 30),
        trial_end_date = coalesce(trial_end_date, current_date + 30),
        approval_status = coalesce(approval_status, 'approved'),
        approved_at = CASE
          WHEN coalesce(approval_status, 'approved') = 'approved'
            THEN coalesce(approved_at, now())
          ELSE approved_at
        END
    WHERE id = v_tenant_id;
  END IF;

  -- Reuse the trigger-created hotel, or the first hotel for this tenant.
  IF v_hotel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hotels WHERE id = v_hotel_id AND tenant_id = v_tenant_id
  ) THEN
    v_hotel_id := NULL;
  END IF;

  IF v_hotel_id IS NULL THEN
    SELECT id INTO v_hotel_id
    FROM hotels
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_hotel_id IS NULL THEN
    LOOP
      v_hotel_code := 'HTL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM hotels WHERE code = v_hotel_code);
    END LOOP;

    INSERT INTO hotels (
      tenant_id, code, name, address, phone, email, total_rooms, type, country, status
    )
    VALUES (
      v_tenant_id,
      v_hotel_code,
      btrim(p_hotel_name),
      nullif(btrim(p_hotel_address), ''),
      nullif(btrim(p_hotel_phone), ''),
      nullif(btrim(p_hotel_email), ''),
      coalesce(p_total_rooms, 0),
      'hotel',
      'VN',
      'active'
    )
    RETURNING id INTO v_hotel_id;
  ELSE
    UPDATE hotels
    SET name = btrim(p_hotel_name),
        address = coalesce(nullif(btrim(p_hotel_address), ''), address),
        phone = coalesce(nullif(btrim(p_hotel_phone), ''), phone),
        email = coalesce(nullif(btrim(p_hotel_email), ''), email),
        total_rooms = coalesce(p_total_rooms, total_rooms),
        status = 'active'
    WHERE id = v_hotel_id;
  END IF;

  -- Update the profile created by the auth trigger, or create it if the
  -- trigger was disabled during a legacy import.
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    UPDATE users
    SET tenant_id = v_tenant_id,
        hotel_id = v_hotel_id,
        email = btrim(p_email),
        phone = coalesce(nullif(btrim(p_phone), ''), phone),
        full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
        role = 'owner',
        user_level_code = 'tenant_owner',
        is_primary_owner = true,
        status = 'active'
    WHERE id = p_user_id;
  ELSE
    INSERT INTO users (
      id, tenant_id, hotel_id, email, phone, full_name,
      user_level_code, role, is_primary_owner, status, login_count
    )
    VALUES (
      p_user_id, v_tenant_id, v_hotel_id, btrim(p_email),
      nullif(btrim(p_phone), ''), coalesce(nullif(btrim(p_full_name), ''), 'Owner'),
      'tenant_owner', 'owner', true, 'active', 0
    );
  END IF;

  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, 'owner')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO user_hotels (
    user_id, hotel_id, assigned_by, can_create_managers, can_create_staff,
    can_view_reports, can_export_data, can_approve_requests
  )
  VALUES (p_user_id, v_hotel_id, p_user_id, true, true, true, true, true)
  ON CONFLICT (user_id, hotel_id) DO UPDATE SET
    assigned_by = excluded.assigned_by,
    can_create_managers = excluded.can_create_managers,
    can_create_staff = excluded.can_create_staff,
    can_view_reports = excluded.can_view_reports,
    can_export_data = excluded.can_export_data,
    can_approve_requests = excluded.can_approve_requests;

  INSERT INTO tenant_usage (
    tenant_id, current_hotels_count, current_users_count,
    current_rooms_count, current_items_count, current_storage_bytes
  )
  VALUES (v_tenant_id, 1, 1, 0, 0, 0)
  ON CONFLICT (tenant_id) DO UPDATE SET
    current_hotels_count = greatest(coalesce(tenant_usage.current_hotels_count, 0), 1),
    current_users_count = greatest(coalesce(tenant_usage.current_users_count, 0), 1);

  -- Seed defaults only once for each tenant so retries remain harmless.
  INSERT INTO item_categories (tenant_id, name, name_en, description, icon, color, sort_order, status)
  SELECT v_tenant_id, d.name, d.name_en, d.description, d.icon, d.color, d.sort_order, 'active'
  FROM (VALUES
    ('Đồ vải', 'Fabric & Linens', 'Khăn tắm, ga giường, chăn gối...', 'shirt', '#3b82f6', 1),
    ('Tiện nghi', 'Amenities', 'Bàn chải, dầu gội, sữa tắm...', 'sparkles', '#8b5cf6', 2),
    ('Thiết bị điện', 'Electronics', 'Tivi, tủ lạnh, máy sấy...', 'tv', '#10b981', 3),
    ('Nội thất', 'Furniture', 'Giường, tủ, bàn, ghế...', 'sofa', '#f59e0b', 4),
    ('Đồ dùng khác', 'Other Items', 'Các vật dụng khác...', 'package', '#6b7280', 5)
  ) AS d(name, name_en, description, icon, color, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM item_categories c
    WHERE c.tenant_id = v_tenant_id AND c.name = d.name
  );

  INSERT INTO laundry_categories (
    tenant_id, name, code, description, price_per_kg, price_per_item, status
  ) VALUES
    (v_tenant_id, 'Giặt thông thường', 'STANDARD', 'Giặt sấy thông thường', 15000, 5000, 'active'),
    (v_tenant_id, 'Giặt khô', 'DRY_CLEAN', 'Giặt khô chuyên nghiệp', 30000, 15000, 'active'),
    (v_tenant_id, 'Giặt hấp', 'STEAM', 'Giặt và là hấp', 20000, 8000, 'active')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO maintenance_categories (
    tenant_id, name, code, description, icon, color, status
  ) VALUES
    (v_tenant_id, 'Điện', 'ELECTRIC', 'Sửa chữa hệ thống điện', 'zap', '#eab308', 'active'),
    (v_tenant_id, 'Nước', 'PLUMBING', 'Sửa chữa hệ thống nước', 'droplet', '#3b82f6', 'active'),
    (v_tenant_id, 'Điều hòa', 'HVAC', 'Sửa chữa điều hòa nhiệt độ', 'wind', '#06b6d4', 'active'),
    (v_tenant_id, 'Nội thất', 'FURNITURE', 'Sửa chữa nội thất', 'hammer', '#f59e0b', 'active'),
    (v_tenant_id, 'Khác', 'OTHER', 'Bảo trì khác', 'wrench', '#6b7280', 'active')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO room_types (tenant_id, hotel_id, name, code, description, base_price, status)
  VALUES
    (v_tenant_id, v_hotel_id, 'Phòng Standard', 'STD', 'Phòng tiêu chuẩn', 500000, 'active'),
    (v_tenant_id, v_hotel_id, 'Phòng Superior', 'SUP', 'Phòng cao cấp', 700000, 'active'),
    (v_tenant_id, v_hotel_id, 'Phòng Deluxe', 'DLX', 'Phòng sang trọng', 1000000, 'active'),
    (v_tenant_id, v_hotel_id, 'Phòng Suite', 'SUI', 'Phòng hạng thương gia', 1500000, 'active')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  UPDATE room_types
  SET hotel_id = v_hotel_id
  WHERE tenant_id = v_tenant_id AND hotel_id IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'hotel_id', v_hotel_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) IS 'Completes registration idempotently for the authenticated user.';
