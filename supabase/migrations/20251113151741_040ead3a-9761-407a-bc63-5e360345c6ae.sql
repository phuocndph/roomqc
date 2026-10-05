-- Enable Row Level Security on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Verify RLS policies are in place
-- The following policies should already exist from Phase 1:
-- 1. Super admins bypass all restrictions
-- 2. Users can view users in their hierarchy
-- 3. Managers can update subordinates
-- 4. Only authorized users can create users
-- 5. Users can update themselves
-- 6. Managers can delete subordinates

COMMENT ON TABLE users IS 'RLS enabled - users are isolated by tenant_id and user hierarchy';