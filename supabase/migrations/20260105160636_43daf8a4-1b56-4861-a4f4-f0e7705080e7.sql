-- 1. Update all existing pending tenants to approved
UPDATE public.tenants 
SET approval_status = 'approved', 
    approved_at = NOW(),
    updated_at = NOW()
WHERE approval_status = 'pending' OR approval_status IS NULL;

-- 2. Update the handle_new_user trigger to auto-approve tenants
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
  new_hotel_id uuid;
  owner_level_id uuid;
  hotel_code text;
BEGIN
  -- Generate uppercase hotel code
  hotel_code := 'HOTEL-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 8));

  -- Create tenant with auto-approved status
  INSERT INTO public.tenants (
    name,
    email,
    subscription_status,
    billing_cycle,
    approval_status,
    approved_at,
    created_at,
    updated_at
  ) VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Khách hàng mới') || ' - Tenant',
    NEW.email,
    'trial',
    'monthly',
    'approved',
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO new_tenant_id;

  -- Create default hotel
  INSERT INTO public.hotels (
    tenant_id,
    name,
    code,
    type,
    country,
    status,
    created_at,
    updated_at
  ) VALUES (
    new_tenant_id,
    'Khách sạn mặc định',
    hotel_code,
    'hotel',
    'VN',
    'active',
    NOW(),
    NOW()
  )
  RETURNING id INTO new_hotel_id;

  -- Get owner level id
  SELECT id INTO owner_level_id FROM public.user_levels WHERE code = 'tenant_owner' LIMIT 1;

  -- Create user profile
  INSERT INTO public.users (
    id,
    tenant_id,
    email,
    full_name,
    level_id,
    is_primary_owner,
    status,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    new_tenant_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Chủ sở hữu'),
    owner_level_id,
    true,
    'active',
    NOW(),
    NOW()
  );

  -- Assign owner role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'owner');

  -- Assign user to default hotel
  INSERT INTO public.user_hotels (user_id, hotel_id, is_primary)
  VALUES (NEW.id, new_hotel_id, true);

  RETURN NEW;
END;
$$;