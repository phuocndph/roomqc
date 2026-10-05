-- Create staff_status table for realtime tracking
CREATE TABLE public.staff_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('available', 'busy', 'break', 'offline')),
  current_location TEXT,
  current_activity TEXT,
  current_activity_type TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  shift_start_at TIMESTAMPTZ,
  shift_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_staff_status_tenant ON public.staff_status(tenant_id);
CREATE INDEX idx_staff_status_status ON public.staff_status(status);
CREATE INDEX idx_staff_status_last_seen ON public.staff_status(last_seen_at);

-- Enable RLS
ALTER TABLE public.staff_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view staff status in their tenant"
ON public.staff_status FOR SELECT
TO authenticated
USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update their own status"
ON public.staff_status FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Managers can update any staff status in tenant"
ON public.staff_status FOR UPDATE
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND user_level_code IN ('super_admin', 'tenant_owner', 'manager')
  )
);

CREATE POLICY "Users can insert their own status"
ON public.staff_status FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "System can insert status for any user in tenant"
ON public.staff_status FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_status;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_staff_status_updated_at
  BEFORE UPDATE ON public.staff_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update staff status from room_check_sessions
CREATE OR REPLACE FUNCTION public.update_staff_status_from_room_check()
RETURNS TRIGGER AS $$
DECLARE
  v_room_name TEXT;
  v_tenant_id UUID;
  v_check_type_label TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get room info
    SELECT r.room_number, r.tenant_id INTO v_room_name, v_tenant_id
    FROM public.rooms r WHERE r.id = NEW.room_id;
    
    -- Map check_type to Vietnamese label
    v_check_type_label := CASE NEW.check_type
      WHEN 'checkin' THEN 'nhận phòng'
      WHEN 'checkout' THEN 'trả phòng'
      WHEN 'daily' THEN 'hàng ngày'
      WHEN 'maintenance' THEN 'bảo trì'
      ELSE NEW.check_type
    END;
    
    INSERT INTO public.staff_status (user_id, tenant_id, status, current_location, current_activity, current_activity_type, last_seen_at)
    VALUES (NEW.user_id, v_tenant_id, 'busy', 'Phòng ' || v_room_name, 'Kiểm tra ' || v_check_type_label, 'room_check', now())
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'busy',
      current_location = 'Phòng ' || v_room_name,
      current_activity = 'Kiểm tra ' || v_check_type_label,
      current_activity_type = 'room_check',
      last_seen_at = now(),
      updated_at = now();
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.staff_status SET
      status = 'available',
      current_location = NULL,
      current_activity = NULL,
      current_activity_type = NULL,
      updated_at = now()
    WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on room_check_sessions
CREATE TRIGGER on_room_check_session_change
  AFTER INSERT OR DELETE ON public.room_check_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_staff_status_from_room_check();