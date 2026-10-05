-- Create function to allow creating notifications for other users in same tenant
-- Using SECURITY DEFINER to bypass RLS while maintaining tenant security
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  p_user_id UUID,
  p_tenant_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_type TEXT DEFAULT 'info',
  p_action_url TEXT DEFAULT NULL,
  p_icon TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_sender_tenant_id UUID;
BEGIN
  -- Verify sender belongs to same tenant
  SELECT tenant_id INTO v_sender_tenant_id
  FROM users WHERE id = auth.uid();
  
  IF v_sender_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User not found';
  END IF;
  
  IF v_sender_tenant_id != p_tenant_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot send notifications to other tenants';
  END IF;
  
  -- Insert notification (SECURITY DEFINER bypasses RLS)
  INSERT INTO in_app_notifications (
    user_id, tenant_id, title, body, type, action_url, icon, metadata, is_read
  ) VALUES (
    p_user_id, p_tenant_id, p_title, p_body, p_type, p_action_url, p_icon, COALESCE(p_metadata, '{}'::jsonb), false
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_notification_for_user TO authenticated;