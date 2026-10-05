
-- Clean up orphaned auth users that don't have public.users records
-- Only delete users who haven't signed in for more than 24 hours to avoid disrupting active sessions

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete orphaned auth users who haven't been active recently
  WITH orphaned_users AS (
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.users pu ON au.id = pu.id
    WHERE pu.id IS NULL
      AND (au.last_sign_in_at IS NULL OR au.last_sign_in_at < NOW() - INTERVAL '24 hours')
  )
  DELETE FROM auth.users
  WHERE id IN (SELECT id FROM orphaned_users);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % orphaned auth users', deleted_count;
END $$;

-- Create a function to periodically clean up orphaned users
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_auth_users()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete orphaned auth users who haven't signed in for more than 7 days
  WITH orphaned_users AS (
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.users pu ON au.id = pu.id
    WHERE pu.id IS NULL
      AND (au.last_sign_in_at IS NULL OR au.last_sign_in_at < NOW() - INTERVAL '7 days')
  )
  DELETE FROM auth.users
  WHERE id IN (SELECT id FROM orphaned_users);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_orphaned_auth_users() IS 'Deletes auth.users that have no corresponding public.users record and have not signed in for 7+ days';
