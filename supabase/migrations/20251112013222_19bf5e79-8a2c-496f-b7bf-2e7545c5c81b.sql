-- ============================================
-- FIX: Update handle_new_user trigger with all required columns
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create user record with all required fields
  INSERT INTO public.users (
    id, 
    email, 
    full_name, 
    avatar_url,
    phone,
    phone_verified,
    status,
    login_count,
    user_level_code,
    is_super_admin,
    is_primary_owner
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.phone,
    false,
    'active',
    0,
    'staff',
    false,
    false
  );

  -- Assign default 'staff' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If trigger fails, still allow user creation in auth
  RAISE WARNING 'Failed to create user profile: %', SQLERRM;
  RETURN NEW;
END;
$$;