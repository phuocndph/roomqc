-- Create shift_reminders table to track sent reminders and prevent spam
CREATE TABLE public.shift_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shift_start_at TIMESTAMPTZ NOT NULL,
  reminded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminder_type TEXT NOT NULL DEFAULT 'warning' CHECK (reminder_type IN ('warning', 'overtime')),
  notification_channels TEXT[] DEFAULT ARRAY['push'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_shift_reminders_user_shift ON public.shift_reminders(user_id, shift_start_at);
CREATE INDEX idx_shift_reminders_tenant ON public.shift_reminders(tenant_id);

-- Enable RLS
ALTER TABLE public.shift_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own reminders"
ON public.shift_reminders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all reminders in tenant"
ON public.shift_reminders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.tenant_id = shift_reminders.tenant_id
    AND u.user_level_code IN ('super_admin', 'tenant_owner', 'manager')
  )
);

-- Service role can insert (for edge functions)
CREATE POLICY "Service can insert reminders"
ON public.shift_reminders FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_reminders;