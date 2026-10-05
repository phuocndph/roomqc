-- Create function to automatically cleanup old check sessions (older than 2 hours)
CREATE OR REPLACE FUNCTION cleanup_old_check_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM room_check_sessions
  WHERE started_at < NOW() - INTERVAL '2 hours';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_old_check_sessions() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION cleanup_old_check_sessions() IS 'Deletes room check sessions that are older than 2 hours to prevent orphaned sessions';