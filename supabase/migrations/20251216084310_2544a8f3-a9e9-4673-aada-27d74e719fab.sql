-- Phase 2: Create notification_preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  
  -- Push notifications
  push_enabled BOOLEAN DEFAULT true,
  
  -- Email notifications
  email_low_stock BOOLEAN DEFAULT true,
  email_laundry_completed BOOLEAN DEFAULT true,
  email_maintenance_new BOOLEAN DEFAULT true,
  email_po_approved BOOLEAN DEFAULT true,
  email_daily_report BOOLEAN DEFAULT false,
  email_weekly_report BOOLEAN DEFAULT true,
  
  -- In-app notifications  
  inapp_realtime BOOLEAN DEFAULT true,
  inapp_low_stock BOOLEAN DEFAULT true,
  inapp_laundry_completed BOOLEAN DEFAULT true,
  inapp_maintenance_new BOOLEAN DEFAULT true,
  inapp_task_assigned BOOLEAN DEFAULT true,
  inapp_approval_request BOOLEAN DEFAULT true,
  
  -- Thresholds
  low_stock_threshold INTEGER DEFAULT 20,
  critical_stock_threshold INTEGER DEFAULT 5,
  overdue_maintenance_days INTEGER DEFAULT 3,
  laundry_delay_hours INTEGER DEFAULT 24,
  
  -- Schedule
  daily_report_time TIME DEFAULT '08:00',
  weekly_report_day INTEGER DEFAULT 1, -- Monday
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notification preferences"
ON public.notification_preferences FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own notification preferences"
ON public.notification_preferences FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notification preferences"
ON public.notification_preferences FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notification preferences"
ON public.notification_preferences FOR DELETE
USING (user_id = auth.uid());

-- Enable realtime for in_app_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;

-- Create function to send notification
CREATE OR REPLACE FUNCTION public.create_notification(
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
BEGIN
  INSERT INTO in_app_notifications (
    user_id, tenant_id, title, body, type, action_url, icon, metadata
  ) VALUES (
    p_user_id, p_tenant_id, p_title, p_body, p_type, p_action_url, p_icon, p_metadata
  ) RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Create trigger for updated_at on notification_preferences
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();