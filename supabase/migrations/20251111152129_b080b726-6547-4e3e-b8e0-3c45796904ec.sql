-- =====================================================
-- PHASE 1: USER LEVELS & MIGRATION (Fixed)
-- =====================================================

-- 1. Create user_levels table
CREATE TABLE IF NOT EXISTS user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  hierarchy_level INTEGER NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert 4-tier levels
INSERT INTO user_levels (code, name, hierarchy_level, description) VALUES
('super_admin', 'Super Admin', 1, 'Platform owner - manages all tenants'),
('tenant_owner', 'Tenant Owner', 2, 'Customer - full control within tenant'),
('manager', 'Manager', 3, 'Hotel manager - manages assigned hotels'),
('staff', 'Staff', 4, 'Employee - executes tasks')
ON CONFLICT (code) DO NOTHING;

-- 2. Add new columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS user_level_code TEXT DEFAULT 'staff' REFERENCES user_levels(code),
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_login_ip INET,
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_reason TEXT,
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_user_level ON users(user_level_code);
CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NULL;

-- 3. Migrate existing role data to user_level_code
UPDATE users u
SET 
  user_level_code = CASE
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'super_admin') THEN 'super_admin'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'owner') THEN 'tenant_owner'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role IN ('hotel_manager', 'department_manager')) THEN 'manager'
    ELSE 'staff'
  END,
  is_super_admin = EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'super_admin')
WHERE user_level_code IS NULL OR user_level_code = 'staff';

-- 4. Create helper functions for user level checks
CREATE OR REPLACE FUNCTION public.get_user_level(_user_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_level_code
  FROM users
  WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_user_level(_user_id uuid, _level_code text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users
    WHERE id = _user_id
      AND user_level_code = _level_code
  );
$$;

CREATE OR REPLACE FUNCTION public.is_level_higher_or_equal(_user_id uuid, _min_level_code text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN user_levels ul ON ul.code = u.user_level_code
    JOIN user_levels min_ul ON min_ul.code = _min_level_code
    WHERE u.id = _user_id
      AND ul.hierarchy_level <= min_ul.hierarchy_level
  );
$$;

-- 5. Create function to fetch user levels
CREATE OR REPLACE FUNCTION public.get_user_levels()
RETURNS TABLE(
  id UUID,
  code TEXT,
  name TEXT,
  hierarchy_level INTEGER,
  description TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT id, code, name, hierarchy_level, description
  FROM user_levels
  ORDER BY hierarchy_level;
$$;

-- 6. Create view for easy user level access
CREATE OR REPLACE VIEW user_with_levels AS
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.phone,
  u.avatar_url,
  u.tenant_id,
  u.hotel_id,
  u.user_level_code,
  u.is_super_admin,
  ul.name as user_level_name,
  ul.hierarchy_level,
  u.status,
  u.last_login_at,
  u.login_count,
  u.account_locked,
  u.created_at
FROM users u
LEFT JOIN user_levels ul ON ul.code = u.user_level_code
WHERE u.deleted_at IS NULL;

-- 7. Drop and recreate policy
DROP POLICY IF EXISTS "Users can view their profile with level" ON users;
CREATE POLICY "Users can view their profile with level"
ON users
FOR SELECT
TO authenticated
USING (id = auth.uid() OR is_super_admin = true);

-- Comments for documentation
COMMENT ON TABLE user_levels IS 'Defines 4-tier user hierarchy: Super Admin (1), Tenant Owner (2), Manager (3), Staff (4)';
COMMENT ON COLUMN users.user_level_code IS 'New 4-tier user level system - replaces role-based system';
COMMENT ON COLUMN users.is_super_admin IS 'Platform owner flag - has access across all tenants';
COMMENT ON COLUMN users.notes IS 'Internal notes for super admin use only';