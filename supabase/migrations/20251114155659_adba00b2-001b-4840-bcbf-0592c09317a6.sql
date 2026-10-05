-- Create room_check_sessions table to track ongoing checks
CREATE TABLE IF NOT EXISTS public.room_check_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('daily', 'checkin', 'checkout', 'maintenance')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  UNIQUE(room_id) -- Only one active session per room
);

-- Enable RLS
ALTER TABLE public.room_check_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view check sessions in their tenant"
ON public.room_check_sessions
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can create their own check sessions"
ON public.room_check_sessions
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own check sessions"
ON public.room_check_sessions
FOR DELETE
USING (
  user_id = auth.uid() AND
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE id = auth.uid()
  )
);

-- Enable realtime
ALTER TABLE room_check_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE room_check_sessions;

-- Create index for faster lookups
CREATE INDEX idx_room_check_sessions_room_id ON public.room_check_sessions(room_id);
CREATE INDEX idx_room_check_sessions_user_id ON public.room_check_sessions(user_id);