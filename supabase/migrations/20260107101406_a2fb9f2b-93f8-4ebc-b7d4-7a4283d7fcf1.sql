CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  new_hotel_id uuid;
  hotel_code text;
BEGIN
  -- Skip if user is created by admin
  IF NEW.raw_user_meta_data->>'created_by_admin' = 'true' THEN
    RETURN NEW;
  END IF;

  -- Generate uppercase hotel code
  hotel_code := 'HOTEL-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 8));

  -- Create tenant with auto-approved status
  INSERT INTO public.tenants (
    name, email, subscription_status, billing_cycle,
    approval_status, approved_at, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Khách hàng mới') || ' - Tenant',
    NEW.email, 'trial', 'monthly', 'approved', NOW(), NOW(), NOW()
  )
  RETURNING id INTO new_tenant_id;

  -- Create default hotel
  INSERT INTO public.hotels (
    tenant_id, name, code, type, country, status, created_at, updated_at
  ) VALUES (
    new_tenant_id, 'Khách sạn mặc định', hotel_code, 'hotel', 'VN', 'active', NOW(), NOW()
  )
  RETURNING id INTO new_hotel_id;

  -- Create user profile with hotel_id
  INSERT INTO public.users (
    id, tenant_id, hotel_id, email, full_name,
    user_level_code, role,
    is_primary_owner, status, created_at, updated_at
  ) VALUES (
    NEW.id, new_tenant_id, new_hotel_id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Chủ sở hữu'),
    'tenant_owner', 'owner',
    true, 'active', NOW(), NOW()
  );

  -- Assign owner role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'owner');

  -- Assign user to default hotel (removed is_primary - column doesn't exist)
  INSERT INTO public.user_hotels (user_id, hotel_id)
  VALUES (NEW.id, new_hotel_id);

  -- Create tenant_usage record
  INSERT INTO public.tenant_usage (tenant_id, current_hotels_count, current_users_count)
  VALUES (new_tenant_id, 1, 1)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;