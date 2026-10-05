-- Make department_manager a first-class account level while preserving the
-- existing app_role permission model.

UPDATE public.user_levels
SET hierarchy_level = 5
WHERE code = 'staff' AND hierarchy_level = 4;

INSERT INTO public.user_levels (code, name, hierarchy_level, description)
VALUES (
  'department_manager',
  'Department Manager',
  4,
  'Manages one operational department within an assigned hotel'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    hierarchy_level = EXCLUDED.hierarchy_level,
    description = EXCLUDED.description;

COMMENT ON TABLE public.user_levels IS
  'Defines user levels: Super Admin (1), Tenant Owner (2), Manager (3), Department Manager (4), Staff (5)';

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND user_level_code IN ('manager', 'department_manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_create_user(
  p_creator_id uuid,
  p_new_user_level text,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_level text;
  v_tenant_approved boolean;
  v_is_super_admin boolean;
  v_primary_owner_exists boolean;
BEGIN
  SELECT is_super_admin() INTO v_is_super_admin;
  IF v_is_super_admin THEN
    RETURN true;
  END IF;

  SELECT u.user_level_code, t.approval_status = 'approved'
  INTO v_creator_level, v_tenant_approved
  FROM public.users u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.id = p_creator_id AND u.tenant_id = p_tenant_id;

  IF v_creator_level IS NULL OR NOT v_tenant_approved THEN
    RETURN false;
  END IF;

  IF p_new_user_level = 'tenant_owner' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.users
      WHERE tenant_id = p_tenant_id
        AND user_level_code = 'tenant_owner'
        AND is_primary_owner = true
    ) INTO v_primary_owner_exists;
    RETURN NOT v_primary_owner_exists;
  END IF;

  IF v_creator_level = 'tenant_owner' THEN
    RETURN p_new_user_level IN ('manager', 'department_manager', 'staff');
  END IF;

  IF v_creator_level = 'manager' THEN
    RETURN p_new_user_level IN ('department_manager', 'staff');
  END IF;

  IF v_creator_level = 'department_manager' THEN
    RETURN p_new_user_level = 'staff';
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_created_by_required()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_level_code IN ('manager', 'department_manager', 'staff')
     AND NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'created_by is required for non-owner users';
  END IF;

  IF NEW.user_level_code IN ('tenant_owner', 'super_admin') THEN
    NEW.created_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;
