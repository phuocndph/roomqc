-- Create housekeeping_tasks table for managing staff work assignments
CREATE TABLE public.housekeeping_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.room_bookings(id) ON DELETE SET NULL,
  
  -- Task details
  task_type TEXT NOT NULL DEFAULT 'cleaning' CHECK (task_type IN ('checkout_inspection', 'cleaning', 'checkin_prep', 'amenity_request', 'other')),
  title TEXT,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Assignment
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  
  -- Linked data
  room_check_id UUID REFERENCES public.room_checks(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view tasks in their tenant"
  ON public.housekeeping_tasks FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create tasks in their tenant"
  ON public.housekeeping_tasks FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update tasks in their tenant"
  ON public.housekeeping_tasks FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can delete tasks in their tenant"
  ON public.housekeeping_tasks FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_housekeeping_tasks_tenant_hotel ON public.housekeeping_tasks(tenant_id, hotel_id);
CREATE INDEX idx_housekeeping_tasks_assigned_to ON public.housekeeping_tasks(assigned_to);
CREATE INDEX idx_housekeeping_tasks_status ON public.housekeeping_tasks(status);
CREATE INDEX idx_housekeeping_tasks_room_id ON public.housekeeping_tasks(room_id);
CREATE INDEX idx_housekeeping_tasks_created_at ON public.housekeeping_tasks(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_housekeeping_tasks_updated_at
  BEFORE UPDATE ON public.housekeeping_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_tasks;