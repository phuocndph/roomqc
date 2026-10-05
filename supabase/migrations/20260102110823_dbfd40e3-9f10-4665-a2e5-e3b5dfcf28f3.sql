-- Fix hotels.code generation in handle_new_user to satisfy hotels_code_format (uppercase)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_hotel_id UUID;
BEGIN
  -- Create a default tenant for the new user with email
  INSERT INTO public.tenants (
    name,
    email,
    subscription_status,
    billing_cycle,
    created_at,
    updated_at
  ) VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Khách hàng mới') || ' - Tenant',
    NEW.email,
    'trial',
    'monthly',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_tenant_id;

  -- Create a default hotel for the tenant
  INSERT INTO public.hotels (
    tenant_id,
    name,
    code,
    type,
    status,
    country,
    created_at,
    updated_at
  ) VALUES (
    v_tenant_id,
    'Khách sạn mặc định',
    'HOTEL-' || UPPER(SUBSTRING(v_tenant_id::text, 1, 8)),
    'hotel',
    'active',
    'VN',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_hotel_id;

  -- Create user profile with tenant and hotel assigned
  INSERT INTO public.users (
    id,
    email,
    full_name,
    status,
    login_count,
    tenant_id,
    hotel_id,
    user_level_code,
    is_primary_owner,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    'active',
    0,
    v_tenant_id,
    v_hotel_id,
    'tenant_owner',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = v_tenant_id,
    hotel_id = v_hotel_id,
    user_level_code = 'tenant_owner',
    is_primary_owner = true,
    status = 'active';

  -- Assign owner role to the user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'owner')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create tenant_usage record
  INSERT INTO public.tenant_usage (tenant_id, current_hotels_count, current_users_count)
  VALUES (v_tenant_id, 1, 1)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();