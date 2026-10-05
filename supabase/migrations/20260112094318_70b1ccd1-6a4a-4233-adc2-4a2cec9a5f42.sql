-- Create checkout_inspection_requests table
CREATE TABLE public.checkout_inspection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.room_bookings(id) ON DELETE CASCADE,
  
  -- Người yêu cầu và người được giao
  requested_by UUID REFERENCES public.users(id),
  assigned_to UUID NOT NULL REFERENCES public.users(id),
  
  -- Trạng thái: pending -> in_progress -> completed/cancelled
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  
  -- Kết quả kiểm tra (link tới room_check)
  room_check_id UUID REFERENCES public.room_checks(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Notes
  notes TEXT
);

-- Indexes
CREATE INDEX idx_checkout_inspection_tenant ON public.checkout_inspection_requests(tenant_id);
CREATE INDEX idx_checkout_inspection_room ON public.checkout_inspection_requests(room_id);
CREATE INDEX idx_checkout_inspection_booking ON public.checkout_inspection_requests(booking_id);
CREATE INDEX idx_checkout_inspection_assigned ON public.checkout_inspection_requests(assigned_to, status);
CREATE INDEX idx_checkout_inspection_status ON public.checkout_inspection_requests(status);

-- Enable RLS
ALTER TABLE public.checkout_inspection_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view inspections in their tenant"
  ON public.checkout_inspection_requests FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create inspections in their tenant"
  ON public.checkout_inspection_requests FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update inspections in their tenant"
  ON public.checkout_inspection_requests FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can delete inspections in their tenant"
  ON public.checkout_inspection_requests FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkout_inspection_requests;