-- Create shift_history table to store completed shifts
CREATE TABLE public.shift_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_at - start_at)) / 60
  ) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_shift_history_tenant ON public.shift_history(tenant_id);
CREATE INDEX idx_shift_history_user ON public.shift_history(user_id);
CREATE INDEX idx_shift_history_start_at ON public.shift_history(start_at DESC);
CREATE INDEX idx_shift_history_tenant_date ON public.shift_history(tenant_id, start_at DESC);

-- Enable RLS
ALTER TABLE public.shift_history ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own shift history
CREATE POLICY "Users can view own shift history"
ON public.shift_history
FOR SELECT
USING (auth.uid() = user_id);

-- RLS: Managers/Owners can view all shift history in their tenant
CREATE POLICY "Managers can view all shift history in tenant"
ON public.shift_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.tenant_id = shift_history.tenant_id
    AND u.user_level_code IN ('super_admin', 'tenant_owner', 'manager')
  )
);

-- Create trigger function to log shift when check-out happens
CREATE OR REPLACE FUNCTION public.log_shift_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log when shift_end_at is being set and shift_start_at exists
  IF NEW.shift_end_at IS NOT NULL 
     AND OLD.shift_end_at IS DISTINCT FROM NEW.shift_end_at
     AND NEW.shift_start_at IS NOT NULL
     AND NEW.shift_end_at > NEW.shift_start_at
  THEN
    INSERT INTO public.shift_history (
      tenant_id,
      user_id,
      hotel_id,
      start_at,
      end_at,
      notes
    ) VALUES (
      NEW.tenant_id,
      NEW.user_id,
      NEW.current_location,
      NEW.shift_start_at,
      NEW.shift_end_at,
      NULL
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to staff_status table
CREATE TRIGGER trigger_log_shift_history
AFTER UPDATE ON public.staff_status
FOR EACH ROW
EXECUTE FUNCTION public.log_shift_history();

-- Enable realtime for shift_history
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_history;